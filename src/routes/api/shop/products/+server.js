import { json, error } from '@sveltejs/kit';
import { buildShopFeed } from '$lib/server/shopFeed.js';
import { requireShopKey } from '$lib/server/shopFeedAuth.js';

/**
 * GET /api/shop/products — full product-content feed for the B2B shop.
 * ?sku=A&sku=B narrows `products` and `categories.products` to those SKUs, for
 * the shop's instant refresh after a sheet is saved (see hooks.server.js).
 * ?featured=1 returns only the products starred as Featured in the Portal
 * (each product also carries `featured` / `featured_at` in the full feed).
 * Auth: `Authorization: Bearer <SHOP_FEED_KEY>`. Read-only; see shopFeed.js.
 */
export async function GET({ request, platform, url }) {
	const env = platform?.env;
	requireShopKey(request, env);
	if (!env?.DB || !env?.SALES_DB) error(500, 'Database unavailable');

	let skus = url.searchParams.getAll('sku').map((s) => s.trim()).filter(Boolean);
	if (url.searchParams.get('featured') === '1') {
		const rows = (await env.DB.prepare(
			`SELECT sku FROM sales_sheets WHERE featured_at IS NOT NULL AND trim(COALESCE(sku,'')) != '' ORDER BY featured_at DESC`
		).all()).results ?? [];
		skus = rows.map((r) => String(r.sku).trim());
		// None starred: a SKU that matches nothing keeps the normal feed shape
		// (and stops buildShopFeed from treating "no SKUs" as the whole catalogue).
		if (!skus.length) skus = ['__no_featured__'];
	}
	// With ?sku=… every query is narrowed to those products (cheap), instead of
	// building the whole catalogue for one product.
	const feed = await buildShopFeed(env.DB, env.SALES_DB, url.origin, { skus });
	const only = new Set(skus.map((s) => s.toLowerCase()));
	if (only.size) {
		feed.products = feed.products.filter((/** @type {any} */ p) => only.has(String(p.sku).toLowerCase()));
		feed.categories.products = feed.categories.products.filter((/** @type {any} */ r) => only.has(String(r.sku).toLowerCase()));
	}
	if (url.searchParams.get('featured') === '1') {
		// Newest star first.
		const order = new Map(skus.map((s, i) => [s.toLowerCase(), i]));
		feed.products.sort((/** @type {any} */ a, /** @type {any} */ b) => (order.get(String(a.sku).toLowerCase()) ?? 1e9) - (order.get(String(b.sku).toLowerCase()) ?? 1e9));
	}
	return json(feed, { headers: { 'Cache-Control': 'no-store' } });
}
