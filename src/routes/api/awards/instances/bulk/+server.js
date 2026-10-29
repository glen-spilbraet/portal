import { json } from '@sveltejs/kit';
import { requireAwards } from '$lib/server/awardsAuth.js';
import { bulkCreateInstances } from '$lib/server/awards.js';

/** POST /api/awards/instances/bulk — create many instances at once (one per SKU),
 *  all sharing media, date and starting status. */
export async function POST({ request, cookies, platform }) {
	const { db } = await requireAwards(cookies, platform);
	const body = await request.json().catch(() => ({}));
	if (!body.media_id) return json({ error: 'media_id required' }, { status: 400 });
	const skus = (body.skus ?? []).map((s) => (s ?? '').trim()).filter(Boolean);
	if (!skus.length) return json({ error: 'at least one SKU required' }, { status: 400 });
	const ids = await bulkCreateInstances(db, {
		media_id: body.media_id,
		instance_date: body.instance_date || null,
		status: body.status || null,
		skus
	});
	return json({ ids, count: ids.length });
}
