import { json, error } from '@sveltejs/kit';
import { getTombolaByCode, joinTombola } from '$lib/server/tombola.js';

// Public: sign up for an event tombola. Returns the phone's secret token.
export async function POST({ params, request, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const t = await getTombolaByCode(db, params.code);
	if (!t) error(404, 'Not found');
	const body = await request.json().catch(() => ({}));
	const r = await joinTombola(db, t, body, request.headers.get('user-agent'));
	if (r.error) return json({ error: r.error }, { status: r.error === 'closed' ? 409 : 400 });
	return json(r);
}
