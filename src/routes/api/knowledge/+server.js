import { json } from '@sveltejs/kit';
import { requireKnowledge } from '$lib/server/knowledgeAuth.js';
import { createKnowledge } from '$lib/db.js';

const lines = (v) => (typeof v === 'string' ? v.split(/[\n,]/).map((s) => s.trim()).filter(Boolean) : Array.isArray(v) ? v : []);

export async function POST(event) {
	const { db, user } = await requireKnowledge(event);
	const b = await event.request.json().catch(() => ({}));
	const id = await createKnowledge(db, {
		type: b.type || 'meeting',
		title: b.title,
		happened_on: b.happened_on || null,
		source: b.source || 'manual',
		transcript: b.transcript || null,
		tldr: b.tldr || null,
		decisions: lines(b.decisions),
		topics: lines(b.topics),
		action_items: Array.isArray(b.action_items) ? b.action_items : [],
		visibility: b.visibility === 'all_staff' ? 'all_staff' : 'participants',
		participants: lines(b.participants),
		teams: Array.isArray(b.teams) ? b.teams : lines(b.teams),
		customer_groups: Array.isArray(b.customer_groups) ? b.customer_groups : lines(b.customer_groups),
		tags: Array.isArray(b.tags) ? b.tags : lines(b.tags),
	}, user.email);
	return json({ ok: true, id });
}
