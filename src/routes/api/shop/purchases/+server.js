import { json, error } from '@sveltejs/kit';
import { requireShopKey } from '$lib/server/shopFeedAuth.js';
import { purchasePairs, customerNumbers } from '$lib/server/shopPurchases.js';

/**
 * GET /api/shop/purchases — which products each customer bought in the last
 * 12 months, per sales market, for the shop's nightly recommendations sync.
 * Bearer SHOP_FEED_KEY.
 *
 * { since, markets: { Denmark: { <company id>: [SKU, …] }, … },
 *   customers: { <company id>: <Rackbeat customer no> } }
 */
export async function GET({ request, platform }) {
	const env = platform?.env;
	requireShopKey(request, env);
	if (!env?.SALES_DB || !env.HUBSPOT_TOKEN) error(500, 'Not configured');

	const from = new Date();
	from.setUTCFullYear(from.getUTCFullYear() - 1);
	const since = from.toISOString().slice(0, 10);

	const pairs = await purchasePairs(env.SALES_DB, since);
	/** @type {Record<string, Record<string, string[]>>} */
	const markets = {};
	for (const p of pairs) ((markets[p.market] ??= {})[p.company] ??= []).push(p.sku);
	const companies = [...new Set(pairs.map((p) => p.company))];
	const customers = await customerNumbers(env.HUBSPOT_TOKEN, companies);

	return json({ since, markets, customers }, { headers: { 'Cache-Control': 'no-store' } });
}
