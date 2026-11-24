import { error } from '@sveltejs/kit';
import { getTombolaByCode } from '$lib/server/tombola.js';

export async function load({ params, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const t = await getTombolaByCode(db, params.code);
	if (!t) error(404, 'This tombola link is not valid.');
	return {
		code: t.code,
		status: t.status,
		eventTitle: t.event_title || 'Event',
		venueName: t.venue_name ?? null,
	};
}
