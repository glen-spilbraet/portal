import { error } from '@sveltejs/kit';
import { getForecastOwners, getForecastYears, getSkippedCount, getCompletedAccuracy, getOngoingProgress, getCompletedHalfYearBreakdown } from '$lib/forecastStats.js';
import { getSyncMeta } from '$lib/salesStats.js';
import { withCache } from '$lib/server/statsCache.js';

export async function load({ parent, platform, url, setHeaders }) {
	const { user } = await parent();
	if (!user?.permissions?.forecast) error(403, "You don't have access to this section.");

	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Database unavailable');

	const today = new Date().toISOString().slice(0, 10);
	const ownerParam = url.searchParams.get('owner') || null;
	const yearParam = (url.searchParams.get('year') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

	const meta = await getSyncMeta(db);
	const version = `${meta?.last_run ?? 'none'}|${today}`;

	// Forecast data depends only on the owner/year filter (not the viewer).
	const payload = await withCache(
		{ platform, url, setHeaders, ns: 'forecast', version, scope: { owner: ownerParam, years: yearParam } },
		async () => {
			const [owners, years, completed, ongoing, skipped, halfYears] = await Promise.all([
				getForecastOwners(db),
				getForecastYears(db),
				getCompletedAccuracy(db, today, ownerParam, yearParam),
				getOngoingProgress(db, today, ownerParam, yearParam),
				getSkippedCount(db, ownerParam),
				getCompletedHalfYearBreakdown(db, today, ownerParam, yearParam)
			]);
			return { owners, years, ownerParam, yearParam, completed, ongoing, skipped, halfYears, today };
		}
	);

	return { user, ...payload };
}
