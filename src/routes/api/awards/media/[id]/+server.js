import { json, error } from '@sveltejs/kit';
import { requireAwards } from '$lib/server/awardsAuth.js';
import { getMedia, updateMedia, deleteMedia } from '$lib/server/awards.js';

export async function GET({ params, cookies, platform }) {
	const { db } = await requireAwards(cookies, platform);
	const media = await getMedia(db, params.id);
	if (!media) error(404, 'Media not found');
	return json(media);
}

export async function PUT({ params, request, cookies, platform }) {
	const { db } = await requireAwards(cookies, platform);
	const body = await request.json().catch(() => ({}));
	if (!body.name?.trim()) error(400, 'name required');
	await updateMedia(db, params.id, body);
	return json({ ok: true });
}

export async function DELETE({ params, cookies, platform }) {
	const { db } = await requireAwards(cookies, platform);
	await deleteMedia(db, params.id);
	return json({ ok: true });
}
