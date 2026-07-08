import { json, error } from '@sveltejs/kit';
import { addImage } from '$lib/db.js';
import { verifySession } from '$lib/auth.js';

async function checkAuth(cookies, platform) {
	const token = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	return verifySession(token ?? '', secret);
}

/** POST /api/images — upload an image to R2 */
export async function POST({ request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	const bucket = platform?.env?.IMAGES;
	if (!db || !bucket) error(500, 'Storage unavailable');

	const formData = await request.formData();
	const file = formData.get('file');
	const sheetId = formData.get('sheetId')?.toString();
	const type = formData.get('type')?.toString() ?? 'grid'; // 'box' | 'grid'
	const order = parseInt(formData.get('order')?.toString() ?? '0');

	if (!file || typeof file === 'string') error(400, 'No file provided');

	// ── Variant upload (resized copy, no DB change — no sheetId needed) ──
	const variantKey = formData.get('variantKey')?.toString();
	if (variantKey) {
		const buffer = await file.arrayBuffer();
		await bucket.put(variantKey, buffer, {
			httpMetadata: { contentType: file.type }
		});
		return json({ key: variantKey });
	}

	if (!sheetId) error(400, 'No sheetId provided');

	// ── Original upload ───────────────────────────────────────────────────
	const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
	const imageId = crypto.randomUUID();
	const r2Key = `${sheetId}/${type}/${imageId}.${ext}`;

	const buffer = await file.arrayBuffer();
	await bucket.put(r2Key, buffer, {
		httpMetadata: { contentType: file.type }
	});

	if (type === 'box') {
		const { updateSheet } = await import('$lib/db.js');
		await updateSheet(db, sheetId, { box_image_key: r2Key });
	} else {
		await addImage(db, imageId, sheetId, r2Key, order);
	}

	return json({ id: imageId, key: r2Key });
}
