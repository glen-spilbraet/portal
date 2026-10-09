/**
 * MCP HubSpot tools — live, read-only CRM access for the MCP (admins only).
 * The portal already holds HUBSPOT_TOKEN. Use these for CURRENT data the sales
 * mirror doesn't have: uninvoiced/open orders, deals by stage, company/contact
 * lookups. (The sales_query tools cover INVOICED history only.)
 */

const HS = 'https://api.hubapi.com';
const OBJECTS = ['deals', 'companies', 'contacts', 'line_items'];
const DEFAULT_PROPS = {
	deals: ['dealname', 'amount', 'amount_in_home_currency', 'deal_currency_code', 'dealstage', 'pipeline', 'closedate', 'createdate', 'hs_is_closed_won', 'hs_is_closed', 'auto_imported', 'rackbeat_id', 'hubspot_owner_id'],
	companies: ['name', 'domain', 'country', 'city', 'zip', 'rackbeat_id', 'hubspot_owner_id'],
	contacts: ['firstname', 'lastname', 'email', 'phone', 'jobtitle'],
	line_items: ['name', 'hs_sku', 'quantity', 'price', 'amount'],
};

async function hs(token, method, path, body) {
	const res = await fetch(`${HS}${path}`, {
		method,
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) {
		let d = ''; try { d = (await res.text()).slice(0, 300); } catch { /* ignore */ }
		throw new Error(`HubSpot ${res.status} ${d}`);
	}
	return res.json();
}

/** Schema + domain knowledge so the model can write correct hubspot_search calls. */
export const HUBSPOT_SCHEMA_DOC = {
	about: 'Live HubSpot CRM (read-only). Use for CURRENT data the sales mirror does not have — uninvoiced/open orders, deals by stage, pipeline, company/contact lookups. sales_query covers INVOICED history only.',
	objects: {
		deals: 'orders/deals. Key props: ' + DEFAULT_PROPS.deals.join(', '),
		companies: 'customers. Key props: ' + DEFAULT_PROPS.companies.join(', '),
		contacts: 'people. Key props: ' + DEFAULT_PROPS.contacts.join(', '),
		line_items: 'deal lines. Key props: ' + DEFAULT_PROPS.line_items.join(', '),
	},
	conventions: [
		'Money: `amount_in_home_currency` = DKK; `amount` = the deal\'s own currency.',
		'`auto_imported` = "true" means the deal has been imported/invoiced into Rackbeat (it then appears in the sales mirror). So UNINVOICED = `auto_imported` NEQ "true".',
		'`hs_is_closed_won` = "true" for won deals; `hs_is_closed` = "true" for won OR lost. Closed-LOST = hs_is_closed "true" AND hs_is_closed_won "false".',
		'An UNINVOICED ORDER = a won deal not yet invoiced: `hs_is_closed_won` EQ "true" AND `auto_imported` NEQ "true". "Big" = high `amount_in_home_currency`.',
		'`rackbeat_id` = the Rackbeat order/invoice id once transferred. Dates (closedate/createdate) are epoch-ms or ISO.',
	],
	how_to_search: 'hubspot_search uses HubSpot v3 search: filterGroups = OR of groups, each group = AND of filters {propertyName, operator, value}. Operators: EQ, NEQ, GT, GTE, LT, LTE, BETWEEN (value+highValue), IN (values[]), HAS_PROPERTY, NOT_HAS_PROPERTY, CONTAINS_TOKEN. Sort: sorts:[{propertyName, direction:"DESCENDING"}]. Always pass the `properties` you want back. Resolve hubspot_owner_id to a name only if asked.',
	examples: [
		'Big uninvoiced orders: hubspot_search {object:"deals", filterGroups:[{filters:[{propertyName:"hs_is_closed_won",operator:"EQ",value:"true"},{propertyName:"auto_imported",operator:"NEQ",value:"true"},{propertyName:"amount_in_home_currency",operator:"GTE",value:"20000"}]}], properties:["dealname","amount_in_home_currency","dealstage","closedate","hubspot_owner_id"], sorts:[{propertyName:"amount_in_home_currency",direction:"DESCENDING"}], limit:25}',
		'A company by name: hubspot_search {object:"companies", filterGroups:[{filters:[{propertyName:"name",operator:"CONTAINS_TOKEN",value:"Proshop"}]}], properties:["name","country","rackbeat_id"]}',
		'One deal with its line items: hubspot_get {object:"deals", id:"508102277349", associations:["line_items","companies"]}',
	],
};

export async function hubspotSearch(token, args) {
	const object = OBJECTS.includes(args?.object) ? args.object : 'deals';
	const limit = Math.min(Math.max(Number(args?.limit) || 25, 1), 100);
	const body = {
		filterGroups: Array.isArray(args?.filterGroups) ? args.filterGroups : [],
		properties: Array.isArray(args?.properties) && args.properties.length ? args.properties : DEFAULT_PROPS[object],
		limit,
		...(Array.isArray(args?.sorts) && args.sorts.length ? { sorts: args.sorts } : {}),
		...(args?.after ? { after: String(args.after) } : {}),
	};
	let data;
	try { data = await hs(token, 'POST', `/crm/v3/objects/${object}/search`, body); }
	catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
	return {
		object,
		total: data.total ?? null,
		count: data.results?.length ?? 0,
		next: data.paging?.next?.after ?? null,
		results: (data.results ?? []).map((r) => ({ id: r.id, properties: r.properties })),
	};
}

// ── Write: bulk import deals + line items ────────────────────────────────────
// The MODEL normalises/validates the data first (decimals, Excel date serials,
// grouping into one deal per import_id) and runs dry_run before a real write.
const LINE_ITEM_TO_DEAL = 20; // HUBSPOT_DEFINED association type id

async function hsOwners(token) {
	const map = {};
	let after = '';
	do {
		const data = await hs(token, 'GET', `/crm/v3/owners?limit=100${after ? `&after=${after}` : ''}`);
		for (const o of data.results ?? []) {
			const name = `${o.firstName ?? ''} ${o.lastName ?? ''}`.trim().toLowerCase();
			if (name) map[name] = o.id;
			if (o.email) map[o.email.toLowerCase()] = o.id;
		}
		after = data.paging?.next?.after ?? '';
	} while (after);
	return map;
}

async function hsPipelines(token) {
	const data = await hs(token, 'GET', '/crm/v3/pipelines/deals');
	const byName = {};
	for (const p of data.results ?? []) {
		const stages = {};
		for (const s of p.stages ?? []) { stages[(s.label || '').toLowerCase()] = s.id; stages[s.id] = s.id; }
		const entry = { id: p.id, stages };
		byName[(p.label || '').toLowerCase()] = entry;
		byName[p.id] = entry;
	}
	return byName;
}

async function hsDealPropNames(token) {
	const data = await hs(token, 'GET', '/crm/v3/properties/deals?archived=false');
	return new Set((data.results ?? []).map((p) => p.name));
}

async function ensureImportIdProperty(token, propNames) {
	if (propNames.has('import_id')) return true;
	try {
		await hs(token, 'POST', '/crm/v3/properties/deals', {
			name: 'import_id', label: 'Import ID', type: 'string', fieldType: 'text',
			groupName: 'dealinformation', description: 'Key used by the portal bulk import to prevent duplicate deals.',
		});
		propNames.add('import_id');
		return true;
	} catch { return false; }
}

async function findCompanyByRackbeat(token, rackbeatId) {
	const data = await hs(token, 'POST', '/crm/v3/objects/companies/search', {
		filterGroups: [{ filters: [{ propertyName: 'rackbeat_id', operator: 'EQ', value: String(rackbeatId) }] }],
		properties: ['name', 'rackbeat_id'], limit: 3,
	});
	return data.results ?? [];
}

async function findDealByImportId(token, importId) {
	const data = await hs(token, 'POST', '/crm/v3/objects/deals/search', {
		filterGroups: [{ filters: [{ propertyName: 'import_id', operator: 'EQ', value: String(importId) }] }],
		properties: ['dealname'], limit: 1,
	});
	return data.results?.[0] ?? null;
}

function lineItemInputs(dealId, items) {
	return items.map((i) => {
		const props = { name: i.name || i.sku || 'Item', quantity: String(i.qty), price: String(i.price) };
		if (i.sku) props.hs_sku = i.sku;
		if (i.discPct != null) props.hs_discount_percentage = String(i.discPct);
		else if (i.discAmt != null) props.discount = String(i.discAmt);
		return { properties: props, associations: [{ to: { id: String(dealId) }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: LINE_ITEM_TO_DEAL }] }] };
	});
}

async function createLineItems(token, dealId, items) {
	const inputs = lineItemInputs(dealId, items);
	for (let j = 0; j < inputs.length; j += 100) {
		await hs(token, 'POST', '/crm/v3/objects/line_items/batch/create', { inputs: inputs.slice(j, j + 100) });
	}
}

function computeItems(lineItems) {
	return (lineItems ?? []).map((li) => {
		const qty = Number(li.quantity) || 0;
		const price = Number(li.unit_price) || 0;
		const gross = qty * price;
		let discPct = null, discAmt = null, net = gross;
		if (li.discount_is_percent && li.discount_value != null && li.discount_value !== '') {
			discPct = Number(li.discount_value) || 0; net = gross * (1 - discPct / 100);
		} else if (li.discount_value != null && li.discount_value !== '') {
			// HubSpot's line-item `discount` is a PER-UNIT amount, so net = (price - d) * qty.
			discAmt = Number(li.discount_value) || 0; net = (price - discAmt) * qty;
		}
		return { sku: li.sku ?? null, name: li.name ?? null, qty, price, discPct, discAmt, net: Math.round(net * 100) / 100 };
	});
}

/**
 * Bulk-create deals + line items from already-normalised, pre-grouped input.
 * Each deal: { import_id?, deal_id?, name, company_rackbeat_id, pipeline, stage,
 * currency, close_date?, delivery_date?, owner_name?, po_number?, line_items:
 * [{sku, name, quantity, unit_price, discount_value?, discount_is_percent?}] }.
 * `deal_id` set → APPEND line items to that existing deal (no deal create/update).
 * Dedupe: skips a create whose import_id already exists on a deal. dry_run (default
 * TRUE) resolves + computes without writing.
 */
export async function hubspotImportDeals(token, args) {
	const dryRun = args?.dry_run !== false;
	const deals = Array.isArray(args?.deals) ? args.deals : [];
	if (!deals.length) return { error: 'deals[] is required' };

	let owners, pipelines, propNames;
	try { owners = await hsOwners(token); } catch (e) { return { error: `owners lookup failed: ${e instanceof Error ? e.message : e}` }; }
	try { pipelines = await hsPipelines(token); } catch (e) { return { error: `pipelines lookup failed: ${e instanceof Error ? e.message : e}` }; }
	try { propNames = await hsDealPropNames(token); } catch (e) { return { error: `deal properties lookup failed: ${e instanceof Error ? e.message : e}` }; }
	if (!dryRun) await ensureImportIdProperty(token, propNames);

	const poProp = ['po_number', 'hs_po_number', 'ponumber', 'po'].find((p) => propNames.has(p)) ?? null;
	const hasDelivery = propNames.has('delivery_date');
	const today = new Date().toISOString().slice(0, 10);
	const results = [];
	let created = 0, appended = 0, skipped = 0, failed = 0;

	for (const d of deals) {
		const items = computeItems(d.line_items);
		const amount = Math.round(items.reduce((s, i) => s + i.net, 0) * 100) / 100;
		const r = { import_id: d.import_id ?? null, name: d.name ?? null, lines: items.length, amount, currency: d.currency ?? null, warnings: [] };
		try {
			const appendMode = d.deal_id != null && String(d.deal_id).trim() !== '';

			// Owner (warn, don't fail)
			let ownerId = null;
			if (d.owner_name) { ownerId = owners[String(d.owner_name).trim().toLowerCase()] ?? null; if (!ownerId) r.warnings.push(`owner not found: ${d.owner_name}`); }

			if (appendMode) {
				r.mode = 'append'; r.deal_id = String(d.deal_id);
				if (!dryRun) {
					await hs(token, 'GET', `/crm/v3/objects/deals/${encodeURIComponent(d.deal_id)}?properties=dealname`);
					await createLineItems(token, d.deal_id, items);
					appended++;
				}
				if (!r.warnings.length) delete r.warnings;
				results.push(r); continue;
			}

			// Resolve pipeline + stage
			const pl = d.pipeline ? pipelines[String(d.pipeline).toLowerCase()] : null;
			if (!pl) throw new Error(`pipeline not found: "${d.pipeline}"`);
			const stageId = pl.stages[String(d.stage ?? '').toLowerCase()] ?? null;
			if (!stageId) throw new Error(`stage not found in "${d.pipeline}": "${d.stage}"`);

			// Company by Rackbeat ID (the only match key)
			const comps = await findCompanyByRackbeat(token, d.company_rackbeat_id);
			if (!comps.length) throw new Error(`no company with Rackbeat ID ${d.company_rackbeat_id}`);
			if (comps.length > 1) r.warnings.push(`${comps.length} companies share Rackbeat ID ${d.company_rackbeat_id} — using first`);
			const companyId = comps[0].id;
			r.company = comps[0].properties?.name ?? null;

			// Dedupe by import_id
			if (d.import_id) {
				const existing = await findDealByImportId(token, d.import_id);
				if (existing) { r.mode = 'skipped'; r.deal_id = existing.id; r.reason = 'already imported (import_id match)'; skipped++; if (!r.warnings.length) delete r.warnings; results.push(r); continue; }
			}

			r.mode = 'create';
			r.close_date = d.close_date || today;
			if (d.po_number && !poProp) r.warnings.push('no PO property on deals — PO not written');
			if (d.delivery_date && !hasDelivery) r.warnings.push('no delivery_date property on deals — not written');

			if (!dryRun) {
				const props = {
					dealname: d.name, pipeline: pl.id, dealstage: stageId,
					closedate: d.close_date || today, amount: String(amount),
				};
				if (d.currency) props.deal_currency_code = d.currency;
				if (ownerId) props.hubspot_owner_id = ownerId;
				if (d.import_id) props.import_id = String(d.import_id);
				if (d.delivery_date && hasDelivery) props.delivery_date = d.delivery_date;
				if (d.po_number && poProp) props[poProp] = d.po_number;
				const createdDeal = await hs(token, 'POST', '/crm/v3/objects/deals', { properties: props });
				r.deal_id = createdDeal.id;
				await hs(token, 'PUT', `/crm/v4/objects/deals/${createdDeal.id}/associations/default/companies/${companyId}`);
				await createLineItems(token, createdDeal.id, items);
				created++;
			}
			if (!r.warnings.length) delete r.warnings;
			results.push(r);
		} catch (e) {
			r.mode = r.mode ?? 'error';
			r.error = e instanceof Error ? e.message : String(e);
			failed++;
			if (!r.warnings?.length) delete r.warnings;
			results.push(r);
		}
	}
	return { dry_run: dryRun, summary: { deals: deals.length, created, appended, skipped, failed }, results };
}

export async function hubspotGet(token, args) {
	const object = OBJECTS.includes(args?.object) ? args.object : 'deals';
	const id = String(args?.id ?? '').trim();
	if (!id) return { error: 'id is required' };
	const props = (Array.isArray(args?.properties) && args.properties.length ? args.properties : DEFAULT_PROPS[object]).join(',');
	const assoc = Array.isArray(args?.associations) && args.associations.length ? `&associations=${args.associations.join(',')}` : '';
	let data;
	try { data = await hs(token, 'GET', `/crm/v3/objects/${object}/${encodeURIComponent(id)}?properties=${props}${assoc}`); }
	catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
	return { object, id: data.id, properties: data.properties, associations: data.associations ?? undefined };
}
