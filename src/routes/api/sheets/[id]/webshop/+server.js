import { json, error } from '@sveltejs/kit';
import { getSheet } from '$lib/db.js';
import { setProductWebshop } from '$lib/server/webshopMarkets.js';
import { notifyShops } from '$lib/server/shopNotify.js';

/**
 * PUT /api/sheets/:id/webshop  { publishedMarkets: string[] | null, overrideLicense: boolean }
 *   publishedMarkets: null → follow the publisher licence (the default state)
 *   publishedMarkets: [..] → exactly these markets (limited to the licence unless overrideLicense)
 * Access: sheet edit (enforced for every /api/sheets write in access.js).
 */
export async function PUT({ params, request, platform, locals }) {
	const email = /** @type {any} */ (locals).auth?.email;
	if (!email) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	const salesDb = platform?.env?.SALES_DB;
	if (!db || !salesDb) error(500, 'DB unavailable');

	const sheet = await getSheet(db, params.id);
	if (!sheet) error(404, 'Sheet not found');
	if (!String(sheet.sku ?? '').trim()) error(400, 'This sheet has no SKU yet, so it cannot be published.');

	const body = await request.json().catch(() => null);
	if (!body || !('publishedMarkets' in body) || (body.publishedMarkets !== null && !Array.isArray(body.publishedMarkets))) {
		error(400, 'publishedMarkets must be a list of markets, or null to follow the publisher licence');
	}
	const saved = await setProductWebshop(salesDb, sheet.sku, {
		publishedMarkets: body.publishedMarkets,
		overrideLicense: !!body.overrideLicense,
	}, email);
	if (!saved) error(500, 'Could not save');
	await notifyShops(platform, { type: 'product_webshop', sku: sheet.sku, published_markets: saved.publishedMarkets, override_license: saved.overrideLicense });

	return json({ ok: true, ...saved });
}
