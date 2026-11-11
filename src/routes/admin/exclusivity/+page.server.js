import { error } from '@sveltejs/kit';
import { listDeals, sheetNames, membersByDeal, MARKETS, MARKET_LABEL } from '$lib/server/exclusivity.js';

// Admin → Exclusivity. Agreements live on the shared SALES_DB; product names are
// refreshed from Sheets (app DB) so renamed products show their current name.
export async function load({ parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Sales DB unavailable');

	const today = new Date().toISOString().slice(0, 10);
	try {
		const deals = await listDeals(db);
		const names = await sheetNames(platform?.env?.DB, deals.map((d) => d.sku));
		for (const d of deals) d.product_name = names.get(d.sku.toLowerCase()) ?? d.product_name ?? null;
		const members = await membersByDeal(db, deals.map((d) => d.id));
		for (const d of deals) d.members = members.get(d.id) ?? [];
		return { user, ready: true, deals, today, markets: MARKETS, marketLabel: MARKET_LABEL };
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return { user, ready: false, noTable: /no such table/i.test(message), message, deals: [], today, markets: MARKETS, marketLabel: MARKET_LABEL };
	}
}
