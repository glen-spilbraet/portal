import { redirect } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';

export async function load({ cookies, url, platform }) {
	const token = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email = await verifySession(token ?? '', secret);
	if (email) redirect(303, url.searchParams.get('next') ?? '/');
	return {
		next: url.searchParams.get('next') ?? '/',
		error: url.searchParams.get('error') ?? null,
		blockedEmail: url.searchParams.get('email') ?? null,
	};
}
