import { json } from '@sveltejs/kit';
import { searchSheets } from '$lib/db.js';
import { requireInitiatives } from '$lib/server/manualInitiatives.js';
import { sheetName } from '$lib/languages.js';

/** GET /api/initiatives/products?q= — product picker (Sales Sheets). */
export async function GET({ url, cookies, platform }) {
	const { db } = await requireInitiatives(cookies, platform);
	const q = (url.searchParams.get('q') ?? '').trim();
	if (q.length < 2) return json([]);
	const rows = /** @type {any[]} */ (await searchSheets(db, q)) ?? [];
	return json(rows.slice(0, 12).map((r) => ({
		sku: r.sku, name: sheetName(r) || r.sku, image: r.box_image_key ?? null,
	})));
}
