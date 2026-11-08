import { error } from '@sveltejs/kit';
import { requireReports } from '$lib/server/reportsAuth.js';
import { getReport } from '$lib/db.js';
import { computeExport, exportToCsv, csvResponse } from '$lib/server/reports.js';
import { cachedReport, ruleKey } from '$lib/server/reportCache.js';

// CSV export of the saved report — all products in rows, one column per country.
export async function GET(event) {
	const { db, salesDb } = await requireReports(event);
	if (!salesDb) error(500, 'Sales data unavailable');
	const report = await getReport(db, event.params.id);
	if (!report) error(404, 'Report not found');
	const measure = event.url.searchParams.get('measure') === 'revenue' ? 'revenue' : 'units';
	const by = event.url.searchParams.get('by') === 'series' ? 'series' : 'product';
	const exp = await cachedReport(db, salesDb, { kind: 'export', v: 2, rules: ruleKey(report.rules), measure, by },
		() => computeExport(salesDb, report.rules, { measure, by }));
	return csvResponse(exportToCsv(exp), `${report.name} ${by === 'series' ? 'series ' : ''}${measure} export.csv`);
}
