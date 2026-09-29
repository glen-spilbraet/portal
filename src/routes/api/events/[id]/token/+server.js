import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { rotateShareToken } from '$lib/server/events.js';

// Rotate the venue share token (invalidates the previous link).
export async function POST(event) {
	const { db } = await requireEvents(event);
	const token = await rotateShareToken(db, event.params.id);
	return json({ token });
}
