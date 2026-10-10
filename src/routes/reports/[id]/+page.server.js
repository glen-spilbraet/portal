import { error } from '@sveltejs/kit';
import { getReport } from '$lib/db.js';
import { computeReport } from '$lib/server/reports.js';
import { listPublishers } from '$lib/server/publishers.js';

export async function load({ params, parent, platform, url }) {
	const { user } = await parent();
	if (!user?.permissions?.reports) error(403, "You don't have access to this section.");
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const report = await getReport(db, params.id);
	if (!report) error(404, 'Report not found');

	const salesDb = platform?.env?.SALES_DB;
	const preview = salesDb ? await computeReport(salesDb, report.rules, { metric: report.metric }) : null;
	const publishers = salesDb ? ((await listPublishers(salesDb)) ?? []).map((r) => r.name) : [];
	return { user, report, preview, publishers, origin: url.origin };
}
