import { error, fail } from '@sveltejs/kit';
import {
	CATEGORY_LANGS, listTaxonomy, labelsFromForm, createGroup, createCategory, updateItem, deleteItem,
	productCategoryIds, setProductCategories
} from '$lib/server/categories.js';

/** @param {any} event */
async function guard({ parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');
	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Database unavailable');
	return { db, user };
}

export async function load(event) {
	const { db } = await guard(event);
	const sku = (event.url.searchParams.get('sku') ?? '').trim();
	const groups = await listTaxonomy(db);

	/** @type {{ sku: string, name: string | null, selected: string[] } | null} */
	let product = null;
	if (sku) {
		// Name from a sales sheet (env DB) or, failing that, the sales mirror.
		const sheetDb = event.platform?.env?.DB;
		const sheetName = sheetDb ? await sheetDb.prepare(
			`SELECT t.value AS name FROM sales_sheets s JOIN translations t ON t.sheet_id = s.id
			 WHERE lower(s.sku) = lower(?) AND t.key = 'product_name' AND t.value != ''
			 ORDER BY (t.language = s.primary_language) DESC LIMIT 1`).bind(sku).first() : null;
		const lineName = sheetName ? null : await db.prepare('SELECT name FROM deal_line_items WHERE lower(sku) = lower(?) AND name IS NOT NULL LIMIT 1').bind(sku).first();
		product = { sku, name: /** @type {any} */ (sheetName ?? lineName)?.name ?? null, selected: await productCategoryIds(db, sku) };
	}
	return { groups, langs: CATEGORY_LANGS, product };
}

/** @param {FormData} f */
const position = (f) => parseInt(String(f.get('position') ?? '0')) || 0;

export const actions = {
	addGroup: async (event) => {
		const { db } = await guard(event);
		const f = await event.request.formData();
		const labels = labelsFromForm(f);
		if (!labels.da && !labels.en) return fail(400, { error: 'Give the group at least a Danish or English name.' });
		await createGroup(db, labels, position(f));
		return { ok: 'Group added.' };
	},
	addCategory: async (event) => {
		const { db } = await guard(event);
		const f = await event.request.formData();
		const labels = labelsFromForm(f);
		if (!labels.da && !labels.en) return fail(400, { error: 'Give the category at least a Danish or English name.' });
		await createCategory(db, String(f.get('group_id')), labels, position(f));
		return { ok: 'Category added.' };
	},
	save: async (event) => {
		const { db } = await guard(event);
		const f = await event.request.formData();
		const type = f.get('type') === 'group' ? 'group' : 'category';
		await updateItem(db, type, String(f.get('id')), labelsFromForm(f), position(f));
		return { ok: 'Saved.' };
	},
	delete: async (event) => {
		const { db } = await guard(event);
		const f = await event.request.formData();
		await deleteItem(db, f.get('type') === 'group' ? 'group' : 'category', String(f.get('id')));
		return { ok: 'Deleted.' };
	},
	product: async (event) => {
		const { db, user } = await guard(event);
		const f = await event.request.formData();
		const sku = String(f.get('sku') ?? '').trim();
		if (!sku) return fail(400, { error: 'Missing SKU.' });
		const ids = await setProductCategories(db, sku, f.getAll('category').map(String), user?.email ?? null);
		return { ok: `Saved ${ids.length} categor${ids.length === 1 ? 'y' : 'ies'} for ${sku}.` };
	}
};
