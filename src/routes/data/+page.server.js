import { listDataProducts, listOwnDataProducts, listAllowedUsers } from '$lib/db.js';

export async function load({ parent, platform }) {
	const { user, simulatedAs } = await parent();
	const db = platform?.env?.DB;
	if (!db) return { products: [], isAdmin: false, userNames: {} };

	const isAdmin = user?.role === 'admin';
	const effectiveEmail = simulatedAs?.email ?? user?.email;

	const [products, allUsers] = await Promise.all([
		isAdmin ? listDataProducts(db) : listOwnDataProducts(db, effectiveEmail),
		listAllowedUsers(db),
	]);

	const userNames = Object.fromEntries(
		allUsers.map(u => [u.email, u.first_name?.trim() || u.email.split('@')[0]])
	);

	return { products, isAdmin, userNames };
}
