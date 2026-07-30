import { getMarketTotals, getCompanyTotals, getCompanyUniverse, getDimensionBreakdown, getAttentionData, scoreAttention, getActiveHides, getFilterOptions, getReps, getSyncMeta, MARKETS } from '$lib/salesStats.js';
import { getEffectiveEmail } from '$lib/server/effectiveEmail.js';
import { listSalesTargetsForYear } from '$lib/db.js';

/**
 * True when [startStr, endExcl) is a whole calendar quarter, or the current
 * quarter up to today. Works for both quick-select and custom date ranges, so
 * the target tracker shows whenever the range really is a quarter.
 */
function isQuarterRange(startStr, endExcl, now) {
	const [sy, sm, sd] = startStr.split('-').map(Number);
	if (sd !== 1 || ![1, 4, 7, 10].includes(sm)) return false; // must start on a quarter boundary

	// Complete quarter: ends exactly on the next quarter's first day.
	const nextQuarter = new Date(Date.UTC(sy, sm - 1 + 3, 1)).toISOString().slice(0, 10);
	if (endExcl === nextQuarter) return true;

	// Current quarter to date: starts this quarter and ends tomorrow.
	const y = now.getUTCFullYear();
	const q = Math.floor(now.getUTCMonth() / 3);
	const curQuarterStart = new Date(Date.UTC(y, q * 3, 1)).toISOString().slice(0, 10);
	const tomorrow = new Date(Date.UTC(y, now.getUTCMonth(), now.getUTCDate()) + 86400000)
		.toISOString()
		.slice(0, 10);
	return startStr === curQuarterStart && endExcl === tomorrow;
}

const MONTHS = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December',
];

/** YYYY-MM-DD (UTC) from an epoch-ms value. */
function ymdMs(ms) {
	return new Date(ms).toISOString().slice(0, 10);
}
/** Shift a YYYY-MM-DD string back by `n` whole years. */
function minusYears(dateStr, n) {
	const [y, m, d] = dateStr.split('-');
	return `${Number(y) - n}-${m}-${d}`;
}
/** Shift a YYYY-MM-DD string by `n` days. */
function addDaysStr(dateStr, n) {
	const d = new Date(dateStr + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}
/** Human label for a period given its (current or prior) start date. */
function labelFor(selected, startStr, isPrior) {
	const [y, m] = startStr.split('-').map(Number);
	const q = Math.floor((m - 1) / 3) + 1;
	if (selected === 'month' || selected === 'last-month') return `${MONTHS[m - 1]} ${y}`;
	if (selected === 'qtd') return `Q${q} ${y}${isPrior ? '' : ' to date'}`;
	return `Q${q} ${y}`; // quarter / last-quarter
}

/**
 * Resolve the requested range (quick period OR custom from/to) into a current
 * window plus the same window one year earlier (for the YoY index). `end` is
 * exclusive. Default period is This Quarter to date.
 */
function resolveRange(url, now) {
	const year = now.getUTCFullYear();
	const month = now.getUTCMonth();
	const q = Math.floor(month / 3);
	const tomorrow = ymdMs(Date.UTC(year, month, now.getUTCDate()) + 86400000);

	const from = url.searchParams.get('from');
	const to = url.searchParams.get('to');

	let cur, label, priorLabel, selected;
	if (from && to) {
		selected = 'custom';
		cur = { start: from, end: addDaysStr(to, 1) };
		const prior = { start: minusYears(cur.start, 1), end: minusYears(cur.end, 1) };
		label = `${from} – ${to}`;
		priorLabel = `${prior.start} – ${addDaysStr(prior.end, -1)}`;
		return { cur, prior, label, priorLabel, selected };
	}

	selected = url.searchParams.get('period') ?? 'qtd';

	// Year-based options (dropdown): This Year to date / This Year / a full year.
	if (selected === 'ytd' || selected === 'this-year' || /^\d{4}$/.test(selected)) {
		const toDate = selected === 'ytd';
		const y = selected === 'ytd' || selected === 'this-year' ? year : Number(selected);
		cur = { start: `${y}-01-01`, end: toDate ? tomorrow : `${y + 1}-01-01` };
		const prior = { start: `${y - 1}-01-01`, end: toDate ? minusYears(tomorrow, 1) : `${y}-01-01` };
		return {
			cur,
			prior,
			label: toDate ? `${y} to date` : `${y}`,
			priorLabel: toDate ? `${y - 1} to date` : `${y - 1}`,
			selected,
		};
	}

	switch (selected) {
		case 'quarter':
			cur = { start: ymdMs(Date.UTC(year, q * 3, 1)), end: ymdMs(Date.UTC(year, q * 3 + 3, 1)) };
			break;
		case 'last-quarter':
			cur = { start: ymdMs(Date.UTC(year, (q - 1) * 3, 1)), end: ymdMs(Date.UTC(year, q * 3, 1)) };
			break;
		case 'month':
			cur = { start: ymdMs(Date.UTC(year, month, 1)), end: ymdMs(Date.UTC(year, month + 1, 1)) };
			break;
		case 'last-month':
			cur = { start: ymdMs(Date.UTC(year, month - 1, 1)), end: ymdMs(Date.UTC(year, month, 1)) };
			break;
		case 'qtd':
		default:
			selected = 'qtd';
			cur = { start: ymdMs(Date.UTC(year, q * 3, 1)), end: tomorrow };
			break;
	}
	const prior = { start: minusYears(cur.start, 1), end: minusYears(cur.end, 1) };
	return {
		cur,
		prior,
		label: labelFor(selected, cur.start, false),
		priorLabel: labelFor(selected, prior.start, true),
		selected,
	};
}

export async function load({ platform, url, cookies, parent }) {
	const db = platform?.env?.SALES_DB;
	const { user } = await parent();

	// Admins see every owner's deals; others only their own company-owner rows.
	const isAdmin = user?.role === 'admin';
	const email = await getEffectiveEmail(cookies, platform);

	// Filter bar. Sales-rep filter is admin-only (reps are already scoped to self).
	const csv = (name) =>
		(url.searchParams.get(name) ?? '').split(',').map((s) => s.trim()).filter(Boolean);
	const repParam = isAdmin ? url.searchParams.get('rep') || null : null;
	const activeFilters = {
		levels: csv('level'),
		groups: csv('group'),
		countries: csv('country'),
		rep: repParam,
	};
	const filters = {
		ownerEmail: isAdmin ? repParam : email,
		levels: activeFilters.levels,
		groups: activeFilters.groups,
		countries: activeFilters.countries,
	};

	const now = new Date();
	const curYear = now.getUTCFullYear();
	const yearOptions = [
		{ key: 'ytd', label: 'This Year to date' },
		{ key: 'this-year', label: 'This Year' },
		{ key: String(curYear - 1), label: String(curYear - 1) },
		{ key: String(curYear - 2), label: String(curYear - 2) },
	];
	const quarterOptions = [
		{ key: 'qtd', label: 'This Quarter to date' },
		{ key: 'quarter', label: 'This Quarter' },
		{ key: 'last-quarter', label: 'Last Quarter' },
	];
	const monthOptions = [
		{ key: 'month', label: 'This Month' },
		{ key: 'last-month', label: 'Last Month' },
	];
	const { cur, prior, label, priorLabel, selected } = resolveRange(url, now);
	const range = { start: cur.start, endInclusive: addDaysStr(cur.end, -1) };

	const emptyOptions = { levels: [], groups: [], countries: [] };
	if (!db) {
		return { widgets: [], companies: [], dims: { countries: [], groups: [], levels: [], owners: [] }, attention: [], snoozed: [], quarterOptions, monthOptions, yearOptions, selected, range, periodLabel: label, priorLabel, meta: null, isAdmin, filterOptions: emptyOptions, reps: [], activeFilters };
	}

	const todayStr = now.toISOString().slice(0, 10);
	const [curTotals, priorTotals, curCompanies, priorCompanies, universe, attentionRows, hides, meta, filterOptions, reps, dimCountries, dimGroups, dimLevels, dimOwners] = await Promise.all([
		getMarketTotals(db, cur.start, cur.end, filters),
		getMarketTotals(db, prior.start, prior.end, filters),
		getCompanyTotals(db, cur.start, cur.end, filters),
		getCompanyTotals(db, prior.start, prior.end, filters),
		getCompanyUniverse(db, filters),
		getAttentionData(db, cur, prior, filters),
		getActiveHides(db, email, todayStr),
		getSyncMeta(db),
		getFilterOptions(db, isAdmin ? null : email),
		isAdmin ? getReps(db) : Promise.resolve([]),
		getDimensionBreakdown(db, cur, prior, 'country', filters),
		getDimensionBreakdown(db, cur, prior, 'customer_group', filters),
		getDimensionBreakdown(db, cur, prior, 'customer_level', filters),
		isAdmin ? getDimensionBreakdown(db, cur, prior, 'owner_email', filters) : Promise.resolve([]),
	]);
	const dims = { countries: dimCountries, groups: dimGroups, levels: dimLevels, owners: dimOwners };

	// Split hidden (snoozed/dismissed) out before scoring so they don't skew the
	// gap scale; keep them for the "Show snoozed" list.
	const hideMap = new Map(hides.map((h) => [h.company_id, h]));
	const visibleRows = attentionRows.filter((r) => !hideMap.has(r.cid));
	const attention = scoreAttention(visibleRows, todayStr);
	const snoozed = attentionRows
		.filter((r) => hideMap.has(r.cid))
		.map((r) => {
			const h = hideMap.get(r.cid);
			return { cid: r.cid, name: r.name, owner: r.owner, krBehind: r.prior_rev - r.cur_rev, until: h.until_date, scope: h.scope };
		})
		.sort((a, b) => b.krBehind - a.krBehind);

	// Show every known company; overlay this period's revenue + YoY (0 when idle).
	const curByCompany = new Map(curCompanies.map((r) => [r.cid, r]));
	const priorByCompany = new Map(priorCompanies.map((r) => [r.cid, r.revenue]));
	const companies = universe
		.map((u) => {
			const cur = curByCompany.get(u.cid);
			const revenue = cur?.revenue ?? 0;
			const priorRev = priorByCompany.get(u.cid) ?? 0;
			const pct = priorRev > 0 ? (revenue / priorRev - 1) * 100 : null;
			return { cid: u.cid, name: u.name, owner: u.owner_name, revenue, deals: cur?.deals ?? 0, pct };
		})
		.sort((a, b) => b.revenue - a.revenue);

	/** Build one widget: current dkk/deals + YoY index vs prior-year same window. */
	function widget(key, wLabel, curVal, priorVal) {
		const dkk = curVal.dkk;
		const priorDkk = priorVal.dkk;
		const index = priorDkk > 0 ? Math.round((dkk / priorDkk) * 100) : null;
		const pct = priorDkk > 0 ? (dkk / priorDkk - 1) * 100 : null;
		return { key, label: wLabel, dkk, deals: curVal.deals, priorDkk, index, pct };
	}

	const widgets = [
		widget('total', 'Total revenue', curTotals.total, priorTotals.total),
		...MARKETS.map((m) => widget(m.toLowerCase(), m, curTotals.byMarket[m], priorTotals.byMarket[m])),
	];

	// Quarterly target tracker — only for quarter views with prior-year data.
	let tracker = null;
	const curRev = curTotals.total.dkk;
	const priorRev = priorTotals.total.dkk;
	if (isQuarterRange(cur.start, cur.end, now) && priorRev > 0) {
		const targetYear = Number(cur.start.slice(0, 4));
		const rows = await listSalesTargetsForYear(db, targetYear);
		if (rows.length) {
			const index = (curRev / priorRev) * 100;
			const targets = rows.map((t) => {
				const needed = (t.index_value / 100) * priorRev;
				return {
					name: t.name,
					index: t.index_value,
					reached: curRev >= needed,
					gap: Math.max(0, needed - curRev),
				};
			});
			const nextIdx = targets.findIndex((t) => !t.reached);
			targets.forEach((t, i) => (t.next = i === nextIdx));
			tracker = {
				year: targetYear,
				index: Math.round(index * 10) / 10,
				allReached: nextIdx === -1,
				targets,
			};
		}
	}

	return {
		widgets,
		companies,
		dims,
		attention,
		snoozed,
		tracker,
		quarterOptions,
		monthOptions,
		yearOptions,
		selected,
		range,
		periodLabel: label,
		priorLabel,
		meta,
		isAdmin,
		filterOptions,
		reps,
		activeFilters,
		ranges: {
			curStart: cur.start,
			curEnd: cur.end,
			priorStart: prior.start,
			priorEnd: prior.end,
			year: Number(cur.start.slice(0, 4)),
		},
	};
}
