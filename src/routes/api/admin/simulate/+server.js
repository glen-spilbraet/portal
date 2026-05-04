import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';

async function requireAdmin(cookies, platform) {
	const token  = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email  = await verifySession(token ?? '', secret);
	if (!email) error(401, 'Unauthorised');
	const db   = platform?.env?.DB;
	if (!db)   error(500, 'Database unavailable');
	const user = await getAllowedUser(db, email);
	if (!user || user.role !== 'admin') error(403, 'Admins only');
	return { db, adminEmail: email };
}

/** POST { email } — start simulating a user */
export async function POST({ request, cookies, platform }) {
	const { db, adminEmail } = await requireAdmin(cookies, platform);
	const { email } = await request.json();
	if (!email || email === adminEmail) error(400, 'Invalid target user');

	const target = await getAllowedUser(db, email);
	if (!target) error(404, 'User not found');

	cookies.set('simulate_as', email, {
		path:     '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge:   60 * 60 * 8, // 8 hours
	});
	return json({ ok: true });
}

/** DELETE — end simulation */
export async function DELETE({ cookies, platform }) {
	await requireAdmin(cookies, platform);
	cookies.delete('simulate_as', { path: '/' });
	return json({ ok: true });
}
