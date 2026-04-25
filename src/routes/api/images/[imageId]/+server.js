import { error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';

async function checkAuth(cookies, platform) {
	const token = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	return verifySession(token ?? '', secret);
}

/** DELETE /api/images/:imageId — remove image from DB and R2 */
export async function DELETE({ params, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	const bucket = platform?.env?.IMAGES;
	if (!db || !bucket) error(500, 'Storage unavailable');

	const { deleteImage } = await import('$lib/db.js');
	const r2Key = await deleteImage(db, params.imageId);
	if (r2Key) {
		await bucket.delete(r2Key);
	}

	return new Response(null, { status: 204 });
}

/** PATCH /api/images/:imageId/crop is handled by crop sub-route */
