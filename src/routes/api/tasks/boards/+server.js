import { json } from '@sveltejs/kit';
import { requireTasks } from '$lib/server/tasksAuth.js';
import { createBoard } from '$lib/server/tasks.js';

export async function POST(event) {
	const { db, email } = await requireTasks(event);
	const body = await event.request.json().catch(() => ({}));
	const name = (body.name ?? '').trim() || 'New board';
	const id = await createBoard(db, { name, createdBy: email });
	return json({ id, name });
}
