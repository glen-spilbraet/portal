import { error } from '@sveltejs/kit';
import { getCatalogue } from '$lib/db.js';

export async function load({ parent, platform, params }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const catalogue = await getCatalogue(db, params.id);
	if (!catalogue) error(404, 'Catalogue not found');

	// Sessions + their events in one query
	const rows = await db
		.prepare(
			`SELECT
        s.id         AS session_id,
        s.device_type,
        s.city,
        s.country,
        s.created_at AS session_at,
        e.id         AS event_id,
        e.event_type,
        e.page,
        e.created_at AS event_at
       FROM catalogue_analytics_sessions s
       LEFT JOIN catalogue_analytics_events e ON e.session_id = s.id
       WHERE s.catalogue_id = ?
       ORDER BY s.created_at DESC, e.created_at ASC`
		)
		.bind(params.id)
		.all();

	// Group into sessions → events
	/** @type {Map<string, {id:string,deviceType:string,city:string|null,country:string|null,sessionAt:number,events:{id:string,eventType:string,page:number|null,eventAt:number}[]}>} */
	const map = new Map();
	const order = [];

	for (const row of /** @type {any[]} */ (rows.results ?? [])) {
		if (!map.has(row.session_id)) {
			map.set(row.session_id, {
				id: row.session_id,
				deviceType: row.device_type,
				city: row.city,
				country: row.country,
				sessionAt: row.session_at,
				events: [],
			});
			order.push(row.session_id);
		}
		if (row.event_id) {
			map.get(row.session_id)?.events.push({
				id: row.event_id,
				eventType: row.event_type,
				page: row.page,
				eventAt: row.event_at,
			});
		}
	}

	const sessions = order.map((id) => map.get(id));
	return { catalogue, sessions };
}
