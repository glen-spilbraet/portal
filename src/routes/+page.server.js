import { getMarketTotals, getCompanyTotals, getCompanyUniverse, getDimensionBreakdown, getMonthlyTotals, getAttentionData, scoreAttention, getActiveHides, getFilterOptions, getReps, getSyncMeta, MARKETS } from '$lib/salesStats.js';
import { getEffectiveEmail } from '$lib/server/effectiveEmail.js';
import { listSalesTargetsForYear } from '$lib/db.js';
import { effectiveParams, resolveRange, getPeriodOptions, yearWindows, isQuarterRange, addDaysStr } from '$lib/server/statsRange.js';

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
	const { yearOptions, quarterOptions, monthOptions } = getPeriodOptions(now);
	const { cur, prior, label, priorLabel, selected } = resolveRange(effectiveParams(url, cookies), now);
	const range = { start: cur.start, endInclusive: addDaysStr(cur.end, -1) };

	const emptyOptions = { levels: [], groups: [], countries: [] };
	if (!db) {
		return { widgets: [], companyWidgets: [], companies: [], dims: { countries: [], groups: [], levels: [], owners: [] }, monthly: { year: curYear, cur: Array(12).fill(0), prior: Array(12).fill(0) }, yearCols: ['—', '—', '—'], colNoData: [false, false, false], crossing: false, attention: [], snoozed: [], quarterOptions, monthOptions, yearOptions, selected, range, periodLabel: label, priorLabel, meta: null, isAdmin, filterOptions: emptyOptions, reps: [], activeFilters };
	}

	const todayStr = now.toISOString().slice(0, 10);
	// The breakdown tables compare three same-shaped windows: the selected range
	// (cur), and the same range one and two years earlier. Shifting by whole
	// years keeps a year-crossing range (e.g. Oct→Mar) apples-to-apples.
	const { windows: dimWindows, yearCols, colNoData, crossing } = yearWindows(cur, prior);
	const prior2 = dimWindows.y0;

	// Company-wide market totals react to the date range ONLY — never to the
	// filter bar or owner scoping. Used for the always-visible company figures
	// (and the quarterly target tracker, which tracks the whole company).
	const [curTotals, priorTotals, companyCur, companyPrior, y0Companies, y1Companies, y2Companies, universe, attentionRows, hides, meta, filterOptions, reps, dimCountries, dimGroups, dimLevels, dimOwners, monthlyCur, monthlyPrior] = await Promise.all([
		getMarketTotals(db, cur.start, cur.end, filters),
		getMarketTotals(db, prior.start, prior.end, filters),
		getMarketTotals(db, cur.start, cur.end, {}),
		getMarketTotals(db, prior.start, prior.end, {}),
		getCompanyTotals(db, prior2.start, prior2.end, filters),
		getCompanyTotals(db, prior.start, prior.end, filters),
		getCompanyTotals(db, cur.start, cur.end, filters),
		getCompanyUniverse(db, filters),
		getAttentionData(db, cur, prior, filters),
		getActiveHides(db, email, todayStr),
		getSyncMeta(db),
		getFilterOptions(db, isAdmin ? null : email),
		isAdmin ? getReps(db) : Promise.resolve([]),
		getDimensionBreakdown(db, dimWindows, 'country', filters),
		getDimensionBreakdown(db, dimWindows, 'customer_group', filters),
		getDimensionBreakdown(db, dimWindows, 'customer_level', filters),
		isAdmin ? getDimensionBreakdown(db, dimWindows, 'owner_email', filters) : Promise.resolve([]),
		getMonthlyTotals(db, curYear, filters),
		getMonthlyTotals(db, curYear - 1, filters),
	]);
	const dims = { countries: dimCountries, groups: dimGroups, levels: dimLevels, owners: dimOwners };
	const monthly = { year: curYear, cur: monthlyCur, prior: monthlyPrior };


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

	// Show every known company; overlay the three windows' revenue (0 when idle)
	// and the YoY index (newest vs one year earlier).
	const y0Map = new Map(y0Companies.map((r) => [r.cid, r.revenue]));
	const y1Map = new Map(y1Companies.map((r) => [r.cid, r.revenue]));
	const y2Map = new Map(y2Companies.map((r) => [r.cid, r.revenue]));
	const companies = universe
		.map((u) => {
			const rev0 = y0Map.get(u.cid) ?? 0;
			const rev1 = y1Map.get(u.cid) ?? 0;
			const rev2 = y2Map.get(u.cid) ?? 0;
			const index = rev1 > 0 ? Math.round((rev2 / rev1) * 100) : null;
			return { cid: u.cid, name: u.name, owner: u.owner_name, rev0, rev1, rev2, index };
		})
		.sort((a, b) => b.rev2 - a.rev2);

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

	// Company-wide widgets (date-only, unfiltered) — shown to non-admins under a
	// "Company Stats" heading so everyone sees whole-company market figures.
	const companyWidgets = [
		widget('total', 'Total revenue', companyCur.total, companyPrior.total),
		...MARKETS.map((m) => widget(m.toLowerCase(), m, companyCur.byMarket[m], companyPrior.byMarket[m])),
	];

	// Quarterly target tracker — company-wide, only for quarter views with prior-year data.
	let tracker = null;
	const curRev = companyCur.total.dkk;
	const priorRev = companyPrior.total.dkk;
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
		companyWidgets,
		companies,
		dims,
		monthly,
		yearCols,
		colNoData,
		crossing,
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
