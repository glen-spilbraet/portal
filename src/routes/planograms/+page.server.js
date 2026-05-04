import { listPlanogramProjects, listOwnPlanogramProjects, listPlanogramFolders, listAllPlanogramFolders, listSharedPlanograms, listAllowedUsers } from '$lib/db.js';

export async function load({ parent, platform }) {
	const { user, simulatedAs } = await parent();
	const db = platform?.env?.DB;
	if (!db) return { projects: [], folders: [], sharedWithMe: [], isAdmin: false, userNames: {} };

	const isAdmin = user?.role === 'admin';
	const effectiveEmail = simulatedAs?.email ?? user?.email;

	const [projects, folders, sharedWithMe, allUsers] = await Promise.all([
		isAdmin ? listPlanogramProjects(db) : listOwnPlanogramProjects(db, effectiveEmail),
		isAdmin ? listAllPlanogramFolders(db) : listPlanogramFolders(db, effectiveEmail),
		isAdmin ? Promise.resolve([]) : listSharedPlanograms(db, effectiveEmail),
		listAllowedUsers(db),
	]);

	const userNames = Object.fromEntries(
		allUsers.map(u => [u.email, u.first_name?.trim() || u.email.split('@')[0]])
	);

	return { projects, folders, sharedWithMe, isAdmin, userNames };
}
