import { error } from '@sveltejs/kit';
import { getReportByToken } from '$lib/db.js';
import { computeReport } from '$lib/server/reports.js';

export async function load({ params, platform }) {
	const db = platform?.env?.DB;
	if (!db) error(500, 'Unavailable');
	const report = await getReportByToken(db, params.token);
	if (!report) error(404, 'Report not found');
	const salesDb = platform?.env?.SALES_DB;
	const data = salesDb ? await computeReport(salesDb, report.rules, { metric: report.metric }) : null;
	return { name: report.name, metric: report.metric, data };
}
