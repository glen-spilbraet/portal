import { error } from '@sveltejs/kit';
import { getCatalogueByShareToken, getCatalogueItemsWithTranslations, getGlobalLabels } from '$lib/db.js';

export async function load({ params, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');

	const catalogue = await getCatalogueByShareToken(db, params.token);
	if (!catalogue) error(404, 'Link not found or has been revoked');

	const [items, globalLabels] = await Promise.all([
		getCatalogueItemsWithTranslations(db, catalogue.id, catalogue.language),
		getGlobalLabels(db)
	]);

	return { catalogue, items, globalLabels, token: params.token };
}
