import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { addContact } from '$lib/server/events.js';

export async function POST(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	const id = await addContact(db, event.params.id, {
		name: body.name, phone: body.phone, email: body.email, role: body.role
	});
	return json({ id });
}
