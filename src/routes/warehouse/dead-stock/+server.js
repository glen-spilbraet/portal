// Lazy data for the Warehouse "Slow movers / Dead stock" tab — only called when
// the tab is opened. Reads the nightly wms_sku_activity summary, never the
// order history. Gated by the `warehouse` permission (endpoints aren't covered
// by the layout guard).
import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';
import { loadDeadStock } from '$lib/server/warehouse.js';

export async function GET({ cookies, platform }) {
	const env = platform?.env;
	const email = await verifySession(cookies.get('session') ?? '', env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const user = env?.DB ? await getAllowedUser(env.DB, email) : null;
	if (!user) error(403, 'Forbidden');
	const perms = await getUserPermissions(env.DB, user);
	if (!perms.warehouse) error(403, 'No access to Warehouse');
	if (!env.SALES_DB) error(500, 'Database unavailable');

	try {
		return json(await loadDeadStock(env.SALES_DB, env.DB), { headers: { 'Cache-Control': 'private, max-age=300' } });
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		if (/no such table/i.test(message)) return json({ rows: [], missing: true });
		throw e;
	}
}
