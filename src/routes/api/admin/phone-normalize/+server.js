import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { regionFromCountry, normalizePhone } from '$lib/server/phoneNormalize.js';

const HS = 'https://api.hubapi.com';
const FIELDS = ['phone', 'mobilephone'];

/** Admin gate (users live in DB / portal-db). */
async function requireAdmin(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
}

async function hubspot(token, method, path, body) {
	const res = await fetch(`${HS}${path}`, {
		method,
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined
	});
	if (!res.ok) {
		let detail = '';
		try { detail = (await res.text()).slice(0, 300); } catch { /* ignore */ }
		const err = new Error(`${res.status} ${detail}`);
		err.status = res.status;
		throw err;
	}
	return res.json();
}

/**
 * POST /api/admin/phone-normalize
 *   { action:'scan', after?:string }  → one page (100 contacts) dry-run
 *   { action:'apply', updates:[{id, properties}] } → batch-write (≤100)
 */
export async function POST({ request, cookies, platform }) {
	await requireAdmin(cookies, platform);
	const token = platform?.env?.HUBSPOT_TOKEN;
	if (!token) error(500, 'HUBSPOT_TOKEN not configured');

	const body = await request.json().catch(() => ({}));

	if (body.action === 'scan') return scan(token, body.after ?? null);
	if (body.action === 'apply') return apply(token, Array.isArray(body.updates) ? body.updates : []);
	error(400, 'Unknown action');
}

async function scan(token, after) {
	// One page of contacts with their phone fields + associated companies.
	const params = new URLSearchParams({
		limit: '100',
		properties: ['firstname', 'lastname', ...FIELDS].join(','),
		associations: 'companies'
	});
	if (after) params.set('after', after);

	let page;
	try {
		page = await hubspot(token, 'GET', `/crm/v3/objects/contacts?${params}`);
	} catch (e) {
		// Most likely a missing scope on the private-app token.
		if (e.status === 403) {
			return json({
				ok: false,
				error: 'scope',
				message: 'HubSpot token is missing contact access. Add scopes crm.objects.contacts.read and crm.objects.contacts.write to the private app.'
			});
		}
		throw e;
	}

	const contacts = page.results ?? [];

	// Resolve the primary company id per contact, then batch-read their countries.
	const companyIds = new Set();
	for (const c of contacts) {
		const id = c.associations?.companies?.results?.[0]?.id;
		if (id) companyIds.add(id);
	}
	const countryById = {};
	if (companyIds.size) {
		const data = await hubspot(token, 'POST', '/crm/v3/objects/companies/batch/read', {
			properties: ['country', 'name'],
			inputs: [...companyIds].map((id) => ({ id }))
		});
		for (const co of data.results ?? []) {
			countryById[co.id] = { country: co.properties?.country ?? '', name: co.properties?.name ?? '' };
		}
	}

	const changes = [];
	const skipped = [];
	const counts = { scanned: contacts.length, contactsToChange: 0, fieldsToChange: 0, alreadyOk: 0, invalid: 0, noCompany: 0, noCountry: 0 };

	for (const c of contacts) {
		const companyId = c.associations?.companies?.results?.[0]?.id ?? null;
		const company = companyId ? countryById[companyId] : null;
		const country = company?.country ?? '';
		const region = regionFromCountry(country);
		const name = [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(' ') || '(no name)';

		const fields = {};
		for (const f of FIELDS) {
			const raw = c.properties?.[f] ?? '';
			const res = normalizePhone(raw, region);
			if (res.status === 'empty') continue;
			if (res.status === 'ok') { counts.alreadyOk++; continue; }
			if (res.status === 'change') { fields[f] = { old: raw, new: res.value }; counts.fieldsToChange++; continue; }
			// no_region / invalid → report, never write a guess
			const reason = res.status === 'invalid'
				? 'invalid number'
				: (!companyId ? 'no linked company' : 'company has no/unknown country');
			if (res.status === 'invalid') counts.invalid++;
			else if (!companyId) counts.noCompany++;
			else counts.noCountry++;
			skipped.push({ id: c.id, name, field: f, old: raw, country, reason });
		}

		if (Object.keys(fields).length) {
			counts.contactsToChange++;
			const properties = {};
			for (const f of FIELDS) if (fields[f]) properties[f] = fields[f].new;
			changes.push({ id: c.id, name, company: company?.name ?? '', country, fields, properties });
		}
	}

	return json({ ok: true, changes, skipped, counts, next: page.paging?.next?.after ?? null });
}

async function apply(token, updates) {
	if (!updates.length) return json({ ok: true, updated: 0, failed: [] });
	const inputs = updates
		.filter((u) => u?.id && u?.properties && Object.keys(u.properties).length)
		.map((u) => ({ id: u.id, properties: u.properties }))
		.slice(0, 100);
	if (!inputs.length) return json({ ok: true, updated: 0, failed: [] });

	try {
		await hubspot(token, 'POST', '/crm/v3/objects/contacts/batch/update', { inputs });
		return json({ ok: true, updated: inputs.length, failed: [] });
	} catch (e) {
		if (e.status === 403) {
			return json({ ok: false, error: 'scope', message: 'HubSpot token cannot write contacts. Add scope crm.objects.contacts.write to the private app.' });
		}
		return json({ ok: false, error: 'write', message: String(e.message ?? e), updated: 0, failed: inputs.map((i) => i.id) });
	}
}
