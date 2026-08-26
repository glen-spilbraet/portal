/** RFC 9728 — tells an MCP client which authorization server protects /mcp. */
const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version'
};

export function OPTIONS() {
	return new Response(null, { status: 204, headers: CORS });
}

export function GET({ url }) {
	const body = {
		resource: `${url.origin}/mcp`,
		authorization_servers: [url.origin]
	};
	return new Response(JSON.stringify(body), {
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS }
	});
}
