import { json } from '@sveltejs/kit';
import { requireTasks } from '$lib/server/tasksAuth.js';
import { updateTask, deleteTask } from '$lib/server/tasks.js';

export async function PUT(event) {
	const { db } = await requireTasks(event);
	const body = await event.request.json().catch(() => ({}));
	await updateTask(db, event.params.id, body);
	return json({ ok: true });
}

export async function DELETE(event) {
	const { db } = await requireTasks(event);
	await deleteTask(db, event.params.id);
	return json({ ok: true });
}
