import { error } from '@sveltejs/kit';

/** GET /api/img/[...key] — stream image from R2.
 *  No auth required: R2 keys are UUID-based random paths, not guessable.
 *  This allows shared catalogue links to display images without a session.
 *
 *  Optional ?size=300 or ?size=1000 will try to serve a resized variant
 *  (stored as key_300.webp / key_1000.webp) and fall back to the original.
 */
export async function GET({ params, url, platform }) {
	const bucket = platform?.env?.IMAGES;
	if (!bucket) error(500, 'Storage unavailable');

	const key  = params.key;
	const size = url.searchParams.get('size');

	// Try variant first when a size is requested
	if (size === '300' || size === '400' || size === '1000' || size === '1600') {
		const lastSlash = key.lastIndexOf('/');
		const lastDot   = key.lastIndexOf('.');
		const variantKey = lastDot > lastSlash
			? key.slice(0, lastDot) + `_${size}.webp`
			: key + `_${size}.webp`;
		const variantObj = await bucket.get(variantKey);
		if (variantObj) {
			const headers = new Headers();
			variantObj.writeHttpMetadata(headers);
			headers.set('Cache-Control', 'public, max-age=3600');
			return new Response(variantObj.body, { headers });
		}
		// Variant not found — fall through to original
	}

	const obj = await bucket.get(key);
	if (!obj) error(404, 'Image not found');

	const headers = new Headers();
	obj.writeHttpMetadata(headers);
	headers.set('Cache-Control', 'public, max-age=3600');

	return new Response(obj.body, { headers });
}
