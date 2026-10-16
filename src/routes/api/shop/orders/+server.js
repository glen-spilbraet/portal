import { json, error } from '@sveltejs/kit';
import { requireShopKey } from '$lib/server/shopFeedAuth.js';
import { companyIdsForCustomer, listOrders } from '$lib/server/shopOrders.js';

/**
 * GET /api/shop/orders?customer=<rackbeat customer no>&limit=50
 * Recent invoiced orders for one customer, newest first. Bearer SHOP_FEED_KEY.
 */
export async function GET({ request, platform, url }) {
	const env = platform?.env;
	requireShopKey(request, env);
	if (!env?.SALES_DB || !env.HUBSPOT_TOKEN) error(500, 'Not configured');
	const customer = url.searchParams.get('customer') ?? '';
	if (!/^\d+$/.test(customer)) error(400, 'customer must be a Rackbeat customer number');
	const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50') || 50));

	const companyIds = await companyIdsForCustomer(env.HUBSPOT_TOKEN, customer);
	const orders = await listOrders(env.SALES_DB, companyIds, limit);
	return json({ customer, orders }, { headers: { 'Cache-Control': 'no-store' } });
}
