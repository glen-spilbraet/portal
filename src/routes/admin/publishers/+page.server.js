import { error } from '@sveltejs/kit';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');

	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Database unavailable');

	const [registry, prefixRows, ovr, vol] = await Promise.all([
		db.prepare('SELECT name FROM publisher').all(),
		db.prepare('SELECT prefix, publisher FROM publisher_prefix').all(),
		db.prepare('SELECT publisher, COUNT(*) AS c FROM product_publisher_override GROUP BY publisher').all(),
		db.prepare(
			`SELECT sku_prefix AS prefix, COUNT(*) AS lines, ROUND(SUM(amount_dkk)) AS dkk
			 FROM deal_line_items WHERE sku_prefix IS NOT NULL AND sku_prefix != '' GROUP BY sku_prefix`
		).all(),
	]);

	const regRows = /** @type {any[]} */ (registry.results ?? []);
	const pfxRows = /** @type {any[]} */ (prefixRows.results ?? []);
	const ovrRows = /** @type {any[]} */ (ovr.results ?? []);
	const volRows = /** @type {any[]} */ (vol.results ?? []);

	/** @type {Record<string, {lines:number,dkk:number}>} */
	const volMap = {};
	for (const v of volRows) volMap[v.prefix] = { lines: v.lines || 0, dkk: v.dkk || 0 };
	/** @type {Record<string, number>} */
	const ocMap = {};
	for (const o of ovrRows) ocMap[o.publisher] = o.c || 0;

	// Prefixes grouped by the publisher they map to.
	/** @type {Record<string, {prefix:string,lines:number,dkk:number}[]>} */
	const byPub = {};
	const mappedPrefixes = new Set();
	for (const r of pfxRows) {
		mappedPrefixes.add(r.prefix);
		(byPub[r.publisher] ??= []).push({ prefix: r.prefix, ...(volMap[r.prefix] ?? { lines: 0, dkk: 0 }) });
	}

	// Every publisher: registry names ∪ any name referenced by a prefix mapping.
	/** @type {Set<string>} */
	const names = new Set([...regRows.map((r) => r.name), ...Object.keys(byPub)]);
	const publishers = [...names]
		.map((name) => {
			const prefixes = (byPub[name] ?? []).sort((a, b) => b.dkk - a.dkk);
			return { name, prefixes, mapped_count: ocMap[name] ?? 0, dkk: prefixes.reduce((s, p) => s + p.dkk, 0) };
		})
		.sort((a, b) => b.dkk - a.dkk || a.name.localeCompare(b.name));

	const unmapped = volRows
		.filter((v) => !mappedPrefixes.has(v.prefix))
		.map((v) => ({ prefix: v.prefix, lines: v.lines || 0, dkk: v.dkk || 0 }))
		.sort((a, b) => b.dkk - a.dkk);

	const allNames = [...names].sort((a, b) => a.localeCompare(b));

	return { publishers, unmapped, allNames };
}
