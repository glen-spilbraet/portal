/**
 * Sales Stats queries against the SALES_DB (sales_deals mirror).
 *
 * All amounts are `amount_dkk` (HubSpot's amount_in_home_currency, in DKK).
 * Deals are organised by `close_date` (YYYY-MM-DD).
 */

const MARKETS = ['Denmark', 'Sweden', 'Norway', 'International'];

/**
 * Build the shared WHERE clause for a date window + optional filters.
 * filters: { ownerEmail?, levels?[], groups?[], countries?[] }
 */
function buildWhere(startIncl, endExcl, filters = {}) {
	const where = ['close_date >= ?', 'close_date < ?'];
	const binds = [startIncl, endExcl];
	if (filters.ownerEmail) {
		where.push('owner_email = ?');
		binds.push(filters.ownerEmail);
	}
	for (const [col, key] of [
		['customer_level', 'levels'],
		['customer_group', 'groups'],
		['country', 'countries'],
	]) {
		const vals = filters[key];
		if (vals && vals.length) {
			where.push(`${col} IN (${vals.map(() => '?').join(',')})`);
			binds.push(...vals);
		}
	}
	return { clause: where.join(' AND '), binds };
}

/**
 * Revenue + deal count per market for a half-open window [startIncl, endExcl).
 * @param {App.Platform['env']['SALES_DB']} db
 */
export async function getMarketTotals(db, startIncl, endExcl, filters = {}) {
	const { clause, binds } = buildWhere(startIncl, endExcl, filters);
	const rows = await db
		.prepare(
			`SELECT market, COUNT(*) AS deals, COALESCE(SUM(amount_dkk), 0) AS dkk
			 FROM sales_deals WHERE ${clause} GROUP BY market`
		)
		.bind(...binds)
		.all();

	const byMarket = {};
	for (const m of MARKETS) byMarket[m] = { dkk: 0, deals: 0 };
	let total = { dkk: 0, deals: 0 };
	for (const r of rows.results ?? []) {
		const m = MARKETS.includes(r.market) ? r.market : 'International';
		byMarket[m].dkk += r.dkk;
		byMarket[m].deals += r.deals;
		total.dkk += r.dkk;
		total.deals += r.deals;
	}
	return { total, byMarket };
}

/**
 * Revenue per company for a half-open window [startIncl, endExcl).
 * @param {App.Platform['env']['SALES_DB']} db
 */
export async function getCompanyTotals(db, startIncl, endExcl, filters = {}) {
	const { clause, binds } = buildWhere(startIncl, endExcl, filters);
	const rows = await db
		.prepare(
			`SELECT COALESCE(company_id, 'none') AS cid,
			        COALESCE(company_name, '(No company)') AS name,
			        MAX(owner_name) AS owner_name,
			        COALESCE(SUM(amount_dkk), 0) AS revenue,
			        COUNT(*) AS deals
			 FROM sales_deals WHERE ${clause} GROUP BY cid`
		)
		.bind(...binds)
		.all();
	return rows.results ?? [];
}

/**
 * Distinct values for the filter bar (Customer Level / Group / Country).
 * Scoped to an owner when provided (so reps only see their own domain).
 */
export async function getFilterOptions(db, ownerEmail = null) {
	async function distinct(col) {
		const where = [`${col} IS NOT NULL`, `${col} != ''`];
		const binds = [];
		if (ownerEmail) {
			where.push('owner_email = ?');
			binds.push(ownerEmail);
		}
		const rows = await db
			.prepare(`SELECT DISTINCT ${col} AS v FROM sales_deals WHERE ${where.join(' AND ')} ORDER BY ${col}`)
			.bind(...binds)
			.all();
		return (rows.results ?? []).map((r) => r.v);
	}
	const [levels, groups, countries] = await Promise.all([
		distinct('customer_level'),
		distinct('customer_group'),
		distinct('country'),
	]);
	return { levels, groups, countries };
}

/** Distinct sales reps (company owners) for the admin rep filter. */
export async function getReps(db) {
	const rows = await db
		.prepare(
			`SELECT owner_email AS email, MAX(owner_name) AS name
			 FROM sales_deals
			 WHERE owner_email IS NOT NULL AND owner_email != ''
			 GROUP BY owner_email ORDER BY name`
		)
		.all();
	return rows.results ?? [];
}

/** Latest sync metadata (for a "data as of …" line). */
export async function getSyncMeta(db) {
	return db.prepare('SELECT last_run, status, deal_count FROM sales_sync_meta WHERE id = 1').first();
}

export { MARKETS };
