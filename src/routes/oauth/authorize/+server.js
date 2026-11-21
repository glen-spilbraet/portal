/**
 * OAuth authorization endpoint. Reuses the portal's Google-backed session:
 *  - not signed in  → bounce through the normal /login flow, then back here
 *  - signed in + allowed org user → a consent screen (GET); the auth code is
 *    issued only when the user presses "Allow" (POST)
 *  - signed in but not allowed     → access_denied
 * Authorization-code + PKCE (S256) only.
 *
 * Why a consent screen: anyone may register a client (RFC 7591), so without one
 * a crafted link opened by signed-in staff would silently hand a stranger a
 * token with that person's Portal rights.
 */
import { redirect } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { getClient, createAuthCode } from '$lib/server/mcpOauth.js';
import { sessionSecret } from '$lib/server/access.js';

/** @param {unknown} s */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// No `form-action` in the CSP: browsers apply it to the redirect that follows
// the form post too, which would block the hand-back to the application.
const PAGE_HEADERS = {
	'Content-Type': 'text/html; charset=utf-8',
	'Cache-Control': 'no-store',
	'X-Frame-Options': 'DENY', // the Allow button must not be clickable inside someone else's page
	'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
	// same-origin (not no-referrer): with no-referrer the browser posts the form
	// with `Origin: null`, and the origin check below would reject every Allow.
	'Referrer-Policy': 'same-origin',
};

/** @param {string} title @param {string} body @param {number} [status] */
function page(title, body, status = 200) {
	return new Response(
		`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>` +
		`<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#18181B">${body}</body></html>`,
		{ status, headers: PAGE_HEADERS }
	);
}

/** @param {string} message @param {number} [status] */
const errorPage = (message, status = 400) =>
	page('Authorization error', `<h1 style="font-size:18px">Couldn't connect</h1><p style="color:#6b5e4e">${esc(message)}</p>`, status);

/** @param {string} redirectUri @param {Record<string, string | null | undefined>} params @returns {never} */
function redirectBack(redirectUri, params) {
	const u = new URL(redirectUri);
	for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
	redirect(302, u.toString());
}

const FIELDS = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope'];

/**
 * Shared by GET (show consent) and POST (act on it): validate the request and
 * the signed-in user. Returns a Response to send, or the validated request.
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {(name: string) => string | null} get
 * @returns {Promise<{ response: Response } | { response?: undefined, db: any, q: Record<string, string | null>, client: any, email: string }>}
 */
async function validate({ url, cookies, platform }, get) {
	const db = platform?.env?.DB;
	if (!db) return { response: errorPage('The server is temporarily unavailable.', 500) };

	const q = /** @type {Record<string, string | null>} */ (Object.fromEntries(FIELDS.map((f) => [f, get(f)])));

	// Validate the client + redirect_uri BEFORE trusting the redirect target.
	const client = q.client_id ? await getClient(db, q.client_id) : null;
	if (!client) return { response: errorPage('Unknown or unregistered application.') };
	if (!q.redirect_uri || !client.redirect_uris.includes(q.redirect_uri)) {
		return { response: errorPage('The application supplied an invalid redirect URI.') };
	}

	// From here, protocol errors are reported back to the client per OAuth.
	if (q.response_type !== 'code') redirectBack(q.redirect_uri, { error: 'unsupported_response_type', state: q.state });
	if (!q.code_challenge || q.code_challenge_method !== 'S256') {
		redirectBack(q.redirect_uri, { error: 'invalid_request', error_description: 'PKCE S256 required', state: q.state });
	}

	// Human auth: reuse the portal session; otherwise send through /login and back.
	const secret = sessionSecret(platform);
	if (!secret) return { response: errorPage('The server is not configured for sign-in.', 500) };
	const email = await verifySession(cookies.get('session') ?? '', secret);
	if (!email) {
		const params = new URLSearchParams();
		for (const f of FIELDS) if (q[f] != null) params.set(f, /** @type {string} */ (q[f]));
		redirect(303, `/login?next=${encodeURIComponent(`${url.pathname}?${params}`)}`);
	}

	const user = await getAllowedUser(db, email);
	if (!user) redirectBack(q.redirect_uri, { error: 'access_denied', error_description: 'Not an allowed account', state: q.state });

	return { db, q, client, email };
}

/** GET — ask the signed-in user before anything is issued. */
export async function GET(event) {
	const v = await validate(event, (name) => event.url.searchParams.get(name));
	if (v.response) return v.response;
	const { q, client, email } = v;

	const host = new URL(/** @type {string} */ (q.redirect_uri)).host;
	const hidden = FIELDS.filter((f) => q[f] != null).map((f) => `<input type="hidden" name="${f}" value="${esc(q[f])}">`).join('');
	const btn = 'font:inherit;font-weight:600;padding:10px 18px;border-radius:8px;cursor:pointer;';
	return page('Connect to the Portal',
		`<h1 style="font-size:20px;margin-bottom:8px">Connect to the Portal?</h1>` +
		`<p style="color:#6b5e4e;line-height:1.5"><strong style="color:#18181B">${esc(client.client_name || 'An application')}</strong> ` +
		`(<code>${esc(host)}</code>) wants to read Portal data as <strong style="color:#18181B">${esc(email)}</strong>, with the same rights you have in the Portal.</p>` +
		`<p style="color:#6b5e4e;line-height:1.5">Only allow this if you started the connection yourself, e.g. by adding the Portal as a connector in Claude.</p>` +
		`<form method="POST" action="/oauth/authorize" style="display:flex;gap:10px;margin-top:24px">${hidden}` +
		`<button name="decision" value="allow" style="${btn}background:#f57832;color:#fff;border:1px solid #f57832">Allow</button>` +
		`<button name="decision" value="deny" style="${btn}background:#fff;color:#18181B;border:1px solid #d6cfc4">Cancel</button>` +
		`</form>`);
}

/** POST — the consent form. Issues the auth code only on "Allow". */
export async function POST(event) {
	// The form only ever posts from this page. (The session cookie is
	// SameSite=Lax, so a cross-site POST arrives signed-out anyway.)
	const origin = event.request.headers.get('origin');
	if (origin && origin !== event.url.origin) return errorPage('This request did not come from the Portal.', 403);

	const form = await event.request.formData().catch(() => null);
	if (!form) return errorPage('Invalid request.');
	const v = await validate(event, (name) => form.get(name)?.toString() ?? null);
	if (v.response) return v.response;
	const { db, q, email } = v;
	const redirect_uri = /** @type {string} */ (q.redirect_uri);

	if (form.get('decision') !== 'allow') {
		redirectBack(redirect_uri, { error: 'access_denied', error_description: 'The user cancelled', state: q.state });
	}
	const code = await createAuthCode(db, { client_id: q.client_id, redirect_uri, code_challenge: q.code_challenge, email, scope: q.scope });
	redirectBack(redirect_uri, { code, state: q.state });
}
