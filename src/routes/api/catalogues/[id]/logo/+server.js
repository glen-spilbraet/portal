import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { updateCatalogue } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	const token = cookies.get('session');
	return verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

/** POST /api/catalogues/[id]/logo — upload catalogue logo to R2 */
export async function POST({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	const bucket = platform?.env?.IMAGES;
	if (!db || !bucket) error(500, 'Storage unavailable');

	const formData = await request.formData();
	const file = formData.get('file');

	if (!file || typeof file === 'string') error(400, 'No file provided');

	const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
	const fileId = crypto.randomUUID();
	const r2Key = `catalogue-logos/${params.id}/${fileId}.${ext}`;

	const buffer = await file.arrayBuffer();
	await bucket.put(r2Key, buffer, {
		httpMetadata: { contentType: file.type }
	});

	await updateCatalogue(db, params.id, { logo_key: r2Key });

	return json({ key: r2Key });
}
