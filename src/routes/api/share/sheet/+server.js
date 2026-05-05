import { json, error } from '@sveltejs/kit';

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

	const lang = url.searchParams.get('lang')?.trim() || null;

	const row = await db
		.prepare('SELECT id, share_token, primary_language FROM sales_sheets WHERE LOWER(sku) = LOWER(?) LIMIT 1')
		.bind(sku)
		.first();

	if (!row) return json({ shareToken: null });

	// If a specific language is requested and it differs from the primary language,
	// check that at least a product name translation exists for it.
	if (lang && lang !== row.primary_language) {
		const hasTranslation = await db
			.prepare(`SELECT 1 FROM translations WHERE sheet_id = ? AND language = ? AND key = 'product_name' AND value != '' LIMIT 1`)
			.bind(row.id, lang)
			.first();
		if (!hasTranslation) return json({ shareToken: null });
	}

	return json({ shareToken: row.share_token ?? null });
}
