import { json, error } from '@sveltejs/kit';
import { requireRestCheck } from '$lib/server/restCheckAuth.js';

const WORKER = 'https://hubspot-sales-sync.glen-16a.workers.dev';

/** Manually run the Rest Check for one Rackbeat order — proxies to the worker,
 *  which runs the exact same logic as the order.created webhook. */
export async function POST({ request, cookies, platform }) {
	await requireRestCheck(cookies, platform);
	const secret = platform?.env?.SYNC_SECRET;
	if (!secret) error(500, 'SYNC_SECRET not set in this environment');

	const body = await request.json();
	const orderNumber = String(body.order_number ?? '').trim();
	if (!orderNumber) error(400, 'order_number is required');
	const sendEmail = body.send_email !== false;

	const res = await fetch(`${WORKER}/?restcheck=run`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ order_number: orderNumber, send_email: sendEmail, source: 'manual' }),
	});
	const data = await res.json().catch(() => ({ error: 'Worker returned non-JSON' }));
	if (!res.ok) error(res.status, data?.error ?? 'Worker error');
	return json(data);
}
