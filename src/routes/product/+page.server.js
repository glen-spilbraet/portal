import { error } from '@sveltejs/kit';
import { getPublisherBreakdown, getSeriesChildrenByPublisher, getAllSeriesBreakdown, getSyncMeta } from '$lib/salesStats.js';
import { effectiveParams, resolveRange, getPeriodOptions, yearWindows, addDaysStr } from '$lib/server/statsRange.js';
import { withCache } from '$lib/server/statsCache.js';

export async function load({ platform, url, cookies, parent, setHeaders }) {
	const { user } = await parent();
	if (!user?.permissions?.product) error(403, "You don't have access to this section.");

	const now = new Date();
	const todayStr = now.toISOString().slice(0, 10);
	const { yearOptions, quarterOptions, monthOptions } = getPeriodOptions(now);
	const { cur, prior, label, selected } = resolveRange(effectiveParams(url, cookies), now);
	const range = { start: cur.start, endInclusive: addDaysStr(cur.end, -1) };

	const pubParam = url.searchParams.get('pub');
	const pub = pubParam === 'mapped' || pubParam === 'series' ? pubParam : 'sku';

	const db = platform?.env?.SALES_DB;
	if (!db) {
		return { publishers: [], seriesRows: [], seriesChildren: {}, pub, yearCols: ['—', '—', '—'], colNoData: [false, false, false], selected, range, periodLabel: label, yearOptions, quarterOptions, monthOptions, syncMeta: null };
	}

	const meta = await getSyncMeta(db);
	const version = `${meta?.last_run ?? 'none'}|${todayStr}`;

	// Product breakdowns are company-wide → scope is the publisher view + period.
	return withCache(
		{ platform, url, setHeaders, ns: 'product', version, scope: { pub, selected, start: cur.start, end: cur.end } },
		async () => {
			const { windows, yearCols, colNoData } = yearWindows(cur, prior);

			// "Mapped series" = a flat leaderboard of every series across all publishers.
			if (pub === 'series') {
				const seriesRows = await getAllSeriesBreakdown(db, windows);
				return { publishers: [], seriesRows, seriesChildren: {}, pub, yearCols, colNoData, selected, range, periodLabel: label, yearOptions, quarterOptions, monthOptions, syncMeta: meta };
			}

			const publishers = await getPublisherBreakdown(db, windows, pub);
			// Series sub-rows for the expandable list (mapped view only).
			const seriesChildren = pub === 'mapped' ? await getSeriesChildrenByPublisher(db, windows) : {};

			return { publishers, seriesRows: [], seriesChildren, pub, yearCols, colNoData, selected, range, periodLabel: label, yearOptions, quarterOptions, monthOptions, syncMeta: meta };
		}
	);
}
