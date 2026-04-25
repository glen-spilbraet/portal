import { error } from '@sveltejs/kit';
import { getCatalogue, getCatalogueItemsWithTranslations, getGlobalLabels } from '$lib/db.js';

export async function load({ params, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const catalogue = await getCatalogue(db, params.id);
	if (!catalogue) error(404, 'Catalogue not found');

	const [items, globalLabels] = await Promise.all([
		getCatalogueItemsWithTranslations(db, params.id, catalogue.language),
		getGlobalLabels(db)
	]);

	return { catalogue, items, globalLabels };
}
