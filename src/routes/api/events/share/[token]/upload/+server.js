import { warmImageWidths } from '$lib/server/imageCdn.js';
import { json, error } from '@sveltejs/kit';
import { getEventByToken, addAsset } from '$lib/server/events.js';

const MAX_BYTES = 100 * 1024 * 1024;
/** Types for files a phone may send without one. */
const BY_EXT = /** @type {Record<string, string>} */ ({ heic: 'image/heic', heif: 'image/heif', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mov: 'video/quicktime', mp4: 'video/mp4', m4v: 'video/x-m4v' });

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
	// Phones often send HEIC/MOV with no type at all: then go by the extension.
	const rawExt = file.name?.split('.').pop()?.toLowerCase() ?? '';
	const type = file.type || BY_EXT[rawExt] || '';
	const kind = kindFor(type);
	if (kind === 'file' || /svg/i.test(type)) error(400, 'Only photos and videos can be uploaded here');
	if (file.size > MAX_BYTES) error(413, 'That file is too large (max 100 MB)');
	const ext = /^[a-z0-9]{1,5}$/.test(rawExt) && !['svg', 'html', 'htm', 'xml', 'js'].includes(rawExt) ? rawExt : (kind === 'image' ? 'jpg' : 'mp4');
	const r2Key = `events/${crypto.randomUUID()}.${ext}`;
	await bucket.put(r2Key, await file.arrayBuffer(), {
		httpMetadata: { contentType: type }
	});
	// Have the image CDN make its WebP widths now, so the photo grid never waits on them.
	if (kind === 'image') warmImageWidths(event.platform, r2Key);

	const id = await addAsset(db, ev.id, {
		category: 'media',
		kind,
		r2_key: r2Key,
		filename: file.name ?? null,
		content_type: type,
		size: file.size ?? null,
		source: 'venue',
		uploaded_by: 'venue',
	});
	return json({ id, r2_key: r2Key, filename: file.name ?? null, kind });
}
