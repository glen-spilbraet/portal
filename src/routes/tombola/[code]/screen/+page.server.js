import { error, fail, redirect } from '@sveltejs/kit';
import { getTombolaByCode, checkTombolaPin } from '$lib/server/tombola.js';
import { screenAccess, grantScreen } from '$lib/server/tombolaScreen.js';

// Big screen. Portal users with events access go straight in; anyone else types the PIN.
export async function load(event) {
	const db = event.platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const t = await getTombolaByCode(db, event.params.code);
	if (!t) error(404, 'This tombola link is not valid.');
	const access = await screenAccess(event, t);
	const base = { code: t.code, eventTitle: t.event_title || 'Event' };
	if (!access) return { ...base, authed: false };
	const { origin, host } = event.url;
	return {
		...base,
		authed: true,
		joinUrl: `${origin}/tombola/${t.code}`,
		joinHost: `${host}/tombola/${t.code}`,
	};
}

export const actions = {
	pin: async (event) => {
		const db = event.platform?.env?.DB;
		if (!db) error(500, 'Database unavailable');
		const t = await getTombolaByCode(db, event.params.code);
		if (!t) error(404, 'Not found');
		const pin = String((await event.request.formData()).get('pin') ?? '');
		const r = await checkTombolaPin(db, t, pin);
		if (!r.ok) return fail(r.locked ? 429 : 400, { error: r.locked ? `Too many wrong tries — try again in ${r.locked} min.` : 'Wrong PIN — try again.' });
		await grantScreen(event, t);
		redirect(303, `/tombola/${t.code}/screen`);
	},
};
