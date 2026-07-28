import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';

/**
 * Customer detail for the Sales Stats modal: KPI tiles (this period vs the same
 * period last year), a full-year monthly series (current vs prior year), and
 * the order lists for both periods. Owner-scoped for non-admins.
 */
export async function GET({ url, cookies, platform }) {
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email = await verifySession(cookies.get('session') ?? '', secret);
	if (!email) error(401, 'Unauthorised');

	const db = platform?.env?.DB;
	const salesDb = platform?.env?.SALES_DB;
	if (!db || !salesDb) error(500, 'Database unavailable');

	const user = await getAllowedUser(db, email);
	if (!user) error(403, 'Forbidden');
	const perms = await getUserPermissions(db, user);
	if (!perms.stats) error(403, 'No access to stats');

	// Simulation-aware effective identity (matches the dashboard).
	let effEmail = email;
	let effRole = user.role;
	if (user.role === 'admin') {
		const sim = cookies.get('simulate_as');
		if (sim && sim !== email) {
			const su = await getAllowedUser(db, sim);
			if (su) { effEmail = sim; effRole = su.role; }
		}
	}
	const ownerScope = effRole === 'admin' ? null : effEmail;

	const id = url.searchParams.get('id');
	if (!id) error(400, 'Missing id');
	const curStart = url.searchParams.get('curStart');
	const curEnd = url.searchParams.get('curEnd');
	const priorStart = url.searchParams.get('priorStart');
	const priorEnd = url.searchParams.get('priorEnd');
	const year = parseInt(url.searchParams.get('year') ?? '', 10) || new Date().getUTCFullYear();

	// company_id filter (+ optional owner scope). id 'none' = the no-company bucket.
	const base = "COALESCE(company_id, 'none') = ?";
	const ownerSql = ownerScope ? ' AND owner_email = ?' : '';
	const scopeBinds = ownerScope ? [ownerScope] : [];

	async function periodTotals(start, end) {
		const row = await salesDb
			.prepare(`SELECT COALESCE(SUM(amount_dkk),0) AS rev, COUNT(*) AS n FROM sales_deals WHERE ${base} AND close_date >= ? AND close_date < ?${ownerSql}`)
			.bind(id, start, end, ...scopeBinds)
			.first();
		return { revenue: row?.rev ?? 0, orders: row?.n ?? 0 };
	}
	async function periodOrders(start, end) {
		const rows = await salesDb
			.prepare(`SELECT deal_id AS id, close_date AS date, amount_dkk AS dkk FROM sales_deals WHERE ${base} AND close_date >= ? AND close_date < ?${ownerSql} ORDER BY close_date DESC, deal_id DESC`)
			.bind(id, start, end, ...scopeBinds)
			.all();
		return rows.results ?? [];
	}

	const info = await salesDb
		.prepare(`SELECT COALESCE(company_name,'(No company)') AS name, MAX(owner_name) AS owner, MAX(country) AS country, MAX(customer_level) AS level, MAX(customer_group) AS grp FROM sales_deals WHERE ${base}${ownerSql}`)
		.bind(id, ...scopeBinds)
		.first();
	if (!info || info.name === null) error(404, 'Company not found');

	const [cur, prior, ordersCur, ordersPrev, monthRows] = await Promise.all([
		periodTotals(curStart, curEnd),
		periodTotals(priorStart, priorEnd),
		periodOrders(curStart, curEnd),
		periodOrders(priorStart, priorEnd),
		salesDb
			.prepare(`SELECT substr(close_date,1,4) AS yr, CAST(substr(close_date,6,2) AS INTEGER) AS mo, COALESCE(SUM(amount_dkk),0) AS dkk FROM sales_deals WHERE ${base} AND close_date >= ? AND close_date < ?${ownerSql} GROUP BY yr, mo`)
			.bind(id, `${year - 1}-01-01`, `${year + 1}-01-01`, ...scopeBinds)
			.all(),
	]);

	// Build 12-month series: current year vs prior year.
	const curByMo = {}, prevByMo = {};
	for (const r of monthRows.results ?? []) {
		(r.yr === String(year) ? curByMo : prevByMo)[r.mo] = r.dkk;
	}
	const monthly = Array.from({ length: 12 }, (_, i) => ({
		month: i + 1,
		cur: curByMo[i + 1] ?? 0,
		prev: prevByMo[i + 1] ?? 0,
	}));

	return json({
		company: {
			id,
			name: info.name,
			owner: info.owner,
			country: info.country,
			level: info.level,
			group: info.grp,
			hasCompany: id !== 'none',
		},
		year,
		tiles: {
			curRevenue: cur.revenue,
			curOrders: cur.orders,
			priorRevenue: prior.revenue,
			priorOrders: prior.orders,
		},
		monthly,
		ordersCur,
		ordersPrev,
	});
}
