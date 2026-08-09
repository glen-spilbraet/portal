<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import MultiFilter from '$lib/components/MultiFilter.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();

	const ownerOpts = $derived((data.owners ?? []).map((o) => ({ value: o.email, label: o.name })));
	const yearOpts = $derived((data.years ?? []).map((y) => ({ value: y, label: y })));

	function applyFilters(owner, years) {
		const p = new URLSearchParams();
		if (owner) p.set('owner', owner);
		if (years?.length) p.set('year', years.join(','));
		const qs = p.toString();
		goto(qs ? `?${qs}` : '?', { noScroll: true });
	}

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

	const DIMS = [
		{ key: 'customers', label: 'Customers' },
		{ key: 'owners', label: 'Owners' },
		{ key: 'products', label: 'Products' }
	];
	const activeList = $derived(data.completed[dim] ?? []);

	// --- Sorting ---------------------------------------------------------
	function cmp(a, b) {
		if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
		if (b === null || b === undefined) return -1;
		if (typeof a === 'string') return a.localeCompare(b);
		return a - b;
	}
	function sortRows(rows, sort, getters) {
		const get = sort.key && getters[sort.key];
		if (!get) return rows;
		return [...rows].sort((a, b) => cmp(get(a), get(b)) * sort.dir);
	}
	function toggleSort(sort, key, defaultDir = 1) {
		return sort.key === key ? { key, dir: -sort.dir } : { key, dir: defaultDir };
	}
	function sortIndicator(sort, key) {
		return sort.key !== key ? '' : sort.dir === 1 ? ' ▲' : ' ▼';
	}
	const NO_SORT = { key: null, dir: 1 };

	let mainSort = $state(NO_SORT);
	function selectDim(key) { dim = key; mainSort = NO_SORT; }

	const mainGetters = $derived(
		dim === 'customers'
			? { label: (g) => g.label, owner: (g) => g.owner, forecastUnits: (g) => g.forecastUnits, actualUnits: (g) => g.actualUnits, attainment: (g) => g.attainment, bias: (g) => g.bias }
			: dim === 'owners'
			? { label: (g) => g.label, childCount: (g) => g.childCount, forecastUnits: (g) => g.forecastUnits, actualUnits: (g) => g.actualUnits, attainment: (g) => g.attainment, bias: (g) => g.bias }
			: { sku: (g) => g.sku, label: (g) => g.label, forecastUnits: (g) => g.forecastUnits, actualUnits: (g) => g.actualUnits, attainment: (g) => g.attainment, bias: (g) => g.bias }
	);
	const sortedActiveList = $derived(sortRows(activeList, mainSort, mainGetters));

	let customerDetailSort = $state(NO_SORT);
	const customerDetailGetters = { key: (c) => c.key, label: (c) => c.label, forecast: (c) => c.forecast, actual: (c) => c.actual, attainment: (c) => c.attainment, diff: (c) => c.actual - c.forecast };

	let otherDetailSort = $state(NO_SORT);
	const otherDetailGetters = { label: (c) => c.label, forecast: (c) => c.forecast, actual: (c) => c.actual, attainment: (c) => c.attainment };

	let ongoingSort = $state(NO_SORT);
	const ongoingGetters = { label: (c) => c.company, owner: (c) => c.owner, window: (c) => c.start, forecastUnits: (c) => c.forecastUnits, actualUnits: (c) => c.actualUnits, attainment: (c) => c.attainment, pace: (c) => c.timeElapsed };
	const sortedOngoing = $derived(sortRows(data.ongoing ?? [], ongoingSort, ongoingGetters));

	let ongoingDetailSort = $state(NO_SORT);
	const ongoingDetailGetters = { key: (s) => s.sku, label: (s) => s.name, forecast: (s) => s.forecast, actual: (s) => s.actual, remaining: (s) => Math.max(0, s.forecast - s.actual) };
</script>

<svelte:head><title>Forecast · Product Portal</title></svelte:head>

<AppNav active="forecast" user={data.user} />

<main class="wrap">
	<div class="head">
		<div>
			<h1>Forecast Stats</h1>
			<p class="sub">Forecast accuracy compared to actual purchases · SKU level, in units</p>
		</div>
		<div class="filters">
			<MultiFilter label="Year" options={yearOpts} selected={data.yearParam}
				onApply={(v) => applyFilters(data.ownerParam, v)} />
			<MultiFilter label="Owner" single allLabel="All owners" options={ownerOpts} selected={data.ownerParam ? [data.ownerParam] : []}
				onApply={(v) => applyFilters(v[0] ?? null, data.yearParam)} />
		</div>
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
					<button class="dimtab" class:active={dim === d.key} onclick={() => selectDim(d.key)}>{d.label}</button>
				{/each}
				<span class="hint">click a row for detail · click a header to sort</span>
			</div>

			{#if activeList.length}
				<div class="table-scroll">
					<table>
						<thead>
							<tr>
								<th></th>
								{#if dim === 'customers'}
									<th class="sortable" onclick={() => (mainSort = toggleSort(mainSort, 'label'))}>Customer{sortIndicator(mainSort, 'label')}</th>
									<th class="sortable" onclick={() => (mainSort = toggleSort(mainSort, 'owner'))}>Owner{sortIndicator(mainSort, 'owner')}</th>
								{:else if dim === 'owners'}
									<th class="sortable" onclick={() => (mainSort = toggleSort(mainSort, 'label'))}>Owner{sortIndicator(mainSort, 'label')}</th>
									<th class="num sortable" onclick={() => (mainSort = toggleSort(mainSort, 'childCount', -1))}>Customers{sortIndicator(mainSort, 'childCount')}</th>
								{:else}
									<th class="sortable" onclick={() => (mainSort = toggleSort(mainSort, 'sku'))}>SKU{sortIndicator(mainSort, 'sku')}</th>
									<th class="sortable" onclick={() => (mainSort = toggleSort(mainSort, 'label'))}>Product{sortIndicator(mainSort, 'label')}</th>
								{/if}
								<th class="num sortable" onclick={() => (mainSort = toggleSort(mainSort, 'forecastUnits', -1))}>Forecast units{sortIndicator(mainSort, 'forecastUnits')}</th>
								<th class="num sortable" onclick={() => (mainSort = toggleSort(mainSort, 'actualUnits', -1))}>Actual units{sortIndicator(mainSort, 'actualUnits')}</th>
								<th class="num sortable" onclick={() => (mainSort = toggleSort(mainSort, 'attainment', -1))}>Attainment{sortIndicator(mainSort, 'attainment')}</th>
								<th class="sortable" onclick={() => (mainSort = toggleSort(mainSort, 'bias'))}>Bias{sortIndicator(mainSort, 'bias')}</th>
							</tr>
						</thead>
						<tbody>
							{#each sortedActiveList as g (g.key)}
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
												<thead>
													<tr>
														<th class="sortable" onclick={() => (customerDetailSort = toggleSort(customerDetailSort, 'key'))}>SKU{sortIndicator(customerDetailSort, 'key')}</th>
														<th class="sortable" onclick={() => (customerDetailSort = toggleSort(customerDetailSort, 'label'))}>Name{sortIndicator(customerDetailSort, 'label')}</th>
														<th class="num sortable" onclick={() => (customerDetailSort = toggleSort(customerDetailSort, 'forecast', -1))}>Forecast{sortIndicator(customerDetailSort, 'forecast')}</th>
														<th class="num sortable" onclick={() => (customerDetailSort = toggleSort(customerDetailSort, 'actual', -1))}>Actual{sortIndicator(customerDetailSort, 'actual')}</th>
														<th class="num sortable" onclick={() => (customerDetailSort = toggleSort(customerDetailSort, 'attainment', -1))}>Attainment{sortIndicator(customerDetailSort, 'attainment')}</th>
														<th class="num sortable" onclick={() => (customerDetailSort = toggleSort(customerDetailSort, 'diff', -1))}>Diff{sortIndicator(customerDetailSort, 'diff')}</th>
													</tr>
												</thead>
												<tbody>
													{#each sortRows(g.children, customerDetailSort, customerDetailGetters) as c (c.key)}
														<tr><td class="sku">{c.key}</td><td class="muted">{c.label}</td><td class="num">{numFmt.format(c.forecast)}</td><td class="num">{numFmt.format(c.actual)}</td><td class="num att">{pct(c.attainment)}</td><td class="num" class:pos={c.actual - c.forecast > 0} class:neg={c.actual - c.forecast < 0}>{c.actual - c.forecast > 0 ? '+' : ''}{numFmt.format(c.actual - c.forecast)}</td></tr>
													{/each}
												</tbody>
											{:else}
												<thead>
													<tr>
														<th class="sortable" onclick={() => (otherDetailSort = toggleSort(otherDetailSort, 'label'))}>Customer{sortIndicator(otherDetailSort, 'label')}</th>
														<th class="num sortable" onclick={() => (otherDetailSort = toggleSort(otherDetailSort, 'forecast', -1))}>Forecast{sortIndicator(otherDetailSort, 'forecast')}</th>
														<th class="num sortable" onclick={() => (otherDetailSort = toggleSort(otherDetailSort, 'actual', -1))}>Actual{sortIndicator(otherDetailSort, 'actual')}</th>
														<th class="num sortable" onclick={() => (otherDetailSort = toggleSort(otherDetailSort, 'attainment', -1))}>Attainment{sortIndicator(otherDetailSort, 'attainment')}</th>
													</tr>
												</thead>
												<tbody>
													{#each sortRows(g.children, otherDetailSort, otherDetailGetters) as c (c.key)}
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
							<tr>
								<th></th>
								<th class="sortable" onclick={() => (ongoingSort = toggleSort(ongoingSort, 'label'))}>Customer{sortIndicator(ongoingSort, 'label')}</th>
								<th class="sortable" onclick={() => (ongoingSort = toggleSort(ongoingSort, 'owner'))}>Owner{sortIndicator(ongoingSort, 'owner')}</th>
								<th class="sortable" onclick={() => (ongoingSort = toggleSort(ongoingSort, 'window'))}>Window{sortIndicator(ongoingSort, 'window')}</th>
								<th class="num sortable" onclick={() => (ongoingSort = toggleSort(ongoingSort, 'forecastUnits', -1))}>Forecast units{sortIndicator(ongoingSort, 'forecastUnits')}</th>
								<th class="num sortable" onclick={() => (ongoingSort = toggleSort(ongoingSort, 'actualUnits', -1))}>Bought so far{sortIndicator(ongoingSort, 'actualUnits')}</th>
								<th class="num sortable" onclick={() => (ongoingSort = toggleSort(ongoingSort, 'attainment', -1))}>Achieved{sortIndicator(ongoingSort, 'attainment')}</th>
								<th class="sortable" onclick={() => (ongoingSort = toggleSort(ongoingSort, 'pace', -1))}>Pace{sortIndicator(ongoingSort, 'pace')}</th>
							</tr>
						</thead>
						<tbody>
							{#each sortedOngoing as c (c.cid ?? c.company)}
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
											<thead>
												<tr>
													<th class="sortable" onclick={() => (ongoingDetailSort = toggleSort(ongoingDetailSort, 'key'))}>SKU{sortIndicator(ongoingDetailSort, 'key')}</th>
													<th class="sortable" onclick={() => (ongoingDetailSort = toggleSort(ongoingDetailSort, 'label'))}>Name{sortIndicator(ongoingDetailSort, 'label')}</th>
													<th class="num sortable" onclick={() => (ongoingDetailSort = toggleSort(ongoingDetailSort, 'forecast', -1))}>Forecast{sortIndicator(ongoingDetailSort, 'forecast')}</th>
													<th class="num sortable" onclick={() => (ongoingDetailSort = toggleSort(ongoingDetailSort, 'actual', -1))}>Bought{sortIndicator(ongoingDetailSort, 'actual')}</th>
													<th class="num sortable" onclick={() => (ongoingDetailSort = toggleSort(ongoingDetailSort, 'remaining', -1))}>Remaining{sortIndicator(ongoingDetailSort, 'remaining')}</th>
												</tr>
											</thead>
											<tbody>
												{#each sortRows(c.skus, ongoingDetailSort, ongoingDetailGetters) as s (s.sku)}
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
	.filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

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
	th.sortable { cursor: pointer; user-select: none; }
	th.sortable:hover { color: #7B3803; }
	td { padding: 10px 16px; border-bottom: 1px solid #F1EADB; }
	tbody tr:last-child td { border-bottom: none; }
	.clickable { cursor: pointer; }
	.clickable:hover { background: #FBF7EF; }
	.chev { width: 24px; color: #8A7550; font-size: 17px; font-weight: 900; }
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
