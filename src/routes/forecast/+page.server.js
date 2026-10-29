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

	// Per-query timing so we can see which step is slow (console + ?debug=1).
	const timings = {};
	const run = async (label, p) => { const s = Date.now(); try { return await p; } finally { timings[label] = Date.now() - s; } };
	const t0 = Date.now();

	const [owners, years, completed, ongoing, skipped, halfYears] = await Promise.all([
		run('owners', getForecastOwners(db)),
		run('years', getForecastYears(db)),
		run('completed', getCompletedAccuracy(db, today, ownerParam, yearParam)),
		run('ongoing', getOngoingProgress(db, today, ownerParam, yearParam)),
		run('skipped', getSkippedCount(db, ownerParam)),
		run('halfYears', getCompletedHalfYearBreakdown(db, today, ownerParam, yearParam))
	]);
	timings.total = Date.now() - t0;
	console.log('[forecast] query timings (ms):', JSON.stringify(timings));

	return {
		user, owners, years, ownerParam, yearParam, completed, ongoing, skipped, halfYears, today,
		timings: url.searchParams.get('debug') ? timings : null,
	};
}
