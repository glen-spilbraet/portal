import { json, error } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { getTombolaForEvent, setShoutoutHidden } from '$lib/server/tombola.js';

// Moderation: hide/unhide a shoutout on the board (never deleted). Body: { hidden: bool }
export async function PATCH(event) {
	const { db } = await requireEvents(event);
	const t = await getTombolaForEvent(db, event.params.id);
	if (!t) error(404, 'No tombola for this event');
	const { hidden } = await event.request.json().catch(() => ({}));
	await setShoutoutHidden(db, t.id, event.params.sid, !!hidden);
	return json({ ok: true });
}
