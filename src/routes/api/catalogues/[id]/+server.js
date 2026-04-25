import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { updateCatalogue, deleteCatalogue } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	const token = cookies.get('session');
	return verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

const ALLOWED = ['name', 'language', 'title', 'logo_key', 'logo_bg_color'];

export async function PUT({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	const body = await request.json();
	const patch = {};
	for (const key of ALLOWED) {
		if (key in body) patch[key] = body[key];
	}
	if (!Object.keys(patch).length) error(400, 'Nothing to update');
	await updateCatalogue(db, params.id, patch);
	return json({ ok: true });
}

export async function DELETE({ params, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	await deleteCatalogue(db, params.id);
	return json({ ok: true });
}
