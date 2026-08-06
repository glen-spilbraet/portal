import { error } from '@sveltejs/kit';
import { getPublisherMarketTotals, getPublisherMonthly, getPublisherCustomers, getPublisherProducts, MARKETS } from '$lib/salesStats.js';
import { effectiveParams, resolveRange, getPeriodOptions, yearWindows, addDaysStr } from '$lib/server/statsRange.js';

export async function load({ params, platform, url, cookies, parent }) {
	const { user } = await parent();
	if (!user?.permissions?.product) error(403, "You don't have access to this section.");

	const publisher = decodeURIComponent(params.publisher);
	const now = new Date();
	const curYear = now.getUTCFullYear();
	const { yearOptions, quarterOptions, monthOptions } = getPeriodOptions(now);
	const { cur, prior, label, selected } = resolveRange(effectiveParams(url, cookies), now);
	const range = { start: cur.start, endInclusive: addDaysStr(cur.end, -1) };
	const empty = { publisher, widgets: [], monthly: { year: curYear, cur: Array(12).fill(0), prior: Array(12).fill(0) }, customers: [], products: [], yearCols: ['—', '—', '—'], colNoData: [false, false, false], selected, range, periodLabel: label, yearOptions, quarterOptions, monthOptions };

	const db = platform?.env?.SALES_DB;
	if (!db) return empty;

	const { windows, yearCols, colNoData } = yearWindows(cur, prior);
	const [curM, priorM, monCur, monPrior, customers, products] = await Promise.all([
		getPublisherMarketTotals(db, cur.start, cur.end, publisher),
		getPublisherMarketTotals(db, prior.start, prior.end, publisher),
		getPublisherMonthly(db, curYear, publisher),
		getPublisherMonthly(db, curYear - 1, publisher),
		getPublisherCustomers(db, windows, publisher),
		getPublisherProducts(db, windows, publisher),
	]);

	const widget = (key, wLabel, cd, pd) => ({ key, label: wLabel, dkk: cd, index: pd > 0 ? Math.round((cd / pd) * 100) : null });
	const widgets = [
		widget('total', 'Total revenue', curM.total.dkk, priorM.total.dkk),
		...MARKETS.map((m) => widget(m.toLowerCase(), m, curM.byMarket[m].dkk, priorM.byMarket[m].dkk)),
	];

	return {
		publisher, widgets, monthly: { year: curYear, cur: monCur, prior: monPrior },
		customers, products, yearCols, colNoData, selected, range, periodLabel: label,
		yearOptions, quarterOptions, monthOptions,
	};
}
