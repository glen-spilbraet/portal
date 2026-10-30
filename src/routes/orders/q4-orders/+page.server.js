// Access is enforced by the root layout (/orders/q4-orders requires the
// `q4_orders` permission). The draft data is fetched client-side from
// /api/q4-orders because pulling every draft + its colli takes a few seconds
// and we want a visible loading state rather than a blocked navigation.
export async function load() {
	return {};
}
