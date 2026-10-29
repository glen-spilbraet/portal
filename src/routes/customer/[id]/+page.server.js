import { error } from '@sveltejs/kit';
import {
	getCustomerInfo, getCustomerMarketTotals, getCustomerMonthly,
	getCustomerProducts, getCustomerPublishers, getCustomerSeries, getSyncMeta, MARKETS,
} from '$lib/salesStats.js';
import { effectiveParams, resolveRange, getPeriodOptions, yearWindows, addDaysStr } from '$lib/server/statsRange.js';

/**
 * Admin-only customer detail — the mirror of the publisher-detail page, scoped
 * to a single company_id: top market figures, a monthly chart, then a breakdown
 * table with a dimension switch (products / publishers SKU / publishers mapped /
 * series). The period follows the shared DateBar (url params → cookies).
 */
export async function load({ params, platform, url, cookies, parent }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, "You don't have access to this section.");

	const id = params.id;
	const now = new Date();
	const curYear = now.getUTCFullYear();
	const { yearOptions, quarterOptions, monthOptions } = getPeriodOptions(now);
	const { cur, prior, label, selected } = resolveRange(effectiveParams(url, cookies), now);
	const range = { start: cur.start, endInclusive: addDaysStr(cur.end, -1) };
	const base = { id, selected, range, periodLabel: label, yearOptions, quarterOptions, monthOptions };

	const db = platform?.env?.SALES_DB;
	if (!db) error(503, 'Sales database unavailable.');

	const info = await getCustomerInfo(db, id);
	if (!info) error(404, 'Customer not found.');

	const { windows, yearCols, colNoData } = yearWindows(cur, prior);
	const [curM, priorM, monCur, monPrior, products, pubSku, pubMapped, series, syncMeta] = await Promise.all([
		getCustomerMarketTotals(db, cur.start, cur.end, id),
		getCustomerMarketTotals(db, prior.start, prior.end, id),
		getCustomerMonthly(db, curYear, id),
		getCustomerMonthly(db, curYear - 1, id),
		getCustomerProducts(db, windows, id),
		getCustomerPublishers(db, windows, id, 'sku'),
		getCustomerPublishers(db, windows, id, 'mapped'),
		getCustomerSeries(db, windows, id),
		getSyncMeta(db),
	]);

	const widget = (key, wLabel, cd, pd) => ({ key, label: wLabel, dkk: cd, index: pd > 0 ? Math.round((cd / pd) * 100) : null });
	const widgets = [
		widget('total', 'Total revenue', curM.total.dkk, priorM.total.dkk),
		...MARKETS.map((m) => widget(m.toLowerCase(), m, curM.byMarket[m].dkk, priorM.byMarket[m].dkk)),
	];

	return {
		...base,
		customer: info,
		widgets,
		monthly: { year: curYear, cur: monCur, prior: monPrior },
		dims: { products, pub_sku: pubSku, pub_mapped: pubMapped, series },
		yearCols, colNoData, syncMeta,
	};
}
