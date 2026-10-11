import { error } from '@sveltejs/kit';
import { getKnowledge, getAllowedUser } from '$lib/db.js';

export async function load({ params, parent, platform }) {
	const { user } = await parent();
	if (!user?.permissions?.knowledge) error(403, "You don't have access to this section.");
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const full = await getAllowedUser(db, user.email);
	const item = await getKnowledge(db, params.id, { role: user.role, email: user.email, department: full?.department });
	if (!item) error(404, 'Not found or not shared with you');
	return { user, item };
}
