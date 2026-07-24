import { getMarketTotals, getCompanyTotals, getSyncMeta, MARKETS } from '$lib/salesStats.js';
import { getEffectiveEmail } from '$lib/server/effectiveEmail.js';

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
	const ownerFilter = isAdmin ? null : email;

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

	if (!db) {
		return { widgets: [], companies: [], quarterOptions, monthOptions, yearOptions, selected, range, periodLabel: label, priorLabel, meta: null, isAdmin };
	}

	const [curTotals, priorTotals, curCompanies, priorCompanies, meta] = await Promise.all([
		getMarketTotals(db, cur.start, cur.end, ownerFilter),
		getMarketTotals(db, prior.start, prior.end, ownerFilter),
		getCompanyTotals(db, cur.start, cur.end, ownerFilter),
		getCompanyTotals(db, prior.start, prior.end, ownerFilter),
		getSyncMeta(db),
	]);

	// Per-company YoY: match current companies to their prior-year revenue.
	const priorByCompany = new Map(priorCompanies.map((r) => [r.cid, r.revenue]));
	const companies = curCompanies
		.map((r) => {
			const priorRev = priorByCompany.get(r.cid) ?? 0;
			const pct = priorRev > 0 ? (r.revenue / priorRev - 1) * 100 : null;
			return { cid: r.cid, name: r.name, owner: r.owner_name, revenue: r.revenue, deals: r.deals, pct };
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

	return {
		widgets,
		companies,
		quarterOptions,
		monthOptions,
		yearOptions,
		selected,
		range,
		periodLabel: label,
		priorLabel,
		meta,
		isAdmin,
	};
}
