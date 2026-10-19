import { json, error } from '@sveltejs/kit';
import { buildShopFeed } from '$lib/server/shopFeed.js';
import { requireShopKey } from '$lib/server/shopFeedAuth.js';

/**
 * GET /api/shop/products — full product-content feed for the B2B shop.
 * ?sku=A&sku=B narrows `products` and `categories.products` to those SKUs, for
 * the shop's instant refresh after a sheet is saved (see hooks.server.js).
 * Auth: `Authorization: Bearer <SHOP_FEED_KEY>`. Read-only; see shopFeed.js.
 */
export async function GET({ request, platform, url }) {
	const env = platform?.env;
	requireShopKey(request, env);
	if (!env?.DB || !env?.SALES_DB) error(500, 'Database unavailable');

	const feed = await buildShopFeed(env.DB, env.SALES_DB, url.origin);
	const only = new Set(url.searchParams.getAll('sku').map((s) => s.trim().toLowerCase()).filter(Boolean));
	if (only.size) {
		feed.products = feed.products.filter((/** @type {any} */ p) => only.has(String(p.sku).toLowerCase()));
		feed.categories.products = feed.categories.products.filter((/** @type {any} */ r) => only.has(String(r.sku).toLowerCase()));
	}
	return json(feed, { headers: { 'Cache-Control': 'no-store' } });
}
