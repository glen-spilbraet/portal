/**
 * Who may run a tombola's big screen (/tombola/<code>/screen + its APIs):
 *   - a signed-in Portal user with the `events` permission (any tombola), or
 *   - anyone holding this tombola's screen cookie, which is handed out after the
 *     right PIN. The cookie is an HMAC over the tombola id + current PIN, so
 *     changing the PIN signs every PIN-opened screen out at once.
 */
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';
import { sessionSecret } from '$lib/server/access.js';

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const screenCookieName = (t) => `tombola_screen_${t.code}`;

async function screenToken(secret, t) {
	const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(`tombola-screen:${t.id}:${t.pin}`)));
}

/** Portal user with events access? Returns their email, or null. */
async function staffEmail(event) {
	const secret = sessionSecret(event.platform);
	const db = event.platform?.env?.DB;
	if (!secret || !db) return null;
	const email = await verifySession(event.cookies.get('session') ?? '', secret);
	if (!email) return null;
	const user = await getAllowedUser(db, email);
	if (!user) return null;
	const perms = await getUserPermissions(db, user);
	return perms.events ? email : null;
}

/**
 * @returns {Promise<{ via: 'login', email: string } | { via: 'pin' } | null>}
 */
export async function screenAccess(event, t) {
	const email = await staffEmail(event).catch(() => null);
	if (email) return { via: 'login', email };
	const secret = sessionSecret(event.platform);
	const got = event.cookies.get(screenCookieName(t));
	if (secret && t.pin && got && got === (await screenToken(secret, t))) return { via: 'pin' };
	return null;
}

/** Hand out the screen cookie after a correct PIN. */
export async function grantScreen(event, t) {
	const secret = sessionSecret(event.platform);
	if (!secret) throw new Error('Missing session secret');
	event.cookies.set(screenCookieName(t), await screenToken(secret, t), {
		path: '/', httpOnly: true, secure: event.url.protocol === 'https:', sameSite: 'lax', maxAge: 60 * 60 * 24 * 14,
	});
}
