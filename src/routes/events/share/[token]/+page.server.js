import { error } from '@sveltejs/kit';
import { getEventByToken } from '$lib/server/events.js';
import { getProductBySku } from '$lib/server/mcpProducts.js';
import { getBadgesForSkus } from '$lib/server/awards.js';

// Public venue page — the unguessable share token is the authorisation.
export async function load({ params, platform, url }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const event = await getEventByToken(db, params.token);
	if (!event) error(404, 'This event link is not valid.');

	const today = new Date().toISOString().slice(0, 10);
	const [badges, products] = await Promise.all([
		getBadgesForSkus(db, event.skus, today),
		Promise.all(event.skus.map((s) => getProductBySku(db, s, undefined, url.origin).catch(() => null))),
	]);

	return {
		event,
		products: products.filter(Boolean),
		badges,
		marketing: event.assets.filter((a) => a.category === 'marketing'),
		media: event.assets.filter((a) => a.category === 'media'),
	};
}
