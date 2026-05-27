import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, listSheets, searchSheets } from '$lib/db.js';

const PAGE_SIZE = 30;

export async function GET({ url, cookies, platform }) {
	const token  = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email  = await verifySession(token ?? '', secret);
	if (!email) error(401, 'Unauthorised');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const user = await getAllowedUser(db, email);
	if (!user) error(403, 'Access denied');

	// ── SKU lookup (existing usage) ────────────────────────────────────────
	const sku = url.searchParams.get('sku')?.trim();
	if (sku) {
		const sheet = await db
			.prepare('SELECT id, sku FROM sales_sheets WHERE LOWER(sku) = LOWER(?) LIMIT 1')
			.bind(sku)
			.first();
		return json({ sheet: sheet ?? null });
	}

	// ── Search ─────────────────────────────────────────────────────────────
	const q = url.searchParams.get('q')?.trim();
	if (q) {
		const sheets = await searchSheets(db, q);
		return json({ sheets });
	}

	// ── Paginated list ─────────────────────────────────────────────────────
	const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10));
	const sheets = await listSheets(db, { limit: PAGE_SIZE, offset });
	return json({ sheets });
}
