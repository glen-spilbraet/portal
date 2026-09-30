import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { updateGuru, deleteGuru } from '$lib/server/gurus.js';

export async function PUT(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	await updateGuru(db, event.params.id, body);
	return json({ ok: true });
}

export async function DELETE(event) {
	const { db } = await requireEvents(event);
	await deleteGuru(db, event.params.id);
	return json({ ok: true });
}
