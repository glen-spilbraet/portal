import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { cleanDeal, updateDeal, deleteDeal, resolveMembers } from '$lib/server/exclusivity.js';
import { notifyShops } from '$lib/server/shopNotify.js';

const skuOf = async (db, id) => /** @type {any} */ (await db.prepare('SELECT sku FROM exclusivity_deal WHERE id = ?').bind(id).first())?.sku ?? null;

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
	const before = await skuOf(db, params.id);
	await updateDeal(db, params.id, value);
	let warning = null;
	try {
		const r = await resolveMembers(db, platform?.env?.HUBSPOT_TOKEN, [params.id]);
		if (r.missingNumber.length) warning = `No Rackbeat customer number in HubSpot for: ${r.missingNumber.map((m) => m.company).join(', ')}`;
	} catch (e) { warning = `Saved, but customers couldn't be looked up in HubSpot (${e instanceof Error ? e.message : e}) — use "Refresh customers".`; }
	await notifyShops(platform, { type: 'exclusivity', skus: [...new Set([before, value.sku].filter(Boolean))] });
	return json({ ok: true, warning });
}

export async function DELETE({ params, cookies, platform }) {
	await requireAdmin(cookies, platform);
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Sales DB unavailable');
	const sku = await skuOf(db, params.id);
	await deleteDeal(db, params.id);
	await db.prepare('DELETE FROM exclusivity_member WHERE deal_id = ?').bind(params.id).run().catch(() => {});
	if (sku) await notifyShops(platform, { type: 'exclusivity', skus: [sku] });
	return json({ ok: true });
}
