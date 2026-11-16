import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { getAsset, deleteAsset, setAssetRating } from '$lib/server/events.js';

export async function DELETE(event) {
	const { db } = await requireEvents(event);
	const asset = await getAsset(db, event.params.id);
	if (asset) {
		const bucket = event.platform?.env?.IMAGES;
		if (bucket && asset.r2_key) { try { await bucket.delete(asset.r2_key); } catch { /* ignore */ } }
		await deleteAsset(db, event.params.id);
	}
	return json({ ok: true });
}

// Body: { rating: 'good' | 'semi' | 'bad' | null }
export async function PATCH(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	const rating = await setAssetRating(db, event.params.id, body?.rating ?? null);
	return json({ ok: true, rating });
}
