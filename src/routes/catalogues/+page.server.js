import { listCatalogues } from '$lib/db.js';

export async function load({ platform }) {
	const db = platform?.env?.DB;
	if (!db) return { catalogues: [] };
	const catalogues = await listCatalogues(db);
	return { catalogues };
}
