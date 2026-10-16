import { json, error } from '@sveltejs/kit';
import { buildShopFeed } from '$lib/server/shopFeed.js';
import { requireShopKey } from '$lib/server/shopFeedAuth.js';

/**
 * GET /api/shop/products — full product-content feed for the B2B shop.
 * Auth: `Authorization: Bearer <SHOP_FEED_KEY>`. Read-only; see shopFeed.js.
 */
export async function GET({ request, platform, url }) {
	const env = platform?.env;
	requireShopKey(request, env);
	if (!env?.DB || !env?.SALES_DB) error(500, 'Database unavailable');

	const feed = await buildShopFeed(env.DB, env.SALES_DB, url.origin);
	return json(feed, { headers: { 'Cache-Control': 'no-store' } });
}
