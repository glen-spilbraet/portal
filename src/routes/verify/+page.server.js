import { error } from '@sveltejs/kit';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');

	const db = platform?.env?.SALES_DB;
	if (!db) return { meta: null, issues: [] };

	const meta = await db.prepare('SELECT * FROM verification_meta WHERE id = 1').first().catch(() => null);
	// Order: not_found first, then amount/date, largest amounts on top.
	const rows = await db
		.prepare(
			`SELECT * FROM verification_issues
			 ORDER BY CASE issue WHEN 'not_found' THEN 0 WHEN 'amount+date' THEN 1 WHEN 'amount' THEN 2 WHEN 'date' THEN 3 ELSE 4 END,
			          ABS(COALESCE(amount_raw, 0)) DESC`
		)
		.all()
		.catch(() => ({ results: [] }));
	return { meta, issues: rows.results ?? [] };
}
