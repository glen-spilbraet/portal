import { json, error } from '@sveltejs/kit';
import { requireKnowledge } from '$lib/server/knowledgeAuth.js';
import { getKnowledge, deleteKnowledge } from '$lib/db.js';

export async function DELETE(event) {
	const { db, user } = await requireKnowledge(event);
	const item = await getKnowledge(db, event.params.id); // no visibility filter — check ownership below
	if (!item) error(404, 'Not found');
	if (user.role !== 'admin' && item.created_by !== user.email) error(403, 'Only the creator or an admin can delete this');
	await deleteKnowledge(db, event.params.id);
	return json({ ok: true });
}
