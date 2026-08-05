import { error } from '@sveltejs/kit';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');

	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Database unavailable');

	const prefixRows = (await db
		.prepare(
			`SELECT sku_prefix AS prefix, COUNT(*) AS lines, ROUND(SUM(amount_dkk)) AS dkk
			 FROM deal_line_items WHERE sku_prefix IS NOT NULL AND sku_prefix != '' GROUP BY sku_prefix`
		)
		.all()).results ?? [];
	const mapRows = (await db.prepare('SELECT prefix, publisher FROM publisher_prefix').all()).results ?? [];
	const map = Object.fromEntries(mapRows.map((r) => [r.prefix, r.publisher]));

	const prefixes = prefixRows
		.map((r) => ({ prefix: r.prefix, lines: r.lines || 0, dkk: r.dkk || 0, publisher: map[r.prefix] ?? '' }))
		.sort((a, b) => b.dkk - a.dkk);
	const overrides = (await db.prepare('SELECT sku, publisher FROM product_publisher_override ORDER BY sku').all()).results ?? [];

	return { prefixes, overrides };
}
