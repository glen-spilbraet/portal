import { error } from '@sveltejs/kit';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const [sheetRows, coverRows, sectionRows] = await Promise.all([
		db.prepare(
			`SELECT id, sku, box_image_key AS image_key
			 FROM sales_sheets
			 WHERE box_image_key IS NOT NULL AND box_image_key != ''
			 ORDER BY updated_at DESC`
		).all(),
		db.prepare(
			`SELECT id, name, cover_image_key AS image_key
			 FROM catalogues
			 WHERE cover_image_key IS NOT NULL AND cover_image_key != ''
			 ORDER BY updated_at DESC`
		).all(),
		db.prepare(
			`SELECT ci.id, c.name AS catalogue_name,
			        ci.type AS item_type, ci.section_image_key AS image_key
			 FROM catalogue_items ci
			 JOIN catalogues c ON c.id = ci.catalogue_id
			 WHERE ci.section_image_key IS NOT NULL AND ci.section_image_key != ''
			 ORDER BY c.updated_at DESC`
		).all(),
	]);

	return {
		sheets:   sheetRows.results   ?? [],
		covers:   coverRows.results   ?? [],
		sections: sectionRows.results ?? [],
	};
}
