import { error } from '@sveltejs/kit';
import { listPermissionSets } from '$lib/db.js';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const sets = await listPermissionSets(db);
	return { sets };
}
