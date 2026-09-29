import { error } from '@sveltejs/kit';
import { listEventTypes } from '$lib/server/events.js';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (!user?.permissions?.events) error(403, "You don't have access to this section.");

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const types = await listEventTypes(db);
	return { user, types };
}
