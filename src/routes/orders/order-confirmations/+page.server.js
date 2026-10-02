import { error } from '@sveltejs/kit';

export async function load({ parent }) {
	const { user } = await parent();
	if (!user?.permissions?.order_conf) error(403, "You don't have access to this section.");
	return { user };
}
