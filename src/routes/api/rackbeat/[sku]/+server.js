import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';

const RACKBEAT_BASE = 'https://app.rackbeat.com/api';

/** GET /api/rackbeat/:sku — proxy lookup with full debug output */
export async function GET({ params, cookies, platform, url }) {
	const token = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const valid = await verifySession(token ?? '', secret);
	if (!valid) error(401, 'Unauthorized');

	const apiKey = platform?.env?.RACKBEAT_API_KEY;
	const debug = url.searchParams.has('debug');

	if (!apiKey) {
		if (debug) return json({ error: 'No RACKBEAT_API_KEY set' }, { status: 200 });
		error(404, 'No API key');
	}

	const endpoint = `${RACKBEAT_BASE}/products/${encodeURIComponent(params.sku)}`;
	let rawStatus, rawBody;

	try {
		const res = await fetch(endpoint, {
			headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }
		});
		rawStatus = res.status;
		const rawText = await res.text();
		try { rawBody = JSON.parse(rawText); } catch { rawBody = rawText.slice(0, 500); }
	} catch (e) {
		if (debug) return json({ error: String(e), endpoint }, { status: 200 });
		error(500, 'Fetch failed');
	}

	if (debug) {
		return json({ endpoint, status: rawStatus, body: rawBody }, { status: 200 });
	}

	if (rawStatus !== 200 || !rawBody) error(404, 'Product not found');

	const item = rawBody.product ?? rawBody.item ?? rawBody;
	const phys = item.physical ?? {};
	return json({
		name: item.name ?? '',
		ean: item.barcode ?? item.ean ?? '',
		height: phys.height || null,
		width: phys.width || null,
		depth: phys.depth || null,
		weight: phys.weight || null,
		sizeUnit: phys.size_unit ?? 'cm',
		weightUnit: phys.weight_unit ?? 'g',
		colli: item.colli ?? item.colli_size ?? item.min_sales ?? null
	});
}
