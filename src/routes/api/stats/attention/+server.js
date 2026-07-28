import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';
import { addHide, removeHide } from '$lib/salesStats.js';

/**
 * Snooze / dismiss / restore a customer on the attention list.
 * Body: { companyId, op: 'snooze'|'dismiss'|'restore', until?: 'YYYY-MM-DD' }
 * - snooze  → per-user, hidden until `until`
 * - dismiss → global (admins) or per-user (reps), indefinite
 * - restore → clears the user's hide (+ global if admin)
 */
export async function POST({ request, cookies, platform }) {
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email = await verifySession(cookies.get('session') ?? '', secret);
	if (!email) error(401, 'Unauthorised');

	const db = platform?.env?.DB;
	const salesDb = platform?.env?.SALES_DB;
	if (!db || !salesDb) error(500, 'Database unavailable');

	const user = await getAllowedUser(db, email);
	if (!user) error(403, 'Forbidden');
	const perms = await getUserPermissions(db, user);
	if (!perms.stats) error(403, 'No access to stats');

	let effEmail = email;
	let effRole = user.role;
	if (user.role === 'admin') {
		const sim = cookies.get('simulate_as');
		if (sim && sim !== email) {
			const su = await getAllowedUser(db, sim);
			if (su) { effEmail = sim; effRole = su.role; }
		}
	}
	const isAdmin = effRole === 'admin';

	const body = await request.json().catch(() => ({}));
	const companyId = body.companyId?.toString();
	const op = body.op?.toString();
	if (!companyId || !op) error(400, 'Missing companyId or op');

	if (op === 'restore') {
		await removeHide(salesDb, { companyId, userEmail: effEmail, isAdmin });
	} else if (op === 'snooze') {
		const until = body.until?.toString();
		if (!until || !/^\d{4}-\d{2}-\d{2}$/.test(until)) error(400, 'Invalid until date');
		await addHide(salesDb, { scope: 'user', userEmail: effEmail, createdBy: effEmail, companyId, untilDate: until });
	} else if (op === 'dismiss') {
		if (isAdmin) {
			await addHide(salesDb, { scope: 'global', userEmail: '*', createdBy: effEmail, companyId, untilDate: null });
		} else {
			await addHide(salesDb, { scope: 'user', userEmail: effEmail, createdBy: effEmail, companyId, untilDate: null });
		}
	} else {
		error(400, 'Unknown op');
	}

	return json({ ok: true });
}
