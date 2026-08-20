import { json } from '@sveltejs/kit';
import { requireAwards } from '$lib/server/awardsAuth.js';
import { searchSheets } from '$lib/db.js';

/** GET /api/awards/products?q= — SKU/name autocomplete from portal sales sheets. */
export async function GET({ url, cookies, platform }) {
	const { db } = await requireAwards(cookies, platform);
	const q = (url.searchParams.get('q') ?? '').trim();
	if (q.length < 2) return json([]);
	const rows = await searchSheets(db, q);
	const out = (rows ?? []).slice(0, 10).map((r) => ({
		sku: r.sku,
		name: r.name_en || r.name_da || r.name_sv || r.name_no || r.sku
	}));
	return json(out);
}
