import { fail, redirect } from '@sveltejs/kit';
import { createSession, sessionCookie } from '$lib/auth.js';

export async function load({ cookies, url, platform }) {
	const token = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const { verifySession } = await import('$lib/auth.js');
	const valid = await verifySession(token ?? '', secret);
	if (valid) redirect(303, url.searchParams.get('next') ?? '/');
	return { next: url.searchParams.get('next') ?? '/' };
}

export const actions = {
	default: async ({ request, cookies, platform }) => {
		const data = await request.formData();
		const password = data.get('password')?.toString() ?? '';
		const next = data.get('next')?.toString() ?? '/';

		const appPassword = platform?.env?.APP_PASSWORD ?? 'dev';
		const secret = platform?.env?.APP_SECRET ?? 'dev-secret';

		if (password !== appPassword) {
			return fail(401, { error: 'Incorrect password' });
		}

		const token = await createSession(secret);
		cookies.set('session', token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 7 * 24 * 60 * 60
		});

		redirect(303, next);
	}
};
