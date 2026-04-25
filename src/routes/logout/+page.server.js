import { redirect } from '@sveltejs/kit';

export async function load({ cookies }) {
	cookies.delete('session', { path: '/' });
	redirect(303, '/login');
}
