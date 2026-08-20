import { json } from '@sveltejs/kit';
import { requireAwards } from '$lib/server/awardsAuth.js';
import { setInstancesDate } from '$lib/server/awards.js';

/** POST /api/awards/instances/bulk-date — set instance_date on many instances. */
export async function POST({ request, cookies, platform }) {
	const { db } = await requireAwards(cookies, platform);
	const body = await request.json().catch(() => ({}));
	if (!Array.isArray(body.ids) || !body.ids.length) return json({ error: 'ids required' }, { status: 400 });
	await setInstancesDate(db, body.ids, body.date || null);
	return json({ ok: true, updated: body.ids.length });
}
