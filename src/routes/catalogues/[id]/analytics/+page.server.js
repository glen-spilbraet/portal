import { error } from '@sveltejs/kit';
import { getCatalogue } from '$lib/db.js';

export async function load({ parent, params, platform }) {
	const { user } = await parent();

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const catalogue = await getCatalogue(db, params.id);
	if (!catalogue) error(404, 'Catalogue not found');

	// Allow admin, owner, or anyone it's been shared with
	const isAdmin = user?.role === 'admin';

	if (!isAdmin && catalogue.created_by !== user?.email) {
		const share = await db
			.prepare('SELECT 1 FROM catalogue_shares WHERE catalogue_id = ? AND shared_with_email = ?')
			.bind(params.id, user?.email)
			.first();
		if (!share) error(403, 'No access');
	}

	const rows = await db
		.prepare(
			`SELECT
        s.id          AS session_id,
        s.device_type,
        s.city,
        s.country,
        s.tracking_id,
        s.created_at  AS session_at,
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

	/** @type {Map<string, any>} */
	const map = new Map();
	const order = [];

	for (const row of /** @type {any[]} */ (rows.results ?? [])) {
		if (!map.has(row.session_id)) {
			map.set(row.session_id, {
				id:         row.session_id,
				deviceType: row.device_type,
				city:       row.city,
				country:    row.country,
				trackingId: row.tracking_id ?? null,
				sessionAt:  row.session_at,
				events:     [],
			});
			order.push(row.session_id);
		}
		if (row.event_id) {
			map.get(row.session_id)?.events.push({
				id:        row.event_id,
				eventType: row.event_type,
				page:      row.page,
				eventAt:   row.event_at,
			});
		}
	}

	const sessions = order.map((id) => map.get(id));
	return { catalogue, sessions };
}
