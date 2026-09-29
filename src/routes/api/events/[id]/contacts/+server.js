import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { setEventContacts } from '$lib/server/events.js';

// Attach/detach venue contacts to this event.
export async function PUT(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	await setEventContacts(db, event.params.id, Array.isArray(body?.contactIds) ? body.contactIds : []);
	return json({ ok: true });
}
