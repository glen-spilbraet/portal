import { json, error } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { getEvent } from '$lib/server/events.js';
import { ensureTombola, getTombolaForEvent, setTombolaStatus } from '$lib/server/tombola.js';

// Create the event's tombola (idempotent).
export async function POST(event) {
	const { db, email } = await requireEvents(event);
	if (!(await getEvent(db, event.params.id))) error(404, 'Event not found');
	return json({ tombola: await ensureTombola(db, event.params.id, email) });
}

// Open / close sign-ups. Body: { status: 'open' | 'closed' }
export async function PATCH(event) {
	const { db } = await requireEvents(event);
	const t = await getTombolaForEvent(db, event.params.id);
	if (!t) error(404, 'No tombola for this event');
	const { status } = await event.request.json().catch(() => ({}));
	if (status !== 'open' && status !== 'closed') error(400, 'Bad status');
	await setTombolaStatus(db, t.id, status);
	return json({ ok: true, status });
}
