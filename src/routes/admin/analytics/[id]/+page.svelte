<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

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

	/** @param {{deviceType:string, city:string|null, country:string|null}} session */
	function sessionHeader(session) {
		const parts = [session.deviceType];
		if (session.city) parts.push(`from ${session.city}`);
		return parts.join(' ');
	}

	const totalSessions = $derived(data.sessions.length);
	const totalEvents   = $derived(data.sessions.reduce((n, s) => n + s.events.length, 0));
</script>

<svelte:head>
	<title>{data.catalogue.name} — Analytics</title>
</svelte:head>

<AppNav active="analytics" user={data.user} />

<main class="page">
	<div class="page-header">
		<div>
			<a href="/admin/analytics" class="back-link">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="15 18 9 12 15 6" />
				</svg>
				All catalogues
			</a>
			<h1 class="page-title">{data.catalogue.name}</h1>
			<p class="page-sub">{totalSessions} {totalSessions === 1 ? 'session' : 'sessions'} · {totalEvents} events</p>
		</div>
	</div>

	{#if data.sessions.length === 0}
		<div class="empty">No visits recorded yet.</div>
	{:else}
		<div class="sessions">
			{#each data.sessions as session (session.id)}
				<div class="session-card">
					<div class="session-header">
						<!-- Device icon -->
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
						<span class="session-label">{sessionHeader(session)}</span>
						<span class="session-time">{fmt(session.sessionAt)}</span>
					</div>

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
										{/if}
									</span>
									<span class="event-label">{eventLabel(ev.eventType, ev.page)}</span>
									<span class="event-ts">{fmt(ev.eventAt)}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</main>

<style>
	.page {
		max-width: 760px;
		margin: 0 auto;
		padding: 40px 28px 80px;
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
		border: 1px solid var(--border);
		border-radius: 14px;
		overflow: hidden;
	}

	.session-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 13px 18px;
		background: #fafaf8;
		border-bottom: 1px solid var(--border);
	}

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

	.session-label {
		font-size: 14px;
		font-weight: 700;
		color: #18181b;
		flex: 1;
	}

	.session-time {
		font-size: 12px;
		color: #a0998a;
		font-variant-numeric: tabular-nums;
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
