import { error } from '@sveltejs/kit';
import { getCatalogue, getCatalogueItems, listSheets } from '$lib/db.js';

export async function load({ params, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const catalogue = await getCatalogue(db, params.id);
	if (!catalogue) error(404, 'Catalogue not found');

	const [items, sheets] = await Promise.all([
		getCatalogueItems(db, params.id),
		listSheets(db, { limit: 10_000 })
	]);

	return { catalogue, items, sheets };
}
