const ALGO = { name: 'HMAC', hash: 'SHA-256' };
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function importKey(secret) {
	const raw = new TextEncoder().encode(secret);
	return crypto.subtle.importKey('raw', raw, ALGO, false, ['sign', 'verify']);
}

function hexEncode(buf) {
	return Array.from(new Uint8Array(buf))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
}
function hexDecode(hex) {
	return new Uint8Array((hex.match(/.{2}/g) ?? []).map(b => parseInt(b, 16)));
}

/**
 * Creates a signed session token that embeds the user's email.
 * Format: base64url(email|timestamp) . hex(hmac)
 */
export async function createSession(email, secret) {
	const key = await importKey(secret);
	const ts = Date.now().toString();
	const payload = `${email}|${ts}`;
	const encoded = btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	const sig = await crypto.subtle.sign(ALGO, key, new TextEncoder().encode(payload));
	return `${encoded}.${hexEncode(sig)}`;
}

/**
 * Verifies a session token and returns the embedded email, or null if invalid/expired.
 */
export async function verifySession(token, secret) {
	if (!token) return null;
	const dot = token.lastIndexOf('.');
	if (dot === -1) return null;

	const encoded = token.slice(0, dot);
	const hexSig = token.slice(dot + 1);

	let payload;
	try {
		// Restore base64 padding
		const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
		payload = atob(b64);
	} catch {
		return null;
	}

	const pipeIdx = payload.lastIndexOf('|');
	if (pipeIdx === -1) return null;
	const email = payload.slice(0, pipeIdx);
	const ts = payload.slice(pipeIdx + 1);

	if (Date.now() - parseInt(ts) > SESSION_TTL_MS) return null;

	try {
		const key = await importKey(secret);
		const sig = hexDecode(hexSig);
		const valid = await crypto.subtle.verify(ALGO, key, sig, new TextEncoder().encode(payload));
		return valid ? email : null;
	} catch {
		return null;
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
