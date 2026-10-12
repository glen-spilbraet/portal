import { error } from '@sveltejs/kit';
import { requireReports } from '$lib/server/reportsAuth.js';
import { getReport } from '$lib/db.js';
import { computeExport, exportToCsv, csvResponse } from '$lib/server/reports.js';

// CSV export of the saved report — all products in rows, one column per country.
export async function GET(event) {
	const { db, salesDb } = await requireReports(event);
	if (!salesDb) error(500, 'Sales data unavailable');
	const report = await getReport(db, event.params.id);
	if (!report) error(404, 'Report not found');
	const measure = event.url.searchParams.get('measure') === 'revenue' ? 'revenue' : 'units';
	const exp = await computeExport(salesDb, report.rules, { measure });
	return csvResponse(exportToCsv(exp), `${report.name} ${measure} export.csv`);
}
