import { json } from '@sveltejs/kit';
import { requireAwards } from '$lib/server/awardsAuth.js';
import { listMedia, createMedia } from '$lib/server/awards.js';

export async function GET({ cookies, platform }) {
	const { db } = await requireAwards(cookies, platform);
	return json(await listMedia(db));
}

export async function POST({ request, cookies, platform }) {
	const { db } = await requireAwards(cookies, platform);
	const body = await request.json().catch(() => ({}));
	if (!body.name?.trim()) return json({ error: 'name required' }, { status: 400 });
	const id = await createMedia(db, body);
	return json({ id });
}
