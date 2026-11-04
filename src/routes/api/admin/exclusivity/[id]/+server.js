import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { cleanDeal, updateDeal, deleteDeal } from '$lib/server/exclusivity.js';

async function requireAdmin(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
}

export async function PUT({ params, request, cookies, platform }) {
	await requireAdmin(cookies, platform);
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Sales DB unavailable');
	const { value, error: msg } = cleanDeal(await request.json().catch(() => ({})));
	if (msg) return json({ message: msg }, { status: 400 });
	await updateDeal(db, params.id, value);
	return json({ ok: true });
}

export async function DELETE({ params, cookies, platform }) {
	await requireAdmin(cookies, platform);
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Sales DB unavailable');
	await deleteDeal(db, params.id);
	return json({ ok: true });
}
