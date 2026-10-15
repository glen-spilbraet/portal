import { error } from '@sveltejs/kit';
import { getPublisherMarketTotals, getPublisherMonthly, getPublisherCustomers, getPublisherProducts, getSeriesBreakdown, MARKETS } from '$lib/salesStats.js';
import { listSeries } from '$lib/server/series.js';
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
	const empty = { publisher, widgets: [], monthly: { year: curYear, cur: Array(12).fill(0), prior: Array(12).fill(0) }, customers: [], products: [], series: [], yearCols: ['—', '—', '—'], colNoData: [false, false, false], selected, range, periodLabel: label, yearOptions, quarterOptions, monthOptions };

	const pub = url.searchParams.get('pub') === 'mapped' ? 'mapped' : 'sku';

	const db = platform?.env?.SALES_DB;
	if (!db) return { ...empty, pub };

	const { windows, yearCols, colNoData } = yearWindows(cur, prior);
	const [curM, priorM, monCur, monPrior, customers, products] = await Promise.all([
		getPublisherMarketTotals(db, cur.start, cur.end, publisher, pub),
		getPublisherMarketTotals(db, prior.start, prior.end, publisher, pub),
		getPublisherMonthly(db, curYear, publisher, pub),
		getPublisherMonthly(db, curYear - 1, publisher, pub),
		getPublisherCustomers(db, windows, publisher, pub),
		getPublisherProducts(db, windows, publisher, pub),
	]);

	const widget = (key, wLabel, cd, pd) => ({ key, label: wLabel, dkk: cd, index: pd > 0 ? Math.round((cd / pd) * 100) : null });
	const widgets = [
		widget('total', 'Total revenue', curM.total.dkk, priorM.total.dkk),
		...MARKETS.map((m) => widget(m.toLowerCase(), m, curM.byMarket[m].dkk, priorM.byMarket[m].dkk)),
	];

	// Series breakdown (mapped view only) — shown when this publisher has series.
	let series = [];
	if (pub === 'mapped' && (await listSeries(db, publisher)).length) {
		series = await getSeriesBreakdown(db, windows, publisher);
	}

	return {
		publisher, pub, widgets, monthly: { year: curYear, cur: monCur, prior: monPrior },
		customers, products, series, yearCols, colNoData, selected, range, periodLabel: label,
		yearOptions, quarterOptions, monthOptions,
	};
}
