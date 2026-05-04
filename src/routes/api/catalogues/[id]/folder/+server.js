import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { setCatalogueFolder } from '$lib/db.js';

async function getEmail(cookies, platform) {
	return verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

/** PATCH — move catalogue into a folder (or null for root) */
export async function PATCH({ params, request, cookies, platform }) {
	if (!(await getEmail(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);

	const { folder_id } = await request.json();
	await setCatalogueFolder(db, params.id, folder_id ?? null);
	return json({ ok: true });
}
