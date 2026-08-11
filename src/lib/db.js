/** @param {App.Platform['env']['DB']} db */

const SHEET_SELECT = `
	SELECT s.id, s.sku, s.status, s.box_image_key, s.created_at, s.updated_at, s.data_fields, s.created_by,
	       COALESCE(u.first_name, '') as creator_first_name,
	       t_en.value as name_en,
	       t_da.value as name_da,
	       t_sv.value as name_sv,
	       t_no.value as name_no,
	       COALESCE(s.usp_count, 3) as usp_count,
	       (SELECT COUNT(*) FROM translations WHERE sheet_id = s.id AND language = 'en' AND key LIKE 'usp_%' AND value != '') as usp_filled_en,
	       (SELECT COUNT(*) FROM translations WHERE sheet_id = s.id AND language = 'da' AND key LIKE 'usp_%' AND value != '') as usp_filled_da,
	       (SELECT COUNT(*) FROM translations WHERE sheet_id = s.id AND language = 'sv' AND key LIKE 'usp_%' AND value != '') as usp_filled_sv,
	       (SELECT COUNT(*) FROM translations WHERE sheet_id = s.id AND language = 'no' AND key LIKE 'usp_%' AND value != '') as usp_filled_no
	FROM sales_sheets s
	LEFT JOIN allowed_users u ON u.email = s.created_by
	LEFT JOIN translations t_en ON t_en.sheet_id = s.id AND t_en.language = 'en' AND t_en.key = 'product_name'
	LEFT JOIN translations t_da ON t_da.sheet_id = s.id AND t_da.language = 'da' AND t_da.key = 'product_name'
	LEFT JOIN translations t_sv ON t_sv.sheet_id = s.id AND t_sv.language = 'sv' AND t_sv.key = 'product_name'
	LEFT JOIN translations t_no ON t_no.sheet_id = s.id AND t_no.language = 'no' AND t_no.key = 'product_name'`;

export async function listSheets(db, { limit = 30, offset = 0 } = {}) {
	const rows = await db
		.prepare(`${SHEET_SELECT} ORDER BY s.updated_at DESC LIMIT ? OFFSET ?`)
		.bind(limit, offset)
		.all();
	return rows.results;
}

export async function countSheets(db) {
	const row = await db.prepare('SELECT COUNT(*) as n FROM sales_sheets').first();
	return row?.n ?? 0;
}

export async function searchSheets(db, query) {
	const q = `%${query.toLowerCase()}%`;
	const rows = await db
		.prepare(`${SHEET_SELECT}
		WHERE lower(s.sku) LIKE ?
		   OR lower(COALESCE(t_en.value,'')) LIKE ?
		   OR lower(COALESCE(t_da.value,'')) LIKE ?
		   OR lower(COALESCE(t_sv.value,'')) LIKE ?
		   OR lower(COALESCE(t_no.value,'')) LIKE ?
		   OR lower(COALESCE((SELECT value FROM translations WHERE sheet_id=s.id AND key='ean' LIMIT 1),'')) LIKE ?
		ORDER BY s.updated_at DESC
		LIMIT 100`)
		.bind(q, q, q, q, q, q)
		.all();
	return rows.results;
}

export async function getSheet(db, id) {
	return db.prepare('SELECT * FROM sales_sheets WHERE id = ?').bind(id).first();
}

export async function getSheetByShareToken(db, token) {
	return db.prepare('SELECT * FROM sales_sheets WHERE share_token = ?').bind(token).first();
}

export async function createSheet(db, id, sku, primaryLanguage = 'en', createdBy = null) {
	const defaultFields = JSON.stringify([
		{ key: 'sku',    label: 'SKU',    value: sku },
		{ key: 'ean',    label: 'EAN',    value: '' },
		{ key: 'weight', label: 'Weight', value: '' },
		{ key: 'height', label: 'Height', value: '' },
		{ key: 'width',  label: 'Width',  value: '' },
		{ key: 'depth',  label: 'Depth',  value: '' },
	]);
	const shareToken = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
	await db
		.prepare(
			`INSERT INTO sales_sheets (id, sku, data_fields, primary_language, created_by, share_token) VALUES (?, ?, ?, ?, ?, ?)`
		)
		.bind(id, sku, defaultFields, primaryLanguage, createdBy, shareToken)
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

/** Admin: all catalogues */
export async function listCatalogues(db) {
	const rows = await db.prepare('SELECT * FROM catalogues ORDER BY updated_at DESC').all();
	return rows.results;
}

/** Non-admin: only catalogues owned by this user */
export async function listOwnCatalogues(db, createdBy) {
	const rows = await db.prepare(
		'SELECT * FROM catalogues WHERE created_by = ? ORDER BY updated_at DESC'
	).bind(createdBy).all();
	return rows.results;
}

// ── Catalogue folders ─────────────────────────────────────────────────────────

export async function listFolders(db, createdBy) {
	const rows = await db.prepare(
		'SELECT * FROM catalogue_folders WHERE created_by = ? ORDER BY name ASC'
	).bind(createdBy).all();
	return rows.results;
}

/** Admin: all folders from all users */
export async function listAllFolders(db) {
	const rows = await db.prepare(
		'SELECT * FROM catalogue_folders ORDER BY name ASC'
	).all();
	return rows.results;
}

export async function createFolder(db, id, name, parentId, createdBy) {
	await db.prepare(
		'INSERT INTO catalogue_folders (id, name, parent_id, created_by) VALUES (?, ?, ?, ?)'
	).bind(id, name, parentId ?? null, createdBy).run();
}

export async function renameFolder(db, id, name) {
	await db.prepare('UPDATE catalogue_folders SET name = ? WHERE id = ?').bind(name, id).run();
}

/** Delete a folder; its children and catalogues move up to the deleted folder's parent. */
export async function deleteFolder(db, id) {
	const folder = await db.prepare('SELECT parent_id FROM catalogue_folders WHERE id = ?').bind(id).first();
	if (!folder) return;
	await db.batch([
		db.prepare('UPDATE catalogue_folders SET parent_id = ? WHERE parent_id = ?').bind(folder.parent_id ?? null, id),
		db.prepare('UPDATE catalogues SET folder_id = ? WHERE folder_id = ?').bind(folder.parent_id ?? null, id),
		db.prepare('DELETE FROM catalogue_folders WHERE id = ?').bind(id),
	]);
}

export async function setCatalogueFolder(db, catalogueId, folderId) {
	await db.prepare(
		'UPDATE catalogues SET folder_id = ?, updated_at = ? WHERE id = ?'
	).bind(folderId ?? null, Math.floor(Date.now() / 1000), catalogueId).run();
}

// ── Catalogue shares (user-to-user) ──────────────────────────────────────────

/** Catalogues shared WITH this user by others */
export async function listSharedCatalogues(db, email) {
	const rows = await db.prepare(`
		SELECT c.*, cs.shared_by_email FROM catalogues c
		JOIN catalogue_shares cs ON cs.catalogue_id = c.id
		WHERE cs.shared_with_email = ?
		ORDER BY cs.shared_at DESC
	`).bind(email).all();
	return rows.results;
}

export async function getSharesForCatalogue(db, catalogueId) {
	const rows = await db.prepare(
		'SELECT * FROM catalogue_shares WHERE catalogue_id = ? ORDER BY shared_at ASC'
	).bind(catalogueId).all();
	return rows.results;
}

export async function shareCatalogueWith(db, catalogueId, sharedWithEmail, sharedByEmail) {
	await db.prepare(
		'INSERT OR IGNORE INTO catalogue_shares (id, catalogue_id, shared_with_email, shared_by_email) VALUES (?, ?, ?, ?)'
	).bind(crypto.randomUUID(), catalogueId, sharedWithEmail, sharedByEmail).run();
}

export async function unshareCatalogueWith(db, catalogueId, sharedWithEmail) {
	await db.prepare(
		'DELETE FROM catalogue_shares WHERE catalogue_id = ? AND shared_with_email = ?'
	).bind(catalogueId, sharedWithEmail).run();
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

export async function createCatalogue(db, id, name, language, createdBy = null) {
	await db.prepare('INSERT INTO catalogues (id, name, language, created_by) VALUES (?, ?, ?, ?)').bind(id, name, language, createdBy).run();
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
           ci.section_grid_size, ci.section_grid_items,
           s.box_image_key, s.data_fields, s.hidden_elements, s.primary_language,
           s.usp_count, s.youtube_url,
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

	// Resolve the referenced products for grid sections (box photo + name + data fields)
	const gridItems = items.filter(item => item.type === 'grid');
	if (gridItems.length > 0) {
		const referencedIds = new Set();
		for (const item of gridItems) {
			for (const sheetId of parseGridSlots(item.section_grid_items)) {
				if (sheetId) referencedIds.add(sheetId);
			}
		}
		const idList = [...referencedIds];
		const productMap = {};
		if (idList.length > 0) {
			const placeholders = idList.map(() => '?').join(',');
			const productRows = await db.prepare(`
        SELECT s.id, s.box_image_key, s.data_fields,
               COALESCE(t_lang.value, t_primary.value, '') as product_name
        FROM sales_sheets s
        LEFT JOIN translations t_lang ON t_lang.sheet_id = s.id AND t_lang.language = ? AND t_lang.key = 'product_name'
        LEFT JOIN translations t_primary ON t_primary.sheet_id = s.id AND t_primary.language = s.primary_language AND t_primary.key = 'product_name'
        WHERE s.id IN (${placeholders})
      `).bind(language, ...idList).all();
			for (const row of productRows.results) {
				productMap[row.id] = { box_image_key: row.box_image_key, data_fields: row.data_fields, product_name: row.product_name };
			}
		}
		for (const item of gridItems) {
			item.grid_products = parseGridSlots(item.section_grid_items).map(sheetId =>
				sheetId ? (productMap[sheetId] ?? null) : null
			);
		}
	}

	return items;
}

function parseGridSlots(raw) {
	try { return JSON.parse(raw || '[]'); } catch { return []; }
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

export async function addGridSection(db, id, catalogueId, gridSize) {
	const max = await db.prepare('SELECT COALESCE(MAX(display_order), -1) as m FROM catalogue_items WHERE catalogue_id = ?').bind(catalogueId).first();
	const slots = JSON.stringify(Array(gridSize).fill(null));
	await db.prepare('INSERT INTO catalogue_items (id, catalogue_id, sheet_id, display_order, type, section_grid_size, section_grid_items) VALUES (?, ?, NULL, ?, ?, ?, ?)').bind(id, catalogueId, (max?.m ?? -1) + 1, 'grid', gridSize, slots).run();
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

export async function listOwnDataProducts(db, createdBy) {
	const rows = await db.prepare('SELECT * FROM data_products WHERE created_by = ? ORDER BY created_at DESC').bind(createdBy).all();
	return rows.results;
}

export async function getDataProduct(db, id) {
	return db.prepare('SELECT * FROM data_products WHERE id = ?').bind(id).first();
}

export async function createDataProduct(db, name, createdBy = null) {
	const id = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	await db.prepare(
		'INSERT INTO data_products (id, name, template_headers, mappings, skus, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
	).bind(id, name, '[]', '{}', '[]', now, now, createdBy).run();
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

// ── Planogram ─────────────────────────────────────────────────────────────────

export async function listPlanogramProjects(db) {
	const rows = await db.prepare('SELECT * FROM planogram_projects ORDER BY updated_at DESC').all();
	return rows.results;
}

export async function listOwnPlanogramProjects(db, createdBy) {
	const rows = await db.prepare(
		'SELECT * FROM planogram_projects WHERE created_by = ? ORDER BY updated_at DESC'
	).bind(createdBy).all();
	return rows.results;
}

// ── Planogram folders ─────────────────────────────────────────────────────────

export async function listPlanogramFolders(db, createdBy) {
	const rows = await db.prepare(
		'SELECT * FROM planogram_folders WHERE created_by = ? ORDER BY name ASC'
	).bind(createdBy).all();
	return rows.results;
}

export async function listAllPlanogramFolders(db) {
	const rows = await db.prepare('SELECT * FROM planogram_folders ORDER BY name ASC').all();
	return rows.results;
}

export async function createPlanogramFolder(db, id, name, parentId, createdBy) {
	await db.prepare(
		'INSERT INTO planogram_folders (id, name, parent_id, created_by) VALUES (?, ?, ?, ?)'
	).bind(id, name, parentId ?? null, createdBy).run();
}

export async function renamePlanogramFolder(db, id, name) {
	await db.prepare('UPDATE planogram_folders SET name = ? WHERE id = ?').bind(name, id).run();
}

export async function deletePlanogramFolder(db, id) {
	const folder = await db.prepare('SELECT parent_id FROM planogram_folders WHERE id = ?').bind(id).first();
	if (!folder) return;
	await db.batch([
		db.prepare('UPDATE planogram_folders SET parent_id = ? WHERE parent_id = ?').bind(folder.parent_id ?? null, id),
		db.prepare('UPDATE planogram_projects SET folder_id = ? WHERE folder_id = ?').bind(folder.parent_id ?? null, id),
		db.prepare('DELETE FROM planogram_folders WHERE id = ?').bind(id),
	]);
}

export async function setPlanogramFolder(db, projectId, folderId) {
	await db.prepare(
		'UPDATE planogram_projects SET folder_id = ?, updated_at = ? WHERE id = ?'
	).bind(folderId ?? null, new Date().toISOString(), projectId).run();
}

// ── Planogram shares (user-to-user) ──────────────────────────────────────────

export async function listSharedPlanograms(db, email) {
	const rows = await db.prepare(`
		SELECT p.*, ps.shared_by_email FROM planogram_projects p
		JOIN planogram_shares ps ON ps.project_id = p.id
		WHERE ps.shared_with_email = ?
		ORDER BY ps.shared_at DESC
	`).bind(email).all();
	return rows.results;
}

export async function getSharesForPlanogram(db, projectId) {
	const rows = await db.prepare(
		'SELECT * FROM planogram_shares WHERE project_id = ? ORDER BY shared_at ASC'
	).bind(projectId).all();
	return rows.results;
}

export async function sharePlanogramWith(db, projectId, sharedWithEmail, sharedByEmail) {
	await db.prepare(
		'INSERT OR IGNORE INTO planogram_shares (id, project_id, shared_with_email, shared_by_email) VALUES (?, ?, ?, ?)'
	).bind(crypto.randomUUID(), projectId, sharedWithEmail, sharedByEmail).run();
}

export async function unsharePlanogramWith(db, projectId, sharedWithEmail) {
	await db.prepare(
		'DELETE FROM planogram_shares WHERE project_id = ? AND shared_with_email = ?'
	).bind(projectId, sharedWithEmail).run();
}

export async function getPlanogramProject(db, id) {
	return db.prepare('SELECT * FROM planogram_projects WHERE id = ?').bind(id).first();
}

export async function getPlanogramProjectByShareToken(db, token) {
	return db.prepare('SELECT * FROM planogram_projects WHERE share_token = ?').bind(token).first();
}

export async function createPlanogramProject(db, id, name, createdBy = null, language = null) {
	const now = new Date().toISOString();
	await db.prepare(
		'INSERT INTO planogram_projects (id, name, created_at, updated_at, created_by, language) VALUES (?, ?, ?, ?, ?, ?)'
	).bind(id, name, now, now, createdBy, language).run();
}

export async function updatePlanogramProject(db, id, patch) {
	const fields = [], values = [];
	for (const [k, v] of Object.entries(patch)) { fields.push(`${k} = ?`); values.push(v); }
	fields.push('updated_at = ?'); values.push(new Date().toISOString());
	values.push(id);
	await db.prepare(`UPDATE planogram_projects SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deletePlanogramProject(db, id) {
	await db.prepare('DELETE FROM planogram_projects WHERE id = ?').bind(id).run();
}

export async function generatePlanogramShareToken(db, id) {
	const token = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
	await db.prepare('UPDATE planogram_projects SET share_token = ?, updated_at = ? WHERE id = ?')
		.bind(token, new Date().toISOString(), id).run();
	return token;
}

export async function revokePlanogramShareToken(db, id) {
	await db.prepare('UPDATE planogram_projects SET share_token = NULL, updated_at = ? WHERE id = ?')
		.bind(new Date().toISOString(), id).run();
}

export async function listPlanogramItems(db, projectId) {
	const rows = await db.prepare(
		'SELECT * FROM planogram_library_items WHERE project_id = ? ORDER BY id ASC'
	).bind(projectId).all();
	return rows.results;
}

export async function addPlanogramItem(db, projectId, sku, name, widthCm, heightCm, isPlaceholder) {
	const now = new Date().toISOString();
	const result = await db.prepare(
		'INSERT INTO planogram_library_items (project_id, sku, name, width_cm, height_cm, is_placeholder, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
	).bind(projectId, sku, name ?? null, widthCm, heightCm, isPlaceholder ? 1 : 0, now).run();
	return result.meta.last_row_id;
}

export async function updatePlanogramItem(db, itemId, patch) {
	const fields = [], values = [];
	for (const [k, v] of Object.entries(patch)) { fields.push(`${k} = ?`); values.push(v); }
	values.push(itemId);
	await db.prepare(`UPDATE planogram_library_items SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deletePlanogramItem(db, itemId) {
	const row = await db.prepare('SELECT photo_key FROM planogram_library_items WHERE id = ?').bind(itemId).first();
	await db.prepare('DELETE FROM planogram_library_items WHERE id = ?').bind(itemId).run();
	return row?.photo_key ?? null;
}

export async function getPlanogramItem(db, itemId) {
	return db.prepare('SELECT * FROM planogram_library_items WHERE id = ?').bind(itemId).first();
}

/** Returns all library items from OTHER projects (for import dialog) */
export async function getPlanogramImportCandidates(db, excludeProjectId) {
	const rows = await db.prepare(`
		SELECT li.*, p.name as project_name
		FROM planogram_library_items li
		JOIN planogram_projects p ON p.id = li.project_id
		WHERE li.project_id != ?
		ORDER BY li.created_at DESC
	`).bind(excludeProjectId).all();
	return rows.results;
}

// ── Global Item Library ────────────────────────────────────────────────────────

/** Upsert a product into the global item library by SKU.
 *  If the SKU already exists, name/dimensions are updated (but photo_key is kept). */
export async function upsertLibraryItem(db, { id, sku, name, widthCm, heightCm }) {
	await db.prepare(`
		INSERT INTO item_library (id, sku, name, width_cm, height_cm)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(sku) DO UPDATE SET
		  name      = COALESCE(excluded.name, item_library.name),
		  width_cm  = excluded.width_cm,
		  height_cm = excluded.height_cm,
		  updated_at = unixepoch()
	`).bind(id, sku, name ?? null, widthCm, heightCm).run();
}

/** After a photo is uploaded to a planogram item, mirror the key in the library.
 *  Pass null to clear a stale key. */
export async function updateLibraryItemPhoto(db, sku, photoKey) {
	await db.prepare(
		'UPDATE item_library SET photo_key = ?, updated_at = unixepoch() WHERE sku = ?'
	).bind(photoKey ?? null, sku).run();
}

export async function listLibraryItems(db) {
	const rows = await db.prepare(
		'SELECT * FROM item_library ORDER BY updated_at DESC, created_at DESC'
	).all();
	return rows.results;
}

export async function getLibraryItemBySku(db, sku) {
	return db.prepare('SELECT * FROM item_library WHERE sku = ?').bind(sku).first();
}

/** Returns all planogram_library_items rows for a SKU that are still placeholders (no photo yet). */
export async function getPlaceholdersBySku(db, sku) {
	const rows = await db.prepare(
		'SELECT * FROM planogram_library_items WHERE sku = ? AND is_placeholder = 1'
	).bind(sku).all();
	return rows.results;
}

// ── Allowed users ──────────────────────────────────────────────────────────────

export async function listAllowedUsers(db) {
	const rows = await db.prepare('SELECT email, role, name, first_name, added_at, permission_set_id, send_from FROM allowed_users ORDER BY added_at ASC').all();
	return rows.results;
}

export async function getAllowedUser(db, email) {
	return db.prepare('SELECT email, role, name, first_name, permission_set_id, send_from FROM allowed_users WHERE email = ?').bind(email).first();
}

export async function addAllowedUser(db, email, role = 'user', name = null, permissionSetId = null, firstName = null) {
	await db.prepare('INSERT OR IGNORE INTO allowed_users (email, role, name, first_name, permission_set_id) VALUES (?, ?, ?, ?, ?)')
		.bind(email.toLowerCase().trim(), role, name, firstName, permissionSetId).run();
}

export async function updateAllowedUserRole(db, email, role) {
	await db.prepare('UPDATE allowed_users SET role = ? WHERE email = ?').bind(role, email).run();
}

export async function updateAllowedUser(db, email, patch) {
	const fields = [], values = [];
	for (const [k, v] of Object.entries(patch)) { fields.push(`${k} = ?`); values.push(v); }
	values.push(email);
	await db.prepare(`UPDATE allowed_users SET ${fields.join(', ')} WHERE email = ?`).bind(...values).run();
}

export async function removeAllowedUser(db, email) {
	await db.prepare('DELETE FROM allowed_users WHERE email = ?').bind(email).run();
}

// ── Permission Sets ────────────────────────────────────────────────────────────

export async function listPermissionSets(db) {
	const rows = await db.prepare('SELECT * FROM permission_sets ORDER BY name ASC').all();
	return rows.results;
}

export async function getPermissionSet(db, id) {
	return db.prepare('SELECT * FROM permission_sets WHERE id = ?').bind(id).first();
}

export async function createPermissionSet(db, id, name, access) {
	await db.prepare(`
		INSERT INTO permission_sets (id, name, access_sheets, access_catalogues, access_planograms, access_data, access_price_lists, access_orders, access_stats, access_mail, access_product, access_forecast)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).bind(id, name,
		access.sheets       ? 1 : 0,
		access.catalogues   ? 1 : 0,
		access.planograms   ? 1 : 0,
		access.data         ? 1 : 0,
		access.price_lists  ? 1 : 0,
		access.orders       ? 1 : 0,
		access.stats        ? 1 : 0,
		access.mail         ? 1 : 0,
		access.product      ? 1 : 0,
		access.forecast     ? 1 : 0
	).run();
}

export async function updatePermissionSet(db, id, patch) {
	const fields = [], values = [];
	for (const [k, v] of Object.entries(patch)) { fields.push(`${k} = ?`); values.push(v); }
	values.push(id);
	await db.prepare(`UPDATE permission_sets SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deletePermissionSet(db, id) {
	// Clear references before deleting
	await db.prepare('UPDATE allowed_users SET permission_set_id = NULL WHERE permission_set_id = ?').bind(id).run();
	await db.prepare('DELETE FROM permission_sets WHERE id = ?').bind(id).run();
}

/**
 * Returns { sheets, catalogues, planograms, data } booleans for a user row.
 * Admins and users with no permission set get full access.
 */
export async function getUserPermissions(db, user) {
	if (user.role === 'admin' || !user.permission_set_id) {
		return { sheets: true, catalogues: true, planograms: true, data: true, mail: true, price_lists: true, stats: true, orders: true, product: true, forecast: true };
	}
	const ps = await getPermissionSet(db, user.permission_set_id);
	if (!ps) return { sheets: true, catalogues: true, planograms: true, data: true, mail: true, price_lists: true, stats: true, orders: true, product: true };
	return {
		sheets:       !!ps.access_sheets,
		catalogues:   !!ps.access_catalogues,
		planograms:   !!ps.access_planograms,
		data:         !!ps.access_data,
		mail:         !!ps.access_mail,
		price_lists:  !!ps.access_price_lists,
		stats:        !!ps.access_stats,
		orders:       !!ps.access_orders,
		product:      !!ps.access_product,
		forecast:     !!ps.access_forecast,
	};
}

// ── Sales Targets (index tiers for the quarterly target tracker) ────────────
export async function listSalesTargets(db) {
	const rows = await db.prepare('SELECT * FROM sales_targets ORDER BY year DESC, index_value ASC').all();
	return rows.results ?? [];
}

export async function listSalesTargetsForYear(db, year) {
	const rows = await db
		.prepare('SELECT * FROM sales_targets WHERE year = ? ORDER BY index_value ASC')
		.bind(year)
		.all();
	return rows.results ?? [];
}

export async function createSalesTarget(db, id, year, name, indexValue) {
	await db
		.prepare('INSERT INTO sales_targets (id, year, name, index_value) VALUES (?, ?, ?, ?)')
		.bind(id, year, name, indexValue)
		.run();
}

export async function updateSalesTarget(db, id, patch) {
	const fields = [], values = [];
	for (const [k, v] of Object.entries(patch)) { fields.push(`${k} = ?`); values.push(v); }
	if (!fields.length) return;
	values.push(id);
	await db.prepare(`UPDATE sales_targets SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deleteSalesTarget(db, id) {
	await db.prepare('DELETE FROM sales_targets WHERE id = ?').bind(id).run();
}

// ── Key Accounts ───────────────────────────────────────────────────────────
export async function listKeyAccounts(db) {
  const rows = await db.prepare('SELECT * FROM key_accounts ORDER BY name ASC').all();
  return rows.results ?? [];
}
export async function createKeyAccount(db, id, name, language = 'en') {
  await db.prepare('INSERT INTO key_accounts (id, name, language) VALUES (?, ?, ?)').bind(id, name, language).run();
}
export async function updateKeyAccount(db, id, patch) {
  const fields = [], values = [];
  if ('name' in patch)     { fields.push('name = ?');     values.push(patch.name); }
  if ('language' in patch) { fields.push('language = ?'); values.push(patch.language); }
  if (!fields.length) return;
  values.push(id);
  await db.prepare(`UPDATE key_accounts SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}
export async function deleteKeyAccount(db, id) {
  await db.prepare('DELETE FROM key_accounts WHERE id = ?').bind(id).run();
}

// ── Contacts ───────────────────────────────────────────────────────────────
export async function listContacts(db) {
  const rows = await db.prepare(`
    SELECT c.*, k.name AS key_account_name, k.language AS key_account_language
    FROM contacts c
    LEFT JOIN key_accounts k ON k.id = c.key_account_id
    ORDER BY c.first_name ASC
  `).all();
  return rows.results ?? [];
}
export async function createContact(db, id, keyAccountId, firstName, email) {
  await db.prepare('INSERT INTO contacts (id, key_account_id, first_name, email) VALUES (?, ?, ?, ?)')
    .bind(id, keyAccountId || null, firstName, email).run();
}
export async function updateContact(db, id, patch) {
  const fields = [], values = [];
  if ('first_name' in patch) { fields.push('first_name = ?'); values.push(patch.first_name); }
  if ('email' in patch)      { fields.push('email = ?');      values.push(patch.email); }
  if ('key_account_id' in patch) { fields.push('key_account_id = ?'); values.push(patch.key_account_id || null); }
  if (!fields.length) return;
  values.push(id);
  await db.prepare(`UPDATE contacts SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}
export async function deleteContact(db, id) {
  await db.prepare('DELETE FROM contacts WHERE id = ?').bind(id).run();
}

// ── Campaigns ──────────────────────────────────────────────────────────────
export async function listCampaigns(db) {
  const rows = await db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM campaign_sheets   WHERE campaign_id = c.id) AS sheet_count,
      (SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = c.id) AS contact_count
    FROM campaigns c
    ORDER BY c.created_at DESC
  `).all();
  return rows.results ?? [];
}

export async function getCampaign(db, id) {
  return db.prepare('SELECT * FROM campaigns WHERE id = ?').bind(id).first();
}

export async function createCampaign(db, id, name) {
  await db.prepare('INSERT INTO campaigns (id, name) VALUES (?, ?)').bind(id, name).run();
}

export async function updateCampaign(db, id, patch) {
  const fields = [], values = [];
  if ('name' in patch) { fields.push('name = ?'); values.push(patch.name); }
  if (!fields.length) return;
  values.push(id);
  await db.prepare(`UPDATE campaigns SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deleteCampaign(db, id) {
  await db.prepare('DELETE FROM campaigns WHERE id = ?').bind(id).run();
}

export async function listSheetsSimple(db) {
  const rows = await db.prepare(`
    SELECT s.id, s.sku,
      COALESCE(t.value, s.sku) AS product_name
    FROM sales_sheets s
    LEFT JOIN translations t ON t.sheet_id = s.id AND t.language = 'en' AND t.key = 'product_name'
    ORDER BY s.sku ASC
  `).all();
  return rows.results ?? [];
}

export async function getCampaignSheets(db, campaignId) {
  const rows = await db.prepare(`
    SELECT cs.sheet_id, cs.added_at,
      s.sku,
      COALESCE(t.value, s.sku) AS product_name
    FROM campaign_sheets cs
    JOIN sales_sheets s ON s.id = cs.sheet_id
    LEFT JOIN translations t ON t.sheet_id = s.id AND t.language = 'en' AND t.key = 'product_name'
    WHERE cs.campaign_id = ?
    ORDER BY cs.display_order ASC, cs.added_at ASC
  `).bind(campaignId).all();
  return rows.results ?? [];
}

export async function reorderCampaignSheets(db, campaignId, orderedSheetIds) {
  const stmts = orderedSheetIds.map((sheetId, i) =>
    db.prepare('UPDATE campaign_sheets SET display_order = ? WHERE campaign_id = ? AND sheet_id = ?')
      .bind(i, campaignId, sheetId)
  );
  if (stmts.length > 0) await db.batch(stmts);
}

export async function addCampaignSheet(db, campaignId, sheetId) {
  await db.prepare('INSERT OR IGNORE INTO campaign_sheets (campaign_id, sheet_id) VALUES (?, ?)')
    .bind(campaignId, sheetId).run();
}

export async function removeCampaignSheet(db, campaignId, sheetId) {
  await db.prepare('DELETE FROM campaign_sheets WHERE campaign_id = ? AND sheet_id = ?')
    .bind(campaignId, sheetId).run();
}

export async function getCampaignContacts(db, campaignId) {
  const rows = await db.prepare(`
    SELECT cc.contact_id, cc.added_at,
      c.first_name, c.email, c.key_account_id,
      k.name AS key_account_name,
      k.language AS key_account_language
    FROM campaign_contacts cc
    JOIN contacts c ON c.id = cc.contact_id
    LEFT JOIN key_accounts k ON k.id = c.key_account_id
    WHERE cc.campaign_id = ?
    ORDER BY
      CASE WHEN k.name IS NULL THEN 1 ELSE 0 END,
      k.name ASC,
      c.first_name ASC
  `).bind(campaignId).all();
  return rows.results ?? [];
}

export async function addCampaignContacts(db, campaignId, contactIds) {
  for (const id of contactIds) {
    await db.prepare('INSERT OR IGNORE INTO campaign_contacts (campaign_id, contact_id) VALUES (?, ?)')
      .bind(campaignId, id).run();
  }
}

export async function addCampaignContactsByAccount(db, campaignId, keyAccountId) {
  await db.prepare(`
    INSERT OR IGNORE INTO campaign_contacts (campaign_id, contact_id)
    SELECT ?, id FROM contacts WHERE key_account_id = ?
  `).bind(campaignId, keyAccountId).run();
}

export async function removeCampaignContact(db, campaignId, contactId) {
  await db.prepare('DELETE FROM campaign_contacts WHERE campaign_id = ? AND contact_id = ?')
    .bind(campaignId, contactId).run();
}

export async function getCampaignSheetsAllTranslations(db, campaignId) {
  // Returns one entry per sheet with all 4 languages' translations nested under .tr
  const rows = await db.prepare(`
    SELECT
      cs.sheet_id, cs.added_at,
      s.sku, s.box_image_key, s.share_token, s.data_fields,
      COALESCE(s.usp_count, 3) AS usp_count,
      t.language, t.key, t.value
    FROM campaign_sheets cs
    JOIN sales_sheets s ON s.id = cs.sheet_id
    LEFT JOIN translations t ON t.sheet_id = s.id
      AND t.language IN ('en', 'da', 'sv', 'no')
      AND t.key IN ('product_name','product_description','usp_1','usp_2','usp_3','usp_4','usp_5','usp_6')
    WHERE cs.campaign_id = ?
    ORDER BY cs.display_order ASC, cs.added_at ASC, t.language, t.key
  `).bind(campaignId).all();

  const sheetsMap = new Map();
  const sheetOrder = [];
  for (const row of (rows.results ?? [])) {
    if (!sheetsMap.has(row.sheet_id)) {
      sheetsMap.set(row.sheet_id, {
        sheet_id: row.sheet_id,
        sku: row.sku,
        box_image_key: row.box_image_key,
        share_token: row.share_token,
        data_fields: row.data_fields,
        usp_count: row.usp_count,
        tr: { en: {}, da: {}, sv: {}, no: {} },
      });
      sheetOrder.push(row.sheet_id);
    }
    if (row.language && row.key && row.value != null) {
      sheetsMap.get(row.sheet_id).tr[row.language][row.key] = row.value;
    }
  }
  return sheetOrder.map(id => sheetsMap.get(id));
}

/**
 * Log that a campaign was sent (or scheduled) to a list of contacts.
 * Safe to call multiple times — duplicate rows are ignored.
 */
export async function logCampaignSend(db, campaignId, contactIds) {
  if (!contactIds.length) return;
  const stmts = contactIds.map(contactId =>
    db.prepare(
      'INSERT OR IGNORE INTO campaign_send_log (id, campaign_id, contact_id) VALUES (?, ?, ?)'
    ).bind(crypto.randomUUID(), campaignId, contactId)
  );
  await db.batch(stmts);
}

/**
 * For the sheets attached to a given campaign, return every (contact_id, sheet_id)
 * pair where the contact has previously been sent a campaign that contained that sheet.
 * Returns an array of "contactId:sheetId" strings for fast Set-based lookup.
 */
export async function getContactSheetHistory(db, campaignId) {
  const rows = await db.prepare(`
    SELECT DISTINCT csl.contact_id, cs.sheet_id
    FROM campaign_send_log csl
    JOIN campaign_sheets cs ON cs.campaign_id = csl.campaign_id
    WHERE cs.sheet_id IN (
      SELECT sheet_id FROM campaign_sheets WHERE campaign_id = ?
    )
  `).bind(campaignId).all();
  return (rows.results ?? []).map(r => `${r.contact_id}:${r.sheet_id}`);
}
