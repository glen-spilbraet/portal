import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, updateAllowedUser, removeAllowedUser } from '$lib/db.js';

async function requireAdmin(cookies, platform) {
	const token = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email = await verifySession(token ?? '', secret);
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const user = await getAllowedUser(db, email);
	if (!user || user.role !== 'admin') error(403, 'Admins only');
	return { db, adminEmail: email };
}

export async function PATCH({ params, request, cookies, platform }) {
	const { db } = await requireAdmin(cookies, platform);
	const targetEmail = decodeURIComponent(params.email);
	const body = await request.json();
	const patch = {};

	if (body.role !== undefined) {
		if (body.role !== 'user' && body.role !== 'admin') error(400, 'Invalid role');
		patch.role = body.role;
	}
	if ('permission_set_id' in body) {
		patch.permission_set_id = body.permission_set_id || null;
	}
	if ('first_name' in body) {
		patch.first_name = typeof body.first_name === 'string' ? body.first_name.trim() || null : null;
	}
	if ('send_from' in body) {
		patch.send_from = typeof body.send_from === 'string' ? body.send_from.trim() || null : null;
	}
	if (Object.keys(patch).length === 0) error(400, 'Nothing to update');
	await updateAllowedUser(db, targetEmail, patch);
	return json({ ok: true });
}

export async function DELETE({ params, cookies, platform }) {
	const { db, adminEmail } = await requireAdmin(cookies, platform);
	const targetEmail = decodeURIComponent(params.email);
	if (targetEmail === adminEmail) error(400, 'Cannot remove yourself');
	await removeAllowedUser(db, targetEmail);
	return json({ ok: true });
}
