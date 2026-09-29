import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { updateStep, deleteStep } from '$lib/server/eventEmails.js';

export async function PUT(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	await updateStep(db, event.params.id, body);
	return json({ ok: true });
}

export async function DELETE(event) {
	const { db } = await requireEvents(event);
	await deleteStep(db, event.params.id);
	return json({ ok: true });
}
