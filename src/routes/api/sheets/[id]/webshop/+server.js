import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getSheet } from '$lib/db.js';
import { setProductWebshop } from '$lib/server/webshopMarkets.js';
import { notifyShops } from '$lib/server/shopNotify.js';

/** PUT /api/sheets/:id/webshop  { publishedMarkets: string[], overrideLicense: boolean } */
export async function PUT({ params, request, cookies, platform }) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorized');

	const db = platform?.env?.DB;
	const salesDb = platform?.env?.SALES_DB;
	if (!db || !salesDb) error(500, 'DB unavailable');

	const sheet = await getSheet(db, params.id);
	if (!sheet) error(404, 'Sheet not found');

	const body = await request.json().catch(() => ({}));
	const markets = await setProductWebshop(salesDb, sheet.sku, {
		publishedMarkets: Array.isArray(body.publishedMarkets) ? body.publishedMarkets : [],
		overrideLicense: !!body.overrideLicense,
	}, email);
	await notifyShops(platform, { type: 'product_webshop', sku: sheet.sku, published_markets: markets, override_license: !!body.overrideLicense });

	return json({ ok: true, publishedMarkets: markets, overrideLicense: !!body.overrideLicense });
}
