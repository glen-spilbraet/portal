import { json, error } from '@sveltejs/kit';
import { getEffectiveEmail } from '$lib/server/effectiveEmail.js';
import {
	getPlanogramProject, listPlanogramItems,
	getSharesForPlanogram, sharePlanogramWith,
} from '$lib/db.js';

export async function POST({ params, cookies, platform }) {
	const email = await getEffectiveEmail(cookies, platform);
	if (!email) error(401);

	const db     = platform?.env?.DB;
	const bucket = platform?.env?.PHOTOS;
	if (!db) error(500);

	const original = await getPlanogramProject(db, params.id);
	if (!original) error(404);

	const newId = crypto.randomUUID();
	const now   = new Date().toISOString();

	// ── 1. Create the new project (no share_token, same folder/language/settings) ──
	await db.prepare(`
		INSERT INTO planogram_projects
			(id, name, created_at, updated_at, created_by, folder_id, language, settings)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`).bind(
		newId,
		`COPY: ${original.name}`,
		now, now,
		email,
		original.folder_id ?? null,
		original.language  ?? null,
		original.settings  ?? null,
	).run();

	// ── 2. Copy library items, build old-id → new-id map ────────────────────────
	const items = await listPlanogramItems(db, params.id);
	const idMap = {}; // oldItemId → newItemId

	for (const item of items) {
		const result = await db.prepare(`
			INSERT INTO planogram_library_items
				(project_id, sku, name, width_cm, height_cm, is_placeholder, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`).bind(newId, item.sku, item.name, item.width_cm, item.height_cm, item.is_placeholder, now).run();

		const newItemId = result.meta.last_row_id;
		idMap[item.id]  = newItemId;

		// Copy R2 photo to a new key (so deleting the original doesn't break the copy)
		if (item.photo_key && bucket) {
			const ext    = item.photo_key.split('.').pop();
			const newKey = `planogram-photos/${newId}/${newItemId}.${ext}`;
			try {
				const obj = await bucket.get(item.photo_key);
				if (obj) {
					const buf = await obj.arrayBuffer();
					await bucket.put(newKey, buf, { httpMetadata: obj.httpMetadata });
					await db.prepare('UPDATE planogram_library_items SET photo_key = ? WHERE id = ?')
						.bind(newKey, newItemId).run();
				}
			} catch { /* ignore, photo just won't appear */ }
		}
	}

	// ── 3. Remap placement libIds and save ───────────────────────────────────────
	const placements = original.placements ? JSON.parse(original.placements) : [];
	const remapped   = placements.map(p => ({ ...p, libId: idMap[p.libId] ?? p.libId }));
	await db.prepare('UPDATE planogram_projects SET placements = ? WHERE id = ?')
		.bind(JSON.stringify(remapped), newId).run();

	// ── 4. Copy user-to-user shares (not the public share_token) ────────────────
	const shares = await getSharesForPlanogram(db, params.id);
	for (const share of shares) {
		await sharePlanogramWith(db, newId, share.shared_with_email, email);
	}

	return json({ id: newId });
}
