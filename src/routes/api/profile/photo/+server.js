import { json, error } from '@sveltejs/kit';
import { profileTarget } from '$lib/server/profile.js';
import { notifyShops } from '$lib/server/shopNotify.js';

/** Photos arrive already cropped square and resized in the browser (/profile). */
const MAX_BYTES = 2 * 1024 * 1024;

/** @param {any} db @param {any} bucket @param {string} email @param {string | null} key */
async function setPhoto(db, bucket, email, key) {
	const old = /** @type {any} */ (await db.prepare('SELECT photo_key FROM allowed_users WHERE email = ?').bind(email).first())?.photo_key;
	await db.prepare('UPDATE allowed_users SET photo_key = ?, profile_updated_at = ? WHERE email = ?').bind(key, new Date().toISOString(), email).run();
	if (old && old !== key && old.startsWith('profiles/')) await bucket.delete(old).catch(() => {});
}

/** POST /api/profile/photo (multipart: file, email?) — set a profile photo. */
export async function POST({ request, cookies, platform }) {
	const form = await request.formData();
	const { db, target } = await profileTarget(cookies, platform, form.get('email')?.toString());
	const bucket = platform?.env?.IMAGES;
	if (!bucket) error(500, 'Storage unavailable');
	const file = form.get('file');
	if (!file || typeof file === 'string') error(400, 'No file provided');
	if (!/^image\/(jpeg|png|webp)$/.test(file.type)) error(400, 'Use a JPG, PNG or WebP image');
	if (file.size > MAX_BYTES) error(400, 'The image is too large');
	const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
	const key = `profiles/${crypto.randomUUID()}.${ext}`;
	await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
	await setPhoto(db, bucket, target, key);
	await notifyShops(platform, { type: 'reps' });
	return json({ ok: true, key });
}

/** DELETE /api/profile/photo?email= — remove a profile photo. */
export async function DELETE({ url, cookies, platform }) {
	const { db, target } = await profileTarget(cookies, platform, url.searchParams.get('email'));
	const bucket = platform?.env?.IMAGES;
	if (!bucket) error(500, 'Storage unavailable');
	await setPhoto(db, bucket, target, null);
	await notifyShops(platform, { type: 'reps' });
	return json({ ok: true });
}
