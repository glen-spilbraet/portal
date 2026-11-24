import { json, error } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { getTombolaForEvent, drawWinner } from '$lib/server/tombola.js';

// Draw a winner among participants who haven't won yet.
export async function POST(event) {
	const { db, email } = await requireEvents(event);
	const t = await getTombolaForEvent(db, event.params.id);
	if (!t) error(404, 'No tombola for this event');
	const winner = await drawWinner(db, t.id, email);
	if (!winner) return json({ error: 'empty' }, { status: 409 });
	return json({ winner });
}
