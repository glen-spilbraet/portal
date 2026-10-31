import { error } from '@sveltejs/kit';
import { listBoards, listTasks } from '$lib/server/tasks.js';
import { listAllowedUsers } from '$lib/db.js';
import { listEvents } from '$lib/server/events.js';

export async function load({ parent, platform, url }) {
	const { user } = await parent();
	// Hidden tool — admin only for now (not wired into nav or a permission set).
	if (user?.role !== 'admin') error(403, "You don't have access to this section.");

	const initialPanel = url.searchParams.get('v') || 'my';

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const [boards, tasks, users, events] = await Promise.all([
		listBoards(db),
		listTasks(db),
		listAllowedUsers(db),
		listEvents(db),
	]);

	return {
		user,
		initialPanel,
		boards,
		tasks,
		users: (users ?? []).map((u) => ({ email: u.email, name: u.first_name || u.name || u.email })),
		events: (events ?? []).map((e) => ({ id: e.id, title: e.title, date: e.event_date })),
	};
}
