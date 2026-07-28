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
 * Every known company (all-time), regardless of the selected date range, so
 * the Companies table can show customers with zero revenue in the window.
 * Honours the same filters (level/group/country/owner) but ignores dates.
 * @param {App.Platform['env']['SALES_DB']} db
 */
export async function getCompanyUniverse(db, filters = {}) {
	const where = [];
	const binds = [];
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
	const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
	const rows = await db
		.prepare(
			`SELECT COALESCE(company_id, 'none') AS cid,
			        COALESCE(company_name, '(No company)') AS name,
			        MAX(owner_name) AS owner_name
			 FROM sales_deals ${clause} GROUP BY cid`
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

/**
 * Per-company revenue + order counts for the selected window and the same
 * window last year, plus the all-time last order date. Filter-aware (no date
 * in the filter — the windows live in the CASE expressions). Only companies
 * with prior-year history are returned.
 * @param {App.Platform['env']['SALES_DB']} db
 */
export async function getAttentionData(db, cur, prior, filters = {}) {
	const where = [];
	const binds = [];
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
	const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
	const dateBinds = [cur.start, cur.end, cur.start, cur.end, prior.start, prior.end, prior.start, prior.end];
	const rows = await db
		.prepare(
			`SELECT COALESCE(company_id, 'none') AS cid,
			        COALESCE(company_name, '(No company)') AS name,
			        MAX(owner_name) AS owner,
			        SUM(CASE WHEN close_date >= ? AND close_date < ? THEN amount_dkk ELSE 0 END) AS cur_rev,
			        SUM(CASE WHEN close_date >= ? AND close_date < ? THEN 1 ELSE 0 END) AS cur_ord,
			        SUM(CASE WHEN close_date >= ? AND close_date < ? THEN amount_dkk ELSE 0 END) AS prior_rev,
			        SUM(CASE WHEN close_date >= ? AND close_date < ? THEN 1 ELSE 0 END) AS prior_ord,
			        MAX(close_date) AS last_order
			 FROM sales_deals ${clause}
			 GROUP BY cid HAVING prior_rev > 0`
		)
		.bind(...dateBinds, ...binds)
		.all();
	return rows.results ?? [];
}

/**
 * Score "customers needing attention" (0–100), money-led:
 *   amount behind 55 (vs the largest gap in the set) · recency 20 · fewer
 *   orders 15 · lower AOV 10. Amount behind dominates so big shortfalls always
 *   outrank small dead accounts. Candidates = companies behind on revenue this
 *   window. Recency uses the true last order date vs `todayStr`.
 */
export function scoreAttention(rows, todayStr) {
	const today = Date.parse(todayStr + 'T00:00:00Z');
	const cand = rows.filter((r) => r.prior_rev > 0 && r.prior_rev > r.cur_rev);
	const gapRef = Math.max(...cand.map((r) => r.prior_rev - r.cur_rev), 1);

	return cand
		.map((r) => {
			const krBehind = r.prior_rev - r.cur_rev;
			const daysSince = r.last_order
				? Math.floor((today - Date.parse(r.last_order + 'T00:00:00Z')) / 86400000)
				: null;
			const freqDrop = r.prior_ord > 0 ? Math.max(0, (r.prior_ord - r.cur_ord) / r.prior_ord) : 0;
			const aovCur = r.cur_ord > 0 ? r.cur_rev / r.cur_ord : 0;
			const aovPrior = r.prior_ord > 0 ? r.prior_rev / r.prior_ord : 0;
			const aovDrop = r.cur_ord > 0 && aovPrior > 0 ? Math.max(0, (aovPrior - aovCur) / aovPrior) : 0;

			const gapPts = Math.min(55, (55 * krBehind) / gapRef);
			const recPts = daysSince != null && daysSince > 15 ? Math.min(20, ((daysSince - 15) / 60) * 20) : 0;
			const ordPts = Math.min(15, freqDrop * 15);
			const aovPts = Math.min(10, aovDrop * 10);
			const score = Math.round(gapPts + recPts + ordPts + aovPts);

			return {
				cid: r.cid,
				name: r.name,
				owner: r.owner,
				krBehind,
				index: r.prior_rev > 0 ? Math.round((r.cur_rev / r.prior_rev) * 100) : null,
				yoyPct: r.prior_rev > 0 ? Math.round((r.cur_rev / r.prior_rev - 1) * 100) : null,
				daysSince,
				freqDropPct: Math.round(freqDrop * 100),
				aovDropPct: Math.round(aovDrop * 100),
				score,
			};
		})
		.sort((a, b) => b.score - a.score);
}

// ── Attention snooze / dismiss ──────────────────────────────────────────────

/** Active hides visible to `userEmail`: global dismisses + that user's own. */
export async function getActiveHides(db, userEmail, todayStr) {
	const rows = await db
		.prepare(
			`SELECT company_id, scope, until_date FROM attention_hides
			 WHERE (until_date IS NULL OR until_date > ?)
			   AND (scope = 'global' OR (scope = 'user' AND user_email = ?))`
		)
		.bind(todayStr, userEmail)
		.all();
	return rows.results ?? [];
}

/** Upsert a hide (snooze = untilDate set; dismiss = untilDate null). */
export async function addHide(db, { scope, userEmail, createdBy, companyId, untilDate }) {
	await db
		.prepare(
			`INSERT INTO attention_hides (id, scope, user_email, created_by, company_id, until_date)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT(scope, user_email, company_id)
			 DO UPDATE SET until_date = excluded.until_date, created_by = excluded.created_by, created_at = unixepoch()`
		)
		.bind(crypto.randomUUID(), scope, userEmail, createdBy ?? null, companyId, untilDate ?? null)
		.run();
}

/** Remove the viewing user's own hide for a company; admins also clear global. */
export async function removeHide(db, { companyId, userEmail, isAdmin }) {
	await db
		.prepare(`DELETE FROM attention_hides WHERE company_id = ? AND scope = 'user' AND user_email = ?`)
		.bind(companyId, userEmail)
		.run();
	if (isAdmin) {
		await db.prepare(`DELETE FROM attention_hides WHERE company_id = ? AND scope = 'global'`).bind(companyId).run();
	}
}

/** Latest sync metadata (for a "data as of …" line). */
export async function getSyncMeta(db) {
	return db.prepare('SELECT last_run, status, deal_count FROM sales_sync_meta WHERE id = 1').first();
}

export { MARKETS };
