import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';

const RACKBEAT_BASE = 'https://app.rackbeat.com/api';

export async function GET({ params, cookies, platform }) {
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

	const orderNumber = params.number;

	try {
		const res = await fetch(
			`${RACKBEAT_BASE}/orders/${encodeURIComponent(orderNumber)}/lines`,
			{ headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } }
		);
		if (!res.ok) error(502, `Rackbeat returned ${res.status}`);
		const body = await res.json();
		return json({ lines: body.order_lines ?? [] });
	} catch (err) {
		if (err.status) throw err;
		error(502, `Rackbeat error: ${err.message}`);
	}
}
