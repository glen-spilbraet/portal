import { error } from '@sveltejs/kit';
import { listSeries } from '$lib/server/series.js';

export async function load({ params, parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Database unavailable');
	const name = decodeURIComponent(params.name);
	return { user, name, series: await listSeries(db, name) };
}
