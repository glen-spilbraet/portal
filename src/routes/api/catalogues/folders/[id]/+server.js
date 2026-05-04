import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { renameFolder, deleteFolder } from '$lib/db.js';

async function getEmail(cookies, platform) {
	return verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

/** PATCH — rename */
export async function PATCH({ params, request, cookies, platform }) {
	if (!(await getEmail(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);

	const { name } = await request.json();
	if (!name?.trim()) error(400, 'name required');
	await renameFolder(db, params.id, name.trim());
	return json({ ok: true });
}

/** DELETE — remove folder (children move to parent) */
export async function DELETE({ params, cookies, platform }) {
	if (!(await getEmail(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);

	await deleteFolder(db, params.id);
	return json({ ok: true });
}
