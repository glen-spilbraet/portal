import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { setEventSkus } from '$lib/server/events.js';

export async function PUT(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	await setEventSkus(db, event.params.id, Array.isArray(body?.skus) ? body.skus : []);
	return json({ ok: true });
}
