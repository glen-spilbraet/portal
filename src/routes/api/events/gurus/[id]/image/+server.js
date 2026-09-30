import { json, error } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { getGuru, updateGuru } from '$lib/server/gurus.js';

// Upload/replace a guru's photo (IMAGES bucket, gurus/…).
export async function POST(event) {
	const { db } = await requireEvents(event);
	const bucket = event.platform?.env?.IMAGES;
	if (!bucket) error(500, 'Storage unavailable');

	const form = await event.request.formData();
	const file = form.get('file');
	if (!file || typeof file === 'string') error(400, 'No file provided');

	const ext = file.name?.split('.').pop()?.toLowerCase() ?? 'jpg';
	const key = `gurus/${crypto.randomUUID()}.${ext}`;
	await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });

	// Remove the previous photo if any.
	const prev = await getGuru(db, event.params.id);
	if (prev?.image_key) { try { await bucket.delete(prev.image_key); } catch { /* ignore */ } }

	await updateGuru(db, event.params.id, { image_key: key });
	return json({ key });
}
