import { error } from '@sveltejs/kit';
import { listMedia, ensureShareKeys } from '$lib/server/awards.js';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (!user?.permissions?.awards) error(403, "You don't have access to this section.");
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const media = await ensureShareKeys(db, await listMedia(db));
	return { user, media };
}
