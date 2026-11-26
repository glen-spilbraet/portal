import { error } from '@sveltejs/kit';
import { getEvent, listVenues, listEventTypes, getVenue, listParticipantLog, listEventContacts } from '$lib/server/events.js';
import { listGurus, listEventGurus, listOpenings } from '$lib/server/gurus.js';
import { tenderLang } from '$lib/guruTender.js';
import { getProductBySku } from '$lib/server/mcpProducts.js';
import { getBadgesForSkus } from '$lib/server/awards.js';
import { getTombolaForEvent, listEntriesAdmin, listShoutoutsAdmin } from '$lib/server/tombola.js';

export async function load({ params, parent, platform, url }) {
	const { user } = await parent();
	if (!user?.permissions?.events) error(403, "You don't have access to this section.");

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const event = await getEvent(db, params.id);
	if (!event) error(404, 'Event not found');

	const today = new Date().toISOString().slice(0, 10);
	const [venues, types, badges, products, venue, participantLog, gurus, eventGurus, eventContacts, openings] = await Promise.all([
		listVenues(db),
		listEventTypes(db),
		getBadgesForSkus(db, event.skus, today),
		Promise.all(event.skus.map((s) => getProductBySku(db, s, undefined, url.origin).catch(() => null))),
		event.venue_id ? getVenue(db, event.venue_id) : null,
		listParticipantLog(db, event.id),
		listGurus(db),
		listEventGurus(db, event.id),
		listEventContacts(db, event.id),
		listOpenings(db, event.id),
	]);

	// Tombola tables may be missing on an environment without migration 0124 → treat as none.
	const tombola = await getTombolaForEvent(db, event.id).catch(() => null);
	const [tombolaEntries, tombolaShoutouts] = tombola
		? await Promise.all([listEntriesAdmin(db, tombola.id), listShoutoutsAdmin(db, tombola.id)])
		: [[], []];

	return {
		user,
		event,
		venues,
		types,
		badges,
		products: products.filter(Boolean),
		venueContacts: venue?.contacts ?? [],
		eventContacts,
		participantLog,
		gurus,
		openings,
		tenderLang: tenderLang(venue?.country),
		eventGurus: eventGurus.map((g) => ({ ...g, proposalUrl: `${url.origin}/events/guru/${g.proposal_token}` })),
		shareUrl: `${url.origin}/events/share/${event.share_token}`,
		tombola: tombola ? { ...tombola, joinUrl: `${url.origin}/tombola/${tombola.code}`, screenUrl: `${url.origin}/tombola/${tombola.code}/screen` } : null,
		tombolaEntries,
		tombolaShoutouts,
	};
}
