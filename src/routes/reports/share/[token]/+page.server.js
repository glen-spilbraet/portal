import { error } from '@sveltejs/kit';
import { getReportByToken } from '$lib/db.js';
import { computeReport } from '$lib/server/reports.js';
import { resolveRange, getPeriodOptions, addDaysStr } from '$lib/server/statsRange.js';

export async function load({ params, platform, url }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'Unavailable');
	const report = await getReportByToken(db, params.token);
	if (!report) error(404, 'Report not found');

	const now = new Date();
	const allow = !!report.allow_date_filter;
	const hasParams = url.searchParams.get('period') || (url.searchParams.get('from') && url.searchParams.get('to'));
	// Default to current year-to-date; only honor the picker when the report allows it.
	const dateParams = allow && hasParams ? url.searchParams : new URLSearchParams('period=ytd');
	const { cur, prior, label, selected } = resolveRange(dateParams, now);

	const salesDb = platform?.env?.SALES_DB;
	const data = salesDb ? await computeReport(salesDb, report.rules, { metric: report.metric, cur, prior, label }) : null;
	const opts = getPeriodOptions(now);

	return {
		name: report.name,
		metric: report.metric,
		allowDateFilter: allow,
		data,
		selected,
		range: { start: cur.start, endInclusive: addDaysStr(cur.end, -1) },
		...opts,
	};
}
