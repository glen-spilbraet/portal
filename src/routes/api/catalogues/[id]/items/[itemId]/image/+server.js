import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { updateCatalogueItemSection } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	const token = cookies.get('session');
	return verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

/** POST /api/catalogues/[id]/items/[itemId]/image — upload section image to R2 */
export async function POST({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	const bucket = platform?.env?.IMAGES;
	if (!db || !bucket) error(500, 'Storage unavailable');

	const formData = await request.formData();
	const file = formData.get('file');
	if (!file || typeof file === 'string') error(400, 'No file provided');

	// ── Variant upload (resized copy, no DB change) ───────────────────────
	const variantKey = formData.get('variantKey')?.toString();
	if (variantKey) {
		const buffer = await file.arrayBuffer();
		await bucket.put(variantKey, buffer, { httpMetadata: { contentType: file.type } });
		return json({ key: variantKey });
	}

	// ── Original upload ───────────────────────────────────────────────────
	const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
	const fileId = crypto.randomUUID();
	const r2Key = `catalogue-sections/${params.id}/${params.itemId}/${fileId}.${ext}`;

	const buffer = await file.arrayBuffer();
	await bucket.put(r2Key, buffer, {
		httpMetadata: { contentType: file.type }
	});

	await updateCatalogueItemSection(db, params.itemId, {
		section_image_key: r2Key,
		section_crop_x: 50,
		section_crop_y: 50
	});

	return json({ key: r2Key });
}

/** PATCH /api/catalogues/[id]/items/[itemId]/image
 *  Re-use an existing R2 key without re-uploading.
 *  Body: { key: string }
 */
export async function PATCH({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Storage unavailable');

	const { key } = await request.json();
	if (!key || typeof key !== 'string') error(400, 'key required');

	await updateCatalogueItemSection(db, params.itemId, {
		section_image_key: key,
		section_crop_x: 50,
		section_crop_y: 50
	});

	return json({ key });
}
