import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';
import { fetchRackbeatOrders } from '$lib/rackbeat.js';

export async function GET({ cookies, platform }) {
	const token  = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email  = await verifySession(token ?? '', secret);
	if (!email) error(401, 'Unauthorised');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const user = await getAllowedUser(db, email);
	if (!user) error(403, 'Access denied');

	if (user.role !== 'admin') error(403, 'No access to orders');

	const apiKey = platform?.env?.RACKBEAT_API_KEY;
	if (!apiKey) error(500, 'Rackbeat API key not configured');

	// When an admin is simulating another user, apply that user's perspective
	let effectiveEmail = email;
	let effectiveRole  = user.role;

	if (user.role === 'admin') {
		const simEmail = cookies.get('simulate_as');
		if (simEmail && simEmail !== email) {
			const simUser = await getAllowedUser(db, simEmail);
			if (simUser) {
				effectiveEmail = simUser.email.toLowerCase();
				effectiveRole  = simUser.role;
			}
		}
	}

	// Admins (or simulated admins) see all orders; everyone else filtered by email
	const filterEmail = effectiveRole === 'admin' ? null : effectiveEmail.toLowerCase();

	try {
		const { orders, debug } = await fetchRackbeatOrders(apiKey, filterEmail);
		return json({ orders, userRole: effectiveRole, userEmail: effectiveEmail, debug });
	} catch (err) {
		error(502, `Rackbeat error: ${err.message}`);
	}
}
