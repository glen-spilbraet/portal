import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { createOpening } from '$lib/server/gurus.js';

// Add a guru opening (label optional, slots 1–50) to the event.
export async function POST(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	const id = await createOpening(db, event.params.id, { label: body?.label, slots: body?.slots ?? 1 });
	return json({ id });
}
