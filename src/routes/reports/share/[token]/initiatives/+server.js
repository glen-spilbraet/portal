// Lazy data for the shared report's Initiatives pane — only fetched when the
// viewer opens it. Public like the report itself (token = access); 404 unless
// the report has Initiatives switched on.
import { json, error } from '@sveltejs/kit';
import { getReportByToken } from '$lib/db.js';
import { loadInitiatives } from '$lib/server/initiatives.js';
import { cachedReport, ruleKey, dataVersion } from '$lib/server/reportCache.js';

export async function GET({ params, platform }) {
	const db = platform?.env?.DB, salesDb = platform?.env?.SALES_DB;
	if (!db || !salesDb) error(500, 'Unavailable');
	const report = await getReportByToken(db, params.token);
	if (!report || !report.show_initiatives) error(404, 'Not found');
	// Cached per rule set until an awards/press/events/publisher-mapping edit
	// bumps the 'initiatives' version (hooks.server.js), or the day changes
	// (product names/images from Sheets, "upcoming" flags, disclosure dates).
	const data = await cachedReport(db, salesDb, { kind: 'initiatives', v: 1, rules: ruleKey(report.rules) },
		() => loadInitiatives(db, salesDb, report.rules), { stamp: dataVersion(db, 'initiatives') });
	return json(data, { headers: { 'Cache-Control': 'private, max-age=60' } });
}
