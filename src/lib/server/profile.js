import { error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';

/**
 * Portal user profiles (photo, phone, title), kept by each user on /profile
 * and shown to their customers in the B2B shop. Admins may edit anyone's.
 */

/**
 * The profile the signed-in user may edit: their own, or (admins) `email`.
 * @param {any} cookies @param {any} platform @param {string | null | undefined} email
 * @returns {Promise<{ db: any, me: string, target: string }>}
 */
export async function profileTarget(cookies, platform, email) {
	const me = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!me) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const target = String(email ?? '').trim().toLowerCase() || me;
	if (target !== me) {
		const user = await getAllowedUser(db, me);
		if (user?.role !== 'admin') error(403, 'You can only edit your own profile');
	}
	if (!(await getAllowedUser(db, target))) error(404, 'No such user');
	return { db, me, target };
}

/** @param {any} db @param {string} email */
export function getProfile(db, email) {
	return db.prepare('SELECT email, name, first_name, department, phone, job_title, photo_key, profile_updated_at FROM allowed_users WHERE email = ?').bind(email).first();
}

/** A phone number as typed, tidied: digits, spaces, + and - only. '' = none. @param {unknown} v */
export function cleanPhone(v) {
	const s = String(v ?? '').replace(/[^\d+\s-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
	return /\d{6,}/.test(s.replace(/\D/g, '')) ? s : '';
}
