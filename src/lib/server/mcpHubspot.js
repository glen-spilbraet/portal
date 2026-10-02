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
