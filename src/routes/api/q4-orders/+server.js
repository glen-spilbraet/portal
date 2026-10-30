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
	return { apiKey };
}

// GET /api/q4-orders — read every open draft + its colli assessment.
export async function GET({ cookies, platform }) {
	const { apiKey } = await requireQ4(cookies, platform);
	try {
		const data = await buildAssessment(apiKey);
		return json(data);
	} catch (err) {
		error(502, err instanceof Error ? err.message : 'Rackbeat request failed');
	}
}

// POST /api/q4-orders — transfer chosen adjustments back to Rackbeat.
// Body: { changes: [{ number, lines: [{ lineId, quantity?, discount_percentage?, remove? }] }] }
export async function POST({ request, cookies, platform }) {
	const { apiKey } = await requireQ4(cookies, platform);

	/** @type {any} */
	let body;
	try { body = await request.json(); } catch { error(400, 'Invalid JSON body'); }

	const changes = Array.isArray(body?.changes) ? body.changes : [];
	if (!changes.length) error(400, 'No changes to transfer');

	const results = await applyChanges(apiKey, changes);
	return json({
		updated: results.filter((r) => r.status === 'updated').length,
		failed:  results.filter((r) => r.status === 'failed').length,
		skipped: results.filter((r) => r.status === 'skipped').length,
		results
	});
}
