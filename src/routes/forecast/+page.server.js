import { error } from '@sveltejs/kit';
import { getForecastOwners, getForecastYears, getSkippedCount, getCompletedAccuracy, getOngoingProgress } from '$lib/forecastStats.js';

export async function load({ parent, platform, url }) {
	const { user } = await parent();
	if (!user?.permissions?.forecast) error(403, "You don't have access to this section.");

	const db = platform?.env?.SALES_DB;
	if (!db) error(500, 'Database unavailable');

	const today = new Date().toISOString().slice(0, 10);
	const ownerParam = url.searchParams.get('owner') || null;
	const yearParam = (url.searchParams.get('year') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

	const [owners, years, completed, ongoing, skipped] = await Promise.all([
		getForecastOwners(db),
		getForecastYears(db),
		getCompletedAccuracy(db, today, ownerParam, yearParam),
		getOngoingProgress(db, today, ownerParam, yearParam),
		getSkippedCount(db, ownerParam)
	]);

	return { user, owners, years, ownerParam, yearParam, completed, ongoing, skipped, today };
}
