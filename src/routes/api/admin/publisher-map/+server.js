import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';

/** Admin-gate; publisher tables live in the shared SALES_DB (portal-db). */
async function requireAdmin(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
}

const RESOLVE_SQL = `UPDATE deal_line_items SET publisher = COALESCE(
	(SELECT publisher FROM product_publisher_override o WHERE o.sku = deal_line_items.sku),
	(SELECT publisher FROM publisher_prefix p WHERE p.prefix = deal_line_items.sku_prefix),
	sku_prefix)`;

export async function POST({ request, cookies, platform }) {
	await requireAdmin(cookies, platform);
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Sales DB unavailable');
	const body = await request.json().catch(() => ({}));

	// Apply the mapping to the stored line-item publisher column (~3s for all rows).
	if (body.action === 'resolve') {
		await db.prepare(RESOLVE_SQL).run();
		return json({ ok: true });
	}

	// Per-SKU override (e.g. SBDK titles that span publishers).
	if (body.type === 'override') {
		const sku = (body.sku ?? '').trim();
		if (!sku) error(400, 'sku required');
		const pub = (body.publisher ?? '').trim();
		if (pub) await db.prepare('INSERT OR REPLACE INTO product_publisher_override (sku, publisher) VALUES (?, ?)').bind(sku, pub).run();
		else await db.prepare('DELETE FROM product_publisher_override WHERE sku = ?').bind(sku).run();
		return json({ ok: true });
	}

	// Prefix → publisher mapping (empty publisher clears it → falls back to code).
	const prefix = (body.prefix ?? '').trim().toUpperCase();
	if (!prefix) error(400, 'prefix required');
	const pub = (body.publisher ?? '').trim();
	if (pub) await db.prepare('INSERT OR REPLACE INTO publisher_prefix (prefix, publisher) VALUES (?, ?)').bind(prefix, pub).run();
	else await db.prepare('DELETE FROM publisher_prefix WHERE prefix = ?').bind(prefix).run();
	return json({ ok: true });
}
