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

	// Attach session counts so every catalogue card can show a quick stat
	const allIds = [...catalogues.map(c => c.id), ...sharedWithMe.map(c => c.id)];
	/** @type {Record<string, number>} */
	let sessionCounts = {};
	if (allIds.length > 0) {
		const placeholders = allIds.map(() => '?').join(',');
		const countRows = await db
			.prepare(
				`SELECT catalogue_id, COUNT(*) AS cnt
         FROM catalogue_analytics_sessions
         WHERE catalogue_id IN (${placeholders})
         GROUP BY catalogue_id`
			)
			.bind(...allIds)
			.all();
		sessionCounts = Object.fromEntries(
			/** @type {any[]} */ (countRows.results ?? []).map(r => [r.catalogue_id, r.cnt])
		);
	}

	const withCounts = (list) => list.map(c => ({ ...c, session_count: sessionCounts[c.id] ?? 0 }));

	return {
		catalogues:   withCounts(catalogues),
		folders,
		sharedWithMe: withCounts(sharedWithMe),
		isAdmin,
		userNames,
	};
}
