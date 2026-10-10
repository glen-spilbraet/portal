import { json } from '@sveltejs/kit';
import { requireReports } from '$lib/server/reportsAuth.js';
import { listPublishers, searchLineItemSkus } from '$lib/server/publishers.js';

// Picker data for the report builder (publishers + SKU search) — from SALES_DB.
export async function GET(event) {
	const { salesDb } = await requireReports(event);
	if (!salesDb) return json({});
	const { searchParams } = event.url;
	if (searchParams.get('publishers') === '1') {
		const rows = await listPublishers(salesDb);
		return json({ publishers: (rows ?? []).map((r) => r.name) });
	}
	const q = searchParams.get('sku');
	if (q != null) {
		const rows = await searchLineItemSkus(salesDb, q);
		return json({ skus: (rows ?? []).map((r) => ({ sku: r.sku, name: r.name })) });
	}
	return json({});
}
