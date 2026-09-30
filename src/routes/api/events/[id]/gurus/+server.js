import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { addEventGurus } from '$lib/server/gurus.js';

// Attach one or more gurus to this event as proposals.
export async function POST(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	await addEventGurus(db, event.params.id, Array.isArray(body?.guruIds) ? body.guruIds : []);
	return json({ ok: true });
}
