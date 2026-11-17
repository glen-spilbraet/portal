import { error } from '@sveltejs/kit';
import { listActivities, listItems, listThemes } from '$lib/server/wheel.js';

export async function load({ parent, platform, url }) {
	const { user } = await parent();
	// Hidden tool — admin only, not linked from the nav.
	if (user?.role !== 'admin') error(403, "You don't have access to this section.");

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const thisYear = new Date().getFullYear();
	const y = Number(url.searchParams.get('year'));
	const year = Number.isInteger(y) && y > 2000 && y < 2100 ? y : thisYear;

	const [activities, items, themes] = await Promise.all([
		listActivities(db),
		listItems(db, year),
		listThemes(db, year),
	]);
	return { user, year, activities, items, themes };
}
