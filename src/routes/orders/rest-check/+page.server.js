import { error } from '@sveltejs/kit';
import { listRestCheckLog, getRestCheckSettings } from '$lib/db.js';

export async function load({ platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const [logs, settings] = await Promise.all([
		listRestCheckLog(db, 100),
		getRestCheckSettings(db),
	]);
	return { logs, settings };
}
