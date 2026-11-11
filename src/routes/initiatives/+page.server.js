import { error } from '@sveltejs/kit';
import { listInitiatives } from '$lib/server/manualInitiatives.js';
import { DEFAULT_IMAGE_SQL } from '$lib/db.js';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (!user?.permissions?.initiatives) error(403, "You don't have access to this section.");
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const items = await listInitiatives(db);
	// Names + default images for the linked products.
	const skus = [...new Set(items.flatMap((i) => i.skus.map((s) => String(s).toLowerCase())))];
	/** @type {Record<string, {sku:string, name:string, image:string|null}>} */
	const products = {};
	for (let i = 0; i < skus.length; i += 90) {
		const part = skus.slice(i, i + 90);
		const rows = (await db.prepare(
			`SELECT lower(s.sku) AS k, s.sku, ${DEFAULT_IMAGE_SQL} AS img,
			        COALESCE((SELECT value FROM translations WHERE sheet_id = s.id AND key = 'product_name' AND language = s.primary_language AND trim(value) != ''),
			                 (SELECT value FROM translations WHERE sheet_id = s.id AND key = 'product_name' AND trim(value) != '' LIMIT 1)) AS name
			 FROM sales_sheets s WHERE lower(s.sku) IN (${part.map(() => '?').join(',')})`
		).bind(...part).all()).results ?? [];
		for (const r of /** @type {any[]} */ (rows)) products[r.k] = { sku: r.sku, name: r.name ?? r.sku, image: r.img ?? null };
	}
	return { user, items, products };
}
