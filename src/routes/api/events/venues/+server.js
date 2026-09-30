import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { createVenue } from '$lib/server/events.js';

export async function POST(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	if (!body?.name?.trim()) return json({ message: 'Name is required' }, { status: 400 });
	const id = await createVenue(db, {
		name: body.name.trim(), address: body.address, zip: body.zip, city: body.city, country: body.country, notes: body.notes
	});
	return json({ id });
}
