import { error } from '@sveltejs/kit';
import { getDataProduct } from '$lib/db.js';

export async function load({ params, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	const product = await getDataProduct(db, params.id);
	if (!product) error(404, 'Data product not found');
	return { product };
}
