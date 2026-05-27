import { error } from '@sveltejs/kit';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const rows = await db
		.prepare(
			`SELECT id, sku, box_image_key
			 FROM sales_sheets
			 WHERE box_image_key IS NOT NULL AND box_image_key != ''
			 ORDER BY updated_at DESC`
		)
		.all();

	return { sheets: rows.results ?? [] };
}
