import { json, error } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { addAsset } from '$lib/server/events.js';

function kindFor(type) {
	if (type?.startsWith('image/')) return 'image';
	if (type?.startsWith('video/')) return 'video';
	return 'file';
}

// Upload a file (image / video / any) onto an event. category: 'media' | 'marketing'.
export async function POST(event) {
	const { db, email } = await requireEvents(event);
	const bucket = event.platform?.env?.IMAGES;
	if (!bucket) error(500, 'Storage unavailable');

	const form = await event.request.formData();
	const file = form.get('file');
	if (!file || typeof file === 'string') error(400, 'No file provided');
	const category = form.get('category') === 'marketing' ? 'marketing' : 'media';

	const ext = file.name?.split('.').pop()?.toLowerCase() ?? 'bin';
	const r2Key = `events/${crypto.randomUUID()}.${ext}`;
	await bucket.put(r2Key, await file.arrayBuffer(), {
		httpMetadata: { contentType: file.type || 'application/octet-stream' }
	});

	const id = await addAsset(db, event.params.id, {
		category,
		kind: kindFor(file.type),
		r2_key: r2Key,
		filename: file.name ?? null,
		content_type: file.type || null,
		size: file.size ?? null,
		source: 'internal',
		uploaded_by: email,
	});
	return json({ id, r2_key: r2Key, filename: file.name ?? null, kind: kindFor(file.type), category });
}
