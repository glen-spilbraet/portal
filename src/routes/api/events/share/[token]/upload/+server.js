import { warmImageWidths } from '$lib/server/imageCdn.js';
import { json, error } from '@sveltejs/kit';
import { getEventByToken, addAsset } from '$lib/server/events.js';

const MAX_BYTES = 100 * 1024 * 1024;

function kindFor(type) {
	if (type?.startsWith('image/')) return 'image';
	if (type?.startsWith('video/')) return 'video';
	return 'file';
}

// Public: a venue uploads a photo/video to their event via the share token.
// No portal session — the unguessable token is the authorisation.
export async function POST(event) {
	const db = event.platform?.env?.DB;
	const bucket = event.platform?.env?.IMAGES;
	if (!db || !bucket) error(500, 'Unavailable');

	const ev = await getEventByToken(db, event.params.token);
	if (!ev) error(404, 'Event not found');

	const form = await event.request.formData();
	const file = form.get('file');
	if (!file || typeof file === 'string') error(400, 'No file provided');

	// Photos and videos only, of a sane size — this endpoint needs no login.
	const kind = kindFor(file.type);
	if (kind === 'file' || /svg/i.test(file.type)) error(400, 'Only photos and videos can be uploaded here');
	if (file.size > MAX_BYTES) error(413, 'That file is too large (max 100 MB)');
	const rawExt = file.name?.split('.').pop()?.toLowerCase() ?? '';
	const ext = /^[a-z0-9]{1,5}$/.test(rawExt) && !['svg', 'html', 'htm', 'xml', 'js'].includes(rawExt) ? rawExt : (kind === 'image' ? 'jpg' : 'mp4');
	const r2Key = `events/${crypto.randomUUID()}.${ext}`;
	await bucket.put(r2Key, await file.arrayBuffer(), {
		httpMetadata: { contentType: file.type || 'application/octet-stream' }
	});
	// Have the image CDN make its WebP widths now, so the photo grid never waits on them.
	if (kindFor(file.type) === 'image') warmImageWidths(event.platform, r2Key);

	const id = await addAsset(db, ev.id, {
		category: 'media',
		kind: kindFor(file.type),
		r2_key: r2Key,
		filename: file.name ?? null,
		content_type: file.type || null,
		size: file.size ?? null,
		source: 'venue',
		uploaded_by: 'venue',
	});
	return json({ id, r2_key: r2Key, filename: file.name ?? null, kind: kindFor(file.type) });
}
