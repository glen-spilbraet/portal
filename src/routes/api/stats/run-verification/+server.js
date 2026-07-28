import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';

const WORKER = 'https://hubspot-sales-sync.glen-16a.workers.dev';

/** Admin trigger for the HubSpot↔Rackbeat verification run (delegates to the worker). */
export async function POST({ cookies, platform }) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');

	const secret = platform?.env?.SYNC_SECRET;
	if (!secret) error(500, 'SYNC_SECRET not set in this environment');

	const res = await fetch(`${WORKER}/?verify=1`, { headers: { Authorization: `Bearer ${secret}` } });
	const body = await res.json().catch(() => ({}));
	if (!res.ok || body.ok === false) error(502, `Verification run failed: ${body.error ?? res.status}`);
	return json(body);
}
