import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { removeEventGuru, setEventGuruStatus } from '$lib/server/gurus.js';

export async function PUT(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	const ok = ['invited', 'accepted', 'declined', 'confirmed'];
	if (!ok.includes(body?.status)) return json({ message: 'Invalid status' }, { status: 400 });
	await setEventGuruStatus(db, event.params.id, event.params.guruId, body.status);
	return json({ ok: true });
}

export async function DELETE(event) {
	const { db } = await requireEvents(event);
	await removeEventGuru(db, event.params.id, event.params.guruId);
	return json({ ok: true });
}
