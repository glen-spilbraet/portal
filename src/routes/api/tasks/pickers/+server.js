import { json, error } from '@sveltejs/kit';
import { requireTasks } from '$lib/server/tasksAuth.js';
import { searchCustomerAssoc } from '$lib/server/tasks.js';
import { searchSheets } from '$lib/db.js';

/**
 * Autocomplete source for association pickers.
 *   ?type=product&q=…  → sales sheets (DB), returns [{ ref_id: sku, label }]
 *   ?type=customer&q=… → companies from the sales mirror (SALES_DB)
 * Events are small enough to be preloaded into the page, so they aren't here.
 */
export async function GET(event) {
	const { db, salesDb } = await requireTasks(event);
	const type = event.url.searchParams.get('type');
	const q = (event.url.searchParams.get('q') ?? '').trim();
	if (q.length < 2) return json([]);

	if (type === 'product') {
		const rows = await searchSheets(db, q);
		return json((rows ?? []).slice(0, 12).map((r) => ({
			ref_id: r.sku,
			label: r.name_en || r.name_da || r.name_sv || r.name_no || r.sku,
		})));
	}
	if (type === 'customer') {
		if (!salesDb) return json([]);
		const rows = await searchCustomerAssoc(salesDb, q);
		return json(rows.map((r) => ({ ref_id: r.id, label: r.name })));
	}
	error(400, 'unknown type');
}
