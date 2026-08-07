<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import DateBar from '$lib/components/DateBar.svelte';
	import MultiFilter from '$lib/components/MultiFilter.svelte';
	import CustomerModal from '$lib/components/CustomerModal.svelte';
	import { goto, invalidateAll } from '$app/navigation';

	let { data } = $props();

	let openCompany = $state(null);

	// Breakdown table dimension tabs.
	const dimTabs = $derived([
		{ key: 'customers', label: 'Customers' },
		{ key: 'countries', label: 'Countries' },
		{ key: 'groups', label: 'Customer Groups' },
		{ key: 'levels', label: 'Customer Levels' },
		...(data.isAdmin ? [{ key: 'owners', label: 'Owner' }] : []),
	]);
	let dimTab = $state('customers');
	const dimTitle = { countries: 'Country', groups: 'Customer Group', levels: 'Customer Level', owners: 'Owner' };
	const dimRows = $derived(dimTab === 'customers' ? [] : data.dims?.[dimTab] ?? []);
	const activeTabLabel = $derived(dimTabs.find((t) => t.key === dimTab)?.label ?? '');
	let dimSearch = $state('');

	// ── Attention snooze/dismiss menu ────────────────────────────────────────
	let menuFor = $state(null);
	let menuX = $state(0);
	let menuY = $state(0);
	let showSnoozed = $state(false);

	function openMenu(e, cid) {
		e.stopPropagation();
		const r = e.currentTarget.getBoundingClientRect();
		menuX = Math.min(r.left, window.innerWidth - 210);
		menuY = r.bottom + 4;
		menuFor = cid;
	}
	function todayPlus(days) {
		const d = new Date();
		d.setDate(d.getDate() + days);
		return d.toISOString().slice(0, 10);
	}
	async function postHide(companyId, op, until) {
		menuFor = null;
		try {
			await fetch('/api/stats/attention', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ companyId, op, until }),
			});
			await invalidateAll();
		} catch (e) {
			/* ignore */
		}
	}

	// Filter options → {value,label} for the dropdowns.
	const toOpts = (arr) => (arr ?? []).map((v) => ({ value: v, label: v }));
	const levelOpts = $derived(toOpts(data.filterOptions?.levels));
	const groupOpts = $derived(toOpts(data.filterOptions?.groups));
	const countryOpts = $derived(toOpts(data.filterOptions?.countries));
	const repOpts = $derived((data.reps ?? []).map((r) => ({ value: r.email, label: r.name || r.email })));

	const anyFilter = $derived(
		(data.activeFilters?.levels?.length ?? 0) +
			(data.activeFilters?.groups?.length ?? 0) +
			(data.activeFilters?.countries?.length ?? 0) +
			(data.activeFilters?.rep ? 1 : 0) > 0
	);

	/** Append the currently-active filters to a URLSearchParams. */
	function addFilters(p, override = {}) {
		const f = { ...data.activeFilters, ...override };
		if (f.levels?.length) p.set('level', f.levels.join(','));
		if (f.groups?.length) p.set('group', f.groups.join(','));
		if (f.countries?.length) p.set('country', f.countries.join(','));
		if (f.rep) p.set('rep', f.rep);
		return p;
	}
	/** Current period as params (quick key or custom from/to). */
	function periodParams(p) {
		if (data.selected === 'custom') { p.set('from', data.range.start); p.set('to', data.range.endInclusive); }
		else p.set('period', data.selected);
		return p;
	}

	function navigate(p) { goto(`?${p.toString()}`, { noScroll: true }); }

	/** A filter changed → keep the period, swap that filter's values. */
	function applyFilter(key, vals) {
		const override = key === 'rep' ? { rep: vals[0] ?? null } : { [key]: vals };
		navigate(addFilters(periodParams(new URLSearchParams()), override));
	}
	function clearAllFilters() {
		navigate(periodParams(new URLSearchParams()));
	}

	const dkkFmt = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 });
	const numFmt = new Intl.NumberFormat('da-DK');

	function formatDkk(n) {
		return dkkFmt.format(Math.round(n ?? 0)) + ' kr';
	}
	const contactFmt = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', year: 'numeric' });
	function formatDate(s) {
		if (!s) return '—';
		const d = new Date(s + 'T00:00:00Z');
		return isNaN(d.getTime()) ? '—' : contactFmt.format(d);
	}
	function formatPct(pct) {
		if (pct === null || pct === undefined) return null;
		const sign = pct >= 0 ? '+' : '−';
		return `${sign}${Math.abs(pct).toFixed(1)}%`;
	}
	// ── Quarterly target tracker (milestone track) ───────────────────────────
	// Adaptive scale with a 10-point margin each side: lower = min(index,100)−10
	// (keeps last-year 100 visible), upper = max(index, highest target)+10.
	const trackRange = $derived.by(() => {
		if (!data.tracker) return { min: 90, max: 155 };
		const idx = data.tracker.index;
		const highest = Math.max(100, ...data.tracker.targets.map((t) => t.index));
		return { min: Math.min(idx, 100) - 10, max: Math.max(idx, highest) + 10 };
	});
	const nextTarget = $derived(data.tracker ? (data.tracker.targets.find((t) => t.next) ?? null) : null);
	function trackPos(v) {
		const { min, max } = trackRange;
		const span = max - min;
		if (span <= 0) return 0;
		return Math.max(0, Math.min(100, ((v - min) / span) * 100));
	}

	/** Attention priority pill colour. */
	function attnClass(s) { return s >= 60 ? 'hi' : s >= 35 ? 'mid' : 'lo'; }

	/** Index chip colour: ≤95 red, 96–99 orange, 100+ green. */
	function indexClass(idx) {
		if (idx === null || idx === undefined) return 'none';
		if (idx <= 95) return 'red';
		if (idx <= 99) return 'orange';
		return 'green';
	}

	function dataAsOf(meta) {
		if (!meta?.last_run) return null;
		const d = new Date(meta.last_run);
		if (isNaN(d)) return meta.last_run;
		return d.toLocaleString('da-DK', { dateStyle: 'medium', timeStyle: 'short' });
	}

	// ── Breakdown table sorting (shared across Customers + dimension tabs) ─────
	// Keys: 'name' (label column), 'owner', 'rev0'|'rev1'|'rev2' (year columns),
	// 'index'. Default = newest year descending.
	let sortKey = $state('rev2');
	let sortDir = $state('desc'); // 'asc' | 'desc'

	function setSort(key) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = key === 'name' || key === 'owner' ? 'asc' : 'desc';
		}
	}

	/** Sort rows by the active key; `nameField` maps the first column per table. */
	function sortRows(rows, nameField) {
		return [...(rows ?? [])].sort((a, b) => {
			let av, bv;
			if (sortKey === 'name') { av = a[nameField]?.toLowerCase() ?? ''; bv = b[nameField]?.toLowerCase() ?? ''; }
			else if (sortKey === 'owner') { av = a.owner?.toLowerCase() ?? ''; bv = b.owner?.toLowerCase() ?? ''; }
			else if (sortKey === 'index') { av = a.index ?? -Infinity; bv = b.index ?? -Infinity; }
			else { av = a[sortKey] ?? 0; bv = b[sortKey] ?? 0; } // rev0 | rev1 | rev2
			if (av < bv) return sortDir === 'asc' ? -1 : 1;
			if (av > bv) return sortDir === 'asc' ? 1 : -1;
			return 0;
		});
	}
	const sortedCompanies = $derived(sortRows(data.companies, 'name'));
	const sortedDim = $derived(sortRows(dimRows, 'label'));

	// Quick text filter on the dimension value (company / country / owner / …).
	const dimMatch = (s) => (s ?? '').toLowerCase().includes(dimSearch.trim().toLowerCase());
	const filteredCompanies = $derived(dimSearch.trim() ? sortedCompanies.filter((c) => dimMatch(c.name)) : sortedCompanies);
	const filteredDim = $derived(dimSearch.trim() ? sortedDim.filter((d) => dimMatch(d.label)) : sortedDim);
	const tabCount = $derived(dimTab === 'customers' ? filteredCompanies.length : filteredDim.length);

	// Monthly revenue chart — whole current year; filters apply, date picker does not.
	const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const monthlyMax = $derived(Math.max(1, ...(data.monthly?.cur ?? []), ...(data.monthly?.prior ?? [])));
	const barH = (v) => `${((v || 0) / monthlyMax) * 100}%`;

	// ── CSV export of the current breakdown view (admin only) ────────────────
	// Matches the Google-Sheets format used for downstream comparisons: raw
	// unrounded numbers with '.' decimals, '-' for empty/zero cells, and Index
	// as the newest÷prior ratio. Reflects the selected tab, filters and dates.
	function csvEscape(val) {
		const s = String(val);
		return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	}
	function exportCsv() {
		const isCust = dimTab === 'customers';
		const rows = isCust ? filteredCompanies : filteredDim;
		const revCols = data.yearCols.map((y) => `${y} Revenue`);
		const header = isCust
			? ['Company name', 'Owner Name', ...revCols, 'Index']
			: [dimTitle[dimTab], ...revCols, 'Index'];

		const revCell = (v, i) => (data.colNoData[i] || !v ? '-' : String(v));
		const idxCell = (r) => (!data.colNoData[1] && r.rev1 > 0 ? String(r.rev2 / r.rev1) : '-');

		const lines = [header];
		for (const r of rows) {
			const lead = isCust ? [r.name, r.owner ?? ''] : [r.label];
			lines.push([...lead, revCell(r.rev0, 0), revCell(r.rev1, 1), revCell(r.rev2, 2), idxCell(r)]);
		}
		const csv = '﻿' + lines.map((row) => row.map(csvEscape).join(',')).join('\r\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `sales-stats-${dimTab}.csv`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head><title>Sales Stats · Product Portal</title></svelte:head>

<AppNav active="stats" user={data.user} />

<DateBar
	selected={data.selected}
	range={data.range}
	yearOptions={data.yearOptions}
	quarterOptions={data.quarterOptions}
	monthOptions={data.monthOptions}
	filters={data.activeFilters}
/>

<main class="wrap">
	{#snippet filterBar()}
		<div class="filter-bar">
			<span class="fb-label">Filters</span>
			<MultiFilter label="Customer Level" options={levelOpts} selected={data.activeFilters.levels}
				onApply={(v) => applyFilter('levels', v)} />
			<MultiFilter label="Customer Group" options={groupOpts} selected={data.activeFilters.groups}
				onApply={(v) => applyFilter('groups', v)} />
			<MultiFilter label="Country" options={countryOpts} selected={data.activeFilters.countries}
				onApply={(v) => applyFilter('countries', v)} />
			{#if data.isAdmin}
				<MultiFilter label="Owner" single allLabel="All owners" options={repOpts}
					selected={data.activeFilters.rep ? [data.activeFilters.rep] : []}
					onApply={(v) => applyFilter('rep', v)} />
			{/if}
			{#if anyFilter}
				<button type="button" class="fb-clear" onclick={clearAllFilters}>Clear all</button>
			{/if}
		</div>
	{/snippet}

	{#snippet widgetGrid(items)}
		<section class="grid">
			{#each items as w (w.key)}
				<div class="card" class:total={w.key === 'total'}>
					<div class="card-label">{w.label}</div>
					<div class="card-value">{formatDkk(w.dkk)}</div>
					<div class="index-row">
						<span class="index-chip {indexClass(w.index)}">{w.index !== null ? `Index ${w.index}` : 'Index —'}</span>
					</div>
				</div>
			{/each}
		</section>
	{/snippet}

	<div class="section-head"><h2>Company Stats</h2></div>
	{@render widgetGrid(data.companyWidgets)}

	<div class="section-head"><h2>Your stats</h2></div>
	{@render filterBar()}
	{@render widgetGrid(data.widgets)}

	<section class="chart-card">
		<div class="chart-head">
			<h3>Revenue by month · {data.monthly.year}</h3>
			<div class="chart-legend">
				<span class="lg"><i class="sw prior"></i>{data.monthly.year - 1}</span>
				<span class="lg"><i class="sw cur"></i>{data.monthly.year}</span>
			</div>
		</div>
		<div class="chart-plot">
			{#each monthLabels as ml, i}
				{@const cur = data.monthly.cur[i]}
				{@const prior = data.monthly.prior[i]}
				{@const idx = prior > 0 ? Math.round((cur / prior) * 100) : null}
				<div class="chart-col">
					<div class="chart-bars">
						<div class="bar prior" style="height:{barH(prior)}"></div>
						<div class="bar cur" style="height:{barH(cur)}"></div>
						<div class="chart-tip" role="tooltip">
							<div class="tip-h">{ml} {data.monthly.year}</div>
							<div class="tip-row"><span class="tip-k">{data.monthly.year - 1} Revenue</span><span class="tip-v">{formatDkk(prior)}</span></div>
							<div class="tip-row"><span class="tip-k">{data.monthly.year} Revenue</span><span class="tip-v">{formatDkk(cur)}</span></div>
							<div class="tip-row tip-idx"><span class="tip-k">Index</span><span class="index-chip {indexClass(idx)}">{idx ?? '—'}</span></div>
						</div>
					</div>
					<span class="chart-mlabel">{ml}</span>
				</div>
			{/each}
		</div>
	</section>

	{#snippet flagTip(label, milestoneRev, remaining)}
		<span class="flag-tip">
			<span class="ft-row"><span class="ft-k">This period</span><span class="ft-v">{formatDkk(data.tracker.curRev)}</span></span>
			<span class="ft-row"><span class="ft-k">{label}</span><span class="ft-v">{formatDkk(milestoneRev)}</span></span>
			<span class="ft-row ft-rem"><span class="ft-k">Remaining</span><span class="ft-v">{formatDkk(remaining)}</span></span>
		</span>
	{/snippet}

	{#if data.tracker}
		<section class="targets">
			<div class="track-card">
				<div class="tc-head">
					<h2>Quarterly Targets</h2>
					{#if nextTarget}
						<div class="next-callout">
							<span class="nc-dot"></span>
							Next: <strong>{nextTarget.name}</strong> (Index {nextTarget.index}) — <strong>{formatDkk(nextTarget.gap)}</strong>&nbsp;to go
						</div>
					{:else}
						<div class="next-callout done">🎉 All targets reached — great work!</div>
					{/if}
				</div>
				<div class="tc-body">
					<div class="track">
						<div class="track-base"></div>
						<div class="track-fill" style="width:{trackPos(data.tracker.index)}%"></div>
						<div class="flag baseline" class:reached={data.tracker.index >= 100} style="left:{trackPos(100)}%">
							<span class="flabel">
								<span class="fl-name">Last year</span>
								<span class="fl-idx">100</span>
							</span>
							<span class="fdot"></span>
							{@render flagTip('Last year', data.tracker.priorRev, Math.max(0, data.tracker.priorRev - data.tracker.curRev))}
						</div>
						{#each data.tracker.targets as t (t.name)}
							<div class="flag" class:reached={t.reached} class:next={t.next} style="left:{trackPos(t.index)}%">
								<span class="flabel">
									<span class="fl-name">{t.name}</span>
									<span class="fl-idx">{t.index}{t.reached ? ' ✓' : ''}</span>
								</span>
								<span class="fdot"></span>
								{@render flagTip(t.name, t.needed, t.gap)}
							</div>
						{/each}
						<div class="you" style="left:{trackPos(data.tracker.index)}%"><span class="ydot"></span></div>
					</div>
				</div>
			</div>
		</section>
	{/if}

	{#snippet yearHeads()}
		{#each ['rev0', 'rev1', 'rev2'] as key, i}
			<th class="th-sort num" class:sorted={sortKey === key} onclick={() => setSort(key)}>
				{data.yearCols[i]}{#if sortKey === key}<span class="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
			</th>
		{/each}
	{/snippet}

	{#snippet indexHead()}
		<th class="th-sort num" class:sorted={sortKey === 'index'} onclick={() => setSort('index')}>
			Index{#if sortKey === 'index'}<span class="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
		</th>
	{/snippet}

	{#snippet yearCells(row)}
		{#each ['rev0', 'rev1', 'rev2'] as key, i}
			<td class="num" class:nodata={data.colNoData[i]}>{data.colNoData[i] ? '—' : numFmt.format(Math.round(row[key]))}</td>
		{/each}
	{/snippet}

	{#snippet indexCell(idx)}
		<td class="num">
			{#if idx !== null && idx !== undefined}
				<span class="index-chip {indexClass(idx)}">{idx}</span>
			{:else}
				<span class="muted">–</span>
			{/if}
		</td>
	{/snippet}

	<section class="table-wrap">
		<div class="table-head">
			<div class="dim-tabs" role="tablist">
				{#each dimTabs as t}
					<button class="dim-tab" class:on={dimTab === t.key} role="tab" aria-selected={dimTab === t.key} onclick={() => { dimTab = t.key; dimSearch = ''; }}>{t.label}</button>
				{/each}
			</div>
			<span class="count">{numFmt.format(tabCount)}</span>
			{#if data.isAdmin}
				<button class="export-btn" onclick={exportCsv} title="Export the current view to CSV">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
					</svg>
					Export CSV
				</button>
			{/if}
		</div>
		<div class="dim-filter">
			<div class="dim-search">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
				</svg>
				<input type="text" bind:value={dimSearch} placeholder="Search {activeTabLabel}…" aria-label="Filter {activeTabLabel}" />
				{#if dimSearch}
					<button class="dim-search-clear" onclick={() => (dimSearch = '')} aria-label="Clear search" title="Clear">×</button>
				{/if}
			</div>
		</div>
		<div class="table-scroll">
			{#if dimTab === 'customers'}
				<table>
					<colgroup>
						<col />
						<col style="width:150px" />
						<col style="width:116px" />
						<col style="width:116px" />
						<col style="width:116px" />
						<col style="width:86px" />
					</colgroup>
					<thead>
						<tr>
							<th class="th-sort" class:sorted={sortKey === 'name'} onclick={() => setSort('name')}>
								Company name{#if sortKey === 'name'}<span class="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
							</th>
							<th class="th-sort" class:sorted={sortKey === 'owner'} onclick={() => setSort('owner')}>
								Owner Name{#if sortKey === 'owner'}<span class="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
							</th>
							{@render yearHeads()}
							{@render indexHead()}
						</tr>
					</thead>
					<tbody>
						{#each filteredCompanies as c (c.cid)}
							<tr>
								<td class="name">
									<div class="name-cell">
										<span class="cname">{c.name}</span>
										<button class="detail-btn" onclick={() => (openCompany = c)} aria-label="Open customer details" title="Open details">
											<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
												<path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
											</svg>
										</button>
									</div>
								</td>
								<td class="owner">{c.owner ?? '—'}</td>
								{@render yearCells(c)}
								{@render indexCell(c.index)}
							</tr>
						{/each}
						{#if filteredCompanies.length === 0}
							<tr><td colspan="6" class="empty">{dimSearch.trim() ? 'No matches.' : 'No companies in this period.'}</td></tr>
						{/if}
					</tbody>
				</table>
			{:else}
				<table>
					<colgroup>
						<col />
						<col style="width:116px" />
						<col style="width:116px" />
						<col style="width:116px" />
						<col style="width:86px" />
					</colgroup>
					<thead>
						<tr>
							<th class="th-sort" class:sorted={sortKey === 'name'} onclick={() => setSort('name')}>
								{dimTitle[dimTab]}{#if sortKey === 'name'}<span class="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
							</th>
							{@render yearHeads()}
							{@render indexHead()}
						</tr>
					</thead>
					<tbody>
						{#each filteredDim as d (d.key)}
							<tr>
								<td class="name"><span class="cname">{d.label}</span></td>
								{@render yearCells(d)}
								{@render indexCell(d.index)}
							</tr>
						{/each}
						{#if filteredDim.length === 0}
							<tr><td colspan="5" class="empty">{dimSearch.trim() ? 'No matches.' : 'No data in this period.'}</td></tr>
						{/if}
					</tbody>
				</table>
			{/if}
		</div>
	</section>

	{#if data.attention.length}
		<section class="table-wrap attn-wrap">
			<div class="table-head">
				<h2>Customers Needing Attention</h2>
				<span class="count">{numFmt.format(data.attention.length)}</span>
				{#if data.snoozed.length}
					<button class="snz-toggle" onclick={() => (showSnoozed = !showSnoozed)}>
						{showSnoozed ? 'Hide' : 'Show'} snoozed ({data.snoozed.length})
					</button>
				{/if}
			</div>

			{#if showSnoozed && data.snoozed.length}
				<div class="snoozed-list">
					{#each data.snoozed as s (s.cid)}
						<div class="snz-row">
							<span class="snz-name">{s.name}</span>
							<span class="snz-meta">{s.until ? `snoozed until ${s.until}` : s.scope === 'global' ? 'dismissed (everyone)' : 'dismissed'}</span>
							<span class="snz-behind">{formatDkk(s.krBehind)}</span>
							<button class="snz-restore" onclick={() => postHide(s.cid, 'restore')}>Restore</button>
						</div>
					{/each}
				</div>
			{/if}

			<div class="table-scroll">
				<table class="attn-table">
					<colgroup>
						<col style="width:64px" />
						<col />
						<col style="width:120px" />
						<col style="width:150px" />
						<col style="width:280px" />
						<col style="width:64px" />
						<col style="width:150px" />
					</colgroup>
					<thead>
						<tr>
							<th>Prio</th>
							<th>Customer</th>
							<th>Last Contacted</th>
							<th>Owner Name</th>
							<th>Why attention</th>
							<th class="num">Index</th>
							<th class="num">Behind</th>
						</tr>
					</thead>
					<tbody>
						{#each data.attention as a (a.cid)}
							<tr class:menu-open={menuFor === a.cid}>
								<td><span class="pri {attnClass(a.score)}">{a.score}</span></td>
								<td class="name">
									<div class="name-cell">
										<span class="cname">{a.name}</span>
										<button class="detail-btn" onclick={() => (openCompany = { cid: a.cid, name: a.name, owner: a.owner })} aria-label="Open customer details" title="Open details">
											<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
												<path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
											</svg>
										</button>
										<button class="detail-btn" onclick={(e) => openMenu(e, a.cid)} aria-label="Snooze or dismiss" title="Snooze / dismiss">
											<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
												<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
											</svg>
										</button>
									</div>
								</td>
								<td class="lastc">{formatDate(a.lastContacted)}</td>
								<td class="owner">{a.owner ?? '—'}</td>
								<td>
									<span class="whys">
										{#if a.daysSince != null && a.daysSince > 15}<span class="b quiet">Quiet {a.daysSince}d</span>{/if}
										{#if a.freqDropPct > 0}<span class="b ord">Orders −{a.freqDropPct}%</span>{/if}
										{#if a.aovDropPct > 0}<span class="b aov">AOV −{a.aovDropPct}%</span>{/if}
									</span>
								</td>
								<td class="num"><span class="index-chip {indexClass(a.index)}">{a.index ?? '—'}</span></td>
								<td class="num behind-cell">{formatDkk(a.krBehind)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	{#if dataAsOf(data.meta)}
		<p class="freshness">Data synced from HubSpot · last updated {dataAsOf(data.meta)}</p>
	{/if}
</main>

{#if openCompany}
	<CustomerModal
		company={openCompany}
		ranges={data.ranges}
		periodLabel={data.periodLabel}
		priorLabel={data.priorLabel}
		onClose={() => (openCompany = null)}
	/>
{/if}

{#if menuFor}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="menu-backdrop" onclick={() => (menuFor = null)}></div>
	<div class="snz-menu" style="top:{menuY}px; left:{menuX}px;">
		<button onclick={() => postHide(menuFor, 'snooze', todayPlus(7))}>Snooze 7 days</button>
		<button onclick={() => postHide(menuFor, 'snooze', todayPlus(14))}>Snooze 14 days</button>
		<div class="snz-div"></div>
		<button class="snz-dismiss" onclick={() => postHide(menuFor, 'dismiss')}>Dismiss{data.isAdmin ? ' (everyone)' : ''}</button>
	</div>
{/if}

<style>
	.wrap {
		max-width: 1140px;
		margin: 0 auto;
		padding: 28px;
	}

	/* Section heading bar (Company Stats / Your stats) */
	.section-head {
		display: flex;
		align-items: center;
		gap: 14px;
		margin: 28px 0 14px;
	}
	.section-head:first-child { margin-top: 4px; }
	.section-head h2 {
		font-size: 15px;
		font-weight: 800;
		letter-spacing: -0.2px;
		color: #18181B;
		margin: 0;
		white-space: nowrap;
	}
	.section-head::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	.filter-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 16px;
	}
	.fb-label {
		font-size: 11px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #A88B52;
		margin-right: 2px;
	}
	.fb-clear {
		font-family: inherit;
		font-size: 12px;
		font-weight: 700;
		color: #B15A12;
		background: none;
		border: none;
		cursor: pointer;
		padding: 6px 8px;
		border-radius: 8px;
	}
	.fb-clear:hover { background: #FFF5D2; text-decoration: underline; }

	.grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 14px;
	}
	@media (max-width: 900px) {
		.grid { grid-template-columns: repeat(2, 1fr); }
	}
	@media (max-width: 520px) {
		.grid { grid-template-columns: 1fr; }
	}

	/* ── Monthly revenue chart ────────────────────────────────────────────────── */
	.chart-card {
		margin-top: 14px;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
		padding: 18px 20px 14px;
	}
	.chart-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
		margin-bottom: 16px;
	}
	.chart-head h3 {
		font-size: 14px;
		font-weight: 800;
		color: #18181B;
		margin: 0;
		letter-spacing: -0.2px;
	}
	.chart-legend { display: flex; gap: 14px; }
	.chart-legend .lg {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 700;
		color: #8A7550;
	}
	.chart-legend .sw { width: 10px; height: 10px; border-radius: 3px; }
	.sw.cur { background: #F57832; }
	.sw.prior { background: #E7D3A6; }
	.chart-plot {
		display: flex;
		align-items: flex-end;
		gap: 8px;
		height: 172px;
	}
	.chart-col {
		flex: 1;
		min-width: 0;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.chart-bars {
		position: relative;
		flex: 1;
		width: 100%;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		gap: 3px;
	}
	.chart-bars .bar {
		width: 44%;
		max-width: 22px;
		border-radius: 4px 4px 0 0;
		transition: height 0.2s, background 0.12s;
	}
	.chart-bars .bar.cur { background: #F57832; }
	.chart-bars .bar.prior { background: #E7D3A6; }
	.chart-col:hover .bar.cur { background: #E06820; }
	.chart-col:hover .bar.prior { background: #DcC492; }
	.chart-mlabel {
		margin-top: 8px;
		font-size: 11px;
		font-weight: 700;
		color: #A88B52;
	}

	/* Hover tooltip over a month's bars */
	.chart-tip {
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-bottom: 9px;
		width: max-content;
		max-width: 300px;
		display: none;
		z-index: 30;
		pointer-events: none;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 11px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
		padding: 11px 13px;
	}
	.chart-tip::after {
		content: '';
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		border: 6px solid transparent;
		border-top-color: #fff;
		filter: drop-shadow(0 1px 0 var(--border));
	}
	.chart-col:hover .chart-tip { display: block; }
	/* Keep edge tooltips inside the card */
	.chart-col:first-child .chart-tip { left: 0; transform: none; }
	.chart-col:first-child .chart-tip::after { left: 30px; }
	.chart-col:last-child .chart-tip { left: auto; right: 0; transform: none; }
	.chart-col:last-child .chart-tip::after { left: auto; right: 30px; transform: none; }
	.tip-h {
		font-size: 11px;
		font-weight: 800;
		color: #A88B52;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		margin-bottom: 8px;
	}
	.tip-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 3px 0;
	}
	.tip-k { font-size: 12px; font-weight: 600; color: #71717A; white-space: nowrap; }
	.tip-v { font-size: 13px; font-weight: 800; color: #18181B; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.tip-idx {
		margin-top: 5px;
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}

	.card {
		background: #fff;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
		padding: 18px 18px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.card.total {
		background: linear-gradient(135deg, #FFF6E2, #FFE9BE);
		border-color: #F4CE7A;
	}

	.card-label {
		font-size: 12px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: #A88B52;
	}
	.card.total .card-label { color: #B15A12; }

	.card-value {
		font-size: 21px;
		font-weight: 800;
		letter-spacing: -0.6px;
		color: #18181B;
		line-height: 1.1;
	}
	.card.total .card-value { color: #7B3803; }

	.index-row { margin-top: 3px; }
	.index-chip {
		display: inline-flex;
		align-items: center;
		font-size: 12px;
		font-weight: 800;
		padding: 3px 10px;
		border-radius: 100px;
	}
	.index-chip.green  { background: #E7F6EC; color: #16794C; }
	.index-chip.orange { background: #FDEBD2; color: #B4611A; }
	.index-chip.red    { background: #FDECEC; color: #C4381B; }
	.index-chip.none   { background: #F1EEE6; color: #A88B52; }

	/* ── Quarterly target tracker ────────────────────────────────────────────── */
	.targets { margin-top: 26px; }

	.track-card {
		background: #fff;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
	}
	.tc-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		flex-wrap: wrap;
		padding: 11px 16px 11px 20px;
		border-bottom: 1px solid var(--border);
	}
	.tc-head h2 {
		font-size: 15px;
		font-weight: 800;
		color: #18181B;
		margin: 0;
		letter-spacing: -0.2px;
	}
	.tc-body { padding: 16px 26px 24px; }

	.next-callout {
		background: #FFE6A5; color: #7B3803;
		font-size: 13px; font-weight: 700; padding: 7px 14px; border-radius: 100px;
		display: flex; align-items: center; gap: 8px;
	}
	.next-callout .nc-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
	.next-callout.done { background: #E7F6EC; color: #16794C; }

	.track { position: relative; height: 8px; margin: 48px 24px 10px; }
	.track-base { position: absolute; inset: 0; background: #F3E7C4; border-radius: 100px; }
	.track-fill { position: absolute; top: 0; bottom: 0; left: 0; background: var(--accent); border-radius: 100px; }
	.flag { position: absolute; top: 50%; transform: translate(-50%, -50%); }
	/* Dots: white = not reached, orange with white border = reached. */
	.fdot { display: block; width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 2px solid #B79B5E; }
	.flag.reached .fdot { background: var(--accent); border-color: #fff; box-shadow: 0 0 0 1.5px var(--accent); }
	.flabel {
		position: absolute; bottom: calc(100% + 7px); left: 50%; transform: translateX(-50%);
		display: flex; flex-direction: column; align-items: center; gap: 0;
		line-height: 1.2; white-space: nowrap; text-align: center;
		font-size: 11px; font-weight: 800; color: #8A7550;
	}
	.fl-idx { font-weight: 700; }
	.flag.reached .flabel { color: #16794C; }
	.flag.next .flabel { color: #7B3803; }

	/* Hover tooltip on each milestone flag (baseline + targets). */
	.flag { cursor: default; }
	.flag-tip {
		position: absolute;
		top: calc(100% + 13px);
		left: 50%;
		transform: translateX(-50%) translateY(3px);
		min-width: 172px;
		background: #2A2118;
		border-radius: 9px;
		padding: 9px 11px;
		box-shadow: 0 8px 24px rgba(60, 36, 0, 0.22);
		display: flex;
		flex-direction: column;
		gap: 5px;
		opacity: 0;
		visibility: hidden;
		pointer-events: none;
		transition: opacity 0.12s ease, transform 0.12s ease;
		z-index: 5;
	}
	.flag-tip::before {
		content: '';
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		border: 6px solid transparent;
		border-bottom-color: #2A2118;
	}
	.flag:hover { z-index: 6; }
	.flag:hover .flag-tip { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0); }
	.ft-row { display: flex; justify-content: space-between; gap: 18px; font-size: 12px; white-space: nowrap; line-height: 1.3; }
	.ft-k { color: #C9BCA8; font-weight: 600; }
	.ft-v { color: #fff; font-weight: 800; font-variant-numeric: tabular-nums; }
	.ft-rem { border-top: 1px solid rgba(255, 255, 255, 0.14); padding-top: 6px; margin-top: 1px; }
	.ft-rem .ft-k, .ft-rem .ft-v { color: #FFB27A; }
	.you { position: absolute; top: 50%; transform: translate(-50%, -50%); z-index: 2; }
	.ydot {
		display: block; width: 20px; height: 20px; border-radius: 50%;
		background: var(--accent); border: 3px solid #fff; box-shadow: 0 0 0 2px var(--accent);
	}

	/* ── Customers needing attention (reuses .table-wrap styles) ─────────────── */
	.attn-wrap { margin-top: 26px; }
	.attn-table { table-layout: fixed; }
	/* Keep every column on one line; truncate names/owner with ellipsis. */
	.attn-table .name-cell { min-width: 0; }
	.attn-table .cname { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	/* Trim the priority column's padding so the narrower column still fits. */
	.attn-table th:first-child, .attn-table td:first-child { padding-right: 6px; }
	.attn-table td.owner { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.attn-table td.lastc { white-space: nowrap; color: #6b5e4e; font-variant-numeric: tabular-nums; }
	.attn-table .whys { flex-wrap: nowrap; }
	.pri {
		display: inline-flex; align-items: center; justify-content: center;
		min-width: 30px; height: 22px; padding: 0 7px; border-radius: 7px;
		font-size: 12.5px; font-weight: 900;
	}
	.pri.hi { background: #FDECEC; color: #C4381B; }
	.pri.mid { background: #FDEBD2; color: #B4611A; }
	.pri.lo { background: #F1EEE6; color: #8A7550; }
	.behind-cell { color: #C4381B; }

	/* snooze/dismiss menu + snoozed list */
	.snz-toggle {
		margin-left: auto; background: none; border: none; font-family: inherit;
		font-size: 12.5px; font-weight: 700; color: #B15A12; cursor: pointer;
		padding: 4px 8px; border-radius: 7px;
	}
	.snz-toggle:hover { background: #FFF5D2; }
	.snoozed-list { background: #FFFBEF; border-bottom: 1px solid var(--border); padding: 4px 20px; }
	.snz-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; font-size: 13px; border-bottom: 1px solid #F5EDD8; }
	.snz-row:last-child { border-bottom: none; }
	.snz-name { font-weight: 700; color: #18181B; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.snz-meta { color: #8A7550; font-weight: 600; white-space: nowrap; }
	.snz-behind { color: #C4381B; font-weight: 700; font-variant-numeric: tabular-nums; width: 96px; text-align: right; }
	.snz-restore { background: #FFE6A5; color: #7B3803; border: none; border-radius: 7px; font-family: inherit; font-size: 12px; font-weight: 700; padding: 6px 12px; cursor: pointer; flex-shrink: 0; }
	.snz-restore:hover { background: #F8D97F; }

	.menu-backdrop { position: fixed; inset: 0; z-index: 250; }
	.snz-menu {
		position: fixed; z-index: 251; min-width: 190px;
		background: #fff; border: 1px solid var(--border); border-radius: 10px;
		box-shadow: 0 10px 30px rgba(100, 60, 0, 0.16); padding: 5px;
		display: flex; flex-direction: column;
	}
	.snz-menu button {
		text-align: left; background: none; border: none; font-family: inherit;
		font-size: 13px; font-weight: 600; color: #3f3a33; padding: 8px 10px;
		border-radius: 7px; cursor: pointer; white-space: nowrap;
		display: flex; align-items: center; gap: 6px;
	}
	.snz-menu button:hover { background: #FFF5D2; color: #7B3803; }
	.snz-div { height: 1px; background: var(--border); margin: 4px 6px; }
	.snz-dismiss { color: #C4381B; }
	.snz-dismiss:hover { background: #FEF2F2 !important; color: #C4381B !important; }
	.whys { display: flex; flex-wrap: wrap; gap: 5px; }
	.b { font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 100px; white-space: nowrap; }
	.b.quiet { background: #FDECEC; color: #C4381B; }
	.b.ord { background: #FDEBD2; color: #B4611A; }
	.b.aov { background: #EEF1F5; color: #3E5060; }

	/* ── Companies table ─────────────────────────────────────────────────────── */
	.table-wrap {
		margin-top: 26px;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow);
		overflow: hidden;
	}
	.table-head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border);
	}
	.table-head h2 {
		font-size: 15px;
		font-weight: 800;
		color: #18181B;
		margin: 0;
		letter-spacing: -0.2px;
	}
	.count {
		font-size: 12px;
		font-weight: 700;
		color: #A88B52;
		background: #FFF5D2;
		padding: 2px 9px;
		border-radius: 100px;
	}
	.dim-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		flex: 1;
		min-width: 0;
	}
	.dim-tab {
		font-size: 13px;
		font-weight: 700;
		color: #6B7280;
		background: transparent;
		border: none;
		padding: 6px 12px;
		border-radius: 8px;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.12s, color 0.12s;
	}
	.dim-tab:hover { background: #F4F4F5; color: #18181B; }
	.dim-tab.on { background: #18181B; color: #fff; }

	.export-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: inherit;
		font-size: 12.5px;
		font-weight: 700;
		color: #524431;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 6px 11px;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.12s, color 0.12s, border-color 0.12s;
	}
	.export-btn:hover { background: #FFF5D2; color: #7B3803; border-color: #F4CE7A; }

	.dim-filter {
		padding: 10px 16px;
		border-bottom: 1px solid var(--border);
	}
	.dim-search {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		width: 100%;
		max-width: 300px;
		padding: 6px 10px;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: #fff;
		transition: border-color 0.12s, box-shadow 0.12s;
	}
	.dim-search:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.12);
	}
	.dim-search svg { color: #B7A579; flex-shrink: 0; }
	.dim-search input {
		flex: 1;
		min-width: 0;
		border: none;
		background: none;
		outline: none;
		font-family: inherit;
		font-size: 13px;
		color: #3f3a33;
	}
	.dim-search input::placeholder { color: #B7A579; }
	.dim-search-clear {
		flex-shrink: 0;
		border: none;
		background: none;
		cursor: pointer;
		color: #A88B52;
		font-size: 16px;
		line-height: 1;
		padding: 0 2px;
	}
	.dim-search-clear:hover { color: #7B3803; }

	.table-scroll {
		max-height: 620px;
		overflow: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13.5px;
	}
	thead th {
		position: sticky;
		top: 0;
		z-index: 1;
		background: #FBEFCB;
		color: #7B3803;
		font-weight: 800;
		text-align: left;
		padding: 11px 20px;
		white-space: nowrap;
		border-bottom: 1px solid var(--border);
		user-select: none;
	}
	th.num, td.num { text-align: right; white-space: nowrap; }
	.th-sort { cursor: pointer; transition: background 0.12s; }
	.th-sort:hover { background: #F8E6B0; }
	.th-sort.sorted { color: #B15A12; }
	.caret { font-size: 9px; margin-left: 4px; }

	tbody td {
		padding: 11px 20px;
		border-bottom: 1px solid #F5EDD8;
		color: #3f3a33;
		vertical-align: middle;
	}
	tbody tr:nth-child(even) td { background: #FFFBEF; }
	tbody tr:hover td { background: #FFF5D2; }
	td.name { font-weight: 700; color: #18181B; }
	.name-cell { display: flex; align-items: center; gap: 8px; }
	.detail-btn {
		flex-shrink: 0;
		display: inline-flex; align-items: center; justify-content: center;
		width: 24px; height: 24px; border-radius: 6px;
		border: 1px solid var(--border); background: #fff; color: #A88B52;
		cursor: pointer; opacity: 0; transition: opacity 0.12s, background 0.12s, color 0.12s;
	}
	tbody tr:hover .detail-btn { opacity: 1; }
	tbody tr.menu-open .detail-btn { opacity: 1; }
	tbody tr.menu-open td { background: #FFF5D2; }
	.detail-btn:hover { background: #FFE6A5; color: #7B3803; }
	@media (hover: none) { .detail-btn { opacity: 1; } }
	td.owner { color: #6b5e4e; }
	td.num { font-variant-numeric: tabular-nums; font-weight: 600; }

	td.num.nodata { color: #C7C7CC; font-weight: 500; }
	.muted { color: #C0AC7C; }

	.empty { text-align: center; color: #A1A1AA; padding: 28px; }

	.freshness {
		margin-top: 18px;
		font-size: 12px;
		color: #A1A1AA;
	}
</style>
