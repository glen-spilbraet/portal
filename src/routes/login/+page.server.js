import { redirect } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { safeNext, sessionSecret } from '$lib/server/access.js';

export async function load({ cookies, url, platform }) {
	const token = cookies.get('session');
	const secret = sessionSecret(platform);
	const email = secret ? await verifySession(token ?? '', secret) : null;
	const next = safeNext(url.searchParams.get('next'));
	const problem = url.searchParams.get('error');
	// Signed in but no longer on the allowed list: drop the cookie and show the
	// message (redirecting on would bounce between here and the page forever).
	if (email && problem === 'not_allowed') cookies.delete('session', { path: '/' });
	else if (email) redirect(303, next);
	return {
		next,
		error: problem ?? null,
		blockedEmail: url.searchParams.get('email') ?? null,
	};
}
