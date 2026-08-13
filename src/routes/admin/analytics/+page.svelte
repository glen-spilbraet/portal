<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import DateBar from '$lib/components/DateBar.svelte';

	let { data } = $props();

	const numFmt = new Intl.NumberFormat('da-DK');
	const dtFmt = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	function fdate(ts) { return ts ? dtFmt.format(new Date(ts * 1000)) : '—'; }

	// ── Activity chart ────────────────────────────────────────────────────────
	const chartMax = $derived(Math.max(1, ...data.chart.map((c) => c.visits)));
	function barLabel(b) {
		if (data.bucket === 'day') { const d = new Date(b + 'T00:00:00Z'); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
		if (data.bucket === 'week') return 'w' + b.slice(5);
		const d = new Date(b + '-01T00:00:00Z'); return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
	}
	const labelStep = $derived(Math.max(1, Math.ceil(data.chart.length / 10)));

	// ── Dimension tabs ────────────────────────────────────────────────────────
	const TABS = [
		{ key: 'catalogues', label: 'Catalogues', col: 'Catalogue', link: true },
		{ key: 'owners', label: 'Owners', col: 'Owner' },
		{ key: 'countries', label: 'Countries', col: 'Country' },
		{ key: 'devices', label: 'Devices', col: 'Device' },
		{ key: 'languages', label: 'Languages', col: 'Language' }
	];
	let activeTab = $state('catalogues');
	let query = $state('');
	let sortKey = $state('visits');
	let sortDir = $state('desc');
	const activeCol = $derived(TABS.find((t) => t.key === activeTab)?.col ?? '');
	const activeLink = $derived(TABS.find((t) => t.key === activeTab)?.link ?? false);

	function setSort(key) {
		if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else { sortKey = key; sortDir = key === 'label' ? 'asc' : 'desc'; }
	}
	const rows = $derived.by(() => {
		const q = query.trim().toLowerCase();
		let list = (data.dims[activeTab] ?? []).filter((r) => !q || (r.label ?? '').toLowerCase().includes(q));
		const dir = sortDir === 'asc' ? 1 : -1;
		return [...list].sort((a, b) => {
			const av = a[sortKey], bv = b[sortKey];
			if (typeof av === 'string' || typeof bv === 'string') return (av ?? '').localeCompare(bv ?? '') * dir;
			return ((av ?? 0) - (bv ?? 0)) * dir;
		});
	});

	// ── Event feed ────────────────────────────────────────────────────────────
	function eventMeta(type, page) {
		switch (type) {
			case 'view_page': return { label: `Page view${page != null ? ' · p.' + page : ''}`, icon: 'eye', tone: 'accent' };
			case 'download_photos': return { label: 'Download · Photos', icon: 'img', tone: 'success' };
			case 'download_excel': return { label: 'Download · Excel', icon: 'sheet', tone: 'success' };
			case 'download_pdf': return { label: 'Download · PDF', icon: 'pdf', tone: 'success' };
			case 'view_end': return { label: 'Session end', icon: 'end', tone: 'muted' };
			default: return { label: type, icon: 'dot', tone: 'muted' };
		}
	}
</script>

<svelte:head><title>Analytics · Admin · Product Portal</title></svelte:head>

<AppNav active="analytics" user={data.user} />

<DateBar
	selected={data.selected}
	range={data.range}
	yearOptions={data.yearOptions}
	quarterOptions={data.quarterOptions}
	monthOptions={data.monthOptions}
/>

<main class="wrap">
	<div class="head">
		<h1>Catalogue Analytics</h1>
		<p class="sub">Share-link engagement · {data.label}</p>
	</div>

	<div class="cards">
		<div class="card total"><span class="k">Visits</span><span class="v">{numFmt.format(data.kpis.visits)}</span></div>
		<div class="card"><span class="k">Catalogues viewed</span><span class="v">{numFmt.format(data.kpis.catalogues)}</span></div>
		<div class="card"><span class="k">Page views</span><span class="v">{numFmt.format(data.kpis.pageViews)}</span></div>
		<div class="card"><span class="k">Downloads</span><span class="v">{numFmt.format(data.kpis.downloads)}</span></div>
		<div class="card"><span class="k">Avg pages / visit</span><span class="v">{data.kpis.avgPages.toLocaleString('da-DK')}</span></div>
	</div>

	<div class="panel chart-panel">
		<div class="panel-head"><h2>Visits over time</h2><span class="hint">per {data.bucket}</span></div>
		{#if data.chart.some((c) => c.visits > 0)}
			<div class="chart">
				{#each data.chart as c, i (c.b)}
					<div class="col" title="{c.b}: {c.visits} visits">
						<div class="bar" style="height:{Math.max(c.visits > 0 ? 2 : 0, (c.visits / chartMax) * 140)}px"></div>
					</div>
				{/each}
			</div>
			<div class="chart-labels">
				{#each data.chart as c, i (c.b)}
					<div class="clab">{i % labelStep === 0 ? barLabel(c.b) : ''}</div>
				{/each}
			</div>
		{:else}
			<div class="empty-inline">No visits in this period.</div>
		{/if}
	</div>

	<div class="panel">
		<div class="tabs">
			{#each TABS as t}
				<button class="tab" class:active={activeTab === t.key} onclick={() => { activeTab = t.key; query = ''; }}>{t.label}</button>
			{/each}
			<div class="tab-search">
				<input placeholder="Filter…" bind:value={query} />
			</div>
		</div>
		<div class="table-scroll">
			<table>
				<thead>
					<tr>
						<th class="sortable" onclick={() => setSort('label')}>{activeCol}{#if sortKey === 'label'}<span class="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}</th>
						<th class="num sortable" onclick={() => setSort('visits')}>Visits{#if sortKey === 'visits'}<span class="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}</th>
						<th class="num sortable" onclick={() => setSort('pageViews')}>Page views{#if sortKey === 'pageViews'}<span class="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}</th>
						<th class="num sortable" onclick={() => setSort('downloads')}>Downloads{#if sortKey === 'downloads'}<span class="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}</th>
						<th class="sortable" onclick={() => setSort('lastVisit')}>Last visit{#if sortKey === 'lastVisit'}<span class="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as r (r.key)}
						<tr>
							<td class="lbl">
								{#if activeLink && r.key}
									<a href="/admin/analytics/{r.key}">{r.label}</a>
								{:else}{r.label}{/if}
							</td>
							<td class="num strong">{numFmt.format(r.visits)}</td>
							<td class="num">{numFmt.format(r.pageViews)}</td>
							<td class="num">{numFmt.format(r.downloads)}</td>
							<td class="muted">{fdate(r.lastVisit)}</td>
						</tr>
					{:else}
						<tr><td colspan="5" class="empty-inline">No data in this period.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<div class="panel">
		<div class="panel-head"><h2>Recent events</h2><span class="hint">latest 50</span></div>
		<div class="feed">
			{#each data.feed as e (e.id)}
				{@const m = eventMeta(e.type, e.page)}
				<div class="frow">
					<span class="fbadge {m.tone}">{m.label}</span>
					<span class="fcat">{e.catalogue}</span>
					<span class="fowner">{e.owner}</span>
					<span class="fmeta">{[e.country, e.device].filter(Boolean).join(' · ') || '—'}</span>
					<span class="ftime">{fdate(e.ts)}</span>
				</div>
			{:else}
				<div class="empty-inline">No events in this period.</div>
			{/each}
		</div>
	</div>
</main>

<style>
	.wrap { max-width: 1140px; margin: 0 auto; padding: 20px 28px 64px; }
	.head { margin-bottom: 16px; }
	.head h1 { font-size: 20px; font-weight: 800; color: #18181B; margin: 0 0 3px; letter-spacing: -0.3px; }
	.sub { font-size: 13px; color: #98876e; margin: 0; }

	.cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 16px; }
	.card { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 13px 15px; display: flex; flex-direction: column; gap: 3px; }
	.card.total { background: #FFF8E8; border-color: #F4CE7A; }
	.card .k { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #A88B52; }
	.card .v { font-size: 23px; font-weight: 800; color: #18181B; }
	.card.total .v { color: #7B3803; }

	.panel { background: #fff; border: 1px solid var(--border); border-radius: 14px; margin-bottom: 16px; overflow: hidden; }
	.panel-head { display: flex; align-items: baseline; justify-content: space-between; padding: 14px 18px 0; }
	.panel-head h2 { font-size: 14px; font-weight: 800; color: #18181B; margin: 0; }
	.hint { font-size: 12px; color: #A88B52; }

	.chart-panel { padding-bottom: 14px; }
	.chart { display: flex; align-items: flex-end; gap: 4px; height: 150px; padding: 14px 18px 0; }
	.col { flex: 1; display: flex; align-items: flex-end; height: 100%; min-width: 0; }
	.bar { width: 100%; border-radius: 3px 3px 0 0; background: var(--accent); min-height: 0; transition: opacity 0.1s; }
	.col:hover .bar { opacity: 0.8; }
	.chart-labels { display: flex; gap: 4px; padding: 6px 18px 0; }
	.clab { flex: 1; text-align: center; font-size: 10px; color: #A88B52; white-space: nowrap; overflow: hidden; min-width: 0; }

	.tabs { display: flex; align-items: center; gap: 4px; padding: 12px 14px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
	.tab { font-family: inherit; font-size: 13px; font-weight: 700; color: #8A7550; background: none; border: none; padding: 7px 12px; border-radius: 8px; cursor: pointer; }
	.tab:hover { background: #FBF7EF; }
	.tab.active { background: #18181B; color: #fff; }
	.tab-search { margin-left: auto; }
	.tab-search input { font-family: inherit; font-size: 13px; padding: 7px 11px; border: 1px solid var(--border); border-radius: 8px; background: #fff; color: #524431; }
	.tab-search input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245,120,50,0.14); }

	.table-scroll { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 13px; }
	th { text-align: left; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #A88B52; padding: 10px 18px; background: #FBF7EF; border-bottom: 1px solid var(--border); white-space: nowrap; }
	th.num { text-align: right; }
	th.sortable { cursor: pointer; user-select: none; }
	.caret { margin-left: 4px; font-size: 9px; }
	td { padding: 10px 18px; border-bottom: 1px solid #F1EADB; }
	tbody tr:last-child td { border-bottom: none; }
	.lbl { color: #18181B; font-weight: 700; }
	.lbl a { color: #B15A12; text-decoration: none; }
	.lbl a:hover { text-decoration: underline; }
	td.num { text-align: right; font-variant-numeric: tabular-nums; color: #6b5e4e; }
	td.num.strong { color: #18181B; font-weight: 700; }
	.muted { color: #98876e; }

	.feed { display: flex; flex-direction: column; padding: 4px 0; }
	.frow { display: flex; align-items: center; gap: 12px; padding: 9px 18px; border-bottom: 1px solid #F1EADB; }
	.frow:last-child { border-bottom: none; }
	.fbadge { font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 100px; white-space: nowrap; width: 132px; text-align: center; flex-shrink: 0; }
	.fbadge.accent { background: #FFE6C7; color: #9A3412; }
	.fbadge.success { background: #E7F6EC; color: #16794C; }
	.fbadge.muted { background: #F1ECE1; color: #7a6b57; }
	.fcat { font-size: 13px; font-weight: 700; color: #18181B; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.fowner { font-size: 12px; color: #6b5e4e; width: 120px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.fmeta { font-size: 12px; color: #98876e; width: 170px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.ftime { font-size: 12px; color: #98876e; width: 96px; text-align: right; flex-shrink: 0; }

	.empty-inline { padding: 26px 18px; text-align: center; color: #98876e; font-size: 13px; }

	@media (max-width: 900px) { .cards { grid-template-columns: 1fr 1fr 1fr; } .fowner, .fmeta { display: none; } }
	@media (max-width: 560px) { .cards { grid-template-columns: 1fr 1fr; } }
</style>
