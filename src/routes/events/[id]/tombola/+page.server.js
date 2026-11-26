import { error, redirect } from '@sveltejs/kit';
import { ensureTombola } from '$lib/server/tombola.js';
import { getEvent } from '$lib/server/events.js';

// Old board URL → the big screen now lives at /tombola/<code>/screen (login or PIN).
export async function load({ params, parent, platform }) {
	const { user } = await parent();
	if (!user?.permissions?.events) error(403, "You don't have access to this section.");
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const event = await getEvent(db, params.id);
	if (!event) error(404, 'Event not found');
	const t = await ensureTombola(db, event.id, user.email);
	redirect(303, `/tombola/${t.code}/screen`);
}
