import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getLibraryItemBySku } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	return verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
}

/** GET /api/item-library/[sku] — look up a single item by SKU */
export async function GET({ params, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401);
	const db = platform?.env?.DB;
	if (!db) error(500);
	const row = await getLibraryItemBySku(db, params.sku.toUpperCase());
	if (!row) error(404, 'Not in library');
	return json({
		id: row.id,
		sku: row.sku,
		name: row.name,
		widthCm: row.width_cm,
		heightCm: row.height_cm,
		hasPhoto: !!row.photo_key,
	});
}
