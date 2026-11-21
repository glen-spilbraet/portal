import { json, error } from '@sveltejs/kit';
import { sheetHasTexts } from '$lib/db.js';
import { normalizeLang } from '$lib/languages.js';

/** Public endpoint — no auth required.
 * GET /api/share/sheet?sku=XXX[&lang=da]
 * Returns { shareToken: string | null } for the given SKU.
 * If lang is provided, returns null unless the sheet has a translation for that language.
 * Only exposes the share_token, which is itself a public-access credential.
 */
export async function GET({ url, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const sku = url.searchParams.get('sku')?.trim();
	if (!sku) error(400, 'sku is required');

	const lang = normalizeLang(url.searchParams.get('lang'));

	const row = await db
		.prepare('SELECT id, share_token, primary_language FROM sales_sheets WHERE LOWER(sku) = LOWER(?) LIMIT 1')
		.bind(sku)
		.first();

	if (!row) return json({ shareToken: null });

	// If a specific language is requested and it differs from the primary language,
	// only link the sheet when it actually has texts in that language.
	if (lang && lang !== row.primary_language && !(await sheetHasTexts(db, row.id, lang))) {
		return json({ shareToken: null });
	}

	return json({ shareToken: row.share_token ?? null });
}
