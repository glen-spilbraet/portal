import { json, error } from '@sveltejs/kit';
import { requireAwards } from '$lib/server/awardsAuth.js';
import { updateInstance, deleteInstance } from '$lib/server/awards.js';

export async function PUT({ params, request, cookies, platform }) {
	const { db } = await requireAwards(cookies, platform);
	const body = await request.json().catch(() => ({}));
	if (!body.media_id) error(400, 'media_id required');
	await updateInstance(db, params.id, body);
	return json({ ok: true });
}

export async function DELETE({ params, cookies, platform }) {
	const { db } = await requireAwards(cookies, platform);
	await deleteInstance(db, params.id);
	return json({ ok: true });
}
