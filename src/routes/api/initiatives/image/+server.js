import { json, error } from '@sveltejs/kit';
import { requireInitiatives } from '$lib/server/manualInitiatives.js';

/** POST /api/initiatives/image — the square crop (JPEG, made in the browser) → R2.
 *  Served via /api/img/<key>?size=300|600|1000|1600 (resized + cached on demand). */
export async function POST({ request, cookies, platform }) {
	await requireInitiatives(cookies, platform);
	const bucket = platform?.env?.IMAGES;
	if (!bucket) error(500, 'Storage unavailable');
	const form = await request.formData();
	const file = form.get('file');
	if (!file || typeof file === 'string') error(400, 'No file provided');
	if (!/^image\//.test(file.type)) error(400, 'Not an image');
	if (file.size > 12 * 1024 * 1024) error(400, 'Image too large');
	const key = `initiatives/${crypto.randomUUID()}.jpg`;
	await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: 'image/jpeg' } });
	return json({ key });
}
