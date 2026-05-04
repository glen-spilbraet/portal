import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getSharesForPlanogram, sharePlanogramWith } from '$lib/db.js';

async function getEmail(cookies, platform) {
	return verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

/** GET — list who this project is shared with */
export async function GET({ params, cookies, platform }) {
	const email = await getEmail(cookies, platform);
	if (!email) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);

	const shares = await getSharesForPlanogram(db, params.id);
	return json(shares);
}

/** POST — share with a user */
export async function POST({ params, request, cookies, platform }) {
	const email = await getEmail(cookies, platform);
	if (!email) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);

	const { shared_with_email } = await request.json();
	if (!shared_with_email?.trim()) error(400, 'shared_with_email required');
	if (shared_with_email.trim().toLowerCase() === email.toLowerCase()) {
		error(400, 'Cannot share with yourself');
	}

	await sharePlanogramWith(db, params.id, shared_with_email.trim().toLowerCase(), email);
	return json({ ok: true });
}
