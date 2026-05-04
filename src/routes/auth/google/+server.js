import { redirect } from '@sveltejs/kit';

export function GET({ url, platform }) {
	const clientId = platform?.env?.GOOGLE_CLIENT_ID;
	if (!clientId) {
		return new Response('Google OAuth not configured', { status: 500 });
	}

	// Store the ?next= param in state so the callback can redirect there
	const next = url.searchParams.get('next') ?? '/';

	const params = new URLSearchParams({
		client_id: clientId,
		redirect_uri: `${url.origin}/auth/google/callback`,
		response_type: 'code',
		scope: 'openid email profile',
		access_type: 'online',
		prompt: 'select_account',
		state: next,
	});

	redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
