/** OAuth token endpoint: authorization_code (PKCE) exchange + refresh_token. */
import { consumeAuthCode, issueTokens, refreshTokens, sha256b64url } from '$lib/server/mcpOauth.js';

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version'
};
const json = (obj, status = 200) =>
	new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });
const oauthErr = (error, error_description, status = 400) => json({ error, error_description }, status);

export function OPTIONS() {
	return new Response(null, { status: 204, headers: CORS });
}

async function readParams(request) {
	const ct = request.headers.get('content-type') ?? '';
	if (ct.includes('application/json')) {
		try { return await request.json(); } catch { return {}; }
	}
	const text = await request.text();
	return Object.fromEntries(new URLSearchParams(text));
}

export async function POST({ request, platform }) {
	const db = platform?.env?.DB;
	if (!db) return oauthErr('server_error', 'DB unavailable', 500);

	const p = await readParams(request);
	const grant_type = p.grant_type;

	if (grant_type === 'authorization_code') {
		const { code, redirect_uri, client_id, code_verifier } = p;
		if (!code || !code_verifier) return oauthErr('invalid_request', 'Missing code or code_verifier');

		const row = await consumeAuthCode(db, code);
		if (!row) return oauthErr('invalid_grant', 'Code invalid or expired');
		if (client_id && row.client_id !== client_id) return oauthErr('invalid_grant', 'Client mismatch');
		if (redirect_uri && row.redirect_uri !== redirect_uri) return oauthErr('invalid_grant', 'redirect_uri mismatch');

		const challenge = await sha256b64url(code_verifier);
		if (challenge !== row.code_challenge) return oauthErr('invalid_grant', 'PKCE verification failed');

		const tokens = await issueTokens(db, { client_id: row.client_id, email: row.email, scope: row.scope });
		return json(tokens);
	}

	if (grant_type === 'refresh_token') {
		const tokens = await refreshTokens(db, { refresh_token: p.refresh_token, client_id: p.client_id });
		if (!tokens) return oauthErr('invalid_grant', 'Refresh token invalid or expired');
		return json(tokens);
	}

	return oauthErr('unsupported_grant_type', `Unsupported grant_type: ${grant_type ?? '(none)'}`);
}
