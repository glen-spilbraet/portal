import { error } from '@sveltejs/kit';
import { getForecastOwners, getForecastYears, getSkippedCount, getCompletedAccuracy, getOngoingProgress, getCompletedHalfYearBreakdown } from '$lib/forecastStats.js';

export async function load({ parent, platform, url }) {
	const { user } = await parent();
	if (!user?.permissions?.forecast) error(403, "You don't have access to this section.");

	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Database unavailable');

	const today = new Date().toISOString().slice(0, 10);
	const ownerParam = url.searchParams.get('owner') || null;
	const yearParam = (url.searchParams.get('year') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

	const tasks = {
		owners:    () => getForecastOwners(db),
		years:     () => getForecastYears(db),
		completed: () => getCompletedAccuracy(db, today, ownerParam, yearParam),
		ongoing:   () => getOngoingProgress(db, today, ownerParam, yearParam),
		skipped:   () => getSkippedCount(db, ownerParam),
		halfYears: () => getCompletedHalfYearBreakdown(db, today, ownerParam, yearParam),
	};
	const defaults = {
		owners: [], years: [], completed: { customers: [], owners: [], products: [] },
		ongoing: [], skipped: 0, halfYears: [],
	};

	// ?debug=1: run each query SEQUENTIALLY (D1 serialises a Worker's queries, so
	// parallel timings all collapse to the batch total) with a SELECT 1 baseline,
	// capturing per-query time + error so one query's isolated cost is visible.
	if (url.searchParams.get('debug')) {
		const timings = {}, errors = {}, res = { ...defaults };
		{
			const s = Date.now();
			try { await db.prepare('SELECT 1').first(); } catch (e) { errors.ping = e?.message ?? String(e); }
			timings.ping = Date.now() - s;
		}
		for (const [k, fn] of Object.entries(tasks)) {
			const s = Date.now();
			try { res[k] = await fn(); } catch (e) { errors[k] = e?.message ?? String(e); }
			timings[k] = Date.now() - s;
		}
		console.log('[forecast] seq timings(ms):', JSON.stringify(timings), 'errors:', JSON.stringify(errors));
		return { user, ownerParam, yearParam, today, ...res, timings, errors };
	}

	const [owners, years, completed, ongoing, skipped, halfYears] = await Promise.all(
		Object.values(tasks).map((fn) => fn())
	);
	return { user, owners, years, ownerParam, yearParam, completed, ongoing, skipped, halfYears, today, timings: null };
}
