import { json, error } from '@sveltejs/kit';
import { requireTasks } from '$lib/server/tasksAuth.js';
import { searchSheets } from '$lib/db.js';
import * as W from '$lib/server/wheel.js';
import { sheetName } from '$lib/languages.js';

/** Picker search: ?type=product|series|publisher&q=… */
export async function GET(event) {
	const { db, salesDb } = await requireTasks(event); // admin-only guard (shared with /tasks)
	const type = event.url.searchParams.get('type');
	const q = (event.url.searchParams.get('q') ?? '').trim();
	if (q.length < 2) return json([]);
	if (type === 'product') {
		const rows = await searchSheets(db, q);
		return json((rows ?? []).slice(0, 12).map((r) => ({
			ref_id: r.sku,
			label: sheetName(r) || r.sku,
			sub: r.sku,
		})));
	}
	if (!salesDb) return json([]);
	if (type === 'series') return json(await W.searchSeriesRefs(salesDb, q));
	if (type === 'publisher') return json(await W.searchPublisherRefs(salesDb, q));
	error(400, 'unknown type');
}

/** All mutations: { op, id?, ...payload } */
export async function POST(event) {
	const { db, email } = await requireTasks(event);
	const body = await event.request.json().catch(() => ({}));
	const { op, id, ...p } = body ?? {};
	try {
		switch (op) {
			case 'item.create':     return json(await W.createItem(db, p, email));
			case 'item.update':     return json(await W.updateItem(db, id, p));
			case 'item.delete':     await W.deleteItem(db, id); return json({ ok: true });
			case 'theme.create':    return json(await W.createTheme(db, p, email));
			case 'theme.update':    return json(await W.updateTheme(db, id, p));
			case 'theme.delete':    await W.deleteTheme(db, id); return json({ ok: true });
			case 'activity.create': return json({ id: await W.createActivity(db, p) });
			case 'activity.update': await W.updateActivity(db, id, p); return json({ ok: true });
			case 'activity.archive': await W.archiveActivity(db, id); return json({ ok: true });
		}
	} catch (e) {
		error(400, /** @type {any} */ (e)?.message || 'Bad request');
	}
	error(400, 'unknown op');
}
