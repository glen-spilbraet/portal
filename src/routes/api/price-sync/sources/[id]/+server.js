import { json } from '@sveltejs/kit';
import { requirePriceSync } from '$lib/server/priceSyncAuth.js';
import { deletePriceSource } from '$lib/db.js';
import { scanPriceSource } from '$lib/server/priceCache.js';

/** Re-scan a source's custom prices. */
export async function POST({ params, cookies, platform }) {
	const { db } = await requirePriceSync(cookies, platform);
	const scan = await scanPriceSource(db, platform?.env?.RACKBEAT_API_KEY, params.id);
	return json(scan);
}

/** Remove a source and its cached prices. */
export async function DELETE({ params, cookies, platform }) {
	const { db } = await requirePriceSync(cookies, platform);
	await deletePriceSource(db, params.id);
	return json({ ok: true });
}
