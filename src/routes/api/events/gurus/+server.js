import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { createGuru } from '$lib/server/gurus.js';

export async function POST(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	if (!body?.name?.trim()) return json({ message: 'Name is required' }, { status: 400 });
	const id = await createGuru(db, body);
	return json({ id });
}
