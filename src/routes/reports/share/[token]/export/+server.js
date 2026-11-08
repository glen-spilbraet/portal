import { error } from '@sveltejs/kit';
import { getReportByToken } from '$lib/db.js';
import { computeExport, exportToCsv, csvResponse } from '$lib/server/reports.js';
import { resolveRange } from '$lib/server/statsRange.js';
import { cachedReport, ruleKey } from '$lib/server/reportCache.js';

// Public CSV export for a shared report — mirrors the share page's date range.
export async function GET({ params, platform, url }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'Unavailable');
	const report = await getReportByToken(db, params.token);
	if (!report) error(404, 'Report not found');
	const salesDb = platform?.env?.SALES_DB;
	if (!salesDb) error(500, 'Sales data unavailable');

	const now = new Date();
	const allow = !!report.allow_date_filter;
	const hasParams = url.searchParams.get('period') || (url.searchParams.get('from') && url.searchParams.get('to'));
	const dateParams = allow && hasParams ? url.searchParams : new URLSearchParams('period=ytd');
	const { cur, prior } = resolveRange(dateParams, now);
	const measure = url.searchParams.get('measure') === 'revenue' ? 'revenue' : 'units';
	const by = url.searchParams.get('by') === 'series' ? 'series' : 'product';

	const exp = await cachedReport(db, salesDb, { kind: 'export', v: 2, rules: ruleKey(report.rules), measure, cur, prior, by },
		() => computeExport(salesDb, report.rules, { measure, cur, prior, by }));
	return csvResponse(exportToCsv(exp), `${report.name} ${by === 'series' ? 'series ' : ''}${measure} export.csv`);
}
