import { json, error } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { getTombolaForEvent, boardFeed } from '$lib/server/tombola.js';

// Big-screen poll: new entries/shoutouts since ?since=, plus status, count, winners.
export async function GET(event) {
	const { db } = await requireEvents(event);
	const t = await getTombolaForEvent(db, event.params.id);
	if (!t) error(404, 'No tombola for this event');
	const feed = await boardFeed(db, t.id, event.url.searchParams.get('since'));
	return json(feed, { headers: { 'cache-control': 'no-store' } });
}
