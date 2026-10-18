import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getSheet } from '$lib/db.js';
import { setProductCategories } from '$lib/server/categories.js';

/** PUT /api/sheets/:id/categories  { categoryIds: string[] } — replaces the SKU's category tags. */
export async function PUT({ params, request, cookies, platform }) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	const salesDb = platform?.env?.SALES_DB;
	if (!db || !salesDb) error(500, 'DB unavailable');

	const sheet = await getSheet(db, params.id);
	if (!sheet) error(404, 'Sheet not found');

	const body = await request.json().catch(() => ({}));
	const ids = Array.isArray(body.categoryIds) ? body.categoryIds.map(String) : [];

	const saved = await setProductCategories(salesDb, sheet.sku, ids, email);
	return json({ ok: true, categoryIds: saved });
}
