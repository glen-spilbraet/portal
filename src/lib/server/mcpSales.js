/**
 * MCP sales/reporting tools — read-only access to the SALES_DB (the production
 * `portal-db` sales mirror), wrapping the same query layer the portal dashboards
 * use (`$lib/salesStats.js`, `$lib/forecastStats.js`) plus a guarded read-only
 * SQL tool for ad-hoc reports.
 *
 * Gating (see `src/routes/mcp/+server.js`): "all data" callers (admins + the
 * Stats all-data level) get everything incl. the free-form SQL tool; "own data"
 * callers get only the structured tools, self-scoped to their owner_email.
 * Everything here is SELECT-only; nothing writes.
 */
import { getMarketTotals, getSyncMeta, getFilterOptions, MARKETS } from '$lib/salesStats.js';
import { getCompletedAccuracy } from '$lib/forecastStats.js';

const MAX_ROWS = 2000;

/** Add days to a YYYY-MM-DD date, returning YYYY-MM-DD (UTC-safe). */
function addDays(ymd, n) {
	const d = new Date(`${ymd}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

function today() {
	return new Date().toISOString().slice(0, 10);
}

/**
 * A plain-language description of the sales schema so the caller can write
 * correct `sales_query` SQL. Kept in sync with migrations 0046+ and salesStats.js.
 */
export const SALES_SCHEMA_DOC = {
	database: 'SALES_DB — the production portal-db sales mirror (read-only via MCP).',
	notes: [
		'All revenue is `amount_dkk` (HubSpot amount_in_home_currency, in DKK).',
		'Deals are dated by `close_date` (YYYY-MM-DD). Use half-open ranges: close_date >= start AND close_date < endExclusive.',
		'`sales_deals` = invoiced/closed-won deals only (hs_is_closed_won + auto_imported). Open/uninvoiced orders are NOT here.',
		'`deal_line_items` has one row per SKU per deal; deal_kind is "closed" (invoiced) or "forecast".',
		'`forecast_deals` holds forecasts (isolated from sales_deals); their lines are deal_line_items where deal_kind="forecast".',
		'market is one of Denmark, Sweden, Norway, International.',
	],
	tables: {
		sales_deals: [
			'deal_id', 'close_date', 'amount_dkk', 'market', 'country',
			'company_id', 'company_name', 'owner_email', 'owner_name',
			'customer_level', 'customer_group', 'last_contacted',
		],
		deal_line_items: [
			'line_item_id', 'deal_id', 'deal_kind (closed|forecast)', 'company_id',
			'close_date', 'sku', 'name', 'publisher', 'amount_dkk', 'quantity',
			'quantity_log_start', 'quantity_log_create',
		],
		forecast_deals: [
			'deal_id', 'company_id', 'company_name', 'owner_email', 'owner_name',
			'forecast_start_date', 'forecast_end_date',
		],
	},
	glossary: [
		'Customer segments the user names in English (bookstores, toy shops/toy stores, niche, "the rest") map to `customer_group` or `customer_level` — the actual values are listed under `values` below and are often DANISH. Translate the user\'s term to the closest listed value (e.g. bookstore ≈ "Boghandler", toy shop ≈ "Legetøj/Legetøjsbutik"). If unsure which of the two columns holds the segment, check both `values.customer_group` and `values.customer_level`.',
		'"Most purchased" / "best-selling" by volume = SUM(quantity) from deal_line_items (deal_kind="closed"). By value = SUM(amount_dkk).',
		'"Year over year" (YoY) = run the SAME month/day window for each year and compare, e.g. Aug–Oct 2025 vs Aug–Oct 2026. Use close_date >= \'YYYY-08-01\' AND close_date < \'YYYY-11-01\' per year (a conditional SUM with CASE lets you get both years in one query).',
		'Per-product analysis needs deal_line_items (has sku/quantity/publisher). Per-deal/company revenue can use sales_deals. Segment columns (customer_group/level/country) live on sales_deals, so joining line items to sales_deals is needed to segment products.',
		'A month range like "August to October" is inclusive of October — use close_date < the FIRST day of the next month (e.g. < \'2026-11-01\').',
		'PERFORMANCE (enforced): every query on deal_line_items must filter deal_kind AND a close_date range (or a specific publisher / sku / company_id) so an index is used. Queries that would read all ~600k sales lines, or use correlated subqueries over them, are refused with a hint — put the whole period you need into the close_date range (e.g. for YoY: close_date >= the first year\'s start AND < the last year\'s end) and split it with CASE.',
	],
	examples: [
		"Best-selling SKUs by units in 2026: SELECT sku, MAX(name) name, SUM(quantity) units, SUM(amount_dkk) dkk FROM deal_line_items WHERE deal_kind='closed' AND close_date >= '2026-01-01' AND close_date < '2027-01-01' AND sku IS NOT NULL GROUP BY sku ORDER BY units DESC LIMIT 20",
		"Bookstores' top products Aug–Oct, YoY (2025 vs 2026): SELECT li.sku, MAX(li.name) name, SUM(CASE WHEN li.close_date>='2025-08-01' AND li.close_date<'2025-11-01' THEN li.quantity ELSE 0 END) units_2025, SUM(CASE WHEN li.close_date>='2026-08-01' AND li.close_date<'2026-11-01' THEN li.quantity ELSE 0 END) units_2026 FROM deal_line_items li JOIN sales_deals d ON d.deal_id=li.deal_id WHERE li.deal_kind='closed' AND li.close_date >= '2025-08-01' AND li.close_date < '2026-11-01' AND d.customer_group='Boghandler' GROUP BY li.sku ORDER BY units_2026 DESC LIMIT 25  -- replace 'Boghandler' with the real value from values.customer_group",
		"One publisher's customers: SELECT d.company_name, SUM(li.amount_dkk) dkk FROM deal_line_items li JOIN sales_deals d ON d.deal_id=li.deal_id WHERE li.deal_kind='closed' AND li.publisher='IELLO' GROUP BY d.company_id ORDER BY dkk DESC",
	],
};

/**
 * The schema doc plus the live distinct segment values (so the caller can map a
 * user's plain-language term like "bookstores" to the real, often-Danish value).
 */
export async function salesSchema(sdb) {
	let values = { customer_group: [], customer_level: [], country: [], market: MARKETS };
	try {
		const opts = await getFilterOptions(sdb, null); // { levels, groups, countries }
		values = {
			customer_group: opts.groups ?? [],
			customer_level: opts.levels ?? [],
			country: opts.countries ?? [],
			market: MARKETS,
		};
	} catch { /* fall back to empty lists */ }
	return { ...SALES_SCHEMA_DOC, values };
}

/** Big tables an ad-hoc query must reach through an index, never by a full walk. */
const BIG_TABLES = ['deal_line_items'];
const NARROW_HINT = 'Narrow it so an index can be used: always add deal_line_items.deal_kind = \'closed\' (or \'forecast\') TOGETHER WITH a close_date range (close_date >= \'YYYY-MM-DD\' AND close_date < \'YYYY-MM-DD\'), or with a specific publisher / sku / company_id. Avoid correlated subqueries over deal_line_items — use GROUP BY or a CTE instead.';

/**
 * Plan-based cost check for runSalesQuery. Returns an error message to show the
 * caller, or null when the plan is fine. Fails open if EXPLAIN itself errors
 * (the real query then reports the SQL error).
 */
async function checkPlan(db, sql) {
	let plan;
	try {
		plan = ((await db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all()).results ?? []).map((r) => String(r.detail ?? ''));
	} catch { return null; }
	// Names the big tables go by in this query: the table name and any alias.
	const names = new Set(BIG_TABLES);
	for (const t of BIG_TABLES) {
		for (const m of sql.matchAll(new RegExp(`\\b${t}\\s+(?:as\\s+)?([A-Za-z_][A-Za-z0-9_]*)`, 'gi'))) {
			const a = m[1].toLowerCase();
			if (!['where', 'join', 'left', 'inner', 'on', 'group', 'order', 'limit', 'cross', 'natural', 'using', 'union'].includes(a)) names.add(a);
		}
	}
	const isBig = (n) => names.has(String(n).toLowerCase());
	for (const line of plan) {
		// Full walk of a big table (plain or through a covering index).
		const scan = line.match(/^SCAN (\S+)/);
		if (scan && isBig(scan[1])) {
			return `Query refused: it would read every row of deal_line_items (~600k lines), which can overload the shared production database. ${NARROW_HINT}`;
		}
	}
	// Index used only for deal_kind → every closed line (~500k) is read. A single-
	// table aggregate over that is a few seconds (allowed); doing per-row work on
	// top of it — a join or a correlated subquery for each of those lines — is
	// what can run past D1's CPU limit, so that combination is refused.
	const kindOnly = plan.some((line) => {
		const m = line.match(/^SEARCH (\S+) USING (?:COVERING )?INDEX \S+ \((.*)\)$/);
		return m && isBig(m[1]) && /^deal_kind=\?$/.test(m[2].trim());
	});
	const tableLines = plan.filter((line) => /^(SEARCH|SCAN) (?!\(|subquery|CONSTANT)/.test(line) && !/^SCAN \(/.test(line));
	if (kindOnly && (tableLines.length > 1 || plan.some((l) => /CORRELATED/.test(l)))) {
		return `Query refused: it would join every closed sales line (~500k) to another table, which can overload the shared production database. ${NARROW_HINT}`;
	}
	return null;
}

/**
 * Guarded read-only SQL over SALES_DB. Accepts a single SELECT/WITH statement,
 * enforces a row cap, and rejects anything that could write or chain statements.
 * @returns {Promise<{columns:string[], rowCount:number, truncated:boolean, rows:object[]}|{error:string}>}
 */
export async function runSalesQuery(sdb, sqlRaw) {
	if (!sqlRaw || typeof sqlRaw !== 'string') return { error: 'Missing SQL string.' };
	let sql = sqlRaw.trim().replace(/;\s*$/, ''); // allow a single trailing semicolon

	if (/;/.test(sql)) return { error: 'Only a single statement is allowed (no ";").' };
	if (!/^(select|with)\b/i.test(sql)) return { error: 'Only SELECT / WITH queries are allowed.' };
	// Defensive keyword denylist (SELECT can\'t write in D1, but block obvious foot-guns).
	if (/\b(attach|detach|pragma|insert|update|delete|drop|alter|create|replace|vacuum|reindex)\b/i.test(sql)) {
		return { error: 'This query contains a disallowed keyword. Read-only SELECT queries only.' };
	}

	// Enforce a row cap. If the caller didn\'t add a LIMIT, wrap the query.
	const hasLimit = /\blimit\b\s+\d+/i.test(sql);
	const finalSql = hasLimit ? sql : `SELECT * FROM (${sql}) LIMIT ${MAX_ROWS + 1}`;

	// Read replica when D1 read replication is on (no-op otherwise): an ad-hoc
	// report then never competes with the portal on the primary database.
	let db = sdb;
	try { if (typeof sdb.withSession === 'function') db = sdb.withSession('first-unconstrained') ?? sdb; } catch { db = sdb; }

	// Cost guard: plan the query first (EXPLAIN QUERY PLAN reads no rows) and
	// refuse plans that walk all ~600k sales lines. D1 runs one query at a time
	// per database, and an unbounded ad-hoc query was able to push the shared
	// production database over its CPU limit (it gets reset → the whole portal
	// hangs). The message tells the caller how to narrow it.
	const verdict = await checkPlan(db, finalSql);
	if (verdict) return { error: verdict };

	let res;
	try {
		res = await db.prepare(finalSql).all();
	} catch (e) {
		return { error: `SQL error: ${e?.message ?? e}` };
	}
	let rows = res.results ?? [];
	let truncated = false;
	if (rows.length > MAX_ROWS) { rows = rows.slice(0, MAX_ROWS); truncated = true; }
	const columns = rows.length ? Object.keys(rows[0]) : [];
	return { columns, rowCount: rows.length, truncated, rows };
}

/** Revenue + deal count per market for an inclusive [from, to] date range. */
export async function salesMarketTotals(sdb, args) {
	const from = args?.from;
	const to = args?.to;
	if (!from || !to) return { error: 'Both `from` and `to` (YYYY-MM-DD) are required.' };
	const filters = {};
	if (args.owner) filters.ownerEmail = args.owner;
	if (args.level) filters.levels = [args.level];
	if (args.group) filters.groups = [args.group];
	if (args.country) filters.countries = [args.country];
	const endExcl = addDays(to, 1); // make `to` inclusive
	return getMarketTotals(sdb, from, endExcl, filters);
}

/**
 * Completed-forecast accuracy (units): forecasted vs actual units at SKU level,
 * rolled up by customer / owner / product. Returns the requested view.
 */
export async function forecastAccuracy(sdb, args) {
	const owner = args?.owner || null;
	const years = Array.isArray(args?.years) ? args.years.map(String) : [];
	const view = ['customers', 'owners', 'products'].includes(args?.view) ? args.view : 'customers';
	const limit = Math.min(Math.max(Number(args?.limit) || 50, 1), 200);

	const acc = await getCompletedAccuracy(sdb, today(), owner, years);
	const groups = (acc[view] ?? []).slice(0, limit).map((g) => ({
		key: g.key,
		label: g.label,
		...(g.sku ? { sku: g.sku } : {}),
		...(g.owner ? { owner: g.owner } : {}),
		forecastUnits: g.forecastUnits,
		actualUnits: g.actualUnits,
		attainmentPct: g.attainment == null ? null : Math.round(g.attainment * 100),
		bias: g.bias,
		childCount: g.childCount,
	}));
	return { view, count: groups.length, groups };
}

/** Data-freshness: when the sales mirror last synced and how many deals it holds. */
export async function salesSyncMeta(sdb) {
	const meta = await getSyncMeta(sdb);
	return meta ?? { note: 'No sync metadata found.' };
}
