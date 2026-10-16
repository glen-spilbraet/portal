import { error } from '@sveltejs/kit';

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
 * Guard for the B2B shop's feed endpoints: `Authorization: Bearer <SHOP_FEED_KEY>`.
 * @param {Request} request
 * @param {{ SHOP_FEED_KEY?: string } | undefined} env
 */
export function requireShopKey(request, env) {
	const auth = request.headers.get('authorization') ?? '';
	const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
	if (!safeEqual(bearer, env?.SHOP_FEED_KEY)) error(401, 'Unauthorised');
}
