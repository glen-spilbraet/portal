import { error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getPlanogramItem, updatePlanogramItem } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	return verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

/** GET /api/planograms/[id]/items/[itemId]/photo — serve photo (auth required) */
export async function GET({ params, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	const bucket = platform?.env?.PHOTOS;
	if (!db || !bucket) error(500);

	const item = await getPlanogramItem(db, Number(params.itemId));
	if (!item || item.project_id !== params.id) error(404);
	if (!item.photo_key) error(404, 'No photo');

	const obj = await bucket.get(item.photo_key);
	if (!obj) error(404);

	const headers = new Headers();
	obj.writeHttpMetadata(headers);
	headers.set('Cache-Control', 'private, max-age=3600');
	return new Response(obj.body, { headers });
}

/** POST /api/planograms/[id]/items/[itemId]/photo — upload photo */
export async function POST({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	const bucket = platform?.env?.PHOTOS;
	if (!db || !bucket) error(500);

	const item = await getPlanogramItem(db, Number(params.itemId));
	if (!item || item.project_id !== params.id) error(404);

	const contentType = request.headers.get('content-type') || 'image/jpeg';
	const ext = contentType.split('/')[1]?.split(';')[0] ?? 'jpg';
	const key = `planogram-photos/${params.id}/${params.itemId}.${ext}`;

	// Delete old photo if exists
	if (item.photo_key && item.photo_key !== key) {
		await bucket.delete(item.photo_key).catch(() => {});
	}

	const buffer = await request.arrayBuffer();
	await bucket.put(key, buffer, { httpMetadata: { contentType } });
	await updatePlanogramItem(db, Number(params.itemId), { photo_key: key, is_placeholder: 0 });

	return new Response(JSON.stringify({ ok: true, key }), {
		headers: { 'Content-Type': 'application/json' }
	});
}
