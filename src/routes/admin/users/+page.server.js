import { error } from '@sveltejs/kit';
import { listAllowedUsers, listPermissionSets, listDepartments } from '$lib/db.js';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const [users, permissionSets, departments] = await Promise.all([
		listAllowedUsers(db),
		listPermissionSets(db),
		listDepartments(db),
	]);
	return { users, permissionSets, departments: departments.map((d) => d.name) };
}
