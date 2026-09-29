import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { createStep } from '$lib/server/eventEmails.js';

export async function POST(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	const id = await createStep(db, body ?? {});
	return json({ id });
}
