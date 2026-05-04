import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { unsharePlanogramWith } from '$lib/db.js';

async function getEmail(cookies, platform) {
	return verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

/** DELETE — revoke access for one user */
export async function DELETE({ params, cookies, platform }) {
	if (!(await getEmail(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);

	await unsharePlanogramWith(db, params.id, decodeURIComponent(params.email));
	return json({ ok: true });
}
