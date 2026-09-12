import { error } from '@sveltejs/kit';
import { listPriceSyncLog, listPriceSources } from '$lib/db.js';

export async function load({ platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const [logs, sources] = await Promise.all([listPriceSyncLog(db, 100), listPriceSources(db)]);
	return { logs, sources };
}
