import { error } from '@sveltejs/kit';
import { listDepartments, listTags, listCustomerGroups } from '$lib/db.js';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (!user?.permissions?.knowledge) error(403, "You don't have access to this section.");
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const [departments, tags, customerGroups] = await Promise.all([
		listDepartments(db),
		listTags(db),
		listCustomerGroups(platform?.env?.SALES_DB),
	]);
	return { user, departments: departments.map((d) => d.name), tags, customerGroups };
}
