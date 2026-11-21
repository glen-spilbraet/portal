import { json, error } from '@sveltejs/kit';

/** POST /api/images/swap { id1, id2 } — swap two sheet photos' positions. (Access: sheet edit, see access.js.) */
export async function POST({ request, platform }) {
	const { id1, id2 } = await request.json();
	if (!id1 || !id2) throw error(400, 'Missing id1 or id2');

	const db = platform?.env?.DB;
	if (!db) throw error(500, 'No database');

	const [row1, row2] = await Promise.all([
		db.prepare('SELECT display_order FROM sheet_images WHERE id = ?').bind(id1).first(),
		db.prepare('SELECT display_order FROM sheet_images WHERE id = ?').bind(id2).first()
	]);

	if (!row1 || !row2) throw error(404, 'Image not found');

	await Promise.all([
		db.prepare('UPDATE sheet_images SET display_order = ? WHERE id = ?').bind(row2.display_order, id1).run(),
		db.prepare('UPDATE sheet_images SET display_order = ? WHERE id = ?').bind(row1.display_order, id2).run()
	]);

	return json({ ok: true });
}
