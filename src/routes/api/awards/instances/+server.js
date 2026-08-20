import { json } from '@sveltejs/kit';
import { requireAwards } from '$lib/server/awardsAuth.js';
import { createInstance } from '$lib/server/awards.js';

export async function POST({ request, cookies, platform }) {
	const { db } = await requireAwards(cookies, platform);
	const body = await request.json().catch(() => ({}));
	if (!body.media_id) return json({ error: 'media_id required' }, { status: 400 });
	const id = await createInstance(db, body);
	return json({ id });
}
