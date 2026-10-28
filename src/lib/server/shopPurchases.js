/**
 * Who bought what in the last 12 months, for the B2B shop's product
 * recommendations ("other customers also bought", series sorting). The shop
 * fetches this once a night and does the counting itself. Read-only.
 *
 * From the sales mirror (invoiced deals only). A product counts as bought by
 * a company when its quantity over the period is above zero, so a fully
 * credited line does not count. Companies are linked to Rackbeat customer
 * numbers through the HubSpot company property `rackbeat_id`.
 */

const HS = 'https://api.hubapi.com';
/** HubSpot batch read takes up to 100 ids per call. */
const HS_BATCH = 100;

/**
 * @param {import('@cloudflare/workers-types').D1Database} db SALES_DB
 * @param {string} since yyyy-mm-dd, inclusive
 * @returns {Promise<{ market: string, company: string, sku: string }[]>}
 */
export async function purchasePairs(db, since) {
	const rows = await db.prepare(
		`SELECT d.market AS market, li.company_id AS company, UPPER(TRIM(li.sku)) AS sku
		 FROM deal_line_items li JOIN sales_deals d ON d.deal_id = li.deal_id
		 WHERE li.deal_kind = 'closed' AND li.close_date >= ? AND li.sku IS NOT NULL AND TRIM(li.sku) <> ''
		   AND li.company_id IS NOT NULL AND d.market IS NOT NULL
		 GROUP BY d.market, li.company_id, UPPER(TRIM(li.sku))
		 HAVING SUM(li.quantity) > 0`
	).bind(since).all();
	return /** @type {any[]} */ (rows.results ?? []).map((r) => ({ market: String(r.market), company: String(r.company), sku: String(r.sku) }));
}

/**
 * Rackbeat customer number(s) per HubSpot company id, for those that have one.
 * @param {string} token HubSpot token
 * @param {string[]} companyIds
 * @returns {Promise<Record<string, number>>}
 */
export async function customerNumbers(token, companyIds) {
	/** @type {Record<string, number>} */
	const out = {};
	for (let i = 0; i < companyIds.length; i += HS_BATCH) {
		const inputs = companyIds.slice(i, i + HS_BATCH).map((id) => ({ id }));
		const data = await hsPost(token, '/crm/v3/objects/companies/batch/read', { properties: ['rackbeat_id'], inputs });
		for (const r of data.results ?? []) {
			const n = String(r.properties?.rackbeat_id ?? '').trim();
			if (/^\d+$/.test(n)) out[String(r.id)] = Number(n);
		}
	}
	return out;
}

/** POST to HubSpot, waiting and retrying once on its rate limit. @param {string} token @param {string} path @param {unknown} body */
async function hsPost(token, path, body, retry = true) {
	const res = await fetch(`${HS}${path}`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(20_000)
	});
	if (res.status === 429 && retry) {
		await new Promise((r) => setTimeout(r, 1_500));
		return hsPost(token, path, body, false);
	}
	if (!res.ok) throw new Error(`HubSpot ${res.status} on ${path}`);
	return res.json();
}
