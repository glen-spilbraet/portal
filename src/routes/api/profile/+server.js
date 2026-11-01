import { json } from '@sveltejs/kit';
import { profileTarget, cleanPhone } from '$lib/server/profile.js';
import { notifyShops } from '$lib/server/shopNotify.js';

/** POST /api/profile { email?, phone, job_title } — save a profile (own, or any as admin). */
export async function POST({ request, cookies, platform }) {
	const body = await request.json().catch(() => ({}));
	const { db, target } = await profileTarget(cookies, platform, body.email);
	const phone = cleanPhone(body.phone);
	const title = String(body.job_title ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
	await db.prepare('UPDATE allowed_users SET phone = ?, job_title = ?, profile_updated_at = ? WHERE email = ?')
		.bind(phone || null, title || null, new Date().toISOString(), target).run();
	await notifyShops(platform, { type: 'reps' });
	return json({ ok: true, phone, job_title: title });
}
