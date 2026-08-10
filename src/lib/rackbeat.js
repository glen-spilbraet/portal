const RACKBEAT_BASE = 'https://app.rackbeat.com/api';

const RB_HEADERS = (apiKey) => ({
	Authorization: `Bearer ${apiKey}`,
	Accept: 'application/json'
});

const RB_MAX_RETRIES = 4;
const RB_BASE_DELAY_MS = 400;
const RB_MAX_DELAY_MS = 4000;

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch from Rackbeat with automatic retry/backoff on rate-limit (429) and
 * transient server errors (5xx) — honors the Retry-After header when
 * Rackbeat sends one. Large exports fire many concurrent requests and were
 * tripping Rackbeat's rate limit; without this, a throttled request looked
 * identical to a genuine 404 to every caller.
 */
async function rackbeatFetch(url, headers) {
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(url, { headers });
		const transient = res.status === 429 || res.status >= 500;
		if (!transient || attempt === RB_MAX_RETRIES) return res;

		const retryAfter = Number(res.headers.get('Retry-After'));
		const delay = Number.isFinite(retryAfter) && retryAfter > 0
			? retryAfter * 1000
			: Math.min(RB_BASE_DELAY_MS * 2 ** attempt, RB_MAX_DELAY_MS);
		await sleep(delay + Math.random() * 200);
	}
}

/**
 * Original lightweight fetch — still used by sheets/catalogues.
 */
export async function fetchRackbeatProduct(sku, apiKey) {
	if (!apiKey) return null;
	const res = await fetch(`${RACKBEAT_BASE}/products/${encodeURIComponent(sku)}`, {
		headers: RB_HEADERS(apiKey)
	});
	if (!res.ok) return null;
	const data = await res.json();
	const item = data.product ?? data.item ?? data;
	const phys = item.physical ?? {};
	return {
		name: item.name ?? '',
		ean: item.barcode ?? item.ean ?? '',
		height: phys.height || null,
		width: phys.width || null,
		depth: phys.depth || null,
		weight: phys.weight || null,
		sizeUnit: phys.size_unit ?? 'cm',
		weightUnit: phys.weight_unit ?? 'g',
		colli: item.colli ?? item.colli_size ?? null
	};
}

/**
 * Full fetch: standard fields + all custom fields (with dropdown label resolution).
 * Returns a flat object whose keys match RACKBEAT_STANDARD_FIELDS keys and
 * "custom:{slug}" / "custom:{slug}__label" for custom fields.
 */
export async function fetchRackbeatProductFull(sku, apiKey) {
	if (!apiKey) return null;
	const headers = RB_HEADERS(apiKey);

	// ── Standard product data ──────────────────────────────────────────────────
	const prodRes = await rackbeatFetch(`${RACKBEAT_BASE}/products/${encodeURIComponent(sku)}`, headers);
	if (prodRes.status === 404) return null; // genuinely doesn't exist in Rackbeat
	if (!prodRes.ok) throw new Error(`Rackbeat error ${prodRes.status} fetching SKU ${sku}`);

	const prodData = await prodRes.json();
	const item = prodData.product ?? prodData.item ?? prodData;
	const phys = item.physical ?? {};

	const standard = {
		sku:            item.item_number ?? sku,
		name:           item.name ?? '',
		description:    item.description ?? '',
		ean:            item.barcode ?? item.ean ?? '',
		sales_price:    item.sales_price ?? item.recommended_price ?? null,
		purchase_price: item.purchase_price ?? null,
		currency:       item.currency ?? '',
		unit:           item.unit?.name ?? (typeof item.unit === 'string' ? item.unit : '') ?? '',
		colli:          item.colli ?? item.colli_size ?? item.min_sales ?? null,
		height:         phys.height || null,
		width:          phys.width || null,
		depth:          phys.depth || null,
		weight:         phys.weight || null,
		size_unit:      phys.size_unit ?? 'cm',
		weight_unit:    phys.weight_unit ?? 'g',
		is_active:      item.is_active ?? null,
	};

	// ── Custom fields + Prices (parallel) ────────────────────────────────────
	const custom = {};
	const prices = {};
	try {
		const [fieldsRes, pricesRes] = await Promise.all([
			rackbeatFetch(`${RACKBEAT_BASE}/products/${encodeURIComponent(sku)}/fields`, headers),
			rackbeatFetch(`${RACKBEAT_BASE}/products/${encodeURIComponent(sku)}/prices`, headers)
		]);

		if (fieldsRes.ok) {
			const fieldsData = await fieldsRes.json();
			for (const fv of (fieldsData.field_values ?? [])) {
				const field = fv.field;
				const slug  = field.slug;
				const value = fv.value;
				custom[`custom:${slug}`] = (value === null || value === undefined) ? '' : value;
				if (field.type === 'dropdown' && field.options?.length > 0) {
					const match = field.options.find(
						o => String(o.value) === String(value) || String(o.id) === String(value)
					);
					custom[`custom:${slug}__label`] = match?.label ?? '';
				}
			}
		}

		if (pricesRes.ok) {
			const pricesData = await pricesRes.json();
			for (const entry of (pricesData.currency_prices ?? [])) {
				const cur = entry.currency;
				if (!cur) continue;
				prices[`price:${cur}`]       = entry.sales_price ?? null;
				prices[`price:${cur}:cost`]  = entry.recommended_cost_price ?? null;
			}
		}
	} catch { /* best-effort */ }

	return { ...standard, ...custom, ...prices };
}

/**
 * Fetches field definitions for one SKU — used to populate the mapping UI.
 * Returns { standardFields, customFields } where each item is { key, label, group, type }.
 */
export async function fetchRackbeatFieldDefinitions(sku, apiKey) {
	if (!apiKey) return null;

	const standardFields = RACKBEAT_STANDARD_FIELDS.map(f => ({ ...f, group: 'standard' }));
	const headers = RB_HEADERS(apiKey);

	const customFields = [];
	const priceFields  = [];
	try {
		const [fieldsRes, pricesRes] = await Promise.all([
			rackbeatFetch(`${RACKBEAT_BASE}/products/${encodeURIComponent(sku)}/fields`, headers),
			rackbeatFetch(`${RACKBEAT_BASE}/products/${encodeURIComponent(sku)}/prices`, headers)
		]);

		if (fieldsRes.ok) {
			const data = await fieldsRes.json();
			for (const fv of (data.field_values ?? [])) {
				const { slug, name, type } = fv.field;
				customFields.push({
					key:   `custom:${slug}`,
					label: type === 'dropdown' ? `${name} (ID)` : name,
					group: 'custom',
					type
				});
				if (type === 'dropdown') {
					customFields.push({
						key:   `custom:${slug}__label`,
						label: `${name} (Label)`,
						group: 'custom',
						type:  'dropdown_label'
					});
				}
			}
		}

		if (pricesRes.ok) {
			const data = await pricesRes.json();
			for (const entry of (data.currency_prices ?? [])) {
				const cur = entry.currency;
				if (!cur) continue;
				priceFields.push({ key: `price:${cur}`,      label: `Price: ${cur} (Sales)`, group: 'price', type: 'price' });
				priceFields.push({ key: `price:${cur}:cost`, label: `Price: ${cur} (Cost)`,  group: 'price', type: 'price' });
			}
		}
	} catch { /* best-effort */ }

	return { standardFields, customFields, priceFields };
}

/**
 * Fetches all non-invoiced orders from Rackbeat, handling pagination.
 * If filterEmail is provided, only returns orders whose our_reference.contact_email matches.
 */
export async function fetchRackbeatOrders(apiKey, filterEmail = null) {
	if (!apiKey) return { orders: [], debug: { error: 'No API key' } };
	const headers = RB_HEADERS(apiKey);
	const LIMIT = 100; // max Rackbeat supports per page

	// ── Page 1: discover total page count, then fetch remaining pages in parallel ─
	const firstUrl = new URL(`${RACKBEAT_BASE}/orders`);
	firstUrl.searchParams.set('limit', String(LIMIT));
	firstUrl.searchParams.set('page', '1');
	firstUrl.searchParams.set('is_archived', 'false');

	const firstRes = await fetch(firstUrl.toString(), { headers });
	if (!firstRes.ok) {
		let errBody = '';
		try { errBody = await firstRes.text(); } catch {}
		return { orders: [], debug: { error: errBody, status: firstRes.status } };
	}

	const firstBody = await firstRes.json();
	const rawFirst  = Array.isArray(firstBody) ? firstBody : (firstBody.orders ?? firstBody.data ?? []);
	const totalPages = firstBody.pages ?? 1; // Rackbeat returns { orders, total, pages, limit, page }

	// Fetch all remaining pages in parallel (pages 2…N)
	const remainingPages = [];
	for (let p = 2; p <= totalPages; p++) remainingPages.push(p);

	const extraResults = await Promise.all(
		remainingPages.map(async (p) => {
			const url = new URL(`${RACKBEAT_BASE}/orders`);
			url.searchParams.set('limit', String(LIMIT));
			url.searchParams.set('page', String(p));
			url.searchParams.set('is_archived', 'false');
			const res = await fetch(url.toString(), { headers });
			if (!res.ok) return [];
			const body = await res.json();
			return Array.isArray(body) ? body : (body.orders ?? body.data ?? []);
		})
	);

	// Merge all pages, deduplicate by order number
	const allRaw = [rawFirst, ...extraResults].flat();
	const seenIds = new Set();
	const allOrders = [];

	for (const o of allRaw) {
		const key = o.number ?? JSON.stringify(o);
		if (seenIds.has(key)) continue;
		seenIds.add(key);
		if (filterEmail) {
			const ownerEmail = (o.our_reference?.contact_email ?? '').toLowerCase();
			if (ownerEmail !== filterEmail.toLowerCase()) continue;
		}
		allOrders.push(o);
	}

	const debug = { totalPages, totalRaw: allRaw.length, totalReturned: allOrders.length, filterEmail };
	return { orders: allOrders, debug };
}

/**
 * Standard Rackbeat product fields available for mapping.
 */
export const RACKBEAT_STANDARD_FIELDS = [
	{ key: 'sku',            label: 'Item Number (SKU)' },
	{ key: 'name',           label: 'Product Name' },
	{ key: 'description',    label: 'Description' },
	{ key: 'ean',            label: 'EAN / Barcode' },
	{ key: 'sales_price',    label: 'Sales Price' },
	{ key: 'purchase_price', label: 'Purchase Price' },
	{ key: 'currency',       label: 'Currency' },
	{ key: 'unit',           label: 'Unit' },
	{ key: 'colli',          label: 'Colli / Package Size' },
	{ key: 'height',         label: 'Height' },
	{ key: 'width',          label: 'Width' },
	{ key: 'depth',          label: 'Depth' },
	{ key: 'weight',         label: 'Weight' },
	{ key: 'size_unit',      label: 'Size Unit' },
	{ key: 'weight_unit',    label: 'Weight Unit' },
	{ key: 'is_active',      label: 'Active' },
];
