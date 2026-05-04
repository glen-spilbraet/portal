import { json, error } from '@sveltejs/kit';

/** Public endpoint — no auth required.
 * GET /api/share/sheet?sku=XXX
 * Returns { shareToken: string | null } for the given SKU.
 * Only exposes the share_token, which is itself a public-access credential.
 */
export async function GET({ url, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const sku = url.searchParams.get('sku')?.trim();
	if (!sku) error(400, 'sku is required');

	const row = await db
		.prepare('SELECT share_token FROM sales_sheets WHERE LOWER(sku) = LOWER(?) LIMIT 1')
		.bind(sku)
		.first();

	return json({ shareToken: row?.share_token ?? null });
}
