import { json } from '@sveltejs/kit';
import { requireInitiatives, cleanInitiative, createInitiative } from '$lib/server/manualInitiatives.js';

/** POST /api/initiatives — create a manual initiative. */
export async function POST({ request, cookies, platform }) {
	const { db, email } = await requireInitiatives(cookies, platform);
	const { value, error: msg } = cleanInitiative(await request.json().catch(() => ({})));
	if (msg || !value) return json({ message: msg }, { status: 400 });
	return json({ ok: true, id: await createInitiative(db, value, email) });
}
