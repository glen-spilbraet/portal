import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { fetchRackbeatProductFull } from '$lib/rackbeat.js';

// Single-SKU endpoint — exactly 2 subrequests per Worker invocation,
// well within Cloudflare's per-invocation subrequest limit.
export async function GET({ url, cookies, platform }) {
	const token = cookies.get('session');
	if (!verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret')) error(401, 'Unauthorized');

	const sku = url.searchParams.get('sku');
	if (!sku) error(400, 'sku required');

	const apiKey = platform?.env?.RACKBEAT_API_KEY;
	if (!apiKey) error(500, 'Rackbeat API key not configured');

	try {
		const data = await fetchRackbeatProductFull(sku, apiKey);
		return json({ sku, data });
	} catch (e) {
		error(502, e?.message ?? `Failed to fetch SKU ${sku} from Rackbeat`);
	}
}
