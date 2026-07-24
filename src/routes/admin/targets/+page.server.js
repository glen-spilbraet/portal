import { error, fail } from '@sveltejs/kit';
import { listSalesTargets, createSalesTarget, updateSalesTarget, deleteSalesTarget } from '$lib/db.js';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');

	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Database unavailable');

	const targets = await listSalesTargets(db);
	// Group by year (descending) for display.
	const byYear = new Map();
	for (const t of targets) {
		if (!byYear.has(t.year)) byYear.set(t.year, []);
		byYear.get(t.year).push(t);
	}
	const years = [...byYear.entries()].map(([year, items]) => ({ year, items }));
	return { years, currentYear: new Date().getUTCFullYear() };
}

export const actions = {
	create: async ({ request, platform }) => {
		const db = platform?.env?.SALES_DB;
		if (!db) return fail(500, { error: 'DB unavailable' });
		const data = await request.formData();
		const year = parseInt(data.get('year')?.toString() ?? '', 10);
		const name = data.get('name')?.toString().trim();
		const indexValue = parseInt(data.get('index_value')?.toString() ?? '', 10);
		if (!year || !name || !Number.isFinite(indexValue)) {
			return fail(400, { error: 'Year, name and index are required' });
		}
		await createSalesTarget(db, crypto.randomUUID(), year, name, indexValue);
		return { ok: true };
	},

	update: async ({ request, platform }) => {
		const db = platform?.env?.SALES_DB;
		if (!db) return fail(500, { error: 'DB unavailable' });
		const data = await request.formData();
		const id = data.get('id')?.toString();
		const name = data.get('name')?.toString().trim();
		const indexValue = parseInt(data.get('index_value')?.toString() ?? '', 10);
		if (!id || !name || !Number.isFinite(indexValue)) {
			return fail(400, { error: 'Name and index are required' });
		}
		await updateSalesTarget(db, id, { name, index_value: indexValue });
		return { ok: true };
	},

	delete: async ({ request, platform }) => {
		const db = platform?.env?.SALES_DB;
		if (!db) return fail(500, { error: 'DB unavailable' });
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { error: 'Missing id' });
		await deleteSalesTarget(db, id);
		return { ok: true };
	},
};
