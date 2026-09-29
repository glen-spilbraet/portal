import { json, error } from '@sveltejs/kit';
import { getEventByToken, setParticipants } from '$lib/server/events.js';

// Public: the venue updates the participant count via the share token.
// Which field is editable is decided server-side by the event date:
//   before the event  → expected (sign-ups)
//   on/after the event → actual (turnout)
export async function POST(event) {
	const db = event.platform?.env?.DB;
	if (!db) error(500, 'Unavailable');

	const ev = await getEventByToken(db, event.params.token);
	if (!ev) error(404, 'Event not found');

	const body = await event.request.json().catch(() => ({}));
	const value = body?.value;

	const today = new Date().toISOString().slice(0, 10);
	const field = ev.event_date && today > ev.event_date ? 'actual' : 'expected';

	const res = await setParticipants(db, ev.id, field, value, 'venue', 'venue');
	return json({ ok: true, field, ...res });
}
