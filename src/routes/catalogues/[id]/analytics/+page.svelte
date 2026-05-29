<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	// ── Filters ───────────────────────────────────────────────────────────────
	let filterTrackingId = $state('');
	let filterFrom       = $state('');
	let filterTo         = $state('');

	/** All distinct tracking IDs in data (excluding null/empty) */
	const allTrackingIds = $derived(
		[...new Set(data.sessions.map(s => s.trackingId).filter(Boolean))].sort()
	);

	// ── Quick-select helpers ──────────────────────────────────────────────────
	function todayBounds() {
		const d = new Date(); d.setHours(0, 0, 0, 0);
		return { from: fmtDate(d), to: fmtDate(d) };
	}
	function thisWeekBounds() {
		const now = new Date(); now.setHours(0, 0, 0, 0);
		const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
		const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
		return { from: fmtDate(mon), to: fmtDate(sun) };
	}
	function lastWeekBounds() {
		const now = new Date(); now.setHours(0, 0, 0, 0);
		const thisMon = new Date(now); thisMon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
		const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
		const lastSun = new Date(thisMon); lastSun.setDate(thisMon.getDate() - 1);
		return { from: fmtDate(lastMon), to: fmtDate(lastSun) };
	}
	function thisMonthBounds() {
		const now = new Date();
		const from = new Date(now.getFullYear(), now.getMonth(), 1);
		const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
		return { from: fmtDate(from), to: fmtDate(to) };
	}
	function lastMonthBounds() {
		const now = new Date();
		const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
		const to   = new Date(now.getFullYear(), now.getMonth(), 0);
		return { from: fmtDate(from), to: fmtDate(to) };
	}

	/** @param {Date} d */
	function fmtDate(d) {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}

	function applyQuick(bounds) {
		filterFrom = bounds.from;
		filterTo   = bounds.to;
	}

	function clearFilters() {
		filterTrackingId = '';
		filterFrom = '';
		filterTo   = '';
	}

	// ── Filtered sessions ─────────────────────────────────────────────────────
	const filtered = $derived((() => {
		let list = data.sessions;

		if (filterTrackingId) {
			list = list.filter(s => s.trackingId === filterTrackingId);
		}

		if (filterFrom) {
			const fromTs = new Date(filterFrom).getTime() / 1000;
			list = list.filter(s => s.sessionAt >= fromTs);
		}

		if (filterTo) {
			const toTs = (new Date(filterTo).getTime() / 1000) + 86399; // end of day
			list = list.filter(s => s.sessionAt <= toTs);
		}

		return list;
	})());

	const totalEvents = $derived(filtered.reduce((n, s) => n + s.events.length, 0));

	const hasFilters = $derived(!!(filterTrackingId || filterFrom || filterTo));

	// ── Formatting ────────────────────────────────────────────────────────────
	/** @param {number} ts */
	function fmt(ts) {
		if (!ts) return '—';
		const d = new Date(ts * 1000);
		const Y = d.getFullYear();
		const M = String(d.getMonth() + 1).padStart(2, '0');
		const D = String(d.getDate()).padStart(2, '0');
		const h = String(d.getHours()).padStart(2, '0');
		const m = String(d.getMinutes()).padStart(2, '0');
		return `${Y}.${M}.${D} ${h}:${m}`;
	}

	/** @param {string} eventType @param {number|null} page */
	function eventLabel(eventType, page) {
		switch (eventType) {
			case 'view_page':       return `View catalogue (Page ${page})`;
			case 'download_photos': return 'Download photos';
			case 'download_excel':  return 'Download data';
			case 'download_pdf':    return 'Download as PDF';
			case 'view_end':        return 'View end of catalogue';
			default:                return eventType;
		}
	}

	/** @param {string} eventType */
	function eventIcon(eventType) {
		switch (eventType) {
			case 'view_page':       return 'eye';
			case 'download_photos': return 'image';
			case 'download_excel':  return 'table';
			case 'download_pdf':    return 'file';
			case 'view_end':        return 'flag';
			default:                return 'dot';
		}
	}

	// ── Collapse / expand ─────────────────────────────────────────────────────
	/** @type {Record<string, boolean>} */
	let expanded = $state({});

	/** @param {string} id */
	function toggleSession(id) {
		expanded = { ...expanded, [id]: !expanded[id] };
	}
</script>

<svelte:head>
	<title>{data.catalogue.name} — Analytics</title>
</svelte:head>

<AppNav active="catalogues" user={data.user} />

<div class="layout">
	<!-- ── Left panel: filters ────────────────────────────────────────────── -->
	<aside class="sidebar">
		<div class="sidebar-section">
			<p class="sidebar-heading">Tracking ID</p>
			{#if allTrackingIds.length === 0}
				<p class="sidebar-empty">No tracking IDs</p>
			{:else}
				<select class="filter-select" bind:value={filterTrackingId}>
					<option value="">All</option>
					{#each allTrackingIds as tid}
						<option value={tid}>{tid}</option>
					{/each}
				</select>
			{/if}
		</div>

		<div class="sidebar-section">
			<p class="sidebar-heading">Date range</p>

			<div class="date-fields">
				<label class="date-label">
					<span>From</span>
					<input class="date-input" type="date" bind:value={filterFrom} />
				</label>
				<label class="date-label">
					<span>To</span>
					<input class="date-input" type="date" bind:value={filterTo} />
				</label>
			</div>

			<div class="quick-btns">
				<button class="quick-btn" onclick={() => applyQuick(todayBounds())}>Today</button>
				<button class="quick-btn" onclick={() => applyQuick(thisWeekBounds())}>This Week</button>
				<button class="quick-btn" onclick={() => applyQuick(lastWeekBounds())}>Last Week</button>
				<button class="quick-btn" onclick={() => applyQuick(thisMonthBounds())}>This Month</button>
				<button class="quick-btn" onclick={() => applyQuick(lastMonthBounds())}>Last Month</button>
			</div>
		</div>

		{#if hasFilters}
			<button class="clear-btn" onclick={clearFilters}>
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
					<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
				</svg>
				Clear filters
			</button>
		{/if}
	</aside>

	<!-- ── Main content ───────────────────────────────────────────────────── -->
	<main class="main">
		<div class="page-header">
			<div>
				<a href="/catalogues" class="back-link">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="15 18 9 12 15 6" />
					</svg>
					All catalogues
				</a>
				<h1 class="page-title">{data.catalogue.name}</h1>
				<p class="page-sub">
					{filtered.length} {filtered.length === 1 ? 'session' : 'sessions'}
					{#if hasFilters && filtered.length !== data.sessions.length}
						<span class="filtered-note">of {data.sessions.length} total</span>
					{/if}
					· {totalEvents} events
				</p>
			</div>
		</div>

		{#if data.sessions.length === 0}
			<div class="empty">No visits recorded yet.</div>
		{:else if filtered.length === 0}
			<div class="empty">No sessions match the current filters.</div>
		{:else}
			<div class="sessions">
				{#each filtered as session (session.id)}
					{@const summaryTypes = [...new Set(session.events.filter(e => e.eventType !== 'view_page').map(e => e.eventType))]}
					<div class="session-card">
						<button class="session-header" onclick={() => toggleSession(session.id)}>
							<div class="device-icon">
								{#if session.deviceType === 'iPhone' || session.deviceType === 'Android'}
									<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
									</svg>
								{:else if session.deviceType === 'iPad' || session.deviceType === 'Android Tablet'}
									<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
									</svg>
								{:else}
									<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
										<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
									</svg>
								{/if}
							</div>
							<div class="session-meta">
								<span class="session-label">
									{session.deviceType}{session.city ? ` · ${session.city}` : ''}
									{#if session.trackingId}
										<span class="tracking-badge">{session.trackingId}</span>
									{/if}
								</span>
							</div>
							{#if summaryTypes.length > 0}
								<div class="header-event-icons">
									{#each summaryTypes as et}
										<span class="header-ev-icon header-ev-{et}" title={eventLabel(et, null)}>
											{#if et === 'download_photos'}
												<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
													<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
												</svg>
											{:else if et === 'download_excel'}
												<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
													<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>
												</svg>
											{:else if et === 'download_pdf'}
												<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
													<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
												</svg>
											{:else if et === 'view_end'}
												<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
													<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
												</svg>
											{/if}
										</span>
									{/each}
								</div>
							{/if}
							<span class="session-time">{fmt(session.sessionAt)}</span>
							<svg class="chevron" class:open={expanded[session.id]} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
								<polyline points="9 18 15 12 9 6"/>
							</svg>
						</button>

						{#if expanded[session.id]}
							{#if session.events.length === 0}
								<p class="no-events">No events recorded in this session.</p>
							{:else}
								<ul class="event-list">
									{#each session.events as ev (ev.id)}
										{@const icon = eventIcon(ev.eventType)}
										<li class="event-row event-{ev.eventType}">
											<span class="event-dot">
												{#if icon === 'eye'}
													<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
														<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
													</svg>
												{:else if icon === 'image'}
													<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
														<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
													</svg>
												{:else if icon === 'table'}
													<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
														<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/>
													</svg>
												{:else if icon === 'file'}
													<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
														<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
													</svg>
												{:else if icon === 'flag'}
													<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
														<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
													</svg>
												{:else}
													<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="4"/></svg>
												{/if}
											</span>
											<span class="event-label">{eventLabel(ev.eventType, ev.page)}</span>
											<span class="event-ts">{fmt(ev.eventAt)}</span>
										</li>
									{/each}
								</ul>
							{/if}
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</main>
</div>

<style>
	.layout {
		display: flex;
		min-height: calc(100vh - 56px);
		max-width: 1140px;
		margin: 0 auto;
		width: 100%;
		padding: 0 28px;
	}

	/* ── Sidebar ─────────────────────────────────────────────────────────────── */

	.sidebar {
		width: 220px;
		flex-shrink: 0;
		padding: 28px 18px 40px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.sidebar-section {
		margin-bottom: 24px;
	}

	.sidebar-heading {
		font-size: 11px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: #a89060;
		margin: 0 0 10px;
	}

	.sidebar-empty {
		font-size: 13px;
		color: #b0a899;
		margin: 0;
	}

	.filter-select {
		width: 100%;
		padding: 7px 10px;
		border: 1px solid #e4e2db;
		border-radius: 8px;
		font-size: 13px;
		font-family: 'Nunito', sans-serif;
		font-weight: 600;
		color: #18181b;
		background: white;
		cursor: pointer;
		outline: none;
		transition: border-color 0.15s;
	}
	.filter-select:focus { border-color: #a89060; }

	.date-fields {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 10px;
	}

	.date-label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 11px;
		font-weight: 700;
		color: #7b6a52;
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}

	.date-input {
		padding: 7px 10px;
		border: 1px solid #e4e2db;
		border-radius: 8px;
		font-size: 13px;
		font-family: 'Nunito', sans-serif;
		color: #18181b;
		background: white;
		outline: none;
		transition: border-color 0.15s;
		width: 100%;
		box-sizing: border-box;
	}
	.date-input:focus { border-color: #a89060; }

	.quick-btns {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.quick-btn {
		background: none;
		border: 1px solid #e4e2db;
		border-radius: 7px;
		padding: 6px 10px;
		font-size: 12px;
		font-weight: 600;
		font-family: 'Nunito', sans-serif;
		color: #5c4f3d;
		cursor: pointer;
		text-align: left;
		transition: background 0.12s, border-color 0.12s, color 0.12s;
	}
	.quick-btn:hover {
		background: #f5f0e8;
		border-color: #c9b896;
		color: #3a2e1e;
	}

	.clear-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: none;
		border: 1px solid #fca5a5;
		border-radius: 7px;
		padding: 6px 12px;
		font-size: 12px;
		font-weight: 700;
		font-family: 'Nunito', sans-serif;
		color: #ef4444;
		cursor: pointer;
		margin-top: 4px;
		transition: background 0.12s;
	}
	.clear-btn:hover { background: #fef2f2; }

	/* ── Main ────────────────────────────────────────────────────────────────── */

	.main {
		flex: 1;
		min-width: 0;
		padding: 40px 40px 80px;
		max-width: 820px;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 13px;
		font-weight: 600;
		color: #a89060;
		text-decoration: none;
		margin-bottom: 10px;
		transition: color 0.12s;
	}
	.back-link:hover { color: #7b3803; }

	.page-title {
		font-size: 26px;
		font-weight: 800;
		color: #18181b;
		letter-spacing: -0.5px;
		margin: 0 0 4px;
	}

	.page-sub {
		font-size: 14px;
		color: #a89060;
		font-weight: 500;
		margin: 0;
	}

	.filtered-note {
		color: #c4b08a;
		font-weight: 400;
	}

	.page-header {
		margin-bottom: 28px;
	}

	.empty {
		text-align: center;
		padding: 64px 0;
		color: #aaa;
		font-size: 14px;
	}

	/* ── Sessions ─────────────────────────────────────────────────────────────── */

	.sessions {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.session-card {
		background: white;
		border: 1px solid var(--border, #e4e2db);
		border-radius: 14px;
		overflow: hidden;
	}

	.session-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 13px 18px;
		background: #fafaf8;
		border: none;
		border-bottom: 1px solid var(--border, #e4e2db);
		width: 100%;
		text-align: left;
		cursor: pointer;
		font-family: 'Nunito', sans-serif;
		transition: background 0.12s;
	}
	.session-header:hover { background: #f5f0e8; }

	.device-icon {
		width: 24px;
		height: 24px;
		background: #ffe6a5;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #7b3803;
		flex-shrink: 0;
	}

	.session-meta {
		flex: 1;
		min-width: 0;
	}

	.session-label {
		font-size: 14px;
		font-weight: 700;
		color: #18181b;
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}

	.tracking-badge {
		display: inline-block;
		background: #fef3c7;
		color: #92400e;
		font-size: 11px;
		font-weight: 700;
		padding: 2px 7px;
		border-radius: 20px;
		letter-spacing: 0.2px;
	}

	.session-time {
		font-size: 12px;
		color: #a0998a;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.header-event-icons {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.header-ev-icon {
		width: 20px;
		height: 20px;
		border-radius: 5px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		background: #f4f4f5;
		color: #71717a;
	}
	.header-ev-download_photos { background: #f0fdf4; color: #16a34a; }
	.header-ev-download_excel  { background: #f0fdf4; color: #16a34a; }
	.header-ev-download_pdf    { background: #fef3c7; color: #d97706; }
	.header-ev-view_end        { background: #faf5ff; color: #7c3aed; }

	.chevron {
		flex-shrink: 0;
		color: #a0998a;
		transform: rotate(0deg);
		transition: transform 0.18s ease;
	}
	.chevron.open {
		transform: rotate(90deg);
	}

	.no-events {
		padding: 16px 18px;
		font-size: 13px;
		color: #a0998a;
		margin: 0;
	}

	/* ── Event list ───────────────────────────────────────────────────────────── */

	.event-list {
		list-style: none;
		margin: 0;
		padding: 6px 0;
	}

	.event-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 7px 18px;
		transition: background 0.1s;
	}
	.event-row:hover { background: #fdfcfa; }

	.event-dot {
		width: 22px;
		height: 22px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		background: #f4f4f5;
		color: #71717a;
	}

	/* Colour-code event types */
	.event-view_page .event-dot       { background: #eff6ff; color: #2563eb; }
	.event-download_photos .event-dot { background: #f0fdf4; color: #16a34a; }
	.event-download_excel .event-dot  { background: #f0fdf4; color: #16a34a; }
	.event-download_pdf .event-dot    { background: #fef3c7; color: #d97706; }
	.event-view_end .event-dot        { background: #faf5ff; color: #7c3aed; }

	.event-label {
		flex: 1;
		font-size: 13px;
		color: #3a3228;
		font-weight: 500;
	}

	.event-ts {
		font-size: 12px;
		color: #a0998a;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
</style>
