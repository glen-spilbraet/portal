/**
 * image-cdn — https://img.spilbraet.dk/<r2 key>?w=600
 *
 *   w = 300 | 600 | 1000 | 1600 → WebP of that width (never upscaled)
 *   no w                       → the original file
 *
 * Variants live in R2 as <key without extension>_<w>.webp — the same naming
 * Portal's browser-made variants already use, so those are reused as-is.
 * A missing variant is made from the original with the Images binding, stored,
 * then served. If making it fails (quota, odd file, >20 MB) the original is
 * served with a short cache, so the image still shows and the variant is
 * tried again later.
 *
 * Keys are UUID paths that are never reused for other content, so successful
 * responses are cached for a year at the edge and in browsers.
 */

const WIDTHS = [300, 600, 1000, 1600];
const YEAR = 'public, max-age=31536000, immutable';
const SHORT = 'public, max-age=3600';
const MAX_SOURCE = 20 * 1024 * 1024; // Images binding input limit

/** @param {string} key @param {number} w */
export function variantKey(key, w) {
	const slash = key.lastIndexOf('/');
	const dot = key.lastIndexOf('.');
	return `${dot > slash ? key.slice(0, dot) : key}_${w}.webp`;
}

/** @param {string} path URL pathname */
export function keyFromPath(path) {
	let key;
	try { key = decodeURIComponent(path.replace(/^\/+/, '')); } catch { return null; }
	// R2 keys from Portal: "<uuid>/<type>/<uuid>.<ext>" and similar. No traversal, no variants requested directly.
	if (!key || key.length > 300 || key.includes('..') || key.includes('\\') || !/^[\w./-]+$/.test(key)) return null;
	return key;
}

/** @param {R2ObjectBody | R2Object} obj @param {string} cache */
function headersFor(obj, cache) {
	const h = new Headers();
	obj.writeHttpMetadata(h);
	h.set('Cache-Control', cache);
	h.set('ETag', obj.httpEtag);
	h.set('Access-Control-Allow-Origin', '*');
	h.set('X-Content-Type-Options', 'nosniff');
	return h;
}

export default {
	/** @param {Request} request @param {{ BUCKET: R2Bucket, IMAGES: any }} env @param {ExecutionContext} ctx */
	async fetch(request, env, ctx) {
		if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
		const url = new URL(request.url);
		const key = keyFromPath(url.pathname);
		if (!key) return new Response('Not found', { status: 404 });
		const wParam = url.searchParams.get('w');
		const w = wParam == null ? null : Number(wParam);
		if (w != null && !WIDTHS.includes(w)) return new Response(`w must be one of ${WIDTHS.join(', ')}`, { status: 400 });

		// Edge cache first (keyed on the normalised URL).
		const cacheKey = new Request(`https://img.spilbraet.dk/${key}${w ? `?w=${w}` : ''}`);
		const cache = caches.default;
		const hit = await cache.match(cacheKey);
		if (hit) return request.method === 'HEAD' ? new Response(null, hit) : hit;

		const response = w ? await variant(env, key, w) : await original(env, key, YEAR);
		if (response.ok) ctx.waitUntil(cache.put(cacheKey, response.clone()));
		return request.method === 'HEAD' ? new Response(null, response) : response;
	}
};

/** @param {{ BUCKET: R2Bucket }} env @param {string} key @param {string} cacheControl */
async function original(env, key, cacheControl) {
	const obj = await env.BUCKET.get(key);
	if (!obj) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } });
	return new Response(obj.body, { headers: headersFor(obj, cacheControl) });
}

/** @param {{ BUCKET: R2Bucket, IMAGES: any }} env @param {string} key @param {number} w */
async function variant(env, key, w) {
	const vKey = variantKey(key, w);
	const stored = await env.BUCKET.get(vKey);
	if (stored) return new Response(stored.body, { headers: headersFor(stored, YEAR) });

	const src = await env.BUCKET.get(key);
	if (!src) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } });
	if (src.size > MAX_SOURCE) return new Response(src.body, { headers: headersFor(src, SHORT) });

	try {
		const out = await env.IMAGES.input(src.body)
			.transform({ width: w, fit: 'scale-down' })
			.output({ format: 'image/webp', quality: 82 });
		const bytes = await out.response().arrayBuffer();
		if (!bytes.byteLength) throw new Error('empty output');
		await env.BUCKET.put(vKey, bytes, { httpMetadata: { contentType: 'image/webp' } });
		return new Response(bytes, {
			headers: { 'Content-Type': 'image/webp', 'Cache-Control': YEAR, 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' }
		});
	} catch (e) {
		console.warn('variant failed, serving original', key, w, e instanceof Error ? e.message : e);
		return original(env, key, SHORT);
	}
}
