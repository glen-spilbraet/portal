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

/** Trigger a verification run (worker runs it in the background). */
export async function POST({ cookies, platform }) {
	await requireAdmin(cookies, platform);
	const secret = platform?.env?.SYNC_SECRET;
	if (!secret) error(500, 'SYNC_SECRET not set in this environment');
	const res = await fetch(`${WORKER}/?verify=1`, { headers: { Authorization: `Bearer ${secret}` } });
	const body = await res.json().catch(() => ({}));
	if (!res.ok || body.ok === false) error(502, `Verification trigger failed: ${body.error ?? res.status}`);
	return json(body);
}

/** Poll the run status. */
export async function GET({ cookies, platform }) {
	await requireAdmin(cookies, platform);
	const sdb = platform?.env?.SALES_DB;
	const meta = sdb ? await sdb.prepare('SELECT status, last_run FROM verification_meta WHERE id = 1').first().catch(() => null) : null;
	return json(meta ?? { status: null });
}
