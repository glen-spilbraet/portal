import { error } from '@sveltejs/kit';
import { getStep } from '$lib/server/eventEmails.js';

export async function load({ params, parent, platform }) {
	const { user } = await parent();
	if (!user?.permissions?.events) error(403, "You don't have access to this section.");

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const step = await getStep(db, params.id);
	if (!step) error(404, 'Step not found');

	return { user, step };
}
