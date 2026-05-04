import { json, error } from '@sveltejs/kit';
import { getEffectiveEmail } from '$lib/server/effectiveEmail.js';
import { createFolder } from '$lib/db.js';

/** POST — create a folder */
export async function POST({ request, cookies, platform }) {
	const email = await getEffectiveEmail(cookies, platform);
	if (!email) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);

	const { name, parent_id } = await request.json();
	if (!name?.trim()) error(400, 'name required');

	const id = crypto.randomUUID();
	await createFolder(db, id, name.trim(), parent_id ?? null, email);
	return json({ id, name: name.trim(), parent_id: parent_id ?? null, created_by: email });
}
