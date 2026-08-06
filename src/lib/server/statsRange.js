// Shared date-range logic for the Stats and Product views, so both use the
// exact same period picker + resolution, and the selection mirrors between them
// via a `statsRange` cookie.

const MONTHS = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December',
];

/** YYYY-MM-DD (UTC) from an epoch-ms value. */
export function ymdMs(ms) {
	return new Date(ms).toISOString().slice(0, 10);
}
/** Shift a YYYY-MM-DD string back by `n` whole years. */
export function minusYears(dateStr, n) {
	const [y, m, d] = dateStr.split('-');
	return `${Number(y) - n}-${m}-${d}`;
}
/** Shift a YYYY-MM-DD string by `n` days. */
export function addDaysStr(dateStr, n) {
	const d = new Date(dateStr + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}
function labelFor(selected, startStr, isPrior) {
	const [y, m] = startStr.split('-').map(Number);
	const q = Math.floor((m - 1) / 3) + 1;
	if (selected === 'month' || selected === 'last-month') return `${MONTHS[m - 1]} ${y}`;
	if (selected === 'qtd') return `Q${q} ${y}${isPrior ? '' : ' to date'}`;
	return `Q${q} ${y}`;
}

/**
 * True when [startStr, endExcl) is a whole calendar quarter (or the current
 * quarter to date). Used by the quarterly target tracker.
 */
export function isQuarterRange(startStr, endExcl, now) {
	const [sy, sm, sd] = startStr.split('-').map(Number);
	if (sd !== 1 || ![1, 4, 7, 10].includes(sm)) return false;
	const nextQuarter = new Date(Date.UTC(sy, sm - 1 + 3, 1)).toISOString().slice(0, 10);
	if (endExcl === nextQuarter) return true;
	const y = now.getUTCFullYear();
	const q = Math.floor(now.getUTCMonth() / 3);
	const curQuarterStart = new Date(Date.UTC(y, q * 3, 1)).toISOString().slice(0, 10);
	const tomorrow = new Date(Date.UTC(y, now.getUTCMonth(), now.getUTCDate()) + 86400000).toISOString().slice(0, 10);
	return startStr === curQuarterStart && endExcl === tomorrow;
}

/** Period dropdown options (Year / Quarter / Month groups). */
export function getPeriodOptions(now) {
	const curYear = now.getUTCFullYear();
	return {
		yearOptions: [
			{ key: 'ytd', label: 'This Year to date' },
			{ key: 'this-year', label: 'This Year' },
			{ key: String(curYear - 1), label: String(curYear - 1) },
			{ key: String(curYear - 2), label: String(curYear - 2) },
		],
		quarterOptions: [
			{ key: 'qtd', label: 'This Quarter to date' },
			{ key: 'quarter', label: 'This Quarter' },
			{ key: 'last-quarter', label: 'Last Quarter' },
		],
		monthOptions: [
			{ key: 'month', label: 'This Month' },
			{ key: 'last-month', label: 'Last Month' },
		],
	};
}

/**
 * Effective date params: the URL's period/from/to if present, else the mirrored
 * `statsRange` cookie (so switching between Stats and Product keeps the date),
 * else empty (→ default qtd).
 */
export function effectiveParams(url, cookies) {
	const sp = url.searchParams;
	if (sp.get('period') || (sp.get('from') && sp.get('to'))) return sp;
	const saved = cookies?.get?.('statsRange');
	return saved ? new URLSearchParams(saved) : sp;
}

/**
 * Resolve params (URLSearchParams) into the current window + same window one
 * year earlier. `end` is exclusive. Default period is This Quarter to date.
 */
export function resolveRange(params, now) {
	const year = now.getUTCFullYear();
	const month = now.getUTCMonth();
	const q = Math.floor(month / 3);
	const tomorrow = ymdMs(Date.UTC(year, month, now.getUTCDate()) + 86400000);

	const from = params.get('from');
	const to = params.get('to');

	let cur, label, priorLabel, selected;
	if (from && to) {
		selected = 'custom';
		cur = { start: from, end: addDaysStr(to, 1) };
		const prior = { start: minusYears(cur.start, 1), end: minusYears(cur.end, 1) };
		return { cur, prior, label: `${from} – ${to}`, priorLabel: `${prior.start} – ${addDaysStr(prior.end, -1)}`, selected };
	}

	selected = params.get('period') ?? 'qtd';

	if (selected === 'ytd' || selected === 'this-year' || /^\d{4}$/.test(selected)) {
		const toDate = selected === 'ytd';
		const y = selected === 'ytd' || selected === 'this-year' ? year : Number(selected);
		cur = { start: `${y}-01-01`, end: toDate ? tomorrow : `${y + 1}-01-01` };
		const prior = { start: `${y - 1}-01-01`, end: toDate ? minusYears(tomorrow, 1) : `${y}-01-01` };
		return { cur, prior, label: toDate ? `${y} to date` : `${y}`, priorLabel: toDate ? `${y - 1} to date` : `${y - 1}`, selected };
	}

	switch (selected) {
		case 'quarter': cur = { start: ymdMs(Date.UTC(year, q * 3, 1)), end: ymdMs(Date.UTC(year, q * 3 + 3, 1)) }; break;
		case 'last-quarter': cur = { start: ymdMs(Date.UTC(year, (q - 1) * 3, 1)), end: ymdMs(Date.UTC(year, q * 3, 1)) }; break;
		case 'month': cur = { start: ymdMs(Date.UTC(year, month, 1)), end: ymdMs(Date.UTC(year, month + 1, 1)) }; break;
		case 'last-month': cur = { start: ymdMs(Date.UTC(year, month - 1, 1)), end: ymdMs(Date.UTC(year, month, 1)) }; break;
		case 'qtd': default: selected = 'qtd'; cur = { start: ymdMs(Date.UTC(year, q * 3, 1)), end: tomorrow }; break;
	}
	const prior = { start: minusYears(cur.start, 1), end: minusYears(cur.end, 1) };
	return { cur, prior, label: labelFor(selected, cur.start, false), priorLabel: labelFor(selected, prior.start, true), selected };
}

/**
 * The three-year breakdown windows (oldest→newest) + their column labels.
 * A window inside one calendar year → "2025"; a crossing window → "2025–26".
 */
export function yearWindows(cur, prior) {
	const prior2 = { start: minusYears(cur.start, 2), end: minusYears(cur.end, 2) };
	const DATA_START = '2024-01-01';
	const label = (w) => {
		const sy = w.start.slice(0, 4);
		const ey = addDaysStr(w.end, -1).slice(0, 4);
		return sy === ey ? sy : `${sy}–${ey.slice(2)}`;
	};
	return {
		windows: { y0: prior2, y1: prior, y2: cur },
		yearCols: [label(prior2), label(prior), label(cur)],
		colNoData: [prior2, prior, cur].map((w) => w.end <= DATA_START),
		crossing: cur.start.slice(0, 4) !== addDaysStr(cur.end, -1).slice(0, 4),
	};
}
