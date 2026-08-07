<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();

	const numFmt = new Intl.NumberFormat('da-DK');
	function pct(a) { return a === null || a === undefined ? '—' : Math.round(a * 100) + '%'; }

	const BIAS = {
		low:  { label: 'Forecasts too low',  cls: 'low' },
		high: { label: 'Forecasts too high', cls: 'high' },
		ok:   { label: 'Accurate',           cls: 'ok' },
		none: { label: '—',                  cls: 'none' }
	};

	let tab = $state('completed');   // completed | ongoing
	let dim = $state('customers');   // customers | owners | products
	let expanded = $state({});
	function toggle(key) { expanded[key] = !expanded[key]; }

	const summary = $derived.by(() => {
		const s = { total: data.completed.customers.length, low: 0, high: 0, ok: 0 };
		for (const c of data.completed.customers) { if (c.bias === 'low') s.low++; else if (c.bias === 'high') s.high++; else if (c.bias === 'ok') s.ok++; }
		return s;
	});

	function onOwner(e) {
		const v = e.currentTarget.value;
		goto(v ? `?owner=${encodeURIComponent(v)}` : '?', { noScroll: true });
	}

	const DIMS = [
		{ key: 'customers', label: 'Customers' },
		{ key: 'owners', label: 'Owners' },
		{ key: 'products', label: 'Products' }
	];
	const activeList = $derived(data.completed[dim] ?? []);
</script>

<svelte:head><title>Forecast · Product Portal</title></svelte:head>

<AppNav active="forecast" user={data.user} />

<main class="wrap">
	<div class="head">
		<div>
			<h1>Forecast Stats</h1>
			<p class="sub">Forecast accuracy compared to actual purchases · SKU level, in units</p>
		</div>
		<select class="owner-select" onchange={onOwner}>
			<option value="" selected={!data.ownerParam}>All owners</option>
			{#each data.owners as o}
				<option value={o.email} selected={data.ownerParam === o.email}>{o.name}</option>
			{/each}
		</select>
	</div>

	<div class="toptabs">
		<button class="toptab" class:active={tab === 'completed'} onclick={() => (tab = 'completed')}>Completed forecasts</button>
		<button class="toptab" class:active={tab === 'ongoing'} onclick={() => (tab = 'ongoing')}>Ongoing forecasts</button>
	</div>

	{#if tab === 'completed'}
		<div class="cards">
			<div class="card"><span class="k">Completed forecasts</span><span class="v">{summary.total}</span><span class="k2">customers</span></div>
			<div class="card high"><span class="k">Forecast too high</span><span class="v">{summary.high}</span><span class="k2">bought less than forecast</span></div>
			<div class="card low"><span class="k">Forecast too low</span><span class="v">{summary.low}</span><span class="k2">bought more than forecast</span></div>
			<div class="card ok"><span class="k">Accurate (±30%)</span><span class="v">{summary.ok}</span></div>
		</div>

		<section class="panel">
			<div class="dimtabs">
				{#each DIMS as d}
					<button class="dimtab" class:active={dim === d.key} onclick={() => (dim = d.key)}>{d.label}</button>
				{/each}
				<span class="hint">click a row for detail</span>
			</div>

			{#if activeList.length}
				<div class="table-scroll">
					<table>
						<thead>
							<tr>
								<th></th>
								{#if dim === 'customers'}<th>Customer</th><th>Owner</th>
								{:else if dim === 'owners'}<th>Owner</th><th class="num">Customers</th>
								{:else}<th>SKU</th><th>Product</th>{/if}
								<th class="num">Forecast units</th><th class="num">Actual units</th><th class="num">Attainment</th><th>Bias</th>
							</tr>
						</thead>
						<tbody>
							{#each activeList as g (g.key)}
								{@const ek = dim + '-' + g.key}
								<tr class="clickable" onclick={() => toggle(ek)}>
									<td class="chev">{expanded[ek] ? '▾' : '▸'}</td>
									{#if dim === 'customers'}
										<td class="lbl">{g.label}</td><td class="muted">{g.owner}</td>
									{:else if dim === 'owners'}
										<td class="lbl">{g.label}</td><td class="num muted">{g.childCount}</td>
									{:else}
										<td class="sku">{g.sku}</td><td class="lbl">{g.label}</td>
									{/if}
									<td class="num strong">{numFmt.format(g.forecastUnits)}</td>
									<td class="num">{numFmt.format(g.actualUnits)}</td>
									<td class="num att">{pct(g.attainment)}</td>
									<td><span class="tag {BIAS[g.bias].cls}">{BIAS[g.bias].label}</span></td>
								</tr>
								{#if expanded[ek]}
									<tr class="detail-row"><td></td><td colspan="6">
										<table class="detail">
											{#if dim === 'customers'}
												<thead><tr><th>SKU</th><th>Name</th><th class="num">Forecast</th><th class="num">Actual</th><th class="num">Diff</th></tr></thead>
												<tbody>
													{#each g.children as c (c.key)}
														<tr><td class="sku">{c.key}</td><td class="muted">{c.label}</td><td class="num">{numFmt.format(c.forecast)}</td><td class="num">{numFmt.format(c.actual)}</td><td class="num" class:pos={c.actual - c.forecast > 0} class:neg={c.actual - c.forecast < 0}>{c.actual - c.forecast > 0 ? '+' : ''}{numFmt.format(c.actual - c.forecast)}</td></tr>
													{/each}
												</tbody>
											{:else}
												<thead><tr><th>Customer</th><th class="num">Forecast</th><th class="num">Actual</th><th class="num">Attainment</th></tr></thead>
												<tbody>
													{#each g.children as c (c.key)}
														<tr><td class="muted">{c.label}</td><td class="num">{numFmt.format(c.forecast)}</td><td class="num">{numFmt.format(c.actual)}</td><td class="num att">{pct(c.attainment)}</td></tr>
													{/each}
												</tbody>
											{/if}
										</table>
									</td></tr>
								{/if}
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="empty">No completed forecasts with dates{data.ownerParam ? ' for this owner' : ''}.</div>
			{/if}
		</section>

		{#if data.skipped > 0}
			<p class="skipped-note">{data.skipped} forecast{data.skipped === 1 ? '' : 's'} skipped — no start/end date, so accuracy can't be measured.</p>
		{/if}
	{:else}
		<section class="panel">
			<div class="panel-head"><h2>Ongoing forecasts — progress</h2><span class="hint">actual so far vs forecast · pace</span></div>
			{#if data.ongoing.length}
				<div class="table-scroll">
					<table>
						<thead>
							<tr><th></th><th>Customer</th><th>Owner</th><th>Window</th><th class="num">Forecast units</th><th class="num">Bought so far</th><th class="num">Achieved</th><th>Pace</th></tr>
						</thead>
						<tbody>
							{#each data.ongoing as c (c.cid ?? c.company)}
								{@const ek = 'o-' + (c.cid ?? c.company)}
								<tr class="clickable" onclick={() => toggle(ek)}>
									<td class="chev">{expanded[ek] ? '▾' : '▸'}</td>
									<td class="lbl">{c.company}</td>
									<td class="muted">{c.owner}</td>
									<td class="muted win">{c.start} → {c.end}</td>
									<td class="num strong">{numFmt.format(c.forecastUnits)}</td>
									<td class="num">{numFmt.format(c.actualUnits)}</td>
									<td class="num att">{pct(c.attainment)}</td>
									<td><span class="tag {c.onTrack ? 'ok' : 'high'}">{c.onTrack ? 'On track' : 'Behind'} · {Math.round(c.timeElapsed * 100)}% elapsed</span></td>
								</tr>
								{#if expanded[ek]}
									<tr class="detail-row"><td></td><td colspan="7">
										<table class="detail">
											<thead><tr><th>SKU</th><th>Name</th><th class="num">Forecast</th><th class="num">Bought</th><th class="num">Remaining</th></tr></thead>
											<tbody>
												{#each c.skus as s (s.sku)}
													<tr><td class="sku">{s.sku}</td><td class="muted">{s.name}</td><td class="num">{numFmt.format(s.forecast)}</td><td class="num">{numFmt.format(s.actual)}</td><td class="num">{numFmt.format(Math.max(0, s.forecast - s.actual))}</td></tr>
												{/each}
											</tbody>
										</table>
									</td></tr>
								{/if}
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="empty">No ongoing forecasts{data.ownerParam ? ' for this owner' : ''}.</div>
			{/if}
		</section>
	{/if}
</main>

<style>
	.wrap { max-width: 1140px; margin: 0 auto; padding: 22px 28px 64px; }
	.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
	.head h1 { font-size: 20px; font-weight: 800; color: #18181B; margin: 0 0 3px; letter-spacing: -0.3px; }
	.sub { font-size: 13px; color: #98876e; margin: 0; }
	.owner-select { font-family: inherit; font-size: 13px; font-weight: 700; color: #524431; background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 8px 11px; cursor: pointer; }
	.owner-select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245,120,50,0.14); }

	.toptabs { display: flex; gap: 6px; margin-bottom: 18px; border-bottom: 1px solid var(--border); }
	.toptab { font-family: inherit; font-size: 14px; font-weight: 800; color: #8A7550; background: none; border: none; padding: 10px 4px; margin-right: 14px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; }
	.toptab:hover { color: #524431; }
	.toptab.active { color: #7B3803; border-bottom-color: var(--accent); }

	.cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
	.card { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 13px 15px; display: flex; flex-direction: column; gap: 2px; }
	.card .k { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #A88B52; }
	.card .k2 { font-size: 11px; color: #98876e; }
	.card .v { font-size: 23px; font-weight: 800; color: #18181B; }
	.card.high { background: #FEF3F0; border-color: #F6C9BC; }
	.card.high .v { color: #B42318; }
	.card.low { background: #EEF4FF; border-color: #C3D6F5; }
	.card.low .v { color: #1D4ED8; }
	.card.ok { background: #E7F6EC; border-color: #B7E3C6; }
	.card.ok .v { color: #16794C; }

	.panel { background: #fff; border: 1px solid var(--border); border-radius: 14px; margin-bottom: 16px; overflow: hidden; }
	.panel-head { display: flex; align-items: baseline; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border); }
	.panel-head h2 { font-size: 14px; font-weight: 800; color: #18181B; margin: 0; }
	.dimtabs { display: flex; align-items: center; gap: 4px; padding: 12px 14px; border-bottom: 1px solid var(--border); }
	.dimtab { font-family: inherit; font-size: 13px; font-weight: 700; color: #8A7550; background: none; border: none; padding: 7px 12px; border-radius: 8px; cursor: pointer; }
	.dimtab:hover { background: #FBF7EF; }
	.dimtab.active { background: #18181B; color: #fff; }
	.hint { font-size: 12px; color: #A88B52; margin-left: auto; }

	.table-scroll { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 13px; }
	th { text-align: left; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #A88B52; padding: 10px 16px; background: #FBF7EF; border-bottom: 1px solid var(--border); white-space: nowrap; }
	th.num { text-align: right; }
	td { padding: 10px 16px; border-bottom: 1px solid #F1EADB; }
	tbody tr:last-child td { border-bottom: none; }
	.clickable { cursor: pointer; }
	.clickable:hover { background: #FBF7EF; }
	.chev { width: 22px; color: #C0AC7C; }
	.lbl { color: #18181B; font-weight: 700; }
	.muted { color: #98876e; }
	.win { font-variant-numeric: tabular-nums; white-space: nowrap; }
	td.num { text-align: right; font-variant-numeric: tabular-nums; color: #6b5e4e; }
	td.num.strong { color: #18181B; font-weight: 700; }
	.att { font-weight: 800; color: #18181B; }

	.tag { font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 100px; white-space: nowrap; }
	.tag.low { background: #EEF4FF; color: #1D4ED8; }
	.tag.high { background: #FEF3F0; color: #B42318; }
	.tag.ok { background: #E7F6EC; color: #16794C; }
	.tag.none { background: #F1ECE1; color: #7a6b57; }

	.detail-row > td { background: #FCFAF5; padding: 0 16px 12px; }
	.detail { width: 100%; margin: 4px 0; }
	.detail th { background: transparent; padding: 6px 10px; border-bottom: 1px solid #EDE4D2; }
	.detail td { padding: 6px 10px; border-bottom: 1px solid #F3ECDD; }
	.sku { font-family: var(--font-mono, monospace); font-size: 12px; color: #6b5e4e; }
	.pos { color: #16794C; font-weight: 700; }
	.neg { color: #B42318; font-weight: 700; }

	.empty { padding: 30px 18px; text-align: center; color: #98876e; font-size: 13px; }
	.skipped-note { font-size: 12px; color: #98876e; margin: 4px 2px; }

	@media (max-width: 820px) { .cards { grid-template-columns: 1fr 1fr; } }
</style>
