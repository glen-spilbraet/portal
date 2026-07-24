<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();

	const isYearSelected = $derived((data.yearOptions ?? []).some((o) => o.key === data.selected));

	function pickYear(e) {
		const v = e.currentTarget.value;
		if (v) goto(`?period=${v}`, { noScroll: true });
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

		<div class="controls">
			<div class="periods">
				{#each data.periods as pr}
					<a
						href="?period={pr.key}"
						class="period-btn"
						class:active={data.selected === pr.key}
						data-sveltekit-noscroll
					>{pr.label}</a>
				{/each}
			</div>

			<div class="range-controls">
				<select class="year-select" class:active={isYearSelected} aria-label="Year range" onchange={pickYear}>
					<option value="" disabled selected={!isYearSelected}>Year…</option>
					{#each data.yearOptions as o}
						<option value={o.key} selected={data.selected === o.key}>{o.label}</option>
					{/each}
				</select>

				<form class="custom-range" method="GET" data-sveltekit-noscroll>
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
				<div class="card-foot">
					<span class="deals">{numFmt.format(w.deals)} deals</span>
					{#if w.pct !== null}
						<span class="yoy" class:up={w.pct >= 0} class:down={w.pct < 0}>
							<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
								{#if w.pct >= 0}<polyline points="6 15 12 9 18 15" />{:else}<polyline points="6 9 12 15 18 9" />{/if}
							</svg>
							{formatPct(w.pct)}
						</span>
					{:else}
						<span class="yoy flat">— no prior</span>
					{/if}
				</div>
				{#if w.index !== null}
					<div class="index-line">Index {w.index} <span class="vs">vs {data.priorLabel}</span></div>
				{/if}
			</div>
		{/each}
	</section>

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

	.periods {
		display: flex;
		gap: 4px;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 4px;
	}
	.period-btn {
		padding: 6px 14px;
		border-radius: 7px;
		font-size: 13px;
		font-weight: 700;
		color: #8A7550;
		text-decoration: none;
		transition: background 0.12s, color 0.12s;
		white-space: nowrap;
	}
	.period-btn:hover { background: #FFF5D2; color: #7B3803; }
	.period-btn.active { background: #FFE6A5; color: #7B3803; }

	.range-controls {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.year-select {
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
	.year-select:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.15);
	}
	.year-select.active {
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

	.card-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-top: 2px;
	}
	.deals { font-size: 12px; color: #A1A1AA; font-weight: 600; }

	.yoy {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-size: 12px;
		font-weight: 800;
		padding: 2px 7px 2px 5px;
		border-radius: 100px;
	}
	.yoy.up   { background: #E7F6EC; color: #16794C; }
	.yoy.down { background: #FDECEC; color: #C4381B; }
	.yoy.flat { background: #F4F4F5; color: #A1A1AA; font-weight: 700; padding: 2px 8px; }

	.index-line {
		font-size: 11px;
		font-weight: 700;
		color: #8A7550;
	}
	.index-line .vs { color: #C0AC7C; font-weight: 600; }

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
