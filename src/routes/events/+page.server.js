import { error } from '@sveltejs/kit';
import { listEvents, listEventTypes } from '$lib/server/events.js';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (!user?.permissions?.events) error(403, "You don't have access to this section.");

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const [events, venues, types] = await Promise.all([
		listEvents(db),
		db.prepare('SELECT id, name, city FROM venue ORDER BY name COLLATE NOCASE').all().then((r) => r.results ?? []),
		listEventTypes(db),
	]);
	return { user, events, venues, types };
}
