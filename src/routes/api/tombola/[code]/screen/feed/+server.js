import { json, error } from '@sveltejs/kit';
import { getTombolaByCode, boardFeed } from '$lib/server/tombola.js';
import { screenAccess } from '$lib/server/tombolaScreen.js';

// Big-screen poll (Portal login or PIN cookie): new entries/shoutouts since ?since=, status, count, winners.
export async function GET(event) {
	const db = event.platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const t = await getTombolaByCode(db, event.params.code);
	if (!t) error(404, 'Not found');
	if (!(await screenAccess(event, t))) error(401, 'PIN required');
	return json(await boardFeed(db, t.id, event.url.searchParams.get('since')), { headers: { 'cache-control': 'no-store' } });
}
