import { json, error } from '@sveltejs/kit';
import { requireTasks } from '$lib/server/tasksAuth.js';
import { addAssociation, ASSOC_KINDS } from '$lib/server/tasks.js';

export async function POST(event) {
	const { db } = await requireTasks(event);
	const body = await event.request.json().catch(() => ({}));
	if (!ASSOC_KINDS.includes(body.kind) || !body.ref_id) error(400, 'kind and ref_id required');
	const id = await addAssociation(db, event.params.id, {
		kind: body.kind, ref_id: body.ref_id, ref_label: body.ref_label,
	});
	return json({ id });
}
