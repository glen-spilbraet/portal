import { error, fail } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { RELATION_LANGS, listRelationTypes, typeLabelsFromForm, createRelationType, updateRelationType, deleteRelationType } from '$lib/server/relations.js';

export async function load({ parent, platform }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	return { user, types: await listRelationTypes(db, { counts: true }), langs: RELATION_LANGS };
}

/** Form actions have no `parent()`; check the session like the admin API routes do. @param {any} event */
async function requireAdmin({ cookies, platform }) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const user = await getAllowedUser(db, email);
	if (!user || user.role !== 'admin') error(403, 'Admins only');
	return { db };
}

export const actions = {
	save: async (event) => {
		const { db } = await requireAdmin(event);
		const f = await event.request.formData();
		const labels = typeLabelsFromForm(f);
		if (!labels.da && !labels.en) return fail(400, { error: 'Give the type at least a Danish or English name.' });
		const id = String(f.get('id') ?? '');
		const position = parseInt(String(f.get('position') ?? '0')) || 0;
		if (id) await updateRelationType(db, id, labels, position);
		else await createRelationType(db, labels, position);
		return { ok: id ? 'Type saved.' : 'Type created.' };
	},
	delete: async (event) => {
		const { db } = await requireAdmin(event);
		const f = await event.request.formData();
		await deleteRelationType(db, String(f.get('id')));
		return { ok: 'Deleted.' };
	}
};
