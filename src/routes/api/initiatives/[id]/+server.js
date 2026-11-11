import { json } from '@sveltejs/kit';
import { requireInitiatives, cleanInitiative, updateInitiative, deleteInitiative } from '$lib/server/manualInitiatives.js';

export async function PUT({ params, request, cookies, platform }) {
	const { db } = await requireInitiatives(cookies, platform);
	const { value, error: msg } = cleanInitiative(await request.json().catch(() => ({})));
	if (msg || !value) return json({ message: msg }, { status: 400 });
	await updateInitiative(db, params.id, value);
	return json({ ok: true });
}

export async function DELETE({ params, cookies, platform }) {
	const { db } = await requireInitiatives(cookies, platform);
	await deleteInitiative(db, params.id);
	return json({ ok: true });
}
