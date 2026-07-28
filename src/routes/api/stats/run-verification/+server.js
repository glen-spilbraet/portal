import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';

const WORKER = 'https://hubspot-sales-sync.glen-16a.workers.dev';

async function requireAdmin(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
}

/**
 * Run the HubSpot↔Rackbeat verification for a date range (deal close_date in
 * [from, to)). Runs synchronously on the worker (scoped periods complete in a
 * few minutes) and returns the summary.
 */
export async function POST({ request, cookies, platform }) {
	await requireAdmin(cookies, platform);
	const secret = platform?.env?.SYNC_SECRET;
	if (!secret) error(500, 'SYNC_SECRET not set in this environment');

	const { from, to } = await request.json().catch(() => ({}));
	if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
		error(400, 'from & to (YYYY-MM-DD) required');
	}

	const res = await fetch(`${WORKER}/?verify=1&from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${secret}` } });
	const body = await res.json().catch(() => ({}));
	if (!res.ok || body.ok === false) error(502, `Verification run failed: ${body.error ?? res.status}`);
	return json(body);
}
