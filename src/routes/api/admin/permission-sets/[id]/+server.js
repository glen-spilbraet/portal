import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, updatePermissionSet, deletePermissionSet } from '$lib/db.js';

async function requireAdmin(cookies, platform) {
	const token  = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email  = await verifySession(token ?? '', secret);
	if (!email) error(401, 'Unauthorised');
	const db   = platform?.env?.DB;
	if (!db)   error(500, 'Database unavailable');
	const user = await getAllowedUser(db, email);
	if (!user || user.role !== 'admin') error(403, 'Admins only');
	return { db };
}

export async function PUT({ params, request, cookies, platform }) {
	const { db } = await requireAdmin(cookies, platform);
	const body   = await request.json();
	const patch  = {};

	if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
	if (typeof body.access_sheets     === 'boolean') patch.access_sheets     = body.access_sheets     ? 1 : 0;
	if (typeof body.access_catalogues === 'boolean') patch.access_catalogues = body.access_catalogues ? 1 : 0;
	if (typeof body.access_planograms === 'boolean') patch.access_planograms = body.access_planograms ? 1 : 0;
	if (typeof body.access_data       === 'boolean') patch.access_data       = body.access_data       ? 1 : 0;

	if (Object.keys(patch).length === 0) error(400, 'Nothing to update');
	await updatePermissionSet(db, params.id, patch);
	return json({ ok: true });
}

export async function DELETE({ params, cookies, platform }) {
	const { db } = await requireAdmin(cookies, platform);
	await deletePermissionSet(db, params.id);
	return json({ ok: true });
}
