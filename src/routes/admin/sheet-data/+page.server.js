import { error } from '@sveltejs/kit';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const sheetsRaw = await db
		.prepare(
			`SELECT s.id, s.sku, s.primary_language,
              COALESCE(s.usp_count, 3) as usp_count,
              s.data_fields, s.hidden_elements,
              s.box_image_key, s.cta_version_id,
              s.created_by, s.updated_at,
              COALESCE(u.first_name, s.created_by) as creator_name,
              cv.name as cta_name
       FROM sales_sheets s
       LEFT JOIN allowed_users u ON u.email = s.created_by
       LEFT JOIN cta_versions cv ON cv.id = s.cta_version_id
       ORDER BY s.updated_at DESC`
		)
		.all();

	const KNOWN_ORDER = ['ean', 'weight', 'height', 'width', 'depth', 'age', 'time', 'players', 'stock_date'];
	const fieldKeySet = new Set();

	const sheets = /** @type {any[]} */ (sheetsRaw.results ?? []).map((s) => {
		const dataFields = JSON.parse(s.data_fields ?? '[]');
		const hiddenElements = JSON.parse(s.hidden_elements ?? '{}');

		/** @type {Record<string, string>} */
		const fieldMap = {};
		for (const f of dataFields) {
			if (f.key !== 'sku') {
				fieldMap[f.key] = f.value;
				fieldKeySet.add(f.key);
			}
		}

		const hiddenKeys = Object.entries(hiddenElements)
			.filter(([, v]) => v)
			.map(([k]) => k);

		return {
			id: s.id,
			sku: s.sku,
			primaryLanguage: s.primary_language,
			uspCount: s.usp_count,
			hasBoxImage: !!s.box_image_key,
			ctaName: s.cta_name ?? null,
			fieldMap,
			hiddenKeys,
			creatorName: s.creator_name ?? null,
			updatedAt: s.updated_at,
		};
	});

	const fieldKeys = [
		...KNOWN_ORDER.filter((k) => fieldKeySet.has(k)),
		...[...fieldKeySet].filter((k) => !KNOWN_ORDER.includes(k)).sort(),
	];

	return { sheets, fieldKeys };
}
