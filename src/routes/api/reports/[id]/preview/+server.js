import { json, error } from '@sveltejs/kit';
import { requireReports } from '$lib/server/reportsAuth.js';
import { computeReport } from '$lib/server/reports.js';

// Compute figures for a DRAFT (unsaved) rule set, so the builder can preview live.
export async function POST(event) {
	const { salesDb } = await requireReports(event);
	if (!salesDb) error(500, 'Sales data unavailable');
	const body = await event.request.json().catch(() => ({}));
	const data = await computeReport(salesDb, Array.isArray(body.rules) ? body.rules : [], { metric: body.metric || 'both' });
	return json(data);
}
