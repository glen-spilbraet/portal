import { json, error } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { getEvent } from '$lib/server/events.js';
import { ensureTombola, getTombolaForEvent, setTombolaStatus, setTombolaPin, PIN_RE } from '$lib/server/tombola.js';

// Create the event's tombola (idempotent).
export async function POST(event) {
	const { db, email } = await requireEvents(event);
	if (!(await getEvent(db, event.params.id))) error(404, 'Event not found');
	return json({ tombola: await ensureTombola(db, event.params.id, email) });
}

// Open / close sign-ups, or set the screen PIN. Body: { status: 'open' | 'closed' } | { pin: '1234' }
export async function PATCH(event) {
	const { db } = await requireEvents(event);
	const t = await getTombolaForEvent(db, event.params.id);
	if (!t) error(404, 'No tombola for this event');
	const body = await event.request.json().catch(() => ({}));
	if ('pin' in body) {
		if (!PIN_RE.test(String(body.pin ?? ''))) error(400, 'PIN must be 4–8 digits');
		await setTombolaPin(db, t.id, String(body.pin));
		return json({ ok: true, pin: String(body.pin) });
	}
	const { status } = body;
	if (status !== 'open' && status !== 'closed') error(400, 'Bad status');
	await setTombolaStatus(db, t.id, status);
	return json({ ok: true, status });
}
