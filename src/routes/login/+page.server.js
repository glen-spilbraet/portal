import { redirect } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { safeNext, sessionSecret } from '$lib/server/access.js';

export async function load({ cookies, url, platform }) {
	const token = cookies.get('session');
	const secret = sessionSecret(platform) ?? '';
	const email = await verifySession(token ?? '', secret);
	const next = safeNext(url.searchParams.get('next'));
	if (email) redirect(303, next);
	return {
		next,
		error: url.searchParams.get('error') ?? null,
		blockedEmail: url.searchParams.get('email') ?? null,
	};
}
