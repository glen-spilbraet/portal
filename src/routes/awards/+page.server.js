import { error } from '@sveltejs/kit';
import { listAllInstances, listMedia } from '$lib/server/awards.js';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (!user?.permissions?.awards) error(403, "You don't have access to this section.");
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const [instances, media] = await Promise.all([listAllInstances(db), listMedia(db)]);
	return { user, instances, media };
}
