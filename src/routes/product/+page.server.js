import { error } from '@sveltejs/kit';
import { getPublisherBreakdown, getSeriesChildrenByPublisher, getAllSeriesBreakdown, getSyncMeta } from '$lib/salesStats.js';
import { effectiveParams, resolveRange, getPeriodOptions, yearWindows, addDaysStr } from '$lib/server/statsRange.js';

export async function load({ platform, url, cookies, parent }) {
	const { user } = await parent();
	if (!user?.permissions?.product) error(403, "You don't have access to this section.");

	const now = new Date();
	const { yearOptions, quarterOptions, monthOptions } = getPeriodOptions(now);
	const { cur, prior, label, selected } = resolveRange(effectiveParams(url, cookies), now);
	const range = { start: cur.start, endInclusive: addDaysStr(cur.end, -1) };

	const pubParam = url.searchParams.get('pub');
	const pub = pubParam === 'mapped' || pubParam === 'series' ? pubParam : 'sku';

	const db = platform?.env?.SALES_DB;
	if (!db) {
		return { publishers: [], seriesRows: [], seriesChildren: {}, pub, yearCols: ['—', '—', '—'], colNoData: [false, false, false], selected, range, periodLabel: label, yearOptions, quarterOptions, monthOptions, syncMeta: null };
	}

	const { windows, yearCols, colNoData } = yearWindows(cur, prior);
	const syncMeta = await getSyncMeta(db);

	// "Mapped series" = a flat leaderboard of every series across all publishers.
	if (pub === 'series') {
		const seriesRows = await getAllSeriesBreakdown(db, windows);
		return { publishers: [], seriesRows, seriesChildren: {}, pub, yearCols, colNoData, selected, range, periodLabel: label, yearOptions, quarterOptions, monthOptions, syncMeta };
	}

	const publishers = await getPublisherBreakdown(db, windows, pub);
	// Series sub-rows for the expandable list (mapped view only).
	const seriesChildren = pub === 'mapped' ? await getSeriesChildrenByPublisher(db, windows) : {};

	return { publishers, seriesRows: [], seriesChildren, pub, yearCols, colNoData, selected, range, periodLabel: label, yearOptions, quarterOptions, monthOptions, syncMeta };
}
