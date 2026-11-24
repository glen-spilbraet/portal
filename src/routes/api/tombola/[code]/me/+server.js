import { json, error } from '@sveltejs/kit';
import { getTombolaByCode, getEntryByToken, listOwnShoutouts } from '$lib/server/tombola.js';

// Public: the phone's own state (status, own entry, own shoutouts, did I win?).
export async function GET({ params, request, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const t = await getTombolaByCode(db, params.code);
	if (!t) error(404, 'Not found');
	const entry = await getEntryByToken(db, t.id, request.headers.get('x-tombola-token'));
	const shoutouts = entry ? await listOwnShoutouts(db, entry.id) : [];
	return json({ status: t.status, entry, shoutouts }, { headers: { 'cache-control': 'no-store' } });
}
