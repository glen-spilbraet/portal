/**
 * Remote MCP server (Streamable HTTP, JSON-RPC 2.0) exposing read-only portal
 * data to Claude. Tools are gated by the caller's portal permissions:
 *   - product sales sheets   (perms.sheets)
 *   - awards & press         (perms.awards)
 *   - sales / reporting + forecasts (admins only in v1; read SALES_DB)
 *
 * Auth: an OAuth 2.1 bearer token (claude.ai / Desktop, org-locked to
 * allowed_users) OR the shared `MCP_API_KEY` (Claude Code CLI → full access).
 *
 * Connect from Claude Code:
 *   claude mcp add --transport http portal https://<portal>/mcp \
 *     --header "Authorization: Bearer <MCP_API_KEY>"
 */
import { searchProducts, getProductBySku, getProductImageBytes } from '$lib/server/mcpProducts.js';
import { getProductPress, listPress, listMediaOutlets, getMediaDetail } from '$lib/server/mcpAwards.js';
import { runSalesQuery, salesMarketTotals, forecastAccuracy, salesSyncMeta, salesSchema } from '$lib/server/mcpSales.js';
import { HUBSPOT_SCHEMA_DOC, hubspotSearch, hubspotGet } from '$lib/server/mcpHubspot.js';
import { validateAccessToken } from '$lib/server/mcpOauth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'spilbraet-portal', version: '1.2.0' };

// Shown to the client/model right after connect. This is what lets people ask in
// plain language ("what did bookstores buy most, Aug–Oct year over year?")
// without knowing any tool names — it tells the model when and how to use them.
const SERVER_INSTRUCTIONS = [
	'This server exposes Spilbræt portal data: product sales sheets, awards & press, and (for admins) sales figures, line items, forecasts, and LIVE HubSpot CRM (deals/companies/contacts).',
	'',
	'Answer data questions by CALLING these tools yourself — never ask the user for tool names, SQL, SKUs, dates or segment codes; infer them from the request.',
	'',
	'For any sales / revenue / best-seller / customer / publisher / "how much did X buy" / year-over-year question: FIRST call `sales_schema` (it returns the tables, columns, the live customer-segment values, and worked examples), then build and run a `sales_query`. `sales_schema` tells you how to map plain-language terms (e.g. "bookstores", "toy shops", "year over year", "most purchased") to the real columns and values — the segment values are often in Danish.',
	'`sales_market_totals` and `forecast_accuracy` are quick shortcuts for those specific asks; anything else goes through `sales_query`.',
	'',
	'The sales tools cover INVOICED deals only (the mirror). For LIVE / not-yet-invoiced data — uninvoiced or open orders, "what\'s in the pipeline", deals by stage, a company/contact lookup in HubSpot — call `hubspot_schema` first, then `hubspot_search` (or `hubspot_get` for one record by id). hubspot_schema explains how "uninvoiced order" is defined. Prefer the sales tools for historical/aggregate questions, HubSpot for current state.',
	'',
	'For product info (descriptions, images, specs) use search_products / get_product / get_product_image. For awards & reviews use the press/media tools.',
	'',
	'Amounts are DKK. The sales data is invoiced deals only. When you present a report, note the date range and, if useful, call `sales_sync_meta` for a "data as of" line.'
].join('\n');

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
	},
	// ── Sales / reporting (admins only) ──────────────────────────────────────
	{
		name: 'sales_schema',
		description: 'Start here for ANY sales/revenue/best-seller/customer/publisher/forecast question. Returns the sales database tables and columns, the live customer-segment values (bookstores, toy shops, etc. — often in Danish, so you can map the user\'s wording), the date/units/year-over-year conventions, and worked example queries. Call this first, then write a sales_query.',
		inputSchema: { type: 'object', properties: {} }
	},
	{
		name: 'sales_query',
		description: 'Run a single read-only SQL SELECT against the sales database and return the rows — the main tool for sales reports. Handles anything: best-selling / most-purchased products (by units or DKK), revenue by customer / segment / group / country / market, per-publisher analysis, year-over-year comparisons, credit notes, top customers, what a given store bought, etc. Always call sales_schema first so you use the real column names and segment values. SELECT/WITH only, single statement; results are capped.',
		inputSchema: {
			type: 'object',
			properties: { sql: { type: 'string', description: 'A single SELECT (or WITH … SELECT) statement. No semicolons, no writes.' } },
			required: ['sql']
		}
	},
	{
		name: 'sales_market_totals',
		description: 'Revenue (DKK) and deal count per market (Denmark, Sweden, Norway, International) for an inclusive date range, with optional owner/level/group/country filters. Quick pre-built summary — for anything more specific use sales_query.',
		inputSchema: {
			type: 'object',
			properties: {
				from: { type: 'string', description: 'Start date, inclusive (YYYY-MM-DD).' },
				to: { type: 'string', description: 'End date, inclusive (YYYY-MM-DD).' },
				owner: { type: 'string', description: 'Filter by owner email.' },
				level: { type: 'string', description: 'Filter by customer level.' },
				group: { type: 'string', description: 'Filter by customer group.' },
				country: { type: 'string', description: 'Filter by country.' }
			},
			required: ['from', 'to']
		}
	},
	{
		name: 'forecast_accuracy',
		description: 'Completed-forecast accuracy in units: forecasted vs actual units at SKU level, rolled up by customer, owner or product, with attainment % and over/under bias.',
		inputSchema: {
			type: 'object',
			properties: {
				view: { type: 'string', enum: ['customers', 'owners', 'products'], description: 'How to roll up (default customers).' },
				owner: { type: 'string', description: 'Filter to one owner email.' },
				years: { type: 'array', items: { type: 'string' }, description: 'Filter to forecast-window years, e.g. ["2025","2026"].' },
				limit: { type: 'number', description: 'Max rows (default 50, max 200).' }
			}
		}
	},
	{
		name: 'sales_sync_meta',
		description: 'When the sales data was last synced from HubSpot and how many deals it holds (use for a "data as of …" note).',
		inputSchema: { type: 'object', properties: {} }
	},
	// ── Live HubSpot (admins only) ────────────────────────────────────────────
	{
		name: 'hubspot_schema',
		description: 'Start here for ANY question about LIVE/current HubSpot data — uninvoiced or open orders, deals by stage/pipeline, "what\'s in the pipeline", company/contact lookups. Returns the objects, key properties, conventions (e.g. how "uninvoiced order" is defined) and search examples. Then call hubspot_search. Use this instead of sales_query when the data is not yet invoiced (the sales mirror is invoiced-only).',
		inputSchema: { type: 'object', properties: {} }
	},
	{
		name: 'hubspot_search',
		description: 'Run a read-only HubSpot CRM search (deals / companies / contacts / line_items) with filters + sorting. The main tool for live questions like "big uninvoiced orders", "deals closing this month", "companies in Norway". Call hubspot_schema first for property names and the filter format.',
		inputSchema: {
			type: 'object',
			properties: {
				object: { type: 'string', enum: ['deals', 'companies', 'contacts', 'line_items'], description: 'Which object (default deals).' },
				filterGroups: { type: 'array', description: 'HubSpot v3 search filterGroups: OR of groups, each an AND of {propertyName, operator, value}.' },
				properties: { type: 'array', items: { type: 'string' }, description: 'Properties to return.' },
				sorts: { type: 'array', description: 'e.g. [{propertyName:"amount_in_home_currency", direction:"DESCENDING"}].' },
				limit: { type: 'number', description: 'Max results (default 25, max 100).' },
				after: { type: 'string', description: 'Paging cursor from a previous result\'s "next".' }
			}
		}
	},
	{
		name: 'hubspot_get',
		description: 'Fetch one HubSpot object by id with chosen properties and optional associations (e.g. a deal with its line_items and companies).',
		inputSchema: {
			type: 'object',
			properties: {
				object: { type: 'string', enum: ['deals', 'companies', 'contacts', 'line_items'], description: 'Which object (default deals).' },
				id: { type: 'string', description: 'The object id.' },
				properties: { type: 'array', items: { type: 'string' }, description: 'Properties to return.' },
				associations: { type: 'array', items: { type: 'string' }, description: 'Associated objects to include, e.g. ["line_items","companies"].' }
			},
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
// Sales/reporting tools are admin-only in v1 (they can read all sales data).
const SALES_TOOLS = new Set(['sales_schema', 'sales_query', 'sales_market_totals', 'forecast_accuracy', 'sales_sync_meta']);
// Live HubSpot tools — admin-only, same as sales.
const HUBSPOT_TOOLS = new Set(['hubspot_schema', 'hubspot_search', 'hubspot_get']);
function toolAllowed(name, { perms, isAdmin }) {
	if (SALES_TOOLS.has(name) || HUBSPOT_TOOLS.has(name)) return perms === null || isAdmin; // shared key or admin
	if (!perms) return true;
	if (SHEET_TOOLS.has(name)) return !!perms.sheets;
	if (AWARDS_TOOLS.has(name)) return !!perms.awards;
	return true;
}

/** The tools a given caller may see/use — so tools/list matches call-time gating. */
function visibleTools(ctx) {
	return TOOLS.filter((t) => toolAllowed(t.name, ctx));
}

async function callTool(name, args, ctx) {
	const { db, salesDb, platform, origin } = ctx;
	if (!toolAllowed(name, ctx)) {
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
	// ── Sales / reporting ────────────────────────────────────────────────────
	if (SALES_TOOLS.has(name) && !salesDb) {
		return { ...textContent('Sales database unavailable.'), isError: true };
	}
	if (name === 'sales_schema') {
		return textContent(await salesSchema(salesDb));
	}
	if (name === 'sales_query') {
		const out = await runSalesQuery(salesDb, args?.sql);
		if (out.error) return { ...textContent(out.error), isError: true };
		return textContent(out);
	}
	if (name === 'sales_market_totals') {
		const out = await salesMarketTotals(salesDb, args ?? {});
		if (out.error) return { ...textContent(out.error), isError: true };
		return textContent(out);
	}
	if (name === 'forecast_accuracy') {
		const out = await forecastAccuracy(salesDb, args ?? {});
		if (out.error) return { ...textContent(out.error), isError: true };
		return textContent(out);
	}
	if (name === 'sales_sync_meta') {
		return textContent(await salesSyncMeta(salesDb));
	}
	// ── Live HubSpot ──────────────────────────────────────────────────────────
	if (HUBSPOT_TOOLS.has(name)) {
		const token = platform?.env?.HUBSPOT_TOKEN;
		if (!token) return { ...textContent('HubSpot token not configured.'), isError: true };
		if (name === 'hubspot_schema') return textContent(HUBSPOT_SCHEMA_DOC);
		if (name === 'hubspot_search') {
			const out = await hubspotSearch(token, args ?? {});
			if (out.error) return { ...textContent(out.error), isError: true };
			return textContent(out);
		}
		if (name === 'hubspot_get') {
			const out = await hubspotGet(token, args ?? {});
			if (out.error) return { ...textContent(out.error), isError: true };
			return textContent(out);
		}
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
				serverInfo: SERVER_INFO,
				instructions: SERVER_INSTRUCTIONS
			});
		}
		if (method === 'ping') return rpc(id, {});
		if (method === 'tools/list') return rpc(id, { tools: visibleTools(ctx) });
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
	let isAdmin = false;
	let email = null;
	let authed = false;
	if (bearer && expected && bearer === expected) {
		authed = true; isAdmin = true; // legacy shared key → full access
	} else if (bearer) {
		const tok = await validateAccessToken(db, bearer);
		if (tok) {
			const user = await getAllowedUser(db, tok.email);
			if (user) {
				perms = await getUserPermissions(db, user);
				isAdmin = user.role === 'admin';
				email = tok.email;
				authed = true;
			}
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

	const ctx = { db, salesDb: platform?.env?.SALES_DB, platform, origin: url.origin, perms, isAdmin, email };
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
