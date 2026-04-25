const ALGO = { name: 'HMAC', hash: 'SHA-256' };
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function importKey(secret) {
	const raw = new TextEncoder().encode(secret);
	return crypto.subtle.importKey('raw', raw, ALGO, false, ['sign', 'verify']);
}

/** Creates a signed session token */
export async function createSession(secret) {
	const key = await importKey(secret);
	const ts = Date.now().toString();
	const sig = await crypto.subtle.sign(ALGO, key, new TextEncoder().encode(ts));
	const hex = Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return `${ts}.${hex}`;
}

/** Returns true if the token is valid and not expired */
export async function verifySession(token, secret) {
	if (!token) return false;
	const dot = token.indexOf('.');
	if (dot === -1) return false;
	const ts = token.slice(0, dot);
	const hex = token.slice(dot + 1);
	if (Date.now() - parseInt(ts) > SESSION_TTL_MS) return false;
	try {
		const key = await importKey(secret);
		const sig = new Uint8Array((hex.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)));
		return await crypto.subtle.verify(ALGO, key, sig, new TextEncoder().encode(ts));
	} catch {
		return false;
	}
}

/** Builds the Set-Cookie header value for a session */
export function sessionCookie(token, clear = false) {
	if (clear) {
		return `session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
	}
	const maxAge = Math.floor(SESSION_TTL_MS / 1000);
	return `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}
