import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { fetchRackbeatFieldDefinitions } from '$lib/rackbeat.js';

export async function GET({ params, request, cookies, platform, url }) {
	const token = cookies.get('session');
	if (!verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret')) error(401, 'Unauthorized');

	const sku = url.searchParams.get('sku');
	if (!sku) error(400, 'sku query param required');

	const apiKey = platform?.env?.RACKBEAT_API_KEY;
	if (!apiKey) error(500, 'Rackbeat API key not configured');

	const defs = await fetchRackbeatFieldDefinitions(sku, apiKey);
	if (!defs) error(404, 'Product not found in Rackbeat');

	return json(defs);
}
