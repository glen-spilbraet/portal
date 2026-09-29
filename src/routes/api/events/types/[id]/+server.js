import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { deleteEventType } from '$lib/server/events.js';

export async function DELETE(event) {
	const { db } = await requireEvents(event);
	await deleteEventType(db, event.params.id);
	return json({ ok: true });
}
