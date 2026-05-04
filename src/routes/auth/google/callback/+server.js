import { redirect } from '@sveltejs/kit';
import { createSession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';

export async function GET({ url, cookies, platform }) {
	const code = url.searchParams.get('code');
	const next = url.searchParams.get('state') ?? '/';
	const error = url.searchParams.get('error');

	if (error || !code) {
		redirect(302, `/login?error=${encodeURIComponent(error ?? 'access_denied')}`);
	}

	const clientId = platform?.env?.GOOGLE_CLIENT_ID;
	const clientSecret = platform?.env?.GOOGLE_CLIENT_SECRET;
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const db = platform?.env?.DB;

	if (!clientId || !clientSecret) {
		return new Response('Google OAuth not configured', { status: 500 });
	}

	// Exchange auth code for tokens
	let tokenData;
	try {
		const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				code,
				client_id: clientId,
				client_secret: clientSecret,
				redirect_uri: `${url.origin}/auth/google/callback`,
				grant_type: 'authorization_code',
			}),
		});
		tokenData = await tokenRes.json();
	} catch {
		redirect(302, '/login?error=token_exchange_failed');
	}

	if (tokenData.error) {
		redirect(302, `/login?error=${encodeURIComponent(tokenData.error)}`);
	}

	// Decode id_token (JWT) — we just need the payload, Google signs it
	// but we trust it because we got it directly from Google's token endpoint
	let userEmail, userName;
	try {
		const [, payloadB64] = tokenData.id_token.split('.');
		const pad = payloadB64.length % 4;
		const padded = pad ? payloadB64 + '='.repeat(4 - pad) : payloadB64;
		const decoded = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')));
		userEmail = decoded.email?.toLowerCase();
		userName = decoded.name ?? decoded.email;
	} catch {
		redirect(302, '/login?error=invalid_token');
	}

	if (!userEmail) {
		redirect(302, '/login?error=no_email');
	}

	// Check allowlist
	if (!db) {
		return new Response('Database unavailable', { status: 500 });
	}
	const user = await getAllowedUser(db, userEmail);
	if (!user) {
		redirect(302, `/login?error=not_allowed&email=${encodeURIComponent(userEmail)}`);
	}

	// Issue session cookie
	const token = await createSession(userEmail, secret);
	cookies.set('session', token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 7 * 24 * 60 * 60,
		secure: url.protocol === 'https:',
	});

	redirect(302, next.startsWith('/') ? next : '/');
}
