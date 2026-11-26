import { json, error } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { getEvent, getVenue } from '$lib/server/events.js';
import { addEventGurus, listEventGurus, listOpenings, markSent } from '$lib/server/gurus.js';
import { buildTenderMail, sendResendBatch } from '$lib/server/guruTenderMail.js';

/**
 * Send the tender: attach the picked gurus to the event (as invited, if not
 * already on it) and e-mail each their personal link. Gurus without an e-mail
 * are attached but skipped (copy their link from the People table instead).
 * Body: { guruIds: string[] }
 */
export async function POST(event) {
	const { db, user, email } = await requireEvents(event);
	const env = event.platform?.env ?? {};
	if (!env.RESEND_API_KEY) error(500, 'RESEND_API_KEY not configured');

	const body = await event.request.json().catch(() => ({}));
	const ids = [...new Set((Array.isArray(body?.guruIds) ? body.guruIds : []).map(String))];
	if (!ids.length) return json({ message: 'Pick at least one guru' }, { status: 400 });

	const ev = await getEvent(db, event.params.id);
	if (!ev) error(404, 'Event not found');
	await addEventGurus(db, ev.id, ids);

	const [venue, openings, eventGurus] = await Promise.all([
		ev.venue_id ? getVenue(db, ev.venue_id) : null,
		listOpenings(db, ev.id),
		listEventGurus(db, ev.id),
	]);
	const byId = new Map(eventGurus.map((g) => [g.id, g]));
	const from = user?.send_from || (user?.first_name ? `${user.first_name} <${email}>` : email) || env.RESEND_FROM;

	const emails = [], sentIds = [], skipped = [];
	for (const gid of ids) {
		const g = byId.get(gid);
		if (!g) { skipped.push({ id: gid, reason: 'Not found' }); continue; }
		if (!g.email) { skipped.push({ id: gid, name: g.name, reason: 'No e-mail' }); continue; }
		if (g.status === 'accepted' || g.status === 'confirmed') { skipped.push({ id: gid, name: g.name, reason: 'Already booked' }); continue; }
		const url = `${event.url.origin}/events/guru/${g.proposal_token}`;
		const m = buildTenderMail({ event: ev, venue, openings, guru: g, url });
		emails.push({ from, to: [g.email], reply_to: email, subject: m.subject, html: m.html, text: m.text });
		sentIds.push(gid);
	}

	if (emails.length) {
		try { await sendResendBatch(emails, env.RESEND_API_KEY); }
		catch (e) { return json({ message: e instanceof Error ? e.message : 'Sending failed', skipped }, { status: 502 }); }
		await markSent(db, ev.id, sentIds);
	}
	return json({ sent: sentIds.length, skipped });
}
