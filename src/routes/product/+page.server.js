import { error } from '@sveltejs/kit';
import { getPublisherBreakdown } from '$lib/salesStats.js';
import { effectiveParams, resolveRange, getPeriodOptions, yearWindows, addDaysStr } from '$lib/server/statsRange.js';

export async function load({ platform, url, cookies, parent }) {
	const { user } = await parent();
	if (!user?.permissions?.product) error(403, "You don't have access to this section.");

	const now = new Date();
	const { yearOptions, quarterOptions, monthOptions } = getPeriodOptions(now);
	const { cur, prior, label, selected } = resolveRange(effectiveParams(url, cookies), now);
	const range = { start: cur.start, endInclusive: addDaysStr(cur.end, -1) };

	const db = platform?.env?.SALES_DB;
	if (!db) {
		return { publishers: [], yearCols: ['—', '—', '—'], colNoData: [false, false, false], selected, range, periodLabel: label, yearOptions, quarterOptions, monthOptions };
	}

	const { windows, yearCols, colNoData } = yearWindows(cur, prior);
	const publishers = await getPublisherBreakdown(db, windows);

	return { publishers, yearCols, colNoData, selected, range, periodLabel: label, yearOptions, quarterOptions, monthOptions };
}
