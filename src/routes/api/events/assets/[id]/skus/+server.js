import { json, error } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { setAssetSkus } from '$lib/server/events.js';

// Replace the product tags on an event photo/video. Body: { skus: string[] }.
// SKUs not yet on the event are added to it too (returned as `mapped`).
export async function PUT(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	const result = await setAssetSkus(db, event.params.id, Array.isArray(body?.skus) ? body.skus : []);
	if (!result) error(404, 'Asset not found');
	return json({ ok: true, ...result });
}
