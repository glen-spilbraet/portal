import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';
import { buildAssessment, applyChanges } from '$lib/server/q4Orders.js';

async function requireQ4(cookies, platform) {
	const token  = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email  = await verifySession(token ?? '', secret);
	if (!email) error(401, 'Unauthorised');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const user = await getAllowedUser(db, email);
	if (!user) error(403, 'Access denied');
	const perms = await getUserPermissions(db, user);
	if (!perms.q4_orders) error(403, 'No access to Q4 Orders');

	const apiKey = platform?.env?.RACKBEAT_API_KEY;
	if (!apiKey) error(500, 'Rackbeat API key not configured');
	return { apiKey, db, email };
}

async function listHandled(db) {
	const rows = await db.prepare('SELECT order_number FROM q4_handled_orders').all();
	return new Set((rows.results ?? []).map((r) => String(r.order_number)));
}
async function markHandled(db, numbers, email) {
	const uniq = [...new Set(numbers.map((n) => String(n)).filter(Boolean))];
	if (!uniq.length) return;
	const stmt = db.prepare("INSERT OR IGNORE INTO q4_handled_orders (order_number, handled_by) VALUES (?, ?)");
	await db.batch(uniq.map((n) => stmt.bind(n, email ?? null)));
}

// GET /api/q4-orders — read every open draft + its colli assessment.
export async function GET({ cookies, platform }) {
	const { apiKey, db } = await requireQ4(cookies, platform);
	try {
		const data = await buildAssessment(apiKey);
		const handled = await listHandled(db);
		data.drafts = (data.drafts ?? []).filter((d) => !handled.has(String(d.number)));
		return json(data);
	} catch (err) {
		error(502, err instanceof Error ? err.message : 'Rackbeat request failed');
	}
}

// POST /api/q4-orders — transfer chosen adjustments back to Rackbeat.
// Body: { changes: [{ number, lines: [{ lineId, quantity?, discount_percentage?, remove? }] }] }
export async function POST({ request, cookies, platform }) {
	const { apiKey, db, email } = await requireQ4(cookies, platform);

	/** @type {any} */
	let body;
	try { body = await request.json(); } catch { error(400, 'Invalid JSON body'); }

	const changes = Array.isArray(body?.changes) ? body.changes : [];
	if (!changes.length) error(400, 'No changes to transfer');

	const results = await applyChanges(apiKey, changes);
	// Remember every draft that was transferred (not failed) so it won't reappear.
	await markHandled(db, results.filter((r) => r.status !== 'failed').map((r) => r.number), email);
	return json({
		updated: results.filter((r) => r.status === 'updated').length,
		failed:  results.filter((r) => r.status === 'failed').length,
		skipped: results.filter((r) => r.status === 'skipped').length,
		results
	});
}
