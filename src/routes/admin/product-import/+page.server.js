import { error } from '@sveltejs/kit';

export async function load({ parent }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');
	return {};
}
