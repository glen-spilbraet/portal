import { error } from '@sveltejs/kit';
import { DEPARTMENTS } from '$lib/departments.js';

export async function load({ parent }) {
	const { user } = await parent();
	if (!user?.permissions?.knowledge) error(403, "You don't have access to this section.");
	return { user, departments: DEPARTMENTS };
}
