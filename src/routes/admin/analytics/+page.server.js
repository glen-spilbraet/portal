import { error } from '@sveltejs/kit';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const rows = await db
		.prepare(
			`SELECT c.id, c.name, c.language,
              COUNT(DISTINCT s.id)   AS session_count,
              COUNT(e.id)            AS event_count,
              MAX(s.created_at)      AS last_visit
       FROM catalogues c
       JOIN catalogue_analytics_sessions s ON s.catalogue_id = c.id
       LEFT JOIN catalogue_analytics_events e ON e.session_id = s.id
       GROUP BY c.id
       ORDER BY last_visit DESC`
		)
		.all();

	return { catalogues: rows.results ?? [] };
}
