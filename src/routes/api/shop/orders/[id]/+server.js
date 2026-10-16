import { json, error } from '@sveltejs/kit';
import { requireShopKey } from '$lib/server/shopFeedAuth.js';
import { companyIdsForCustomer, getOrder } from '$lib/server/shopOrders.js';

/**
 * GET /api/shop/orders/<deal id>?customer=<rackbeat customer no>
 * One order with its lines, only if it belongs to that customer. Bearer SHOP_FEED_KEY.
 */
export async function GET({ request, platform, url, params }) {
	const env = platform?.env;
	requireShopKey(request, env);
	if (!env?.SALES_DB || !env.HUBSPOT_TOKEN) error(500, 'Not configured');
	const customer = url.searchParams.get('customer') ?? '';
	if (!/^\d+$/.test(customer)) error(400, 'customer must be a Rackbeat customer number');
	if (!/^\d+$/.test(params.id)) error(400, 'Bad order id');

	const companyIds = await companyIdsForCustomer(env.HUBSPOT_TOKEN, customer);
	const result = await getOrder(env.SALES_DB, companyIds, params.id);
	if (!result) error(404, 'Not found');
	return json(result, { headers: { 'Cache-Control': 'no-store' } });
}
