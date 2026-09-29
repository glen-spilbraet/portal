import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { updateEventType, deleteEventType } from '$lib/server/events.js';

export async function PUT(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	if (!body?.name?.trim()) return json({ message: 'Name is required' }, { status: 400 });
	await updateEventType(db, event.params.id, body.name.trim());
	return json({ ok: true });
}

export async function DELETE(event) {
	const { db } = await requireEvents(event);
	await deleteEventType(db, event.params.id);
	return json({ ok: true });
}
