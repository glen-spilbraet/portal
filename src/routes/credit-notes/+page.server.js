import { error } from '@sveltejs/kit';
import { getMarketTotals, getMonthlyTotals, getDimensionBreakdown, getCreditLineDimension, getSyncMeta, MARKETS } from '$lib/salesStats.js';
import { effectiveParams, resolveRange, getPeriodOptions, yearWindows, addDaysStr } from '$lib/server/statsRange.js';

/** Credit-note report: same shape as Sales Stats, scoped to credit notes (negative amounts). */
export async function load({ platform, url, cookies, parent }) {
	const { user } = await parent();
	if (!user?.permissions?.credit_notes) error(403, "You don't have access to this section.");

	const now = new Date();
	const curYear = now.getUTCFullYear();
	const { yearOptions, quarterOptions, monthOptions } = getPeriodOptions(now);
	const { cur, prior, label, selected } = resolveRange(effectiveParams(url, cookies), now);
	const range = { start: cur.start, endInclusive: addDaysStr(cur.end, -1) };
	const empty = { widgets: [], monthly: { year: curYear, cur: Array(12).fill(0), prior: Array(12).fill(0) }, dims: { customers: [], owners: [], countries: [], publishers: [], products: [] }, yearCols: ['—', '—', '—'], colNoData: [false, false, false], selected, range, periodLabel: label, yearOptions, quarterOptions, monthOptions };

	const db = platform?.env?.SALES_DB;
	if (!db) return empty;

	const F = { creditNotes: true };
	const { windows, yearCols, colNoData } = yearWindows(cur, prior);
	const [curTot, priorTot, monCur, monPrior, customers, owners, countries, publishers, products, syncMeta] = await Promise.all([
		getMarketTotals(db, cur.start, cur.end, F),
		getMarketTotals(db, prior.start, prior.end, F),
		getMonthlyTotals(db, curYear, F),
		getMonthlyTotals(db, curYear - 1, F),
		getDimensionBreakdown(db, windows, 'company_name', F),
		getDimensionBreakdown(db, windows, 'owner_email', F),
		getDimensionBreakdown(db, windows, 'country', F),
		getCreditLineDimension(db, windows, 'publisher'),
		getCreditLineDimension(db, windows, 'product'),
		getSyncMeta(db),
	]);

	// Index = this period / same period last year (both negative → positive ratio).
	const widget = (key, wLabel, cd, pd) => ({ key, label: wLabel, dkk: cd, index: pd !== 0 ? Math.round((cd / pd) * 100) : null });
	const widgets = [
		widget('total', 'Total credit', curTot.total.dkk, priorTot.total.dkk),
		...MARKETS.map((m) => widget(m.toLowerCase(), m, curTot.byMarket[m].dkk, priorTot.byMarket[m].dkk)),
	];

	return {
		widgets, monthly: { year: curYear, cur: monCur, prior: monPrior },
		dims: { customers, owners, countries, publishers, products },
		yearCols, colNoData, selected, range, periodLabel: label,
		yearOptions, quarterOptions, monthOptions, syncMeta,
	};
}
