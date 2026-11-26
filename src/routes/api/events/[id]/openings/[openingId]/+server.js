import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { updateOpening, deleteOpening } from '$lib/server/gurus.js';

export async function PUT(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	await updateOpening(db, event.params.id, event.params.openingId, body ?? {});
	return json({ ok: true });
}

export async function DELETE(event) {
	const { db } = await requireEvents(event);
	await deleteOpening(db, event.params.id, event.params.openingId);
	return json({ ok: true });
}
