import { json, error } from '@sveltejs/kit';
import { requirePriceSync } from '$lib/server/priceSyncAuth.js';
import { deletePriceSource } from '$lib/db.js';

const WORKER = 'https://hubspot-sales-sync.glen-16a.workers.dev';

/** Re-scan a source's custom prices. */
export async function POST({ params, cookies, platform }) {
	await requirePriceSync(cookies, platform);
	const secret = platform?.env?.SYNC_SECRET;
	if (!secret) error(500, 'SYNC_SECRET not set in this environment');
	const res = await fetch(`${WORKER}/?pricesync=scan`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ source_id: params.id }),
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) error(res.status, data?.error ?? 'Scan failed');
	return json(data);
}

/** Remove a source and its cached prices. */
export async function DELETE({ params, cookies, platform }) {
	const { db } = await requirePriceSync(cookies, platform);
	await deletePriceSource(db, params.id);
	return json({ ok: true });
}
