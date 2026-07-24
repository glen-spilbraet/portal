import { fail, redirect } from '@sveltejs/kit';
import { listSheets, countSheets, deleteSheet } from '$lib/db.js';

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
	delete: async ({ request, platform }) => {
		const db = platform?.env?.DB;
		if (!db) return fail(500, { error: 'DB unavailable' });
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { error: 'Missing id' });
		await deleteSheet(db, id);
		redirect(303, '/sheets');
	}
};
