/** RFC 8414 — authorization server metadata for the MCP OAuth flow. */
const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version'
};

export function OPTIONS() {
	return new Response(null, { status: 204, headers: CORS });
}

export function GET({ url }) {
	const o = url.origin;
	const body = {
		issuer: o,
		authorization_endpoint: `${o}/oauth/authorize`,
		token_endpoint: `${o}/oauth/token`,
		registration_endpoint: `${o}/oauth/register`,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		token_endpoint_auth_methods_supported: ['none'],
		scopes_supported: ['mcp']
	};
	return new Response(JSON.stringify(body), {
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS }
	});
}
