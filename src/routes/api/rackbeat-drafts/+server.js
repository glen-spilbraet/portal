import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';

const HUBSPOT_BASE = 'https://api.hubapi.com';
const RACKBEAT_BASE = 'https://app.rackbeat.com/api';

const DEAL_PROPS = ['dealname', 'rackbeat_id', 'delivery_date', 'description', 'deal_currency_code'];
const LINE_ITEM_PROPS = ['quantity', 'name', 'hs_sku', 'hs_discount_percentage', 'price'];

const MAX_DEALS_PER_REQUEST = 50;
const RACKBEAT_NOTE_MAX = 800;
const RACKBEAT_HEADING_MAX = 255;

class HttpError extends Error {
	/** @param {number} status @param {string} message */
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

/**
 * @typedef {object} DealResult
 * @property {string} dealId
 * @property {string | null} dealName
 * @property {'created' | 'failed'} status
 * @property {string | null} customerId
 * @property {string | number | null} rackbeatNumber
 * @property {number} lineCount
 * @property {string[]} errors
 * @property {string[]} warnings
 */

/**
 * POST /api/rackbeat-drafts
 * Body: { dealIds: string[] }
 *
 * For each HubSpot deal: reads the deal, its primary company (whose rackbeat_id
 * is the Rackbeat customer) and its line items, validates everything against
 * Rackbeat (customer + SKUs must exist), creates a Rackbeat order draft, then
 * writes the created order id back to the deal's rackbeat_id. A deal whose
 * rackbeat_id is already set is skipped (draft already exists). A deal either
 * fully succeeds or is skipped entirely — no partial orders. Returns a
 * per-deal report.
 */
export async function POST({ request, cookies, platform }) {
	const token  = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email  = await verifySession(token ?? '', secret);
	if (!email) error(401, 'Unauthorised');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const user = await getAllowedUser(db, email);
	if (!user) error(403, 'Access denied');
	if (user.role !== 'admin') error(403, 'No access to orders');

	const rackbeatKey  = platform?.env?.RACKBEAT_API_KEY;
	const hubspotToken = platform?.env?.HUBSPOT_TOKEN;
	if (!rackbeatKey)  error(500, 'Rackbeat API key not configured');
	if (!hubspotToken) error(500, 'HubSpot token not configured');

	/** @type {any} */
	let body;
	try {
		body = await request.json();
	} catch {
		error(400, 'Invalid JSON body');
	}

	/** @type {unknown[]} */
	const rawIds = Array.isArray(body?.dealIds) ? body.dealIds : [];
	const dealIds = [...new Set(
		rawIds.map((id) => String(id).trim()).filter((id) => /^\d+$/.test(id))
	)];

	if (dealIds.length === 0) error(400, 'dealIds must be a non-empty array of numeric HubSpot deal ids');
	if (dealIds.length > MAX_DEALS_PER_REQUEST) error(400, `Max ${MAX_DEALS_PER_REQUEST} deals per request`);

	// Sequential on purpose: keeps us well inside HubSpot/Rackbeat rate limits.
	/** @type {DealResult[]} */
	const results = [];
	for (const dealId of dealIds) {
		results.push(await processDeal(dealId, hubspotToken, rackbeatKey));
	}

	return json({
		created: results.filter((r) => r.status === 'created').length,
		failed:  results.filter((r) => r.status === 'failed').length,
		results
	});
}

/**
 * @param {string} dealId
 * @param {string} hubspotToken
 * @param {string} rackbeatKey
 * @returns {Promise<DealResult>} per-deal report entry
 */
async function processDeal(dealId, hubspotToken, rackbeatKey) {
	/** @type {DealResult} */
	const result = {
		dealId,
		dealName: null,
		status: 'failed',
		customerId: null,
		rackbeatNumber: null,
		lineCount: 0,
		errors: [],
		warnings: []
	};

	// ── 1. Deal ────────────────────────────────────────────────────────────────
	let props;
	try {
		const deal = await hubspot(
			hubspotToken, 'GET',
			`/crm/v3/objects/deals/${dealId}?properties=${DEAL_PROPS.join(',')}`
		);
		props = deal.properties ?? {};
	} catch (err) {
		const notFound = err instanceof HttpError && err.status === 404;
		result.errors.push(notFound ? 'Deal not found in HubSpot' : `HubSpot: ${errMessage(err)}`);
		return result;
	}

	result.dealName = props.dealname ?? null;

	// The deal's rackbeat_id holds the Rackbeat order id once a draft has been
	// created — a non-empty value means this deal was already transferred.
	const existingOrderId = (props.rackbeat_id ?? '').trim();
	if (existingOrderId) {
		result.errors.push(`Deal already linked to Rackbeat order ${existingOrderId} — skipped`);
		return result;
	}

	// ── 1b. Customer id from the deal's (primary) company ──────────────────────
	let customerId = '';
	try {
		const assoc = await hubspot(hubspotToken, 'POST', '/crm/v4/associations/deals/companies/batch/read', {
			inputs: [{ id: dealId }]
		});
		const companies = assoc.results?.[0]?.to ?? [];
		const primary =
			companies.find((/** @type {any} */ c) =>
				(c.associationTypes ?? []).some((/** @type {any} */ t) => /primary/i.test(t.label ?? ''))
			) ?? companies[0];

		if (!primary) {
			result.errors.push('Deal has no associated company');
		} else {
			const company = await hubspot(
				hubspotToken, 'GET',
				`/crm/v3/objects/companies/${primary.toObjectId}?properties=rackbeat_id,name`
			);
			customerId = (company.properties?.rackbeat_id ?? '').trim();
			if (!customerId) {
				result.errors.push(`Company "${company.properties?.name ?? primary.toObjectId}" has no rackbeat_id`);
			}
		}
	} catch (err) {
		result.errors.push(`HubSpot company lookup: ${errMessage(err)}`);
	}
	result.customerId = customerId || null;

	// ── 2. Line items ──────────────────────────────────────────────────────────
	/** @type {any[]} */
	let lines = [];
	try {
		const assoc = await hubspot(hubspotToken, 'POST', '/crm/v4/associations/deals/line_items/batch/read', {
			inputs: [{ id: dealId }]
		});
		const lineIds = (assoc.results?.[0]?.to ?? []).map((/** @type {any} */ t) => String(t.toObjectId));

		if (lineIds.length === 0) {
			result.errors.push('Deal has no line items');
		} else {
			for (const batch of chunk(lineIds, 100)) {
				const data = await hubspot(hubspotToken, 'POST', '/crm/v3/objects/line_items/batch/read', {
					properties: LINE_ITEM_PROPS,
					inputs: batch.map((/** @type {string} */ id) => ({ id }))
				});
				lines.push(...(data.results ?? []));
			}
		}
	} catch (err) {
		result.errors.push(`HubSpot line items: ${errMessage(err)}`);
		return result;
	}

	result.lineCount = lines.length;

	// ── 3. Validate lines ──────────────────────────────────────────────────────
	/** @type {any[]} */
	const rbLines = [];
	for (const line of lines) {
		const p = line.properties ?? {};
		const sku = (p.hs_sku ?? '').trim();
		const label = p.name ? `"${p.name}"` : `line item ${line.id}`;

		if (!sku) {
			result.errors.push(`${label} has no SKU`);
			continue;
		}
		const quantity = Number(p.quantity);
		if (!Number.isFinite(quantity) || quantity <= 0) {
			result.errors.push(`${label} (${sku}) has invalid quantity "${p.quantity ?? ''}"`);
			continue;
		}

		/** @type {Record<string, string | number>} */
		const rbLine = { item_id: sku, quantity };
		if (p.name) rbLine.name = p.name;

		const price = Number(p.price);
		if (p.price != null && p.price !== '' && Number.isFinite(price)) {
			rbLine.line_price = price;
		} else {
			result.warnings.push(`${label} (${sku}) has no price in HubSpot — Rackbeat pricing will apply`);
		}

		const discount = Number(p.hs_discount_percentage);
		if (p.hs_discount_percentage != null && p.hs_discount_percentage !== '' && Number.isFinite(discount)) {
			rbLine.discount_percentage = discount;
		}

		rbLines.push(rbLine);
	}

	// ── 4. Validate against Rackbeat (customer + SKUs must exist) ──────────────
	if (customerId) {
		const customerRes = await rackbeatFetch(rackbeatKey, `/customers/${encodeURIComponent(customerId)}`);
		if (customerRes.status === 404) {
			result.errors.push(`Customer ${customerId} not found in Rackbeat`);
		} else if (!customerRes.ok) {
			result.errors.push(`Rackbeat customer lookup failed (${customerRes.status})`);
		}
	}

	const uniqueSkus = [...new Set(rbLines.map((l) => String(l.item_id)))];
	const skuChecks = await Promise.all(
		uniqueSkus.map(async (sku) => {
			const res = await rackbeatFetch(rackbeatKey, `/products/${encodeURIComponent(sku)}`);
			return { sku, status: res.status, ok: res.ok };
		})
	);
	for (const check of skuChecks) {
		if (check.status === 404) result.errors.push(`SKU ${check.sku} not found in Rackbeat`);
		else if (!check.ok) result.errors.push(`Rackbeat product lookup failed for ${check.sku} (${check.status})`);
	}

	// Fail the whole deal if anything above went wrong — no partial orders.
	if (result.errors.length > 0) return result;

	// ── 5. Create the draft ────────────────────────────────────────────────────
	/** @type {Record<string, any>} */
	const payload = { customer_id: customerId, lines: rbLines };

	const description = (props.description ?? '').trim();
	if (description) {
		payload.heading = description.slice(0, RACKBEAT_HEADING_MAX);
		payload.note = description.slice(0, RACKBEAT_NOTE_MAX);
	}

	if (props.delivery_date) {
		const ymd = toYmd(props.delivery_date);
		if (ymd) payload.deliver_at = ymd;
		else result.warnings.push(`Could not parse delivery_date "${props.delivery_date}" — omitted`);
	}

	if (props.deal_currency_code) payload.currency = props.deal_currency_code;

	const createRes = await rackbeatFetch(rackbeatKey, '/orders/drafts', 'POST', payload);
	if (!createRes.ok) {
		let detail = '';
		try { detail = (await createRes.text()).slice(0, 300); } catch { /* ignore */ }
		result.errors.push(`Rackbeat rejected the draft (${createRes.status}): ${detail}`);
		return result;
	}

	try {
		const created = await createRes.json();
		const order = created.order ?? created;
		result.rackbeatNumber = order.number ?? order.id ?? null;
	} catch { /* draft was created; number just unknown */ }

	result.status = 'created';

	// ── 6. Write the Rackbeat order id back to the deal's rackbeat_id ──────────
	if (result.rackbeatNumber != null) {
		try {
			await hubspot(hubspotToken, 'PATCH', `/crm/v3/objects/deals/${dealId}`, {
				properties: { rackbeat_id: String(result.rackbeatNumber) }
			});
		} catch (err) {
			result.warnings.push(`Draft created, but writing rackbeat_id back to the deal failed: ${errMessage(err)}`);
		}
	} else {
		result.warnings.push('Draft created, but Rackbeat returned no order number — rackbeat_id not written back');
	}

	return result;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

/**
 * @param {string} token
 * @param {string} method
 * @param {string} path
 * @param {object} [body]
 * @returns {Promise<any>}
 */
async function hubspot(token, method, path, body) {
	const res = await fetch(`${HUBSPOT_BASE}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		body: body ? JSON.stringify(body) : undefined
	});
	if (!res.ok) {
		let detail = '';
		try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
		throw new HttpError(res.status, `${res.status} ${detail}`);
	}
	return res.json();
}

/**
 * @param {string} apiKey
 * @param {string} path
 * @param {string} [method]
 * @param {object} [body]
 */
function rackbeatFetch(apiKey, path, method = 'GET', body) {
	return fetch(`${RACKBEAT_BASE}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			Accept: 'application/json',
			...(body ? { 'Content-Type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
}

// ── Utils ─────────────────────────────────────────────────────────────────────

/** @param {unknown} err */
function errMessage(err) {
	return err instanceof Error ? err.message : String(err);
}

/**
 * @template T
 * @param {T[]} arr
 * @param {number} size
 * @returns {T[][]}
 */
function chunk(arr, size) {
	const out = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

/**
 * Normalizes a HubSpot date property (epoch ms, ISO datetime, or Y-m-d) to Y-m-d.
 * @param {string} value
 */
function toYmd(value) {
	const str = String(value).trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
	const ms = /^\d+$/.test(str) ? Number(str) : Date.parse(str);
	if (!Number.isFinite(ms)) return null;
	const date = new Date(ms);
	return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
