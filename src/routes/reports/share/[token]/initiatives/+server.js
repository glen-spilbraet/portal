// Lazy data for the shared report's Initiatives pane — only fetched when the
// viewer opens it. Public like the report itself (token = access); 404 unless
// the report has Initiatives switched on.
import { json, error } from '@sveltejs/kit';
import { getReportByToken } from '$lib/db.js';
import { loadInitiatives } from '$lib/server/initiatives.js';

export async function GET({ params, platform }) {
	const db = platform?.env?.DB, salesDb = platform?.env?.SALES_DB;
	if (!db || !salesDb) error(500, 'Unavailable');
	const report = await getReportByToken(db, params.token);
	if (!report || !report.show_initiatives) error(404, 'Not found');
	return json(await loadInitiatives(db, salesDb, report.rules), { headers: { 'Cache-Control': 'private, max-age=300' } });
}
