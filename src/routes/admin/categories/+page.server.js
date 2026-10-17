import { error, fail } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import {
	CATEGORY_LANGS, listTaxonomy, labelsFromForm, createGroup, createCategory, updateItem, deleteItem,
	productCategoryIds, setProductCategories
} from '$lib/server/categories.js';

export async function load({ parent, platform, url }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Database unavailable');

	const sku = (url.searchParams.get('sku') ?? '').trim();
	const groups = await listTaxonomy(db);

	/** @type {{ sku: string, name: string | null, selected: string[] } | null} */
	let product = null;
	if (sku) {
		// Name from a sales sheet (env DB) or, failing that, the sales mirror.
		const sheetDb = platform?.env?.DB;
		const sheetName = sheetDb ? await sheetDb.prepare(
			`SELECT t.value AS name FROM sales_sheets s JOIN translations t ON t.sheet_id = s.id
			 WHERE lower(s.sku) = lower(?) AND t.key = 'product_name' AND t.value != ''
			 ORDER BY (t.language = s.primary_language) DESC LIMIT 1`).bind(sku).first() : null;
		const lineName = sheetName ? null : await db.prepare('SELECT name FROM deal_line_items WHERE lower(sku) = lower(?) AND name IS NOT NULL LIMIT 1').bind(sku).first();
		product = { sku, name: /** @type {any} */ (sheetName ?? lineName)?.name ?? null, selected: await productCategoryIds(db, sku) };
	}
	return { user, groups, langs: CATEGORY_LANGS, product };
}

/**
 * Form actions have no `parent()`; check the session like the admin API routes do.
 * @param {any} event
 */
async function requireAdmin({ cookies, platform }) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const appDb = platform?.env?.DB;
	const db = platform?.env?.SALES_DB;
	if (!appDb || !db) error(500, 'Database unavailable');
	const user = await getAllowedUser(appDb, email);
	if (!user || user.role !== 'admin') error(403, 'Admins only');
	return { db, email };
}

/** @param {FormData} f */
const position = (f) => parseInt(String(f.get('position') ?? '0')) || 0;

export const actions = {
	saveGroup: async (event) => {
		const { db } = await requireAdmin(event);
		const f = await event.request.formData();
		const labels = labelsFromForm(f);
		if (!labels.da && !labels.en) return fail(400, { error: 'Give the group at least a Danish or English name.' });
		const id = String(f.get('id') ?? '');
		if (id) await updateItem(db, 'group', id, labels, position(f));
		else await createGroup(db, labels, position(f));
		return { ok: id ? 'Group saved.' : 'Group created.' };
	},
	saveCategory: async (event) => {
		const { db } = await requireAdmin(event);
		const f = await event.request.formData();
		const labels = labelsFromForm(f);
		if (!labels.da && !labels.en) return fail(400, { error: 'Give the category at least a Danish or English name.' });
		const id = String(f.get('id') ?? '');
		if (id) await updateItem(db, 'category', id, labels, position(f));
		else await createCategory(db, String(f.get('group_id') ?? ''), labels, position(f));
		return { ok: id ? 'Category saved.' : 'Category created.' };
	},
	delete: async (event) => {
		const { db } = await requireAdmin(event);
		const f = await event.request.formData();
		await deleteItem(db, f.get('type') === 'group' ? 'group' : 'category', String(f.get('id')));
		return { ok: 'Deleted.' };
	},
	product: async (event) => {
		const { db, email } = await requireAdmin(event);
		const f = await event.request.formData();
		const sku = String(f.get('sku') ?? '').trim();
		if (!sku) return fail(400, { error: 'Missing SKU.' });
		const ids = await setProductCategories(db, sku, f.getAll('category').map(String), email);
		return { ok: `Saved ${ids.length} categor${ids.length === 1 ? 'y' : 'ies'} for ${sku}.` };
	}
};
