import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';

/**
 * Returns the effective email for write operations (created_by, etc.).
 *
 * When an admin is simulating another user the `simulate_as` cookie is set.
 * In that case we return the simulated user's email so items are attributed
 * to the simulated user rather than to the real admin.
 *
 * Returns null if the session token is missing or invalid.
 */
export async function getEffectiveEmail(cookies, platform) {
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email = await verifySession(cookies.get('session') ?? '', secret);
	if (!email) return null;

	const simEmail = cookies.get('simulate_as');
	if (simEmail && simEmail !== email) {
		// Only real admins may simulate — verify role before trusting the cookie
		const db = platform?.env?.DB;
		if (db) {
			const user = await getAllowedUser(db, email);
			if (user?.role === 'admin') return simEmail;
		}
	}

	return email;
}
