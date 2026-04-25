import { error } from '@sveltejs/kit';

/** GET /api/img/[...key] — stream image from R2.
 *  No auth required: R2 keys are UUID-based random paths, not guessable.
 *  This allows shared catalogue links to display images without a session.
 */
export async function GET({ params, platform }) {
	const bucket = platform?.env?.IMAGES;
	if (!bucket) error(500, 'Storage unavailable');

	const obj = await bucket.get(params.key);
	if (!obj) error(404, 'Image not found');

	const headers = new Headers();
	obj.writeHttpMetadata(headers);
	headers.set('Cache-Control', 'public, max-age=3600');

	return new Response(obj.body, { headers });
}
