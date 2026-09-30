import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { removeEventContact, setEventContactFlow } from '$lib/server/events.js';

// Per-event contact: toggle email-flow (PUT) or detach (DELETE).
export async function PUT(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	if (typeof body?.in_email_flow === 'boolean') {
		await setEventContactFlow(db, event.params.id, event.params.contactId, body.in_email_flow);
	}
	return json({ ok: true });
}

export async function DELETE(event) {
	const { db } = await requireEvents(event);
	await removeEventContact(db, event.params.id, event.params.contactId);
	return json({ ok: true });
}
