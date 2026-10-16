/**
 * Invoiced order history for the B2B shop, from the sales mirror (SALES_DB:
 * sales_deals + deal_line_items, synced from HubSpot). Read-only.
 *
 * A shop account is a Rackbeat customer number; orders hang off HubSpot
 * companies, linked through the company property `rackbeat_id`. Only invoiced
 * (closed-won) orders are in the mirror — open orders are not.
 */
import { findCompanyByRackbeat } from './mcpHubspot.js';

/**
 * HubSpot company ids for a Rackbeat customer number (usually one).
 * @param {string} token HubSpot token
 * @param {string} customer
 * @returns {Promise<string[]>}
 */
export async function companyIdsForCustomer(token, customer) {
	const rows = await findCompanyByRackbeat(token, customer, 10);
	return rows.map((/** @type {any} */ r) => String(r.id));
}

/**
 * @param {import('@cloudflare/workers-types').D1Database} db SALES_DB
 * @param {string[]} companyIds
 * @param {number} limit
 */
export async function listOrders(db, companyIds, limit) {
	if (!companyIds.length) return [];
	const marks = companyIds.map(() => '?').join(',');
	const rows = await db.prepare(
		`SELECT d.deal_id, d.deal_name, d.rackbeat_id, d.close_date, d.amount_raw, d.currency,
		        (SELECT COUNT(*) FROM deal_line_items li WHERE li.deal_id = d.deal_id) AS line_count
		 FROM sales_deals d WHERE d.company_id IN (${marks})
		 ORDER BY d.close_date DESC, d.deal_id DESC LIMIT ?`
	).bind(...companyIds, limit).all();
	return (rows.results ?? []).map(shapeOrder);
}

/**
 * One order with its lines — only if it belongs to one of the companies.
 * @param {import('@cloudflare/workers-types').D1Database} db SALES_DB
 * @param {string[]} companyIds
 * @param {string} dealId
 */
export async function getOrder(db, companyIds, dealId) {
	if (!companyIds.length) return null;
	const marks = companyIds.map(() => '?').join(',');
	const [orderRes, linesRes] = await db.batch([
		db.prepare(
			`SELECT d.deal_id, d.deal_name, d.rackbeat_id, d.close_date, d.amount_raw, d.currency,
			        (SELECT COUNT(*) FROM deal_line_items li WHERE li.deal_id = d.deal_id) AS line_count
			 FROM sales_deals d WHERE d.deal_id = ? AND d.company_id IN (${marks})`
		).bind(dealId, ...companyIds),
		db.prepare(
			`SELECT li.sku, li.name, li.quantity, li.unit_price, li.net_price, li.currency
			 FROM deal_line_items li JOIN sales_deals d ON d.deal_id = li.deal_id
			 WHERE li.deal_id = ? AND d.company_id IN (${marks}) AND li.deal_kind = 'closed'
			 ORDER BY li.name COLLATE NOCASE`
		).bind(dealId, ...companyIds)
	]);
	const order = /** @type {any} */ (orderRes.results?.[0]);
	if (!order) return null;
	return {
		order: shapeOrder(order),
		lines: (linesRes.results ?? []).map((/** @type {any} */ l) => {
			const qty = Number(l.quantity) || 0;
			const total = Number(l.net_price) || 0; // net_price is the line total
			return {
				sku: l.sku ?? null,
				name: l.name ?? l.sku ?? '',
				quantity: qty,
				list_price: l.unit_price != null ? Number(l.unit_price) : null,
				unit_price: qty ? Math.round((total / qty) * 100) / 100 : null,
				total,
				currency: l.currency ?? order.currency ?? null
			};
		})
	};
}

/** @param {any} d */
function shapeOrder(d) {
	return {
		id: String(d.deal_id),
		number: d.rackbeat_id || String(d.deal_name ?? '').replace(/^#/, '') || String(d.deal_id),
		date: d.close_date ?? null,
		total: d.amount_raw != null ? Number(d.amount_raw) : null,
		currency: d.currency ?? null,
		lines: Number(d.line_count) || 0
	};
}
