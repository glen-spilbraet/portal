import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { createEventType } from '$lib/server/events.js';

export async function POST(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	if (!body?.name?.trim()) return json({ message: 'Name is required' }, { status: 400 });
	const id = await createEventType(db, body.name.trim());
	return json({ id });
}
