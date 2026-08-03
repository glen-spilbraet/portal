import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';

const WORKER = 'https://hubspot-sales-sync.glen-16a.workers.dev';

/**
 * Apply fixes to selected deals: writes Rackbeat's values into HubSpot and
 * updates our mirror. Admin only. Delegates to the worker (holds HUBSPOT_TOKEN).
 * Body: { dealIds: string[], field: 'date'|'amount'|'both' }
 */
export async function POST({ request, cookies, platform }) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
	const secret = platform?.env?.SYNC_SECRET;
	if (!secret) error(500, 'SYNC_SECRET not set in this environment');

	const { dealIds, field } = await request.json().catch(() => ({}));
	if (!Array.isArray(dealIds) || !dealIds.length || !['date', 'amount', 'currency', 'all'].includes(field)) {
		error(400, 'dealIds[] and field (date|amount|currency|all) required');
	}

	const res = await fetch(`${WORKER}/?fix=1`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ dealIds, field }),
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok || body.ok === false) error(502, `Fix failed: ${body.error ?? res.status}`);
	return json(body);
}
