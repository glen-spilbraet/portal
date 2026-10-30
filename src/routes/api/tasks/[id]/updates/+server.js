import { json, error } from '@sveltejs/kit';
import { requireTasks } from '$lib/server/tasksAuth.js';
import { listUpdates, addUpdate } from '$lib/server/tasks.js';

export async function GET(event) {
	const { db } = await requireTasks(event);
	return json(await listUpdates(db, event.params.id));
}

export async function POST(event) {
	const { db, email } = await requireTasks(event);
	const body = await event.request.json().catch(() => ({}));
	const text = (body.body ?? '').trim();
	if (!text) error(400, 'Update is empty');
	const id = await addUpdate(db, event.params.id, { author: email, body: text });
	return json({ id, task_id: event.params.id, author_email: email, body: text, created_at: new Date().toISOString() });
}
