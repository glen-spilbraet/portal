import { redirect } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';

export async function load({ cookies, url, platform }) {
	if (url.pathname === '/login') return {};
	if (url.pathname.startsWith('/share/')) return {};
	const token = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const valid = await verifySession(token ?? '', secret);
	if (!valid) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	return {};
}
