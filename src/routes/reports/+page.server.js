import { error } from '@sveltejs/kit';
import { listReports } from '$lib/db.js';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (!user?.permissions?.reports) error(403, "You don't have access to this section.");
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	return { user, reports: await listReports(db) };
}
