import { json } from '@sveltejs/kit';
import { requireAwards } from '$lib/server/awardsAuth.js';
import { setInstancesStatus } from '$lib/server/awards.js';

/** POST /api/awards/instances/status — set status (+ derived award flags) on one
 *  or more instances. Used by the per-row quick status change. */
export async function POST({ request, cookies, platform }) {
	const { db } = await requireAwards(cookies, platform);
	const body = await request.json().catch(() => ({}));
	if (!Array.isArray(body.ids) || !body.ids.length) return json({ error: 'ids required' }, { status: 400 });
	await setInstancesStatus(db, body.ids, body.status || null);
	return json({ ok: true, updated: body.ids.length });
}
