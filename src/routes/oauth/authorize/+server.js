/**
 * OAuth authorization endpoint. Reuses the portal's Google-backed session:
 *  - not signed in  → bounce through the normal /login flow, then back here
 *  - signed in + allowed org user → auto-consent, issue an auth code
 *  - signed in but not allowed     → access_denied
 * Authorization-code + PKCE (S256) only.
 */
import { redirect } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { getClient, createAuthCode } from '$lib/server/mcpOauth.js';

function errorPage(message, status = 400) {
	return new Response(
		`<!doctype html><meta charset="utf-8"><title>Authorization error</title>` +
		`<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#18181B">` +
		`<h1 style="font-size:18px">Couldn't connect</h1><p style="color:#6b5e4e">${message}</p></body>`,
		{ status, headers: { 'Content-Type': 'text/html' } }
	);
}

function redirectBack(redirectUri, params) {
	const u = new URL(redirectUri);
	for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
	redirect(302, u.toString());
}

export async function GET({ url, cookies, platform }) {
	const db = platform?.env?.DB;
	if (!db) return errorPage('The server is temporarily unavailable.', 500);

	const q = url.searchParams;
	const response_type = q.get('response_type');
	const client_id = q.get('client_id');
	const redirect_uri = q.get('redirect_uri');
	const code_challenge = q.get('code_challenge');
	const code_challenge_method = q.get('code_challenge_method');
	const state = q.get('state');
	const scope = q.get('scope');

	// Validate the client + redirect_uri BEFORE trusting the redirect target.
	const client = client_id ? await getClient(db, client_id) : null;
	if (!client) return errorPage('Unknown or unregistered application.');
	if (!redirect_uri || !client.redirect_uris.includes(redirect_uri)) {
		return errorPage('The application supplied an invalid redirect URI.');
	}

	// From here, protocol errors are reported back to the client per OAuth.
	if (response_type !== 'code') return redirectBack(redirect_uri, { error: 'unsupported_response_type', state });
	if (!code_challenge || code_challenge_method !== 'S256') {
		return redirectBack(redirect_uri, { error: 'invalid_request', error_description: 'PKCE S256 required', state });
	}

	// Human auth: reuse the portal session; otherwise send through /login and back.
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email = await verifySession(cookies.get('session') ?? '', secret);
	if (!email) {
		const next = url.pathname + url.search;
		redirect(303, `/login?next=${encodeURIComponent(next)}`);
	}

	const user = await getAllowedUser(db, email);
	if (!user) return redirectBack(redirect_uri, { error: 'access_denied', error_description: 'Not an allowed account', state });

	// Allowed org user → auto-consent (first-party internal tool).
	const code = await createAuthCode(db, { client_id, redirect_uri, code_challenge, email, scope });
	return redirectBack(redirect_uri, { code, state });
}
