import { fail, redirect } from '@sveltejs/kit';
import { listSheets, deleteSheet } from '$lib/db.js';

export async function load({ platform }) {
	const db = platform?.env?.DB;
	if (!db) return { sheets: [] };
	const sheets = await listSheets(db);
	return { sheets };
}

export const actions = {
	delete: async ({ request, platform }) => {
		const db = platform?.env?.DB;
		if (!db) return fail(500, { error: 'DB unavailable' });
		const data = await request.formData();
		const id = data.get('id')?.toString();
		if (!id) return fail(400, { error: 'Missing id' });
		await deleteSheet(db, id);
		redirect(303, '/');
	}
};
