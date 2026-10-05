import { listSheetsNeedingAwardUpdate } from '$lib/db.js';

export async function load({ platform }) {
	const db = platform?.env?.DB;
	if (!db) return { sheets: [] };
	const sheets = await listSheetsNeedingAwardUpdate(db);
	return { sheets };
}
