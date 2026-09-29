import { error } from '@sveltejs/kit';
import { getEvent, listVenues, listEventTypes, getVenue, listParticipantLog } from '$lib/server/events.js';
import { getProductBySku } from '$lib/server/mcpProducts.js';
import { getBadgesForSkus } from '$lib/server/awards.js';

export async function load({ params, parent, platform, url }) {
	const { user } = await parent();
	if (!user?.permissions?.events) error(403, "You don't have access to this section.");

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const event = await getEvent(db, params.id);
	if (!event) error(404, 'Event not found');

	const today = new Date().toISOString().slice(0, 10);
	const [venues, types, badges, products, venue, participantLog] = await Promise.all([
		listVenues(db),
		listEventTypes(db),
		getBadgesForSkus(db, event.skus, today),
		Promise.all(event.skus.map((s) => getProductBySku(db, s, undefined, url.origin).catch(() => null))),
		event.venue_id ? getVenue(db, event.venue_id) : null,
		listParticipantLog(db, event.id),
	]);

	return {
		user,
		event,
		venues,
		types,
		badges,
		products: products.filter(Boolean),
		venueContacts: venue?.contacts ?? [],
		participantLog,
		shareUrl: `${url.origin}/events/share/${event.share_token}`,
	};
}
