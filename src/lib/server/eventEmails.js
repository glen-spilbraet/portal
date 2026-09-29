/**
 * Event email flow — timed steps (relative to the event date) and their per-language
 * templates. Builder only for now; the sending engine comes later.
 */

export const EMAIL_LANGS = ['da', 'se', 'no', 'en'];
export const LANG_LABELS = { da: 'Dansk', se: 'Svenska', no: 'Norsk', en: 'English' };

function uid() { return crypto.randomUUID(); }

/** All steps in flow order (before → after), with which languages have content. */
export async function listSteps(db) {
	const [steps, tpls] = await Promise.all([
		db.prepare('SELECT * FROM event_email_step ORDER BY offset_days, sort').all(),
		db.prepare('SELECT step_id, lang, subject, body FROM event_email_template').all(),
	]);
	const filled = {};
	for (const t of tpls.results ?? []) {
		const hasContent = (t.subject && t.subject.trim()) || (t.body && t.body.trim());
		if (hasContent) (filled[t.step_id] ??= []).push(t.lang);
	}
	return (steps.results ?? []).map((s) => ({ ...s, languages: filled[s.id] ?? [] }));
}

/** One step plus its templates as a {lang: {subject, body}} map. */
export async function getStep(db, id) {
	const step = await db.prepare('SELECT * FROM event_email_step WHERE id = ?').bind(id).first();
	if (!step) return null;
	const tpls = await db.prepare('SELECT lang, subject, body FROM event_email_template WHERE step_id = ?').bind(id).all();
	const templates = {};
	for (const l of EMAIL_LANGS) templates[l] = { subject: '', body: '' };
	for (const t of tpls.results ?? []) templates[t.lang] = { subject: t.subject ?? '', body: t.body ?? '' };
	return { ...step, templates };
}

export async function createStep(db, patch) {
	const id = uid();
	await db.prepare(
		`INSERT INTO event_email_step (id, offset_days, name, ask_participants, ask_images, skip_if_complete, active, sort)
		 VALUES (?,?,?,?,?,?,?,?)`
	).bind(
		id,
		Number(patch.offset_days) || 0,
		patch.name ?? 'New step',
		patch.ask_participants ? 1 : 0,
		patch.ask_images ? 1 : 0,
		patch.skip_if_complete ? 1 : 0,
		patch.active === false ? 0 : 1,
		Number(patch.sort) || 0,
	).run();
	return id;
}

export async function updateStep(db, id, patch) {
	const cols = { offset_days: 1, name: 1, ask_participants: 1, ask_images: 1, skip_if_complete: 1, active: 1, sort: 1 };
	const boolCols = { ask_participants: 1, ask_images: 1, skip_if_complete: 1, active: 1 };
	const fields = [], values = [];
	for (const [k, v] of Object.entries(patch)) {
		if (!cols[k]) continue;
		fields.push(`${k} = ?`);
		values.push(boolCols[k] ? (v ? 1 : 0) : v);
	}
	if (!fields.length) return;
	values.push(id);
	await db.prepare(`UPDATE event_email_step SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deleteStep(db, id) {
	await db.batch([
		db.prepare('DELETE FROM event_email_template WHERE step_id = ?').bind(id),
		db.prepare('DELETE FROM event_email_step WHERE id = ?').bind(id),
	]);
}

/** Insert or update one language's template for a step. */
export async function upsertTemplate(db, stepId, lang, { subject, body }) {
	if (!EMAIL_LANGS.includes(lang)) return;
	await db.prepare(
		`INSERT INTO event_email_template (step_id, lang, subject, body) VALUES (?,?,?,?)
		 ON CONFLICT(step_id, lang) DO UPDATE SET subject = excluded.subject, body = excluded.body`
	).bind(stepId, lang, subject ?? null, body ?? null).run();
}
