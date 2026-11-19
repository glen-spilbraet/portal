import { error } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { getEvent } from '$lib/server/events.js';
import { getTombolaForEvent, listEntriesAdmin } from '$lib/server/tombola.js';

const cell = (v) => {
	const s = String(v ?? '');
	return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// CSV of all participants (incl. email + zip) for the event.
export async function GET(event) {
	const { db } = await requireEvents(event);
	const ev = await getEvent(db, event.params.id);
	const t = await getTombolaForEvent(db, event.params.id);
	if (!ev || !t) error(404, 'No tombola for this event');
	const rows = await listEntriesAdmin(db, t.id);
	const lines = [['First name', 'Last name', 'Email', 'Zip', 'Signed up (UTC)', 'Won (UTC)', 'Shoutouts']]
		.concat(rows.map((r) => [r.first_name, r.last_name, r.email, r.zip, r.created_at, r.won_at ?? '', r.shoutouts]));
	const csv = '﻿' + lines.map((l) => l.map(cell).join(',')).join('\r\n');
	const name = `tombola-${(ev.title || 'event').replace(/[^\w-]+/g, '-').slice(0, 40)}.csv`;
	return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"` } });
}
