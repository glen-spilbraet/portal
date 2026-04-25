/** @param {App.Platform['env']['DB']} db */

export async function listSheets(db) {
	const rows = await db
		.prepare(
			`SELECT s.id, s.sku, s.status, s.box_image_key, s.created_at, s.updated_at, s.data_fields,
              t_en.value as name_en,
              t_da.value as name_da,
              t_sv.value as name_sv,
              t_no.value as name_no
       FROM sales_sheets s
       LEFT JOIN translations t_en ON t_en.sheet_id = s.id AND t_en.language = 'en' AND t_en.key = 'product_name'
       LEFT JOIN translations t_da ON t_da.sheet_id = s.id AND t_da.language = 'da' AND t_da.key = 'product_name'
       LEFT JOIN translations t_sv ON t_sv.sheet_id = s.id AND t_sv.language = 'sv' AND t_sv.key = 'product_name'
       LEFT JOIN translations t_no ON t_no.sheet_id = s.id AND t_no.language = 'no' AND t_no.key = 'product_name'
       ORDER BY s.updated_at DESC`
		)
		.all();
	return rows.results;
}

export async function getSheet(db, id) {
	return db.prepare('SELECT * FROM sales_sheets WHERE id = ?').bind(id).first();
}

export async function createSheet(db, id, sku, primaryLanguage = 'en') {
	const defaultFields = JSON.stringify([
		{ key: 'sku', label: 'SKU', value: sku },
		{ key: 'ean', label: 'EAN', value: '' },
		{ key: 'stock_date', label: 'Est. stock date', value: '' },
		{ key: 'age', label: 'Age', value: '' },
		{ key: 'time', label: 'Time', value: '' },
		{ key: 'players', label: 'Players', value: '' }
	]);
	await db
		.prepare(
			`INSERT INTO sales_sheets (id, sku, data_fields, primary_language) VALUES (?, ?, ?, ?)`
		)
		.bind(id, sku, defaultFields, primaryLanguage)
		.run();
}

export async function updateSheet(db, id, patch) {
	const fields = [];
	const values = [];
	for (const [k, v] of Object.entries(patch)) {
		fields.push(`${k} = ?`);
		values.push(v);
	}
	fields.push('updated_at = ?');
	values.push(Math.floor(Date.now() / 1000));
	values.push(id);
	await db.prepare(`UPDATE sales_sheets SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deleteSheet(db, id) {
	await db.prepare('DELETE FROM sales_sheets WHERE id = ?').bind(id).run();
}

export async function getTranslations(db, sheetId) {
	const rows = await db
		.prepare('SELECT language, key, value FROM translations WHERE sheet_id = ?')
		.bind(sheetId)
		.all();
	/** @type {Record<string, Record<string, string>>} */
	const result = {};
	for (const row of rows.results) {
		if (!result[row.language]) result[row.language] = {};
		result[row.language][row.key] = row.value;
	}
	return result;
}

export async function setTranslation(db, sheetId, language, key, value) {
	const id = crypto.randomUUID();
	await db
		.prepare(
			`INSERT INTO translations (id, sheet_id, language, key, value)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(sheet_id, language, key) DO UPDATE SET value = excluded.value`
		)
		.bind(id, sheetId, language, key, value)
		.run();
}

export async function getImages(db, sheetId) {
	const rows = await db
		.prepare('SELECT * FROM sheet_images WHERE sheet_id = ? ORDER BY display_order ASC')
		.bind(sheetId)
		.all();
	return rows.results;
}

export async function addImage(db, id, sheetId, r2Key, order) {
	await db
		.prepare(
			'INSERT INTO sheet_images (id, sheet_id, r2_key, display_order) VALUES (?, ?, ?, ?)'
		)
		.bind(id, sheetId, r2Key, order)
		.run();
}

export async function updateImageCrop(db, imageId, cropX, cropY) {
	await db
		.prepare('UPDATE sheet_images SET crop_x = ?, crop_y = ? WHERE id = ?')
		.bind(cropX, cropY, imageId)
		.run();
}

export async function updateImageOrder(db, imageId, order) {
	await db.prepare('UPDATE sheet_images SET display_order = ? WHERE id = ?').bind(order, imageId).run();
}

export async function getGlobalLabels(db) {
	const rows = await db.prepare('SELECT key, lang, label FROM global_labels').all();
	/** @type {Record<string, Record<string, string>>} */
	const result = {};
	for (const row of rows.results) {
		if (!result[row.key]) result[row.key] = {};
		result[row.key][row.lang] = row.label;
	}
	return result;
}

export async function upsertGlobalLabel(db, key, lang, label) {
	await db
		.prepare(
			`INSERT INTO global_labels (key, lang, label) VALUES (?, ?, ?)
       ON CONFLICT(key, lang) DO UPDATE SET label = excluded.label`
		)
		.bind(key, lang, label)
		.run();
}

export async function deleteImage(db, imageId) {
	const row = await db.prepare('SELECT r2_key FROM sheet_images WHERE id = ?').bind(imageId).first();
	await db.prepare('DELETE FROM sheet_images WHERE id = ?').bind(imageId).run();
	return row?.r2_key;
}

export async function listCtaVersions(db) {
	const rows = await db.prepare('SELECT * FROM cta_versions ORDER BY sort_order ASC, created_at ASC').all();
	const versions = rows.results;
	// load translations for all versions
	const tRows = await db.prepare('SELECT cta_id, lang, value FROM cta_version_translations').all();
	const byId = {};
	for (const v of versions) byId[v.id] = { ...v, translations: {} };
	for (const t of tRows.results) {
		if (byId[t.cta_id]) byId[t.cta_id].translations[t.lang] = t.value;
	}
	return versions.map(v => byId[v.id]);
}

export async function createCtaVersion(db, id, name) {
	const maxOrder = await db.prepare('SELECT COALESCE(MAX(sort_order),0) as m FROM cta_versions').first();
	await db.prepare('INSERT INTO cta_versions (id, name, sort_order) VALUES (?, ?, ?)').bind(id, name, (maxOrder?.m ?? 0) + 1).run();
}

export async function updateCtaVersionName(db, id, name) {
	await db.prepare('UPDATE cta_versions SET name = ? WHERE id = ?').bind(name, id).run();
}

export async function upsertCtaVersionTranslation(db, ctaId, lang, value) {
	await db.prepare('INSERT INTO cta_version_translations (cta_id, lang, value) VALUES (?, ?, ?) ON CONFLICT(cta_id, lang) DO UPDATE SET value = excluded.value').bind(ctaId, lang, value).run();
}

export async function deleteCtaVersion(db, id) {
	await db.prepare('DELETE FROM cta_versions WHERE id = ?').bind(id).run();
}

export async function getCtaVersionTranslations(db, ctaId) {
	const rows = await db.prepare('SELECT lang, value FROM cta_version_translations WHERE cta_id = ?').bind(ctaId).all();
	const result = {};
	for (const r of rows.results) result[r.lang] = r.value;
	return result;
}

// ── Catalogues ────────────────────────────────────────────────────────────────

export async function listCatalogues(db) {
	const rows = await db.prepare('SELECT * FROM catalogues ORDER BY updated_at DESC').all();
	return rows.results;
}

export async function getCatalogue(db, id) {
	return db.prepare('SELECT * FROM catalogues WHERE id = ?').bind(id).first();
}

export async function getCatalogueByShareToken(db, token) {
	return db.prepare('SELECT * FROM catalogues WHERE share_token = ?').bind(token).first();
}

export async function generateShareToken(db, id) {
	const token = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
	await db.prepare('UPDATE catalogues SET share_token = ?, updated_at = ? WHERE id = ?')
		.bind(token, Math.floor(Date.now() / 1000), id).run();
	return token;
}

export async function createCatalogue(db, id, name, language) {
	await db.prepare('INSERT INTO catalogues (id, name, language) VALUES (?, ?, ?)').bind(id, name, language).run();
}

export async function updateCatalogue(db, id, patch) {
	const fields = [], values = [];
	for (const [k, v] of Object.entries(patch)) { fields.push(`${k} = ?`); values.push(v); }
	fields.push('updated_at = ?'); values.push(Math.floor(Date.now() / 1000));
	values.push(id);
	await db.prepare(`UPDATE catalogues SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deleteCatalogue(db, id) {
	await db.prepare('DELETE FROM catalogues WHERE id = ?').bind(id).run();
}

export async function getCatalogueItems(db, catalogueId) {
	const rows = await db.prepare(`
    SELECT ci.*, s.box_image_key, s.data_fields, s.hidden_elements,
           t_name.value as product_name, t_desc.value as product_description,
           s.primary_language
    FROM catalogue_items ci
    LEFT JOIN sales_sheets s ON s.id = ci.sheet_id
    LEFT JOIN translations t_name ON t_name.sheet_id = ci.sheet_id AND t_name.language = s.primary_language AND t_name.key = 'product_name'
    LEFT JOIN translations t_desc ON t_desc.sheet_id = ci.sheet_id AND t_desc.language = s.primary_language AND t_desc.key = 'product_description'
    WHERE ci.catalogue_id = ?
    ORDER BY ci.display_order ASC
  `).bind(catalogueId).all();
	return rows.results;
}

export async function getCatalogueItemsWithTranslations(db, catalogueId, language) {
	const rows = await db.prepare(`
    SELECT ci.id, ci.sheet_id, ci.display_order,
           ci.type, ci.section_image_key, ci.section_crop_x, ci.section_crop_y, ci.section_text,
           s.box_image_key, s.data_fields, s.hidden_elements, s.primary_language,
           s.usp_count,
           COALESCE(t_name_lang.value, t_name_primary.value, '') as product_name,
           COALESCE(t_desc_lang.value, t_desc_primary.value, '') as product_description
    FROM catalogue_items ci
    LEFT JOIN sales_sheets s ON s.id = ci.sheet_id
    LEFT JOIN translations t_name_lang ON t_name_lang.sheet_id = ci.sheet_id AND t_name_lang.language = ? AND t_name_lang.key = 'product_name'
    LEFT JOIN translations t_name_primary ON t_name_primary.sheet_id = ci.sheet_id AND t_name_primary.language = s.primary_language AND t_name_primary.key = 'product_name'
    LEFT JOIN translations t_desc_lang ON t_desc_lang.sheet_id = ci.sheet_id AND t_desc_lang.language = ? AND t_desc_lang.key = 'product_description'
    LEFT JOIN translations t_desc_primary ON t_desc_primary.sheet_id = ci.sheet_id AND t_desc_primary.language = s.primary_language AND t_desc_primary.key = 'product_description'
    WHERE ci.catalogue_id = ?
    ORDER BY ci.display_order ASC
  `).bind(language, language, catalogueId).all();
	const items = rows.results;
	for (const item of items) {
		// Only fetch USPs for sheet items
		if (item.type !== 'sheet' && item.type !== null) {
			item.usps = [];
			continue;
		}
		const uspCount = item.usp_count ?? 3;
		const uspRows = await db.prepare(`
      SELECT k.key,
             COALESCE(t_lang.value, t_primary.value, '') as value
      FROM (SELECT DISTINCT key FROM translations WHERE sheet_id = ? AND key LIKE 'usp_%') k
      LEFT JOIN translations t_lang ON t_lang.sheet_id = ? AND t_lang.language = ? AND t_lang.key = k.key
      LEFT JOIN translations t_primary ON t_primary.sheet_id = ? AND t_primary.language = ? AND t_primary.key = k.key
      ORDER BY k.key ASC
    `).bind(item.sheet_id, item.sheet_id, language, item.sheet_id, item.primary_language).all();
		item.usps = uspRows.results
			.slice(0, uspCount)
			.map(r => r.value)
			.filter(v => v && v.trim());
	}
	return items;
}

export async function addCatalogueItem(db, id, catalogueId, sheetId) {
	const max = await db.prepare('SELECT COALESCE(MAX(display_order), -1) as m FROM catalogue_items WHERE catalogue_id = ?').bind(catalogueId).first();
	await db.prepare('INSERT INTO catalogue_items (id, catalogue_id, sheet_id, display_order) VALUES (?, ?, ?, ?)').bind(id, catalogueId, sheetId, (max?.m ?? -1) + 1).run();
	await db.prepare('UPDATE catalogues SET updated_at = ? WHERE id = ?').bind(Math.floor(Date.now() / 1000), catalogueId).run();
}

export async function removeCatalogueItem(db, itemId, catalogueId) {
	await db.prepare('DELETE FROM catalogue_items WHERE id = ?').bind(itemId).run();
	await db.prepare('UPDATE catalogues SET updated_at = ? WHERE id = ?').bind(Math.floor(Date.now() / 1000), catalogueId).run();
}

export async function reorderCatalogueItems(db, catalogueId, orderedIds) {
	for (let i = 0; i < orderedIds.length; i++) {
		await db.prepare('UPDATE catalogue_items SET display_order = ? WHERE id = ? AND catalogue_id = ?').bind(i, orderedIds[i], catalogueId).run();
	}
}

export async function addImageSection(db, id, catalogueId, type) {
	const max = await db.prepare('SELECT COALESCE(MAX(display_order), -1) as m FROM catalogue_items WHERE catalogue_id = ?').bind(catalogueId).first();
	await db.prepare('INSERT INTO catalogue_items (id, catalogue_id, sheet_id, display_order, type) VALUES (?, ?, NULL, ?, ?)').bind(id, catalogueId, (max?.m ?? -1) + 1, type).run();
	await db.prepare('UPDATE catalogues SET updated_at = ? WHERE id = ?').bind(Math.floor(Date.now() / 1000), catalogueId).run();
}

export async function updateCatalogueItemSection(db, itemId, patch) {
	const fields = [], values = [];
	for (const [k, v] of Object.entries(patch)) { fields.push(`${k} = ?`); values.push(v); }
	values.push(itemId);
	await db.prepare(`UPDATE catalogue_items SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

// ── Data Products ─────────────────────────────────────────────────────────────

export async function listDataProducts(db) {
	const rows = await db.prepare('SELECT * FROM data_products ORDER BY created_at DESC').all();
	return rows.results;
}

export async function getDataProduct(db, id) {
	return db.prepare('SELECT * FROM data_products WHERE id = ?').bind(id).first();
}

export async function createDataProduct(db, name) {
	const id = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	await db.prepare(
		'INSERT INTO data_products (id, name, template_headers, mappings, skus, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
	).bind(id, name, '[]', '{}', '[]', now, now).run();
	return id;
}

export async function updateDataProduct(db, id, patch) {
	const fields = [], values = [];
	for (const [k, v] of Object.entries(patch)) { fields.push(`${k} = ?`); values.push(v); }
	fields.push('updated_at = ?'); values.push(Math.floor(Date.now() / 1000));
	values.push(id);
	await db.prepare(`UPDATE data_products SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deleteDataProduct(db, id) {
	await db.prepare('DELETE FROM data_products WHERE id = ?').bind(id).run();
}
