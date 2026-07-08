/**
 * Forecast quantity log
 *
 * Snapshots line item quantities on HubSpot forecast deals into three
 * line item properties:
 *
 *   quantity_log_create   - when the line item is created
 *   quantity_log_1_month  - 1 month before the deal's forecast_start_date
 *   quantity_log_start    - on the deal's forecast_start_date
 *
 * Rules per field:
 *   - Before its trigger date: never touched.
 *   - On its trigger date: written, overwriting any pre-filled value.
 *   - After its trigger date: written only if still empty (backfill).
 *
 * Whenever a run changes anything on a deal's line items, a note is created
 * on that deal's timeline summarizing what was logged, per log type:
 *   "SKU: Product Name (Quantity)" per line item.
 *
 * Runs on a cron trigger every 15 minutes. Also exposes, protected by
 * ADMIN_KEY:
 *   POST /run            - manual run ("?dryRun=1" to preview without writing)
 *   GET  /pipelines      - list deal pipelines + stage ids (for configuration)
 */

interface Env {
	HUBSPOT_TOKEN: string;
	ADMIN_KEY: string;
	HUBSPOT_PIPELINE_ID?: string;
	FORECAST_STAGE_IDS?: string;
	TIMEZONE?: string;
}

const HUBSPOT_BASE = 'https://api.hubapi.com';

const LINE_ITEM_PROPS = [
	'quantity',
	'createdate',
	'name',
	'hs_sku',
	'quantity_log_create',
	'quantity_log_1_month',
	'quantity_log_start'
] as const;

/** HubSpot-defined association type: note -> deal */
const NOTE_TO_DEAL = 214;

interface Deal {
	id: string;
	properties: { dealname?: string; forecast_start_date?: string };
}

interface LineItem {
	id: string;
	properties: Partial<Record<(typeof LINE_ITEM_PROPS)[number], string>>;
}

interface LineItemUpdate {
	id: string;
	properties: Record<string, string>;
}

/** Per-deal list of "SKU: Product Name (Quantity)" lines, per log type. */
interface DealChangeLog {
	create: string[];
	oneMonth: string[];
	start: string[];
}

interface RunSummary {
	dryRun: boolean;
	today: string;
	dealsScanned: number;
	lineItemsScanned: number;
	lineItemsUpdated: number;
	dealsChanged: number;
	notesCreated: number;
	updates: Array<{ lineItemId: string; dealId: string; dealName?: string; properties: Record<string, string> }>;
	errors: string[];
}

export default {
	async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		ctx.waitUntil(
			runQuantityLog(env, false).then(
				(summary) =>
					console.log(
						`forecast-quantity-log: ${summary.dealsScanned} deals, ` +
							`${summary.lineItemsScanned} line items scanned, ` +
							`${summary.lineItemsUpdated} updated, ` +
							`${summary.notesCreated}/${summary.dealsChanged} deal notes created` +
							(summary.errors.length ? `, errors: ${summary.errors.join(' | ')}` : '')
					),
				(err) => console.error('forecast-quantity-log failed:', err)
			)
		);
	},

	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		const auth = request.headers.get('authorization') ?? '';
		if (!env.ADMIN_KEY || auth !== `Bearer ${env.ADMIN_KEY}`) {
			return json({ error: 'unauthorized' }, 401);
		}

		try {
			if (request.method === 'POST' && url.pathname === '/run') {
				const dryRun = url.searchParams.get('dryRun') === '1';
				const summary = await runQuantityLog(env, dryRun);
				return json(summary);
			}

			if (request.method === 'GET' && url.pathname === '/pipelines') {
				const data = await hubspot(env, 'GET', '/crm/v3/pipelines/deals');
				const pipelines = (data.results ?? []).map((p: any) => ({
					id: p.id,
					label: p.label,
					stages: (p.stages ?? []).map((s: any) => ({ id: s.id, label: s.label }))
				}));
				return json({ pipelines });
			}
		} catch (err) {
			return json({ error: String(err) }, 500);
		}

		return json({ error: 'not found' }, 404);
	}
};

async function runQuantityLog(env: Env, dryRun: boolean): Promise<RunSummary> {
	const tz = env.TIMEZONE?.trim() || 'Europe/Copenhagen';
	const today = dateInTz(new Date(), tz);

	const summary: RunSummary = {
		dryRun,
		today,
		dealsScanned: 0,
		lineItemsScanned: 0,
		lineItemsUpdated: 0,
		dealsChanged: 0,
		notesCreated: 0,
		updates: [],
		errors: []
	};

	const deals = await fetchForecastDeals(env);
	summary.dealsScanned = deals.length;
	if (deals.length === 0) return summary;

	const lineItemIdsByDeal = await fetchLineItemAssociations(
		env,
		deals.map((d) => d.id)
	);
	const allLineItemIds = [...new Set([...lineItemIdsByDeal.values()].flat())];
	const lineItems = await batchReadLineItems(env, allLineItemIds);
	summary.lineItemsScanned = lineItems.size;

	// Keyed by line item id so an item shared between deals is only updated once.
	const updates = new Map<string, LineItemUpdate>();
	// Per-deal change summary, used for the timeline note.
	const dealChanges = new Map<string, DealChangeLog>();

	for (const deal of deals) {
		const startDate = normalizeDate(deal.properties.forecast_start_date, tz);
		const oneMonthDate = startDate ? minusOneMonth(startDate) : null;

		for (const lineItemId of lineItemIdsByDeal.get(deal.id) ?? []) {
			const item = lineItems.get(lineItemId);
			if (!item) continue;

			const quantity = item.properties.quantity?.trim() || '0';
			const createdDate = normalizeDate(item.properties.createdate, tz);
			const properties: Record<string, string> = {};

			const createVal = decide(item.properties.quantity_log_create, today, createdDate, quantity);
			if (createVal !== null) properties.quantity_log_create = createVal;

			const oneMonthVal = decide(item.properties.quantity_log_1_month, today, oneMonthDate, quantity);
			if (oneMonthVal !== null) properties.quantity_log_1_month = oneMonthVal;

			const startVal = decide(item.properties.quantity_log_start, today, startDate, quantity);
			if (startVal !== null) properties.quantity_log_start = startVal;

			if (Object.keys(properties).length > 0) {
				updates.set(lineItemId, { id: lineItemId, properties });
				summary.updates.push({
					lineItemId,
					dealId: deal.id,
					dealName: deal.properties.dealname,
					properties
				});

				let changeLog = dealChanges.get(deal.id);
				if (!changeLog) {
					changeLog = { create: [], oneMonth: [], start: [] };
					dealChanges.set(deal.id, changeLog);
				}
				const sku = item.properties.hs_sku?.trim();
				const name = item.properties.name?.trim() || `Line item ${lineItemId}`;
				const label = `${sku ? `${sku}: ` : ''}${name} (${quantity})`;
				if (properties.quantity_log_create !== undefined) changeLog.create.push(label);
				if (properties.quantity_log_1_month !== undefined) changeLog.oneMonth.push(label);
				if (properties.quantity_log_start !== undefined) changeLog.start.push(label);
			}
		}
	}

	if (!dryRun) {
		await batchUpdateLineItems(env, [...updates.values()], summary.errors);
		summary.notesCreated = await createDealNotes(env, dealChanges, today, summary.errors);
	}
	summary.lineItemsUpdated = updates.size;
	summary.dealsChanged = dealChanges.size;

	// Keep the response payload bounded on large backfills.
	if (summary.updates.length > 500) {
		summary.updates = summary.updates.slice(0, 500);
	}

	return summary;
}

/**
 * Decides what to write for one log field.
 *
 *   - trigger date unknown or in the future -> null (leave untouched)
 *   - field empty and trigger date reached  -> fill with current quantity
 *   - field pre-filled, but today IS the trigger date -> overwrite
 *   - field filled and trigger date passed  -> null (historical value is kept)
 */
export function decide(
	existing: string | undefined,
	today: string,
	triggerDate: string | null,
	value: string
): string | null {
	if (!triggerDate || today < triggerDate) return null;
	const isEmpty = existing === undefined || existing === null || existing.trim() === '';
	if (isEmpty) return value;
	if (today === triggerDate && existing.trim() !== value) return value;
	return null;
}

/** "2027-01-01" -> "2026-12-01", clamping the day to the target month's length. */
export function minusOneMonth(isoDate: string): string {
	const [y, m, d] = isoDate.split('-').map(Number);
	const year = m === 1 ? y - 1 : y;
	const month = m === 1 ? 12 : m - 1;
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	const day = Math.min(d, lastDay);
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Normalizes a HubSpot property value to a local "YYYY-MM-DD" string.
 * Date properties arrive as "2027-01-01", datetimes as ISO strings,
 * and some payloads use epoch milliseconds.
 */
export function normalizeDate(value: string | undefined, tz: string): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
	const date = /^\d+$/.test(trimmed) ? new Date(Number(trimmed)) : new Date(trimmed);
	if (isNaN(date.getTime())) return null;
	return dateInTz(date, tz);
}

function dateInTz(date: Date, tz: string): string {
	// en-CA formats as YYYY-MM-DD
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(date);
}

/**
 * Fetches deals to process:
 *   - deals in the configured Forecast stage(s), and/or
 *   - any deal in the pipeline with forecast_start_date set
 *     (catches forecasts that already started and moved to another stage)
 */
async function fetchForecastDeals(env: Env): Promise<Deal[]> {
	const pipelineId = env.HUBSPOT_PIPELINE_ID?.trim();
	const stageIds = (env.FORECAST_STAGE_IDS ?? '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);

	const pipelineFilter = pipelineId
		? [{ propertyName: 'pipeline', operator: 'EQ', value: pipelineId }]
		: [];

	const filterGroups: unknown[] = [];
	if (stageIds.length > 0) {
		filterGroups.push({
			filters: [...pipelineFilter, { propertyName: 'dealstage', operator: 'IN', values: stageIds }]
		});
	}
	filterGroups.push({
		filters: [...pipelineFilter, { propertyName: 'forecast_start_date', operator: 'HAS_PROPERTY' }]
	});

	const deals: Deal[] = [];
	let after: string | undefined;
	for (let page = 0; page < 100; page++) {
		const body: Record<string, unknown> = {
			filterGroups,
			properties: ['dealname', 'forecast_start_date'],
			limit: 100
		};
		if (after) body.after = after;
		const data = await hubspot(env, 'POST', '/crm/v3/objects/deals/search', body);
		deals.push(...(data.results ?? []));
		after = data.paging?.next?.after;
		if (!after) break;
	}
	return deals;
}

/** Returns dealId -> line item ids. */
async function fetchLineItemAssociations(env: Env, dealIds: string[]): Promise<Map<string, string[]>> {
	const map = new Map<string, string[]>();
	for (const batch of chunk(dealIds, 100)) {
		const data = await hubspot(env, 'POST', '/crm/v4/associations/deals/line_items/batch/read', {
			inputs: batch.map((id) => ({ id }))
		});
		for (const result of data.results ?? []) {
			map.set(
				String(result.from.id),
				(result.to ?? []).map((t: any) => String(t.toObjectId))
			);
		}
	}
	return map;
}

async function batchReadLineItems(env: Env, ids: string[]): Promise<Map<string, LineItem>> {
	const map = new Map<string, LineItem>();
	for (const batch of chunk(ids, 100)) {
		const data = await hubspot(env, 'POST', '/crm/v3/objects/line_items/batch/read', {
			properties: LINE_ITEM_PROPS,
			inputs: batch.map((id) => ({ id }))
		});
		for (const item of data.results ?? []) {
			map.set(String(item.id), item);
		}
	}
	return map;
}

/** Creates one timeline note per changed deal summarizing what was logged. */
async function createDealNotes(
	env: Env,
	dealChanges: Map<string, DealChangeLog>,
	today: string,
	errors: string[]
): Promise<number> {
	const inputs = [...dealChanges.entries()].map(([dealId, changeLog]) => ({
		properties: {
			hs_timestamp: new Date().toISOString(),
			hs_note_body: buildNoteBody(changeLog, today)
		},
		associations: [
			{
				to: { id: dealId },
				types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: NOTE_TO_DEAL }]
			}
		]
	}));

	let created = 0;
	for (const batch of chunk(inputs, 100)) {
		try {
			await hubspot(env, 'POST', '/crm/v3/objects/notes/batch/create', { inputs: batch });
			created += batch.length;
		} catch (err) {
			errors.push(String(err));
		}
	}
	return created;
}

export function buildNoteBody(changeLog: DealChangeLog, today: string): string {
	const sections: Array<[string, string[]]> = [
		['On line item creation, logged quantity to be:', changeLog.create],
		['1 month before start, logged quantity to be:', changeLog.oneMonth],
		['At forecast start, logged quantity to be:', changeLog.start]
	];
	let html = `<strong>Forecast quantity log</strong> &mdash; ${today}`;
	for (const [heading, entries] of sections) {
		if (entries.length === 0) continue;
		html += `<br><br><strong>${heading}</strong><br>${entries.map(escapeHtml).join('<br>')}`;
	}
	return html;
}

function escapeHtml(text: string): string {
	return text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

async function batchUpdateLineItems(env: Env, updates: LineItemUpdate[], errors: string[]): Promise<void> {
	for (const batch of chunk(updates, 100)) {
		try {
			await hubspot(env, 'POST', '/crm/v3/objects/line_items/batch/update', { inputs: batch });
		} catch (err) {
			errors.push(String(err));
		}
	}
}

async function hubspot(env: Env, method: string, path: string, body?: unknown): Promise<any> {
	const response = await fetch(`${HUBSPOT_BASE}${path}`, {
		method,
		headers: {
			authorization: `Bearer ${env.HUBSPOT_TOKEN}`,
			'content-type': 'application/json'
		},
		body: body === undefined ? undefined : JSON.stringify(body)
	});
	if (!response.ok) {
		const text = await response.text();
		throw new Error(`HubSpot ${method} ${path} -> ${response.status}: ${text.slice(0, 500)}`);
	}
	return response.json();
}

function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}
