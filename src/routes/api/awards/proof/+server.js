import { json, error } from '@sveltejs/kit';
import { requireAwards } from '$lib/server/awardsAuth.js';

/** POST /api/awards/proof — upload a proof file (PDF etc.) to R2, return its key.
 *  Served back via /api/img/[...key]. */
export async function POST({ request, cookies, platform }) {
	await requireAwards(cookies, platform);
	const bucket = platform?.env?.IMAGES;
	if (!bucket) error(500, 'Storage unavailable');

	const form = await request.formData();
	const file = form.get('file');
	if (!file || typeof file === 'string') error(400, 'No file provided');

	const ext = file.name?.split('.').pop()?.toLowerCase() ?? 'pdf';
	const key = `award-proofs/${crypto.randomUUID()}.${ext}`;
	await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
	return json({ key, name: file.name ?? key });
}
