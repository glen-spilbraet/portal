<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import MultiFilter from '$lib/components/MultiFilter.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();

	const isQuickSelected = $derived(data.selected !== 'custom');

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

	function pickQuick(e) {
		const v = e.currentTarget.value;
		if (!v) return;
		const p = new URLSearchParams();
		p.set('period', v);
		navigate(addFilters(p));
	}
	function applyCustom(e) {
		e.preventDefault();
		const f = e.currentTarget;
		if (!f.from.value || !f.to.value) return;
		const p = new URLSearchParams();
		p.set('from', f.from.value);
		p.set('to', f.to.value);
		navigate(addFilters(p));
	}
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

	// ── Companies table sorting ──────────────────────────────────────────────
	let sortKey = $state('revenue');
	let sortDir = $state('desc'); // 'asc' | 'desc'

	function setSort(key) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = key === 'name' || key === 'owner' ? 'asc' : 'desc';
		}
	}

	const sortedCompanies = $derived(
		[...(data.companies ?? [])].sort((a, b) => {
			let av, bv;
			if (sortKey === 'name') { av = a.name?.toLowerCase() ?? ''; bv = b.name?.toLowerCase() ?? ''; }
			else if (sortKey === 'owner') { av = a.owner?.toLowerCase() ?? ''; bv = b.owner?.toLowerCase() ?? ''; }
			else if (sortKey === 'pct') { av = a.pct ?? -Infinity; bv = b.pct ?? -Infinity; }
			else { av = a.revenue; bv = b.revenue; }
			if (av < bv) return sortDir === 'asc' ? -1 : 1;
			if (av > bv) return sortDir === 'asc' ? 1 : -1;
			return 0;
		})
	);
</script>

<svelte:head><title>Sales Stats · Product Portal</title></svelte:head>

<AppNav active="stats" user={data.user} />

<main class="wrap">
	<header class="page-head">
		<div class="head-top">
			<h1>Sales Stats</h1>
			<p class="sub">
				Revenue by market · <strong>{data.periodLabel}</strong>
				{#if !data.isAdmin}<span class="scope">· your accounts</span>{/if}
			</p>
		</div>

		<div class="filter-bar">
			<span class="fb-label">Filters</span>
			<MultiFilter label="Customer Level" options={levelOpts} selected={data.activeFilters.levels}
				onApply={(v) => applyFilter('levels', v)} />
			<MultiFilter label="Customer Group" options={groupOpts} selected={data.activeFilters.groups}
				onApply={(v) => applyFilter('groups', v)} />
			<MultiFilter label="Country" options={countryOpts} selected={data.activeFilters.countries}
				onApply={(v) => applyFilter('countries', v)} />
			{#if data.isAdmin}
				<MultiFilter label="Sales Rep" single options={repOpts}
					selected={data.activeFilters.rep ? [data.activeFilters.rep] : []}
					onApply={(v) => applyFilter('rep', v)} />
			{/if}
			{#if anyFilter}
				<button type="button" class="fb-clear" onclick={clearAllFilters}>Clear all</button>
			{/if}
		</div>

		<div class="controls">
			<div class="range-controls">
				<select class="quick-select" class:active={isQuickSelected} aria-label="Quick select" onchange={pickQuick}>
					<option value="" disabled selected={!isQuickSelected}>Quick Select</option>
					<optgroup label="Year">
						{#each data.yearOptions as o}
							<option value={o.key} selected={data.selected === o.key}>{o.label}</option>
						{/each}
					</optgroup>
					<optgroup label="Quarter">
						{#each data.quarterOptions as o}
							<option value={o.key} selected={data.selected === o.key}>{o.label}</option>
						{/each}
					</optgroup>
					<optgroup label="Month">
						{#each data.monthOptions as o}
							<option value={o.key} selected={data.selected === o.key}>{o.label}</option>
						{/each}
					</optgroup>
				</select>

				<form class="custom-range" onsubmit={applyCustom}>
					<input type="date" name="from" value={data.range.start} class="date-input" aria-label="From date" />
					<span class="range-dash">–</span>
					<input type="date" name="to" value={data.range.endInclusive} class="date-input" aria-label="To date" />
					<button type="submit" class="apply-btn" class:active={data.selected === 'custom'}>Apply</button>
				</form>
			</div>
		</div>
	</header>

	<section class="grid">
		{#each data.widgets as w (w.key)}
			<div class="card" class:total={w.key === 'total'}>
				<div class="card-label">{w.label}</div>
				<div class="card-value">{formatDkk(w.dkk)}</div>
				<div class="index-row">
					<span class="index-chip {indexClass(w.index)}">{w.index !== null ? `Index ${w.index}` : 'Index —'}</span>
				</div>
			</div>
		{/each}
	</section>

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
						</div>
						{#each data.tracker.targets as t (t.name)}
							<div class="flag" class:reached={t.reached} class:next={t.next} style="left:{trackPos(t.index)}%">
								<span class="flabel">
									<span class="fl-name">{t.name}</span>
									<span class="fl-idx">{t.index}{t.reached ? ' ✓' : ''}</span>
								</span>
								<span class="fdot"></span>
							</div>
						{/each}
						<div class="you" style="left:{trackPos(data.tracker.index)}%"><span class="ydot"></span></div>
					</div>
				</div>
			</div>
		</section>
	{/if}

	<section class="table-wrap">
		<div class="table-head">
			<h2>Companies</h2>
			<span class="count">{numFmt.format(sortedCompanies.length)}</span>
		</div>
		<div class="table-scroll">
			<table>
				<thead>
					<tr>
						<th class="th-sort" class:sorted={sortKey === 'name'} onclick={() => setSort('name')}>
							Company name{#if sortKey === 'name'}<span class="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
						</th>
						<th class="th-sort" class:sorted={sortKey === 'owner'} onclick={() => setSort('owner')}>
							Owner Name{#if sortKey === 'owner'}<span class="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
						</th>
						<th class="th-sort num" class:sorted={sortKey === 'revenue'} onclick={() => setSort('revenue')}>
							Revenue{#if sortKey === 'revenue'}<span class="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
						</th>
						<th class="th-sort num" class:sorted={sortKey === 'pct'} onclick={() => setSort('pct')}>
							% Δ{#if sortKey === 'pct'}<span class="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
						</th>
					</tr>
				</thead>
				<tbody>
					{#each sortedCompanies as c (c.cid)}
						<tr>
							<td class="name">{c.name}</td>
							<td class="owner">{c.owner ?? '—'}</td>
							<td class="num">{numFmt.format(Math.round(c.revenue))}</td>
							<td class="num">
								{#if c.pct !== null}
									<span class="delta" class:up={c.pct >= 0} class:down={c.pct < 0}>
										{c.pct >= 0 ? '' : '−'}{Math.abs(c.pct).toFixed(1)}%
										<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
											{#if c.pct >= 0}<polyline points="6 15 12 9 18 15" />{:else}<polyline points="6 9 12 15 18 9" />{/if}
										</svg>
									</span>
								{:else}
									<span class="delta flat">–</span>
								{/if}
							</td>
						</tr>
					{/each}
					{#if sortedCompanies.length === 0}
						<tr><td colspan="4" class="empty">No companies in this period.</td></tr>
					{/if}
				</tbody>
			</table>
		</div>
	</section>

	{#if dataAsOf(data.meta)}
		<p class="freshness">Data synced from HubSpot · last updated {dataAsOf(data.meta)}</p>
	{/if}
</main>

<style>
	.wrap {
		max-width: 1140px;
		margin: 0 auto;
		padding: 28px;
	}

	.page-head {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin-bottom: 22px;
	}
	.controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px 20px;
		flex-wrap: wrap;
	}
	.filter-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
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
	h1 {
		font-size: 24px;
		font-weight: 800;
		letter-spacing: -0.4px;
		color: #18181B;
		margin: 0;
	}
	.sub {
		font-size: 14px;
		color: #8A7550;
		margin: 4px 0 0;
	}
	.sub strong { color: #7B3803; font-weight: 700; }
	.scope { color: #A1A1AA; }

	.range-controls {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.quick-select {
		font-family: inherit;
		font-size: 13px;
		font-weight: 700;
		color: #524431;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 7px 10px;
		cursor: pointer;
	}
	.quick-select:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.15);
	}
	.quick-select.active {
		background: #FFE6A5;
		color: #7B3803;
		border-color: #F4CE7A;
	}

	.custom-range {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.date-input {
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		color: #524431;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 6px 8px;
	}
	.date-input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.15);
	}
	.range-dash { color: #A88B52; font-weight: 700; }
	.apply-btn {
		font-family: inherit;
		font-size: 13px;
		font-weight: 700;
		color: #fff;
		background: var(--accent);
		border: none;
		border-radius: 8px;
		padding: 7px 14px;
		transition: background 0.15s;
	}
	.apply-btn:hover { background: var(--accent-hover); }
	.apply-btn.active { box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.2); }

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
		overflow: hidden;
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
	.you { position: absolute; top: 50%; transform: translate(-50%, -50%); z-index: 2; }
	.ydot {
		display: block; width: 20px; height: 20px; border-radius: 50%;
		background: var(--accent); border: 3px solid #fff; box-shadow: 0 0 0 2px var(--accent);
	}

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
	th.num, td.num { text-align: right; }
	.th-sort { cursor: pointer; transition: background 0.12s; }
	.th-sort:hover { background: #F8E6B0; }
	.th-sort.sorted { color: #B15A12; }
	.caret { font-size: 9px; margin-left: 4px; }

	tbody td {
		padding: 11px 20px;
		border-bottom: 1px solid #F5EDD8;
		color: #3f3a33;
	}
	tbody tr:nth-child(even) td { background: #FFFBEF; }
	tbody tr:hover td { background: #FFF5D2; }
	td.name { font-weight: 700; color: #18181B; }
	td.owner { color: #6b5e4e; }
	td.num { font-variant-numeric: tabular-nums; font-weight: 600; }

	.delta {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-weight: 800;
		justify-content: flex-end;
	}
	.delta.up { color: #16794C; }
	.delta.down { color: #C4381B; }
	.delta.flat { color: #C0AC7C; }

	.empty { text-align: center; color: #A1A1AA; padding: 28px; }

	.freshness {
		margin-top: 18px;
		font-size: 12px;
		color: #A1A1AA;
	}
</style>
