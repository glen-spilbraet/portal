import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { deletePublisher, renamePublisher } from '$lib/server/publishers.js';

async function requireAdmin(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
}

// Remove a publisher from the registry (does not touch existing mappings).
export async function DELETE({ params, cookies, platform }) {
	await requireAdmin(cookies, platform);
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Sales DB unavailable');
	await deletePublisher(db, decodeURIComponent(params.name));
	return json({ ok: true });
}

// Rename a publisher everywhere (mappings, series, markets, shop page, sales lines, report rules).
export async function PATCH({ params, request, cookies, platform }) {
	await requireAdmin(cookies, platform);
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Sales DB unavailable');
	const body = await request.json().catch(() => ({}));
	try {
		await renamePublisher(db, platform?.env?.DB, decodeURIComponent(params.name), String(body?.name ?? ''));
	} catch (e) {
		return json({ message: e instanceof Error ? e.message : String(e) }, { status: 400 });
	}
	return json({ ok: true, name: String(body.name).trim() });
}
