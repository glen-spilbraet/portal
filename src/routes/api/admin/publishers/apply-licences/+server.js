import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { previewApplyLicences, applyLicences } from '$lib/server/applyLicences.js';
import { notifyShops } from '$lib/server/shopNotify.js';

async function requireAdmin(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
	return email;
}

/** GET /api/admin/publishers/apply-licences — preview: products with an empty Publication whose publisher is now licensed. */
export async function GET({ cookies, platform }) {
	await requireAdmin(cookies, platform);
	const db = platform?.env?.DB;
	const salesDb = platform?.env?.SALES_DB;
	if (!db || !salesDb) error(500, 'DB unavailable');
	return json(await previewApplyLicences(db, salesDb));
}

/** POST { skus: string[] } — reset those products to follow their publisher licence; one 'full' shop notice. */
export async function POST({ request, cookies, platform }) {
	const email = await requireAdmin(cookies, platform);
	const salesDb = platform?.env?.SALES_DB;
	if (!salesDb) error(500, 'DB unavailable');
	const body = await request.json().catch(() => ({}));
	const skus = Array.isArray(body.skus) ? body.skus : [];
	if (!skus.length) error(400, 'No products selected');
	if (skus.length > 5000) error(400, 'Too many products');
	const res = await applyLicences(salesDb, skus, email);
	if (res.updated) await notifyShops(platform, { type: 'full' });
	return json(res);
}
