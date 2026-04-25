const RACKBEAT_BASE = 'https://app.rackbeat.com/api';

const RB_HEADERS = (apiKey) => ({
	Authorization: `Bearer ${apiKey}`,
	Accept: 'application/json'
});

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
	const prodRes = await fetch(`${RACKBEAT_BASE}/products/${encodeURIComponent(sku)}`, { headers });
	if (!prodRes.ok) return null;

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
			fetch(`${RACKBEAT_BASE}/products/${encodeURIComponent(sku)}/fields`, { headers }),
			fetch(`${RACKBEAT_BASE}/products/${encodeURIComponent(sku)}/prices`, { headers })
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
			for (const entry of (pricesData.prices ?? [])) {
				const groupName = entry.price_group?.name ?? entry.currency_code ?? entry.currency ?? String(entry.id);
				const key = `price:${groupName}`;
				// Only keep first entry per group (lowest qty break)
				if (!(key in prices)) {
					prices[key] = entry.price ?? entry.amount ?? null;
				}
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
			fetch(`${RACKBEAT_BASE}/products/${encodeURIComponent(sku)}/fields`, { headers }),
			fetch(`${RACKBEAT_BASE}/products/${encodeURIComponent(sku)}/prices`, { headers })
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
			const seen = new Set();
			for (const entry of (data.prices ?? [])) {
				const groupName = entry.price_group?.name ?? entry.currency_code ?? entry.currency ?? String(entry.id);
				const key = `price:${groupName}`;
				if (!seen.has(key)) {
					seen.add(key);
					priceFields.push({ key, label: `Price: ${groupName}`, group: 'price', type: 'price' });
				}
			}
		}
	} catch { /* best-effort */ }

	return { standardFields, customFields, priceFields };
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
