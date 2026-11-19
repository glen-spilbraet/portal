import { json, error } from '@sveltejs/kit';
import { getTombolaByCode, getEntryByToken, addShoutout } from '$lib/server/tombola.js';

// Public: post a shoutout to the big screen (needs the phone's token).
export async function POST({ params, request, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const t = await getTombolaByCode(db, params.code);
	if (!t) error(404, 'Not found');
	const entry = await getEntryByToken(db, t.id, request.headers.get('x-tombola-token'));
	if (!entry) return json({ error: 'not_joined' }, { status: 403 });
	const body = await request.json().catch(() => ({}));
	const r = await addShoutout(db, t, entry, body.message);
	if (r.error) return json(r, { status: r.error === 'cooldown' ? 429 : 400 });
	return json(r);
}
