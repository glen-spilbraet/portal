import { redirect } from '@sveltejs/kit';

/**
 * GET /api/admin/simulate/end
 * Server-side cookie clear + redirect — works even if client JS fails.
 */
export async function GET({ cookies }) {
	cookies.delete('simulate_as', { path: '/' });
	redirect(303, '/catalogues');
}
