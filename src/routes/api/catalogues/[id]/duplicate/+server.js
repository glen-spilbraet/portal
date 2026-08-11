import { json, error } from '@sveltejs/kit';
import { getEffectiveEmail } from '$lib/server/effectiveEmail.js';
import { getCatalogue, getSharesForCatalogue, shareCatalogueWith } from '$lib/db.js';

export async function POST({ params, cookies, platform }) {
	const email = await getEffectiveEmail(cookies, platform);
	if (!email) error(401);

	const db = platform?.env?.DB;
	if (!db) error(500);

	const original = await getCatalogue(db, params.id);
	if (!original) error(404);

	const newId = crypto.randomUUID();
	const now   = Math.floor(Date.now() / 1000);

	// ── 1. Create the new catalogue (no share_token, same folder/language/style) ──
	await db.prepare(`
		INSERT INTO catalogues
			(id, name, language, created_by, folder_id, title, logo_key, logo_bg_color, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).bind(
		newId,
		`COPY: ${original.name}`,
		original.language     ?? null,
		email,
		original.folder_id    ?? null,
		original.title        ?? null,
		original.logo_key     ?? null,
		original.logo_bg_color ?? null,
		now,
	).run();

	// ── 2. Copy all catalogue items (sheets + image sections) ────────────────────
	const items = await db.prepare(
		'SELECT * FROM catalogue_items WHERE catalogue_id = ? ORDER BY display_order ASC'
	).bind(params.id).all();

	for (const item of items.results) {
		await db.prepare(`
			INSERT INTO catalogue_items
				(id, catalogue_id, sheet_id, display_order, type,
				 section_image_key, section_crop_x, section_crop_y, section_text,
				 section_grid_size, section_grid_items)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).bind(
			crypto.randomUUID(),
			newId,
			item.sheet_id           ?? null,
			item.display_order,
			item.type               ?? null,
			item.section_image_key  ?? null,
			item.section_crop_x     ?? null,
			item.section_crop_y     ?? null,
			item.section_text       ?? null,
			item.section_grid_size  ?? null,
			item.section_grid_items ?? null,
		).run();
	}

	// ── 3. Copy user-to-user shares (not the public share_token) ────────────────
	const shares = await getSharesForCatalogue(db, params.id);
	for (const share of shares) {
		await shareCatalogueWith(db, newId, share.shared_with_email, email);
	}

	return json({ id: newId });
}
