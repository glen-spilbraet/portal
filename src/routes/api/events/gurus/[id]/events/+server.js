import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';

/**
 * A guru's events (accepted/confirmed — same as the count on the guru card) with
 * per-event performance: attendance, photos/video by rating and tombola sign-ups.
 */
export async function GET(event) {
	const { db } = await requireEvents(event);
	const rows = await db.prepare(
		`SELECT e.id, e.title, e.event_date, e.end_date, e.status, e.participants_expected, e.participants_actual,
		        eg.status AS guru_status, eg.rating AS guru_rating, eg.rating_note AS guru_note, v.name AS venue_name, t.name AS type_name,
		        (SELECT COUNT(*) FROM event_asset a WHERE a.event_id = e.id AND a.category = 'media' AND a.kind IN ('image','video')) AS media_count,
		        (SELECT COUNT(*) FROM event_asset a WHERE a.event_id = e.id AND a.category = 'media' AND a.kind IN ('image','video') AND a.rating = 'good') AS media_good,
		        (SELECT COUNT(*) FROM event_asset a WHERE a.event_id = e.id AND a.category = 'media' AND a.kind IN ('image','video') AND a.rating = 'semi') AS media_semi,
		        (SELECT COUNT(*) FROM event_asset a WHERE a.event_id = e.id AND a.category = 'media' AND a.kind IN ('image','video') AND a.rating = 'bad') AS media_bad,
		        tb.id AS tombola_id, tb.status AS tombola_status,
		        (SELECT COUNT(*) FROM tombola_entry te WHERE te.tombola_id = tb.id) AS tombola_entries,
		        (SELECT COUNT(*) FROM tombola_shoutout ts WHERE ts.tombola_id = tb.id) AS tombola_shoutouts
		 FROM event_guru eg
		 JOIN event e ON e.id = eg.event_id
		 LEFT JOIN venue v ON v.id = e.venue_id
		 LEFT JOIN event_type t ON t.id = e.type_id
		 LEFT JOIN tombola tb ON tb.event_id = e.id
		 WHERE eg.guru_id = ? AND eg.status IN ('accepted','confirmed')
		 ORDER BY e.event_date DESC`
	).bind(event.params.id).all();
	return json(rows.results ?? []);
}
