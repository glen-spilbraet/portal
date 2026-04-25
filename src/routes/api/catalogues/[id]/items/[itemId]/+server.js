import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { updateCatalogueItemSection } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	const token = cookies.get('session');
	return verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

/** PATCH /api/catalogues/[id]/items/[itemId] — update section fields */
export async function PATCH({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const body = await request.json();
	const patch = {};
	if (body.section_crop_x !== undefined) patch.section_crop_x = body.section_crop_x;
	if (body.section_crop_y !== undefined) patch.section_crop_y = body.section_crop_y;
	if (body.section_text !== undefined) patch.section_text = body.section_text;
	if (body.type === 'image_half' || body.type === 'image_full') patch.type = body.type;

	if (Object.keys(patch).length === 0) error(400, 'Nothing to update');
	await updateCatalogueItemSection(db, params.itemId, patch);
	return json({ ok: true });
}
