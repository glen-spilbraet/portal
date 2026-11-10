import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, listSheets, searchSheets, listIncompleteSheets, listFeaturedSheets, getUserPermissions } from '$lib/db.js';

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

	// ── Todo: sheets missing required info (edit access only) ───────────────
	if (url.searchParams.get('todo')) {
		const perms = await getUserPermissions(db, user);
		if (!perms.sheetsEdit) error(403, 'Edit access required');
		return json({ sheets: await listIncompleteSheets(db) });
	}

	// ── Featured (starred for the webshop) ────────────────────────────────
	if (url.searchParams.get('featured')) return json({ sheets: await listFeaturedSheets(db) });

	// ── Search ─────────────────────────────────────────────────────────────
	// A pasted spreadsheet row (tabs/newlines, hundreds of chars) made SQLite reject
	// the LIKE pattern as "too complex" → 500. Search on the first cell, max 100 chars.
	const q = url.searchParams.get('q')?.split(/[\t\r\n]/).map((x) => x.trim()).find(Boolean)?.slice(0, 100);
	if (q) {
		const sheets = await searchSheets(db, q);
		return json({ sheets });
	}

	// ── Paginated list ─────────────────────────────────────────────────────
	const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10));
	const sheets = await listSheets(db, { limit: PAGE_SIZE, offset });
	return json({ sheets });
}
