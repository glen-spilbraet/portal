import { json, error } from '@sveltejs/kit';
import { getTombolaByCode, drawWinner } from '$lib/server/tombola.js';
import { screenAccess } from '$lib/server/tombolaScreen.js';

// Draw a winner among participants who haven't won yet (Portal login or PIN cookie).
export async function POST(event) {
	const db = event.platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const t = await getTombolaByCode(db, event.params.code);
	if (!t) error(404, 'Not found');
	const access = await screenAccess(event, t);
	if (!access) error(401, 'PIN required');
	const winner = await drawWinner(db, t.id, access.via === 'login' ? access.email : 'screen-pin');
	if (!winner) return json({ error: 'empty' }, { status: 409 });
	return json({ winner });
}
