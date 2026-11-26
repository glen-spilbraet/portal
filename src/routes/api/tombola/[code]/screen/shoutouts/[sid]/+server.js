import { json, error } from '@sveltejs/kit';
import { getTombolaByCode, setShoutoutHidden } from '$lib/server/tombola.js';
import { screenAccess } from '$lib/server/tombolaScreen.js';

// Hide/unhide a shoutout from the big screen (never deleted). Body: { hidden: bool }
export async function PATCH(event) {
	const db = event.platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const t = await getTombolaByCode(db, event.params.code);
	if (!t) error(404, 'Not found');
	if (!(await screenAccess(event, t))) error(401, 'PIN required');
	const { hidden } = await event.request.json().catch(() => ({}));
	await setShoutoutHidden(db, t.id, event.params.sid, !!hidden);
	return json({ ok: true });
}
