import { json, error } from '@sveltejs/kit';
import { buildBrandFeed } from '$lib/server/brandPages.js';
import { requireShopKey } from '$lib/server/shopFeedAuth.js';

/**
 * GET /api/shop/brands — landing-page content for EVERY publisher and series.
 * Build a landing page only where `show_in_shop` is true (toggled per
 * publisher/series in the Portal); remove it when it turns false.
 *
 *   { generated_at, languages: ['da','sv','no','en','pl'],
 *     publishers: [{ name, slug, sku_prefixes, show_in_shop, image, image_cdn, has_content, updated_at,
 *                    texts: { da: { subheader, text }, … },
 *                    series: [{ id, name, slug, product_count, show_in_shop, image, image_cdn, has_content, updated_at, texts }] }] }
 *
 * image = the 4:3 original; image_cdn = WebP via img.spilbraet.dk (append ?w=300|600|1000|1600).
 * Which products belong where: the /api/shop/products feed (`publishers` + `series`).
 * ?publisher=<name> narrows to one publisher (for the instant refresh after a
 * `{ type: 'brands', publisher }` webhook notice).
 * Auth: `Authorization: Bearer <SHOP_FEED_KEY>`.
 */
export async function GET({ request, platform, url }) {
	const env = platform?.env;
	requireShopKey(request, env);
	if (!env?.SALES_DB) error(500, 'Database unavailable');
	const feed = await buildBrandFeed(env.SALES_DB, url.origin, { publisher: url.searchParams.get('publisher') });
	return json(feed, { headers: { 'Cache-Control': 'no-store' } });
}
