import { json } from '@sveltejs/kit';
import { requireRestCheck } from '$lib/server/restCheckAuth.js';
import { updateRestCheckSettings, getRestCheckSettings } from '$lib/db.js';

export async function POST({ request, cookies, platform }) {
	const { db } = await requireRestCheck(cookies, platform);
	const body = await request.json();
	await updateRestCheckSettings(db, {
		recipient_email: (body.recipient_email ?? '').trim(),
		from_email: (body.from_email ?? '').trim() || null,
		enabled: body.enabled !== false,
	});
	return json({ ok: true, settings: await getRestCheckSettings(db) });
}
