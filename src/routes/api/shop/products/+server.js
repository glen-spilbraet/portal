import { json, error } from '@sveltejs/kit';
import { buildShopFeed } from '$lib/server/shopFeed.js';

/**
 * Constant-time compare so the key can't be guessed byte by byte.
 * @param {string | null} a
 * @param {string | undefined} b
 */
function safeEqual(a, b) {
	if (!a || !b) return false;
	const x = new TextEncoder().encode(a);
	const y = new TextEncoder().encode(b);
	let diff = x.length ^ y.length;
	for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
	return diff === 0;
}

/**
 * GET /api/shop/products — full product-content feed for the B2B shop.
 * Auth: `Authorization: Bearer <SHOP_FEED_KEY>`. Read-only; see shopFeed.js.
 */
export async function GET({ request, platform, url }) {
	const env = platform?.env;
	const auth = request.headers.get('authorization') ?? '';
	const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
	if (!safeEqual(bearer, env?.SHOP_FEED_KEY)) error(401, 'Unauthorised');
	if (!env?.DB || !env?.SALES_DB) error(500, 'Database unavailable');

	const feed = await buildShopFeed(env.DB, env.SALES_DB, url.origin);
	return json(feed, { headers: { 'Cache-Control': 'no-store' } });
}
