import { listCatalogues, listOwnCatalogues, listFolders, listAllFolders, listSharedCatalogues, listAllowedUsers } from '$lib/db.js';

export async function load({ parent, platform }) {
	const { user, simulatedAs } = await parent();
	const db = platform?.env?.DB;
	if (!db) return { catalogues: [], folders: [], sharedWithMe: [], isAdmin: false, userNames: {} };

	// When an admin is simulating another user, apply that user's perspective
	const isAdmin = user?.role === 'admin';
	const effectiveEmail = simulatedAs?.email ?? user.email;

	const [catalogues, folders, sharedWithMe, allUsers] = await Promise.all([
		isAdmin ? listCatalogues(db) : listOwnCatalogues(db, effectiveEmail),
		isAdmin ? listAllFolders(db) : listFolders(db, effectiveEmail),
		isAdmin ? Promise.resolve([]) : listSharedCatalogues(db, effectiveEmail),
		listAllowedUsers(db),
	]);

	// Build email → display name map (first_name if set, else part before @)
	const userNames = Object.fromEntries(
		allUsers.map(u => [u.email, u.first_name?.trim() || u.email.split('@')[0]])
	);

	return { catalogues, folders, sharedWithMe, isAdmin, userNames };
}
