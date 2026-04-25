import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { updateImageCrop } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	const token = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	return verifySession(token ?? '', secret);
}

/** PATCH /api/images/:imageId/crop — save new crop position */
export async function PATCH({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const { cropX, cropY } = await request.json();
	await updateImageCrop(db, params.imageId, cropX, cropY);

	return json({ ok: true });
}
