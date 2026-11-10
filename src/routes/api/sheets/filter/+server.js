import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';
import { parseFilter, filterSheets, filterOptions } from '$lib/server/sheetFilter.js';

/**
 * GET /api/sheets/filter?pub=&pubMode=sku|mapped&q=&missing=age,time&missingMode=any|all
 *                       &markets=DK,SE|none&preorder=yes|no&restock=yes|no&featured=1
 * GET /api/sheets/filter?options=1 → { publishers, markets }
 * Advanced Sheets filter — edit access only.
 */
export async function GET({ url, cookies, platform }) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB, salesDb = platform?.env?.SALES_DB;
	if (!db || !salesDb) error(500, 'Database unavailable');
	const user = await getAllowedUser(db, email);
	if (!user) error(403, 'Access denied');
	if (!(await getUserPermissions(db, user)).sheetsEdit) error(403, 'Edit access required');

	if (url.searchParams.get('options')) return json(await filterOptions(salesDb));
	return json(await filterSheets(db, salesDb, parseFilter(url.searchParams)));
}
