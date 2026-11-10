import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';

/**
 * POST /api/sheets/:id/featured { featured: boolean } — star / unstar a product
 * for the webshop's "Featured Products". Doesn't touch updated_at (a star isn't
 * a content edit). The shops are notified automatically (hooks.server.js →
 * /api/sheets/:id/* → product notice for this SKU).
 */
export async function POST({ params, request, cookies, platform }) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	const user = await getAllowedUser(db, email);
	if (!user) error(403, 'Access denied');
	if (!(await getUserPermissions(db, user)).sheetsEdit) error(403, 'Edit access required');

	const body = await request.json().catch(() => ({}));
	const featured = body?.featured === true;
	const res = await db.prepare(
		`UPDATE sales_sheets SET featured_at = ${featured ? "COALESCE(featured_at, strftime('%Y-%m-%dT%H:%M:%SZ','now'))" : 'NULL'} WHERE id = ?`
	).bind(params.id).run();
	if (!res.meta?.changes) error(404, 'Sheet not found');
	const row = await db.prepare('SELECT featured_at FROM sales_sheets WHERE id = ?').bind(params.id).first();
	return json({ ok: true, featured, featured_at: row?.featured_at ?? null });
}
