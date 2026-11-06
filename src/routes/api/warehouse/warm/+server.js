// Called by the lagersystem-sync worker right after its nightly run: pre-builds
// the Warehouse cache for every date preset, so daytime page loads never hit the
// order tables. Bearer SYNC_SECRET (same shared secret as the other workers).
import { json, error } from '@sveltejs/kit';
import { warmWarehouse } from '$lib/server/warehouse.js';

export async function POST({ request, platform }) {
	const env = platform?.env;
	const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
	if (!env?.SYNC_SECRET || token !== env.SYNC_SECRET) error(401, 'Unauthorised');
	if (!env.SALES_DB) error(500, 'Database unavailable');
	return json({ ok: true, warmed: await warmWarehouse(env) });
}
