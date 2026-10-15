import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { listSeries, createSeries, renameSeries, deleteSeries, mapSkuToSeries, unmapSkuSeries, searchPublisherProducts } from '$lib/server/series.js';

// Admin-gate; series tables live in the shared SALES_DB (portal-db).
async function requireAdmin(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
}

export async function GET({ url, cookies, platform }) {
	await requireAdmin(cookies, platform);
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Sales DB unavailable');
	const publisher = (url.searchParams.get('publisher') ?? '').trim();
	const q = url.searchParams.get('q');
	if (q != null) return json({ results: await searchPublisherProducts(db, publisher, q) });
	return json({ series: await listSeries(db, publisher) });
}

export async function POST({ request, cookies, platform }) {
	await requireAdmin(cookies, platform);
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Sales DB unavailable');
	const b = await request.json().catch(() => ({}));
	switch (b.op) {
		case 'create': return json({ ok: true, id: await createSeries(db, b.publisher, b.name) });
		case 'rename': await renameSeries(db, b.id, b.name); return json({ ok: true });
		case 'delete': await deleteSeries(db, b.id); return json({ ok: true });
		case 'map': await mapSkuToSeries(db, b.sku, b.series_id); return json({ ok: true });
		case 'unmap': await unmapSkuSeries(db, b.sku); return json({ ok: true });
		default: return json({ message: 'unknown op' }, { status: 400 });
	}
}
