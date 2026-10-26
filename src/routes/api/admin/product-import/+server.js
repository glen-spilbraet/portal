import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { parseCsv, buildPlan } from '$lib/server/productImport.js';

async function requireAdmin(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
	return email;
}

/** POST /api/admin/product-import — multipart `file` (CSV) → dry-run plan (no writes). */
export async function POST({ request, cookies, platform }) {
	await requireAdmin(cookies, platform);
	const db = platform?.env?.DB;
	const salesDb = platform?.env?.SALES_DB;
	if (!db || !salesDb) error(500, 'DB unavailable');

	const form = await request.formData();
	const file = form.get('file');
	if (!file || typeof file === 'string') error(400, 'No CSV file provided');
	const text = await file.text();
	const rows = parseCsv(text);
	if (!rows.length) error(400, 'CSV had no data rows');

	const plan = await buildPlan(db, salesDb, rows);
	return json(plan);
}
