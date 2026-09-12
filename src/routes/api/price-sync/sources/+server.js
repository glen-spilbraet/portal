import { json, error } from '@sveltejs/kit';
import { requirePriceSync } from '$lib/server/priceSyncAuth.js';
import { addPriceSource } from '$lib/db.js';

const WORKER = 'https://hubspot-sales-sync.glen-16a.workers.dev';

/** Add a tracked customer/group and immediately scan its custom prices. */
export async function POST({ request, cookies, platform }) {
	const { db } = await requirePriceSync(cookies, platform);
	const secret = platform?.env?.SYNC_SECRET;
	if (!secret) error(500, 'SYNC_SECRET not set in this environment');

	const body = await request.json();
	const type = body.type === 'group' ? 'group' : 'customer';
	const ref = String(body.ref ?? '').trim();
	const name = (body.name ?? '').trim() || null;
	if (!ref) error(400, 'ref (customer id / group number) is required');

	const src = await addPriceSource(db, { type, ref, name });
	if (!src) error(500, 'Could not add source');

	const res = await fetch(`${WORKER}/?pricesync=scan`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ source_id: src.id }),
	});
	const scan = await res.json().catch(() => ({}));
	return json({ source: src, scan });
}
