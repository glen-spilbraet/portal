/** RFC 7591 — Dynamic Client Registration. Claude registers itself here so the
 *  user never has to configure a client. Public clients (PKCE, no secret). */
import { registerClient } from '$lib/server/mcpOauth.js';

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version'
};
const json = (obj, status = 200) =>
	new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });

export function OPTIONS() {
	return new Response(null, { status: 204, headers: CORS });
}

export async function POST({ request, platform }) {
	const db = platform?.env?.DB;
	if (!db) return json({ error: 'server_error', error_description: 'DB unavailable' }, 500);

	let body;
	try { body = await request.json(); } catch { return json({ error: 'invalid_client_metadata', error_description: 'Invalid JSON' }, 400); }

	const redirect_uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.filter((u) => typeof u === 'string') : [];
	if (!redirect_uris.length) {
		return json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris is required' }, 400);
	}

	const client = await registerClient(db, { client_name: body?.client_name, redirect_uris });
	return json({
		client_id: client.client_id,
		client_name: client.client_name ?? undefined,
		redirect_uris: client.redirect_uris,
		token_endpoint_auth_method: 'none',
		grant_types: ['authorization_code', 'refresh_token'],
		response_types: ['code']
	}, 201);
}
