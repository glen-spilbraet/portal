import { json, error } from '@sveltejs/kit';
import { requirePriceSync } from '$lib/server/priceSyncAuth.js';
import { addPriceSource } from '$lib/db.js';
import { scanPriceSource } from '$lib/server/priceCache.js';

/** Add a tracked customer/group and immediately scan its custom prices. */
export async function POST({ request, cookies, platform }) {
	const { db } = await requirePriceSync(cookies, platform);
	const body = await request.json();
	const type = body.type === 'group' ? 'group' : 'customer';
	const ref = String(body.ref ?? '').trim();
	const name = (body.name ?? '').trim() || null;
	if (!ref) error(400, 'ref (customer id / group number) is required');

	const src = await addPriceSource(db, { type, ref, name });
	if (!src) error(500, 'Could not add source');

	const scan = await scanPriceSource(db, platform?.env?.RACKBEAT_API_KEY, src.id);
	return json({ source: src, scan });
}
