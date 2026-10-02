import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';

const HS = 'https://api.hubapi.com';
const DEAL_PROPS = ['dealname', 'delivery_date', 'deal_currency_code', 'closedate', 'hubspot_owner_id'];
const COMPANY_PROPS = ['name', 'address', 'zip', 'city', 'country'];
const LINE_ITEM_PROPS = ['hs_sku', 'name', 'quantity', 'price'];

/** Country → market language. */
function langForCountry(country) {
	const c = (country ?? '').toLowerCase();
	if (/denmark|danmark|^dk$/.test(c)) return 'da';
	if (/sweden|sverige|^se$/.test(c)) return 'sv';
	if (/norway|norge|^no$/.test(c)) return 'no';
	return 'en';
}

async function hs(token, method, path, body) {
	const res = await fetch(`${HS}${path}`, {
		method,
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) {
		let d = ''; try { d = (await res.text()).slice(0, 200); } catch { /* ignore */ }
		throw new Error(`HubSpot ${res.status} ${d}`);
	}
	return res.json();
}

function toYmd(value) {
	const s = String(value ?? '').trim();
	if (!s) return null;
	if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
	const ms = /^\d+$/.test(s) ? Number(s) : Date.parse(s);
	if (!Number.isFinite(ms)) return null;
	const d = new Date(ms);
	// Treat the epoch/zero as "no date set".
	if (d.getTime() <= 0) return null;
	return d.toISOString().slice(0, 10);
}

/** Canonical product names from the sheets catalog for a set of SKUs. */
async function catalogNames(db, skus) {
	const list = [...new Set(skus.map((s) => String(s).toLowerCase()).filter(Boolean))];
	if (!list.length || !db) return {};
	const ph = list.map(() => '?').join(',');
	const rows = await db.prepare(
		`SELECT lower(s.sku) AS sku, COALESCE(
		   (SELECT tr.value FROM translations tr WHERE tr.sheet_id = s.id AND tr.key='product_name' AND tr.language = s.primary_language AND COALESCE(tr.value,'') != ''),
		   (SELECT tr.value FROM translations tr WHERE tr.sheet_id = s.id AND tr.key='product_name' AND COALESCE(tr.value,'') != '' LIMIT 1)
		 ) AS name
		 FROM sales_sheets s WHERE lower(s.sku) IN (${ph})`
	).bind(...list).all();
	const map = {};
	for (const r of rows.results ?? []) if (r.name) map[r.sku] = r.name;
	return map;
}

async function buildOrder(token, dealId, ownerCache) {
	const deal = await hs(token, 'GET', `/crm/v3/objects/deals/${dealId}?properties=${DEAL_PROPS.join(',')}`);
	const p = deal.properties ?? {};

	// Primary company
	let buyer = null;
	try {
		const assoc = await hs(token, 'POST', '/crm/v4/associations/deals/companies/batch/read', { inputs: [{ id: dealId }] });
		const companies = assoc.results?.[0]?.to ?? [];
		const primary = companies.find((c) => (c.associationTypes ?? []).some((t) => /primary/i.test(t.label ?? ''))) ?? companies[0];
		if (primary) {
			const comp = await hs(token, 'GET', `/crm/v3/objects/companies/${primary.toObjectId}?properties=${COMPANY_PROPS.join(',')}`);
			const cp = comp.properties ?? {};
			buyer = { name: cp.name ?? null, address: cp.address ?? null, zip: cp.zip ?? null, city: cp.city ?? null, country: cp.country ?? null };
		}
	} catch { /* leave buyer null */ }

	// Seller (deal owner)
	let sellerName = null;
	const ownerId = p.hubspot_owner_id;
	if (ownerId) {
		if (ownerCache.has(ownerId)) sellerName = ownerCache.get(ownerId);
		else {
			try {
				const o = await hs(token, 'GET', `/crm/v3/owners/${ownerId}`);
				sellerName = [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email || null;
			} catch { sellerName = null; }
			ownerCache.set(ownerId, sellerName);
		}
	}

	// Line items
	const lines = [];
	try {
		const assoc = await hs(token, 'POST', '/crm/v4/associations/deals/line_items/batch/read', { inputs: [{ id: dealId }] });
		const ids = (assoc.results?.[0]?.to ?? []).map((t) => String(t.toObjectId));
		for (let i = 0; i < ids.length; i += 100) {
			const data = await hs(token, 'POST', '/crm/v3/objects/line_items/batch/read', {
				properties: LINE_ITEM_PROPS, inputs: ids.slice(i, i + 100).map((id) => ({ id })),
			});
			lines.push(...(data.results ?? []));
		}
	} catch { /* no lines */ }

	return { dealId, props: p, buyer, sellerName, lineItems: lines };
}

export async function POST({ request, cookies, platform }) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user) error(403, 'Access denied');
	const perms = await getUserPermissions(db, user);
	if (!perms.orders) error(403, 'No access to orders');

	const token = platform?.env?.HUBSPOT_TOKEN;
	if (!token) error(500, 'HubSpot token not configured');

	const body = await request.json().catch(() => ({}));
	const raw = Array.isArray(body?.items) ? body.items.map((s) => String(s)) : String(body?.input ?? '').split(/[\n,;]+/);
	const tokens = [...new Set(raw.map((s) => s.trim()).filter(Boolean))];

	// Resolve: numeric → deal id; else search by exact dealname.
	const resolved = []; // { id, inputName? }
	const unresolved = [];
	for (const t of tokens) {
		if (/^\d+$/.test(t)) { resolved.push({ id: t }); continue; }
		try {
			const data = await hs(token, 'POST', '/crm/v3/objects/deals/search', {
				filterGroups: [{ filters: [{ propertyName: 'dealname', operator: 'EQ', value: t }] }],
				properties: ['dealname'], limit: 5,
			});
			const hits = data.results ?? [];
			if (hits.length === 1) resolved.push({ id: hits[0].id, inputName: t });
			else if (hits.length === 0) unresolved.push({ input: t, reason: 'No deal with that exact name' });
			else unresolved.push({ input: t, reason: `${hits.length} deals share that name — use the ID`, candidates: hits.map((h) => ({ id: h.id, name: h.properties?.dealname })) });
		} catch (e) { unresolved.push({ input: t, reason: e instanceof Error ? e.message : String(e) }); }
	}

	const ownerCache = new Map();
	const built = [];
	for (const r of resolved) {
		try { built.push(await buildOrder(token, r.id, ownerCache)); }
		catch (e) { unresolved.push({ input: r.inputName ?? r.id, reason: e instanceof Error ? e.message : String(e) }); }
	}

	// Canonical names for every SKU across all orders.
	const allSkus = built.flatMap((b) => b.lineItems.map((li) => li.properties?.hs_sku).filter(Boolean));
	const nameMap = await catalogNames(db, allSkus);

	const orders = built.map((b) => {
		const p = b.props;
		const currency = p.deal_currency_code || 'DKK';
		const lines = b.lineItems.map((li) => {
			const lp = li.properties ?? {};
			const sku = (lp.hs_sku ?? '').trim();
			const qty = Number(lp.quantity) || 0;
			const unit = Number(lp.price) || 0;
			const name = (sku && nameMap[sku.toLowerCase()]) || lp.name || sku || '—';
			return { sku, name, qty, unitPrice: unit, lineTotal: qty * unit };
		});
		const total = lines.reduce((s, l) => s + l.lineTotal, 0);
		const lang = langForCountry(b.buyer?.country);
		return {
			dealId: b.dealId,
			dealName: p.dealname ?? null,
			deliveryDate: toYmd(p.delivery_date),
			currency,
			lang,
			seller: { name: b.sellerName },
			buyer: b.buyer,
			lines,
			total,
		};
	});

	return json({ orders, unresolved });
}
