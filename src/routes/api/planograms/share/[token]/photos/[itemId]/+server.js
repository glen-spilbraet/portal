import { error } from '@sveltejs/kit';
import { getPlanogramProjectByShareToken, getPlanogramItem } from '$lib/db.js';

/** GET — public photo endpoint for shared planograms */
export async function GET({ params, platform }) {
	const db = platform?.env?.DB;
	const bucket = platform?.env?.PHOTOS;
	if (!db || !bucket) error(500);

	const project = await getPlanogramProjectByShareToken(db, params.token);
	if (!project) error(404);

	const item = await getPlanogramItem(db, Number(params.itemId));
	if (!item || item.project_id !== project.id) error(404);
	if (!item.photo_key) error(404, 'No photo');

	const obj = await bucket.get(item.photo_key);
	if (!obj) error(404);

	const headers = new Headers();
	obj.writeHttpMetadata(headers);
	headers.set('Cache-Control', 'public, max-age=3600');
	return new Response(obj.body, { headers });
}
