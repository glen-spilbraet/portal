import { error } from '@sveltejs/kit';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only.');
	return { user, hasKey: !!(platform?.env?.LAGERSYSTEM_API_KEY) };
}
