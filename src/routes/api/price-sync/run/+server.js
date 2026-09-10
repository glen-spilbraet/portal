import { json, error } from '@sveltejs/kit';
import { requirePriceSync } from '$lib/server/priceSyncAuth.js';

const WORKER = 'https://hubspot-sales-sync.glen-16a.workers.dev';

/** Preview or apply customer-custom-price corrections for one HubSpot deal —
 *  proxies to the worker (which holds the HubSpot + Rackbeat credentials). */
export async function POST({ request, cookies, platform }) {
	const { email } = await requirePriceSync(cookies, platform);
	const secret = platform?.env?.SYNC_SECRET;
	if (!secret) error(500, 'SYNC_SECRET not set in this environment');

	const body = await request.json();
	const dealId = String(body.deal_id ?? '').trim();
	if (!dealId) error(400, 'deal_id is required');
	const apply = body.apply === true;

	const res = await fetch(`${WORKER}/?pricesync=run`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ deal_id: dealId, apply, user_email: email }),
	});
	const data = await res.json().catch(() => ({ error: 'Worker returned non-JSON' }));
	if (!res.ok) error(res.status, data?.error ?? 'Worker error');
	return json(data);
}
