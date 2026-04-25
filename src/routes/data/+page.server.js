import { error } from '@sveltejs/kit';
import { listDataProducts } from '$lib/db.js';

export async function load({ platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	return { products: await listDataProducts(db) };
}
