import { json } from '@sveltejs/kit';
import { requireReports } from '$lib/server/reportsAuth.js';
import { updateReport, setReportRules, deleteReport, rotateReportToken } from '$lib/db.js';

export async function PUT(event) {
	const { db } = await requireReports(event);
	const id = event.params.id;
	const body = await event.request.json().catch(() => ({}));
	if (body.rotate === true) return json({ ok: true, share_token: await rotateReportToken(db, id) });
	const patch = {};
	if (typeof body.name === 'string') patch.name = body.name.trim() || 'Untitled report';
	if (['units', 'revenue', 'both'].includes(body.metric)) patch.metric = body.metric;
	if (typeof body.allow_date_filter === 'boolean') patch.allow_date_filter = body.allow_date_filter ? 1 : 0;
	if (Object.keys(patch).length) await updateReport(db, id, patch);
	if (Array.isArray(body.rules)) await setReportRules(db, id, body.rules);
	return json({ ok: true });
}

export async function DELETE(event) {
	const { db } = await requireReports(event);
	await deleteReport(db, event.params.id);
	return json({ ok: true });
}
