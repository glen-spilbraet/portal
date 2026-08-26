/**
 * OAuth 2.1 (authorization-code + PKCE) helpers for the remote MCP server.
 * The portal is the authorization server; codes and tokens are opaque random
 * strings stored in D1 (revocable). Public clients only (PKCE, no secret).
 */

const CODE_TTL_SEC = 600;              // 10 min
const ACCESS_TTL_SEC = 30 * 24 * 3600; // 30 days
const REFRESH_TTL_SEC = 365 * 24 * 3600; // 1 year

const now = () => Math.floor(Date.now() / 1000);

function b64url(bytes) {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Cryptographically-random opaque token. */
export function randToken(bytes = 32) {
	const a = new Uint8Array(bytes);
	crypto.getRandomValues(a);
	return b64url(a);
}

/** base64url(SHA-256(input)) — for PKCE S256 verification. */
export async function sha256b64url(input) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
	return b64url(new Uint8Array(digest));
}

// ── Clients (dynamic registration) ─────────────────────────────────────────
export async function registerClient(db, { client_name, redirect_uris }) {
	const client_id = `mcp_${randToken(16)}`;
	await db.prepare('INSERT INTO mcp_oauth_client (client_id, client_name, redirect_uris) VALUES (?,?,?)')
		.bind(client_id, client_name || null, JSON.stringify(redirect_uris)).run();
	return { client_id, client_name: client_name || null, redirect_uris };
}

export async function getClient(db, clientId) {
	if (!clientId) return null;
	const row = await db.prepare('SELECT * FROM mcp_oauth_client WHERE client_id = ?').bind(clientId).first();
	if (!row) return null;
	let uris = [];
	try { uris = JSON.parse(row.redirect_uris); } catch { uris = []; }
	return { client_id: row.client_id, client_name: row.client_name, redirect_uris: uris };
}

// ── Authorization codes ────────────────────────────────────────────────────
export async function createAuthCode(db, { client_id, redirect_uri, code_challenge, email, scope }) {
	const code = randToken(32);
	await db.prepare(
		'INSERT INTO mcp_oauth_code (code, client_id, redirect_uri, code_challenge, email, scope, expires_at) VALUES (?,?,?,?,?,?,?)'
	).bind(code, client_id, redirect_uri, code_challenge, email, scope || null, now() + CODE_TTL_SEC).run();
	return code;
}

/** Fetch + delete a code (single use). Returns the row or null if missing/expired. */
export async function consumeAuthCode(db, code) {
	if (!code) return null;
	const row = await db.prepare('SELECT * FROM mcp_oauth_code WHERE code = ?').bind(code).first();
	if (row) await db.prepare('DELETE FROM mcp_oauth_code WHERE code = ?').bind(code).run();
	if (!row || row.expires_at < now()) return null;
	return row;
}

// ── Tokens ─────────────────────────────────────────────────────────────────
export async function issueTokens(db, { client_id, email, scope }) {
	const access_token = randToken(32);
	const refresh_token = randToken(32);
	await db.prepare(
		'INSERT INTO mcp_oauth_token (access_token, refresh_token, client_id, email, scope, expires_at) VALUES (?,?,?,?,?,?)'
	).bind(access_token, refresh_token, client_id, email, scope || null, now() + ACCESS_TTL_SEC).run();
	return { access_token, refresh_token, token_type: 'Bearer', expires_in: ACCESS_TTL_SEC, scope: scope || undefined };
}

/** Validate an access token → { email, scope, client_id } or null. */
export async function validateAccessToken(db, token) {
	if (!token) return null;
	const row = await db.prepare('SELECT * FROM mcp_oauth_token WHERE access_token = ?').bind(token).first();
	if (!row || row.expires_at < now()) return null;
	return { email: row.email, scope: row.scope, client_id: row.client_id };
}

/** Exchange a refresh token for a fresh access token (rotates access, keeps refresh). */
export async function refreshTokens(db, { refresh_token, client_id }) {
	if (!refresh_token) return null;
	const row = await db.prepare('SELECT * FROM mcp_oauth_token WHERE refresh_token = ?').bind(refresh_token).first();
	if (!row) return null;
	if (client_id && row.client_id !== client_id) return null;
	// Refresh tokens live REFRESH_TTL_SEC from creation.
	const created = row.created_at ? Math.floor(new Date(row.created_at + 'Z').getTime() / 1000) : now();
	if (created + REFRESH_TTL_SEC < now()) return null;
	const access_token = randToken(32);
	await db.prepare('UPDATE mcp_oauth_token SET access_token = ?, expires_at = ? WHERE refresh_token = ?')
		.bind(access_token, now() + ACCESS_TTL_SEC, refresh_token).run();
	return { access_token, refresh_token, token_type: 'Bearer', expires_in: ACCESS_TTL_SEC, scope: row.scope || undefined };
}
