import { error } from '@sveltejs/kit';
import { getProfile } from '$lib/server/profile.js';

/** /profile — your own profile; admins can open anyone's with ?email=. */
export async function load({ parent, platform, url }) {
	const { user } = await parent();
	if (!user) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const asked = (url.searchParams.get('email') ?? '').trim().toLowerCase();
	const email = asked && user.role === 'admin' ? asked : user.email;
	const profile = await getProfile(db, email);
	if (!profile) error(404, 'No such user');
	return { user, profile, own: email === user.email };
}
