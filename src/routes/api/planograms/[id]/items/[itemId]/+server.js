import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { deletePlanogramItem, updatePlanogramItem } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	return verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

export async function PUT({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	const body = await request.json();
	const patch = {};
	const allowed = ['sku', 'name', 'width_cm', 'height_cm', 'is_placeholder', 'photo_key'];
	for (const k of allowed) if (k in body) patch[k] = body[k];
	if (!Object.keys(patch).length) error(400, 'Nothing to update');
	await updatePlanogramItem(db, Number(params.itemId), patch);
	return json({ ok: true });
}

export async function DELETE({ params, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	const bucket = platform?.env?.PHOTOS;
	if (!db) error(500);
	const photoKey = await deletePlanogramItem(db, Number(params.itemId));
	if (photoKey && bucket) bucket.delete(photoKey).catch(() => {});
	return json({ ok: true });
}
