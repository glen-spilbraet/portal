import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, searchSheets } from '$lib/db.js';
import { cleanDeal, createDeal, searchParties } from '$lib/server/exclusivity.js';

/** Admin gate (role via DB). Agreements live on the shared SALES_DB. */
async function requireAdmin(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
	return email;
}

/**
 * Picker search.
 *   ?type=product&q=…            → sales sheets (DB): [{ sku, label }]
 *   ?type=customer&q=…&market=DK → groups + companies (SALES_DB)
 */
export async function GET({ url, cookies, platform }) {
	await requireAdmin(cookies, platform);
	const q = (url.searchParams.get('q') ?? '').trim();
	if (q.length < 2) return json([]);
	const type = url.searchParams.get('type');
	if (type === 'product') {
		const rows = await searchSheets(platform.env.DB, q);
		return json((rows ?? []).slice(0, 12).map((r) => ({
			sku: r.sku,
			label: r.name_en || r.name_da || r.name_sv || r.name_no || r.sku,
		})));
	}
	if (type === 'customer') {
		const db = platform?.env?.SALES_DB;
		if (!db) error(500, 'Sales DB unavailable');
		return json(await searchParties(db, q, (url.searchParams.get('market') ?? '').toUpperCase()));
	}
	error(400, 'unknown type');
}

export async function POST({ request, cookies, platform }) {
	const email = await requireAdmin(cookies, platform);
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Sales DB unavailable');
	const { value, error: msg } = cleanDeal(await request.json().catch(() => ({})));
	if (msg) return json({ message: msg }, { status: 400 });
	return json({ ok: true, id: await createDeal(db, value, email) });
}
