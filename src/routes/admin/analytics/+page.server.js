import { error } from '@sveltejs/kit';
import { effectiveParams, resolveRange, getPeriodOptions, addDaysStr } from '$lib/server/statsRange.js';

/** YYYY-MM-DD (UTC midnight) → unix seconds. */
function toEpoch(ymd) {
	return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 1000);
}

/**
 * Aggregate one dimension: visits (distinct sessions), page views, downloads and
 * last visit, for sessions inside the window. Events are joined only within the
 * window so their counts match the selected range.
 */
async function dimBreakdown(db, groupExpr, labelExpr, s0, s1) {
	const rows = await db
		.prepare(
			`SELECT ${groupExpr} AS key, ${labelExpr} AS label,
			        COUNT(DISTINCT s.id) AS visits,
			        COUNT(CASE WHEN e.event_type = 'view_page' THEN 1 END) AS page_views,
			        COUNT(CASE WHEN e.event_type LIKE 'download_%' THEN 1 END) AS downloads,
			        MAX(s.created_at) AS last_visit
			 FROM catalogue_analytics_sessions s
			 LEFT JOIN catalogue_analytics_events e
			        ON e.session_id = s.id AND e.created_at >= ? AND e.created_at < ?
			 LEFT JOIN catalogues c ON c.id = s.catalogue_id
			 LEFT JOIN allowed_users u ON u.email = c.created_by
			 WHERE s.created_at >= ? AND s.created_at < ?
			 GROUP BY ${groupExpr}
			 ORDER BY visits DESC
			 LIMIT 200`
		)
		.bind(s0, s1, s0, s1)
		.all();
	return (rows.results ?? []).map((r) => ({
		key: r.key ?? '—',
		label: r.label || r.key || '—',
		visits: r.visits || 0,
		pageViews: r.page_views || 0,
		downloads: r.downloads || 0,
		lastVisit: r.last_visit || null
	}));
}

export async function load({ parent, platform, url, cookies }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const now = new Date();
	const { yearOptions, quarterOptions, monthOptions } = getPeriodOptions(now);
	const { cur, label, selected } = resolveRange(effectiveParams(url, cookies), now);
	const range = { start: cur.start, endInclusive: addDaysStr(cur.end, -1) };
	const s0 = toEpoch(cur.start);
	const s1 = toEpoch(cur.end);

	// Bucket granularity for the time chart adapts to range length.
	const days = Math.max(1, Math.round((s1 - s0) / 86400));
	const bucket = days <= 62 ? 'day' : days <= 400 ? 'week' : 'month';
	const fmt = bucket === 'day' ? '%Y-%m-%d' : bucket === 'week' ? '%Y-%W' : '%Y-%m';

	const [kpiSess, kpiEv, series, catalogues, owners, countries, devices, languages, feed] = await Promise.all([
		db.prepare(
			`SELECT COUNT(*) AS visits, COUNT(DISTINCT catalogue_id) AS catalogues
			 FROM catalogue_analytics_sessions WHERE created_at >= ? AND created_at < ?`
		).bind(s0, s1).first(),
		db.prepare(
			`SELECT COUNT(CASE WHEN event_type = 'view_page' THEN 1 END) AS page_views,
			        COUNT(CASE WHEN event_type LIKE 'download_%' THEN 1 END) AS downloads,
			        COUNT(CASE WHEN event_type = 'view_end' THEN 1 END) AS session_ends
			 FROM catalogue_analytics_events WHERE created_at >= ? AND created_at < ?`
		).bind(s0, s1).first(),
		db.prepare(
			`SELECT strftime('${fmt}', created_at, 'unixepoch') AS b, COUNT(*) AS visits
			 FROM catalogue_analytics_sessions WHERE created_at >= ? AND created_at < ?
			 GROUP BY b ORDER BY b`
		).bind(s0, s1).all(),
		dimBreakdown(db, 's.catalogue_id', 'c.name', s0, s1),
		dimBreakdown(db, 'c.created_by', "COALESCE(NULLIF(u.first_name,''), c.created_by, 'Unknown')", s0, s1),
		dimBreakdown(db, "COALESCE(NULLIF(s.country,''),'Unknown')", "COALESCE(NULLIF(s.country,''),'Unknown')", s0, s1),
		dimBreakdown(db, "COALESCE(NULLIF(s.device_type,''),'Unknown')", "COALESCE(NULLIF(s.device_type,''),'Unknown')", s0, s1),
		dimBreakdown(db, "COALESCE(NULLIF(c.language,''),'—')", "COALESCE(NULLIF(c.language,''),'—')", s0, s1),
		db.prepare(
			`SELECT e.event_type AS type, e.page, e.created_at AS ts,
			        COALESCE(c.name,'(deleted)') AS catalogue,
			        COALESCE(NULLIF(u.first_name,''), c.created_by, '—') AS owner,
			        s.country, s.device_type AS device
			 FROM catalogue_analytics_events e
			 JOIN catalogue_analytics_sessions s ON s.id = e.session_id
			 LEFT JOIN catalogues c ON c.id = s.catalogue_id
			 LEFT JOIN allowed_users u ON u.email = c.created_by
			 WHERE e.created_at >= ? AND e.created_at < ?
			 ORDER BY e.created_at DESC LIMIT 50`
		).bind(s0, s1).all()
	]);

	const visits = kpiSess?.visits || 0;
	const pageViews = kpiEv?.page_views || 0;
	const kpis = {
		visits,
		catalogues: kpiSess?.catalogues || 0,
		pageViews,
		downloads: kpiEv?.downloads || 0,
		sessionEnds: kpiEv?.session_ends || 0,
		avgPages: visits ? Math.round((pageViews / visits) * 10) / 10 : 0
	};

	// Fill day buckets so the chart has no gaps; week/month plotted as-returned.
	let chart = (series.results ?? []).map((r) => ({ b: r.b, visits: r.visits || 0 }));
	if (bucket === 'day') {
		const byDay = Object.fromEntries(chart.map((r) => [r.b, r.visits]));
		const out = [];
		for (let t = s0; t < s1; t += 86400) {
			const d = new Date(t * 1000).toISOString().slice(0, 10);
			out.push({ b: d, visits: byDay[d] || 0 });
		}
		chart = out;
	}

	return {
		user,
		selected, range, label, yearOptions, quarterOptions, monthOptions,
		kpis,
		bucket,
		chart,
		dims: { catalogues, owners, countries, devices, languages },
		feed: feed.results ?? []
	};
}
