import { json } from '@sveltejs/kit';
import { requireEvents } from '$lib/server/eventsAuth.js';
import { upsertTemplate } from '$lib/server/eventEmails.js';

// Save one language's subject/body for a step.
export async function PUT(event) {
	const { db } = await requireEvents(event);
	const body = await event.request.json().catch(() => ({}));
	if (!body?.lang) return json({ message: 'lang is required' }, { status: 400 });
	await upsertTemplate(db, event.params.id, body.lang, { subject: body.subject, body: body.body });
	return json({ ok: true });
}
