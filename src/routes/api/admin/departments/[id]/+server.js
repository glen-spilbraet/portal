import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, renameDepartment, deleteDepartment } from '$lib/db.js';

async function requireAdmin(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const user = await getAllowedUser(db, email);
	if (!user || user.role !== 'admin') error(403, 'Admins only');
	return db;
}

export async function PATCH({ params, request, cookies, platform }) {
	const db = await requireAdmin(cookies, platform);
	const body = await request.json().catch(() => ({}));
	if (!(body.name ?? '').trim()) error(400, 'Name required');
	await renameDepartment(db, params.id, body.name);
	return json({ ok: true });
}

export async function DELETE({ params, cookies, platform }) {
	const db = await requireAdmin(cookies, platform);
	await deleteDepartment(db, params.id);
	return json({ ok: true });
}
