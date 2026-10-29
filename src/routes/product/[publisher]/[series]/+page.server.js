import { error } from '@sveltejs/kit';
import { getSeriesMarketTotals, getSeriesMonthly, getSeriesCustomers, getSeriesProducts, getSyncMeta, MARKETS } from '$lib/salesStats.js';
import { getSeries } from '$lib/server/series.js';
import { effectiveParams, resolveRange, getPeriodOptions, yearWindows, addDaysStr } from '$lib/server/statsRange.js';

export async function load({ params, platform, url, cookies, parent }) {
	const { user } = await parent();
	if (!user?.permissions?.product) error(403, "You don't have access to this section.");

	const publisher = decodeURIComponent(params.publisher);
	const seriesId = params.series;
	const pub = url.searchParams.get('pub') === 'mapped' ? 'mapped' : 'sku';
	const now = new Date();
	const curYear = now.getUTCFullYear();
	const { yearOptions, quarterOptions, monthOptions } = getPeriodOptions(now);
	const { cur, prior, label, selected } = resolveRange(effectiveParams(url, cookies), now);
	const range = { start: cur.start, endInclusive: addDaysStr(cur.end, -1) };

	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Database unavailable');
	const series = await getSeries(db, seriesId);
	if (!series) error(404, 'Series not found');

	const { windows, yearCols, colNoData } = yearWindows(cur, prior);
	const [curM, priorM, monCur, monPrior, customers, products, syncMeta] = await Promise.all([
		getSeriesMarketTotals(db, cur.start, cur.end, seriesId),
		getSeriesMarketTotals(db, prior.start, prior.end, seriesId),
		getSeriesMonthly(db, curYear, seriesId),
		getSeriesMonthly(db, curYear - 1, seriesId),
		getSeriesCustomers(db, windows, seriesId),
		getSeriesProducts(db, windows, seriesId),
		getSyncMeta(db),
	]);

	const widget = (key, wLabel, cd, pd) => ({ key, label: wLabel, dkk: cd, index: pd > 0 ? Math.round((cd / pd) * 100) : null });
	const widgets = [
		widget('total', 'Total revenue', curM.total.dkk, priorM.total.dkk),
		...MARKETS.map((m) => widget(m.toLowerCase(), m, curM.byMarket[m].dkk, priorM.byMarket[m].dkk)),
	];

	return {
		publisher, pub, series: { id: series.id, name: series.name },
		widgets, monthly: { year: curYear, cur: monCur, prior: monPrior },
		customers, products, yearCols, colNoData, selected, range, periodLabel: label,
		yearOptions, quarterOptions, monthOptions, syncMeta,
	};
}
