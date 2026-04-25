import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { fetchRackbeatProductFull } from '$lib/rackbeat.js';

export async function POST({ params, request, cookies, platform }) {
	const token = cookies.get('session');
	if (!verifySession(token ?? '', platform?.env?.APP_SECRET ?? 'dev-secret')) error(401, 'Unauthorized');

	const { skus } = await request.json();
	if (!Array.isArray(skus) || skus.length === 0) error(400, 'No SKUs provided');

	const apiKey = platform?.env?.RACKBEAT_API_KEY;
	if (!apiKey) error(500, 'Rackbeat API key not configured');

	// Fetch all SKUs in parallel, 5 at a time to stay well within
	// Cloudflare's CPU limits (each SKU = 2 Rackbeat calls).
	const results = {};
	const errors = {};
	const chunks = [];
	for (let i = 0; i < skus.length; i += 5) chunks.push(skus.slice(i, i + 5));

	for (const chunk of chunks) {
		const fetched = await Promise.all(
			chunk.map(async (sku) => {
				try {
					const data = await fetchRackbeatProductFull(sku, apiKey);
					return [sku, data, null];
				} catch (e) {
					return [sku, null, e?.message ?? String(e)];
				}
			})
		);
		for (const [sku, data, err] of fetched) {
			results[sku] = data;
			if (err) errors[sku] = err;
		}
	}

	// Always return 200 with partial results — the client handles per-SKU nulls.
	return json({ results, errors });
}
