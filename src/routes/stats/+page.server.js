import { getMarketTotals, getSyncMeta, MARKETS } from '$lib/salesStats.js';
import { getEffectiveEmail } from '$lib/server/effectiveEmail.js';

/** YYYY-MM-DD for a Date (UTC). */
function ymd(d) {
	return d.toISOString().slice(0, 10);
}
/** Shift a YYYY-MM-DD string back by `n` whole years. */
function minusYears(dateStr, n) {
	const [y, m, d] = dateStr.split('-');
	return `${Number(y) - n}-${m}-${d}`;
}

/**
 * Resolve the selected period into a current window + the same window one year
 * earlier (for the YoY index). `end` is exclusive.
 */
function resolvePeriod(period, now) {
	const curYear = now.getUTCFullYear();
	const tomorrow = new Date(now);
	tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

	let cur, label;
	if (period === String(curYear - 1)) {
		cur = { start: `${curYear - 1}-01-01`, end: `${curYear}-01-01` };
		label = `${curYear - 1}`;
	} else if (period === String(curYear - 2)) {
		cur = { start: `${curYear - 2}-01-01`, end: `${curYear - 1}-01-01` };
		label = `${curYear - 2}`;
	} else {
		// default: year-to-date
		cur = { start: `${curYear}-01-01`, end: ymd(tomorrow) };
		label = `${curYear} YTD`;
	}
	const prior = { start: minusYears(cur.start, 1), end: minusYears(cur.end, 1) };
	return { cur, prior, label };
}

export async function load({ platform, url, cookies, parent }) {
	const db = platform?.env?.SALES_DB;
	const { user } = await parent();

	// Admins see every owner's deals; others only their own company-owner rows.
	const isAdmin = user?.role === 'admin';
	const email = await getEffectiveEmail(cookies, platform);
	const ownerFilter = isAdmin ? null : email;

	const now = new Date();
	const curYear = now.getUTCFullYear();
	const periods = [
		{ key: 'ytd', label: `${curYear} YTD` },
		{ key: String(curYear - 1), label: `${curYear - 1}` },
		{ key: String(curYear - 2), label: `${curYear - 2}` },
	];
	const selected = url.searchParams.get('period') ?? 'ytd';
	const { cur, prior, label } = resolvePeriod(selected, now);

	if (!db) {
		return { widgets: [], periods, selected, periodLabel: label, meta: null, isAdmin };
	}

	const [curTotals, priorTotals, meta] = await Promise.all([
		getMarketTotals(db, cur.start, cur.end, ownerFilter),
		getMarketTotals(db, prior.start, prior.end, ownerFilter),
		getSyncMeta(db),
	]);

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

	return {
		widgets,
		periods,
		selected,
		periodLabel: label,
		priorLabel: minusYears(cur.start, 1).slice(0, 4),
		meta,
		isAdmin,
	};
}
