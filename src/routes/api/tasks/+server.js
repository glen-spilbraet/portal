import { json, error } from '@sveltejs/kit';
import { requireTasks } from '$lib/server/tasksAuth.js';
import { createTask } from '$lib/server/tasks.js';

export async function POST(event) {
	const { db, email } = await requireTasks(event);
	const body = await event.request.json().catch(() => ({}));
	if (!body.board_id) error(400, 'board_id required');
	const id = await createTask(db, { board_id: body.board_id, name: body.name ?? '', createdBy: email });
	return json({ id });
}
