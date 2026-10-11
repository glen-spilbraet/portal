import { error } from '@sveltejs/kit';
import { listKnowledge, getAllowedUser, listDepartments, listTags } from '$lib/db.js';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (!user?.permissions?.knowledge) error(403, "You don't have access to this section.");
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const full = await getAllowedUser(db, user.email);
	const [items, departments, tags] = await Promise.all([
		listKnowledge(db, { role: user.role, email: user.email, department: full?.department }, {}),
		listDepartments(db),
		listTags(db),
	]);
	return { user, items, departments: departments.map((d) => d.name), tags };
}
