/**
 * Remote MCP server (Streamable HTTP, JSON-RPC 2.0) exposing read-only access to
 * portal sales-sheet data. Auth: `Authorization: Bearer <MCP_API_KEY>`.
 *
 * Connect from Claude Code:
 *   claude mcp add --transport http portal https://<portal>/mcp \
 *     --header "Authorization: Bearer <MCP_API_KEY>"
 */
import { searchProducts, getProductBySku, getProductImageBytes } from '$lib/server/mcpProducts.js';
import { getProductPress, listPress, listMediaOutlets, getMediaDetail } from '$lib/server/mcpAwards.js';
import { validateAccessToken } from '$lib/server/mcpOauth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'spilbraet-portal', version: '1.0.0' };

const TOOLS = [
	{
		name: 'search_products',
		description: 'Search sales sheets by SKU, product name (any language) or EAN. Returns matching products with their SKU, name and status.',
		inputSchema: {
			type: 'object',
			properties: { query: { type: 'string', description: 'Search text — part of a SKU, product name or EAN.' } },
			required: ['query']
		}
	},
	{
		name: 'get_product',
		description: 'Get everything on a product sales sheet by SKU: name, description, USP bullet points, attributes (age, play time, players, dimensions, weight, EAN, stock date), image URLs and YouTube link. Text is returned in the requested language (defaults to the sheet primary language).',
		inputSchema: {
			type: 'object',
			properties: {
				sku: { type: 'string', description: 'Exact product SKU.' },
				language: { type: 'string', enum: ['en', 'da', 'sv', 'no'], description: 'Language for name/description/bullets. Defaults to the sheet primary language.' }
			},
			required: ['sku']
		}
	},
	{
		name: 'get_product_image',
		description: "Return the actual image bytes for a product (so you can see it). By default the box image; pass a gallery index (as a string, e.g. '0') for a gallery image.",
		inputSchema: {
			type: 'object',
			properties: {
				sku: { type: 'string', description: 'Exact product SKU.' },
				which: { type: 'string', description: "'box' (default) or a gallery image index like '0', '1'." }
			},
			required: ['sku']
		}
	},
	{
		name: 'get_product_press',
		description: 'Get all awards & press for a product by SKU: nominations, wins and reviews. Each entry has the media outlet, award category, whether it was nominated / won, the event and disclosure dates, a proof link, badge image URLs, and any review statements with their scores.',
		inputSchema: {
			type: 'object',
			properties: { sku: { type: 'string', description: 'Exact product SKU.' } },
			required: ['sku']
		}
	},
	{
		name: 'list_press',
		description: 'List recent awards & press instances across all products (newest first). Optionally filter by date range and/or media outlet name.',
		inputSchema: {
			type: 'object',
			properties: {
				from: { type: 'string', description: 'Only include instances on/after this date (YYYY-MM-DD).' },
				to: { type: 'string', description: 'Only include instances on/before this date (YYYY-MM-DD).' },
				media: { type: 'string', description: 'Filter by media outlet name (partial match).' },
				limit: { type: 'number', description: 'Max results (default 50, max 200).' }
			}
		}
	},
	{
		name: 'list_media',
		description: 'List the media outlets (award shows / press) with their country, review scale and how many contacts and press instances each has.',
		inputSchema: { type: 'object', properties: {} }
	},
	{
		name: 'get_media',
		description: 'Get one media outlet by id: details, review scale, badge-placement config and contacts (name, email, phone, role).',
		inputSchema: {
			type: 'object',
			properties: { id: { type: 'string', description: 'Media id (from list_media).' } },
			required: ['id']
		}
	}
];

function rpc(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }
function textContent(obj) { return { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] }; }

// Which permission each tool requires. `perms === null` means full access
// (legacy MCP_API_KEY); otherwise gate by the OAuth user's portal permissions.
const SHEET_TOOLS = new Set(['search_products', 'get_product', 'get_product_image']);
const AWARDS_TOOLS = new Set(['get_product_press', 'list_press', 'list_media', 'get_media']);
function toolAllowed(name, perms) {
	if (!perms) return true;
	if (SHEET_TOOLS.has(name)) return !!perms.sheets;
	if (AWARDS_TOOLS.has(name)) return !!perms.awards;
	return true;
}

async function callTool(name, args, { db, platform, origin, perms }) {
	if (!toolAllowed(name, perms)) {
		return { ...textContent(`Your account does not have access to "${name}".`), isError: true };
	}
	if (name === 'search_products') {
		const results = await searchProducts(db, args?.query ?? '');
		return textContent({ count: results.length, results });
	}
	if (name === 'get_product') {
		if (!args?.sku) return { ...textContent('Missing required argument: sku'), isError: true };
		const product = await getProductBySku(db, args.sku, args.language, origin);
		if (!product) return { ...textContent(`No product found with SKU ${args.sku}`), isError: true };
		return textContent(product);
	}
	if (name === 'get_product_image') {
		if (!args?.sku) return { ...textContent('Missing required argument: sku'), isError: true };
		const img = await getProductImageBytes(platform, db, args.sku, args.which ?? 'box');
		if (img.error) return { ...textContent(img.error), isError: true };
		return { content: [{ type: 'image', data: img.base64, mimeType: img.mimeType }] };
	}
	if (name === 'get_product_press') {
		if (!args?.sku) return { ...textContent('Missing required argument: sku'), isError: true };
		const press = await getProductPress(db, args.sku, origin);
		return textContent({ sku: args.sku, count: press.length, press });
	}
	if (name === 'list_press') {
		const press = await listPress(db, { from: args?.from, to: args?.to, media: args?.media, limit: args?.limit }, origin);
		return textContent({ count: press.length, press });
	}
	if (name === 'list_media') {
		const media = await listMediaOutlets(db);
		return textContent({ count: media.length, media });
	}
	if (name === 'get_media') {
		if (!args?.id) return { ...textContent('Missing required argument: id'), isError: true };
		const media = await getMediaDetail(db, args.id);
		if (!media) return { ...textContent(`No media found with id ${args.id}`), isError: true };
		return textContent(media);
	}
	return { ...textContent(`Unknown tool: ${name}`), isError: true };
}

async function handleMessage(msg, ctx) {
	const { id, method, params } = msg ?? {};
	// Notifications (no id) — acknowledge without a response body.
	if (id === undefined || id === null) return null;

	try {
		if (method === 'initialize') {
			return rpc(id, {
				protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
				capabilities: { tools: {} },
				serverInfo: SERVER_INFO
			});
		}
		if (method === 'ping') return rpc(id, {});
		if (method === 'tools/list') return rpc(id, { tools: TOOLS });
		if (method === 'tools/call') {
			const result = await callTool(params?.name, params?.arguments ?? {}, ctx);
			return rpc(id, result);
		}
		return rpcError(id, -32601, `Method not found: ${method}`);
	} catch (e) {
		return rpcError(id, -32603, `Internal error: ${e?.message ?? e}`);
	}
}

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version',
	'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id'
};

export async function OPTIONS() {
	return new Response(null, { status: 204, headers: CORS });
}

// Streamable HTTP: no server-initiated stream offered here.
export async function GET() {
	return new Response('Method Not Allowed', { status: 405, headers: { ...CORS, Allow: 'POST' } });
}

export async function POST({ request, platform, url }) {
	const db = platform?.env?.DB;
	if (!db) {
		return new Response(JSON.stringify(rpcError(null, -32603, 'Database unavailable')), {
			status: 500,
			headers: { 'Content-Type': 'application/json', ...CORS }
		});
	}

	// Auth: OAuth bearer token (claude.ai / Desktop) OR the legacy shared key
	// (Claude Code). `perms === null` → full access (shared key); an OAuth token
	// resolves to a portal user whose permissions gate the tools.
	const expected = platform?.env?.MCP_API_KEY;
	const auth = request.headers.get('authorization') ?? '';
	const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;

	let perms = null;
	let authed = false;
	if (bearer && expected && bearer === expected) {
		authed = true; // legacy shared key → full access
	} else if (bearer) {
		const tok = await validateAccessToken(db, bearer);
		if (tok) {
			const user = await getAllowedUser(db, tok.email);
			if (user) { perms = await getUserPermissions(db, user); authed = true; }
		}
	}
	if (!authed) {
		return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized' } }), {
			status: 401,
			headers: {
				'Content-Type': 'application/json',
				'WWW-Authenticate': `Bearer resource_metadata="${url.origin}/.well-known/oauth-protected-resource"`,
				...CORS
			}
		});
	}

	let body;
	try { body = await request.json(); } catch {
		return new Response(JSON.stringify(rpcError(null, -32700, 'Parse error')), {
			status: 400,
			headers: { 'Content-Type': 'application/json', ...CORS }
		});
	}

	const ctx = { db, platform, origin: url.origin, perms };
	const isBatch = Array.isArray(body);
	const messages = isBatch ? body : [body];
	const responses = [];
	for (const m of messages) {
		const r = await handleMessage(m, ctx);
		if (r) responses.push(r);
	}

	// Only notifications → 202 with no body.
	if (responses.length === 0) return new Response(null, { status: 202, headers: CORS });

	const payload = isBatch ? responses : responses[0];
	return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } });
}
