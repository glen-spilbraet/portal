import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { addEventContacts } from '$lib/server/events.js';

// Attach one or more venue contacts to this event.
export async function POST(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	await addEventContacts(db, event.params.id, Array.isArray(body?.contactIds) ? body.contactIds : []);
	return json({ ok: true });
}
