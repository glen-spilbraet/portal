import { error } from '@sveltejs/kit';
import { listProfiles } from '$lib/server/profile.js';

/** Admin → Profiles: every user's profile (photo, name, title, phone) in one table. */
export async function load({ parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	return { profiles: await listProfiles(db) };
}
