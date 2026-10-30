import { json } from '@sveltejs/kit';
import { requireTasks } from '$lib/server/tasksAuth.js';
import { removeAssociation } from '$lib/server/tasks.js';

export async function DELETE(event) {
	const { db } = await requireTasks(event);
	await removeAssociation(db, event.params.assocId);
	return json({ ok: true });
}
