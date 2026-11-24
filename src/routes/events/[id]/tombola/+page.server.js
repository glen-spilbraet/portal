import { error } from '@sveltejs/kit';
import { getEvent } from '$lib/server/events.js';
import { ensureTombola } from '$lib/server/tombola.js';

// Big-screen tombola board (internal: needs the `events` permission).
export async function load({ params, parent, platform, url }) {
	const { user } = await parent();
	if (!user?.permissions?.events) error(403, "You don't have access to this section.");
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const event = await getEvent(db, params.id);
	if (!event) error(404, 'Event not found');
	const tombola = await ensureTombola(db, event.id, user.email);

	return {
		eventId: event.id,
		eventTitle: event.title || 'Event',
		venueName: event.venue_name ?? null,
		code: tombola.code,
		joinUrl: `${url.origin}/tombola/${tombola.code}`,
		joinHost: `${url.host}/tombola/${tombola.code}`,
	};
}
