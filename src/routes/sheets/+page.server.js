import { fail, redirect, error } from '@sveltejs/kit';
import { listSheets, countSheets, deleteSheet, getAllowedUser, getUserPermissions } from '$lib/db.js';
import { verifySession } from '$lib/auth.js';

const PAGE_SIZE = 30;

export async function load({ platform }) {
	const db = platform?.env?.DB;
	if (!db) return { sheets: [], totalCount: 0 };
	const [sheets, totalCount] = await Promise.all([
		listSheets(db, { limit: PAGE_SIZE }),
		countSheets(db),
	]);
	return { sheets, totalCount };
}

export const actions = {
	delete: async ({ request, cookies, platform }) => {
		const db = platform?.env?.DB;
		if (!db) return fail(500, { error: 'DB unavailable' });
		// Edit-level only.
		const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
		const user = email ? await getAllowedUser(db, email) : null;
		if (!user) error(401, 'Unauthorized');
		const perms = await getUserPermissions(db, user);
		if (!perms.sheetsEdit) error(403, "You don't have edit access to Sheets.");
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { error: 'Missing id' });
		await deleteSheet(db, id);
		redirect(303, '/sheets');
	}
};
