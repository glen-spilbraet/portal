import { error } from '@sveltejs/kit';
import { getPublisherMappings } from '$lib/server/publishers.js';

export async function load({ params, parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');

	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Database unavailable');

	const name = decodeURIComponent(params.name);
	const mappings = await getPublisherMappings(db, name);
	return { user, name, mappings };
}
