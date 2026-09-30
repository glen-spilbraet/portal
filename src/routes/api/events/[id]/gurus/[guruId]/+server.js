import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { removeEventGuru, setEventGuruStatus, setEventGuruFlow } from '$lib/server/gurus.js';

export async function PUT(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	if (typeof body?.in_email_flow === 'boolean') {
		await setEventGuruFlow(db, event.params.id, event.params.guruId, body.in_email_flow);
		return json({ ok: true });
	}
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
