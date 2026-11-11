import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { resolveMembers } from '$lib/server/exclusivity.js';
import { notifyShops } from '$lib/server/shopNotify.js';

/** POST — re-resolve every running/upcoming agreement's customers (groups → companies → Rackbeat numbers) from HubSpot. */
export async function POST({ cookies, platform }) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const user = platform?.env?.DB ? await getAllowedUser(platform.env.DB, email) : null;
	if (!user || user.role !== 'admin') error(403, 'Admins only');
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Sales DB unavailable');
	try {
		const r = await resolveMembers(db, platform?.env?.HUBSPOT_TOKEN);
		if (r.skus.length) await notifyShops(platform, { type: 'exclusivity', skus: r.skus });
		return json({ ok: true, deals: r.deals, customers: r.customers, missingNumber: r.missingNumber });
	} catch (e) {
		return json({ message: e instanceof Error ? e.message : String(e) }, { status: 502 });
	}
}
