import { json } from '@sveltejs/kit';
import { requireReports } from '$lib/server/reportsAuth.js';
import { createReport, setReportRules } from '$lib/db.js';

export async function POST(event) {
	const { db, email } = await requireReports(event);
	const body = await event.request.json().catch(() => ({}));
	const id = await createReport(db, { name: body.name, metric: body.metric, createdBy: email });
	if (Array.isArray(body.rules)) await setReportRules(db, id, body.rules);
	return json({ ok: true, id });
}
