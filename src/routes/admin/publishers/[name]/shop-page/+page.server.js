import { error } from '@sveltejs/kit';
import { listSeries } from '$lib/server/series.js';
import { getBrandPage, brandPageStatus } from '$lib/server/brandPages.js';

export async function load({ params, parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Database unavailable');

	const name = decodeURIComponent(params.name);
	const exists = await db.prepare('SELECT name FROM publisher WHERE name = ?').bind(name).first();
	if (!exists) error(404, 'Unknown publisher');

	const series = await listSeries(db, name);
	const [page, status] = await Promise.all([
		getBrandPage(db, 'publisher', name),
		brandPageStatus(db, 'series', series.map((/** @type {any} */ s) => s.id))
	]);
	return { user, name, page, series, status };
}
