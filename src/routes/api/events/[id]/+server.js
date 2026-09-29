import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { updateEvent, deleteEvent, setParticipants } from '$lib/server/events.js';

export async function PUT(event) {
	const { db, email } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	// Participant fields go through the logged setter (audit trail).
	if ('participants_expected' in body) {
		await setParticipants(db, event.params.id, 'expected', body.participants_expected, 'internal', email);
		delete body.participants_expected;
	}
	if ('participants_actual' in body) {
		await setParticipants(db, event.params.id, 'actual', body.participants_actual, 'internal', email);
		delete body.participants_actual;
	}
	await updateEvent(db, event.params.id, body);
	return json({ ok: true });
}

export async function DELETE(event) {
	const { db } = await requireEvents(event);
	await deleteEvent(db, event.params.id);
	return json({ ok: true });
}
