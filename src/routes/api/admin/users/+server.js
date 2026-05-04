import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, addAllowedUser, listAllowedUsers } from '$lib/db.js';

async function requireAdmin(cookies, platform) {
	const token = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email = await verifySession(token ?? '', secret);
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const user = await getAllowedUser(db, email);
	if (!user || user.role !== 'admin') error(403, 'Admins only');
	return { db, email };
}

export async function GET({ cookies, platform }) {
	const { db } = await requireAdmin(cookies, platform);
	const users = await listAllowedUsers(db);
	return json(users);
}

export async function POST({ request, cookies, platform }) {
	const { db } = await requireAdmin(cookies, platform);
	const body = await request.json();
	const email = body.email?.toLowerCase?.()?.trim();
	const role = body.role === 'admin' ? 'admin' : 'user';
	const permissionSetId = body.permission_set_id || null;
	const firstName = typeof body.first_name === 'string' ? body.first_name.trim() || null : null;
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		error(400, 'Invalid email');
	}
	await addAllowedUser(db, email, role, null, permissionSetId, firstName);
	const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
	return json({ email, role, name: null, first_name: firstName, added_at: now, permission_set_id: permissionSetId }, { status: 201 });
}
