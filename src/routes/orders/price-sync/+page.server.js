import { error } from '@sveltejs/kit';
import { listPriceSyncLog } from '$lib/db.js';

export async function load({ platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	return { logs: await listPriceSyncLog(db, 100) };
}
