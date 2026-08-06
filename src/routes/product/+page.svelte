<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import DateBar from '$lib/components/DateBar.svelte';

	let { data } = $props();

	const numFmt = new Intl.NumberFormat('da-DK');
	function indexClass(idx) {
		if (idx === null || idx === undefined) return '';
		if (idx >= 100) return 'green';
		if (idx >= 96) return 'orange';
		return 'red';
	}

	let search = $state('');
	let sortKey = $state('rev2');
	let sortDir = $state('desc');
	function setSort(key) {
		if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else { sortKey = key; sortDir = key === 'name' ? 'asc' : 'desc'; }
	}
	const caret = (k) => (sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '');

	const filtered = $derived(
		(search.trim()
			? data.publishers.filter((p) => p.label.toLowerCase().includes(search.trim().toLowerCase()))
			: data.publishers
		).slice().sort((a, b) => {
			let av, bv;
			if (sortKey === 'name') { av = a.label?.toLowerCase() ?? ''; bv = b.label?.toLowerCase() ?? ''; }
			else if (sortKey === 'index') { av = a.index ?? -Infinity; bv = b.index ?? -Infinity; }
			else { av = a[sortKey] ?? 0; bv = b[sortKey] ?? 0; }
			if (av < bv) return sortDir === 'asc' ? -1 : 1;
			if (av > bv) return sortDir === 'asc' ? 1 : -1;
			return 0;
		})
	);
</script>

<svelte:head><title>Product · Product Portal</title></svelte:head>

<AppNav active="product" user={data.user} />

<DateBar
	selected={data.selected}
	range={data.range}
	yearOptions={data.yearOptions}
	quarterOptions={data.quarterOptions}
	monthOptions={data.monthOptions}
/>

<main class="wrap">
	<div class="section-head"><h2>Publishers</h2></div>

	<section class="table-wrap">
		<div class="table-head">
			<h3>Revenue by publisher</h3>
			<span class="count">{numFmt.format(filtered.length)}</span>
		</div>
		<div class="dim-filter">
			<div class="dim-search">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
				</svg>
				<input type="text" bind:value={search} placeholder="Search publishers…" aria-label="Filter publishers" />
				{#if search}<button class="dim-search-clear" onclick={() => (search = '')} aria-label="Clear search">×</button>{/if}
			</div>
			<p class="hint">Columns show the selected date range in each year · Index = newest vs one year earlier · unmapped publishers show their SKU prefix</p>
		</div>
		<div class="table-scroll">
			<table>
				<colgroup>
					<col />
					<col style="width:116px" /><col style="width:116px" /><col style="width:116px" /><col style="width:86px" />
				</colgroup>
				<thead>
					<tr>
						<th class="th-sort" class:sorted={sortKey === 'name'} onclick={() => setSort('name')}>Publisher {caret('name')}</th>
						{#each ['rev0', 'rev1', 'rev2'] as key, i}
							<th class="th-sort num" class:sorted={sortKey === key} onclick={() => setSort(key)}>{data.yearCols[i]} {caret(key)}</th>
						{/each}
						<th class="th-sort num" class:sorted={sortKey === 'index'} onclick={() => setSort('index')}>Index {caret('index')}</th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as p (p.key)}
						<tr>
							<td class="name">{p.label}</td>
							{#each ['rev0', 'rev1', 'rev2'] as key, i}
								<td class="num" class:nodata={data.colNoData[i]}>{data.colNoData[i] ? '—' : numFmt.format(Math.round(p[key]))}</td>
							{/each}
							<td class="num">
								{#if p.index !== null}<span class="index-chip {indexClass(p.index)}">{p.index}</span>{:else}<span class="muted">–</span>{/if}
							</td>
						</tr>
					{/each}
					{#if filtered.length === 0}
						<tr><td colspan="5" class="empty">{search.trim() ? 'No matches.' : 'No data in this period.'}</td></tr>
					{/if}
				</tbody>
			</table>
		</div>
	</section>
</main>

<style>
	.wrap { max-width: 1140px; margin: 0 auto; padding: 28px; }
	.section-head { display: flex; align-items: center; gap: 14px; margin: 4px 0 14px; }
	.section-head h2 { font-size: 15px; font-weight: 800; letter-spacing: -0.2px; color: #18181B; margin: 0; white-space: nowrap; }
	.section-head::after { content: ''; flex: 1; height: 1px; background: var(--border); }

	.table-wrap { background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow); overflow: hidden; }
	.table-head { display: flex; align-items: center; gap: 10px; padding: 16px 20px; border-bottom: 1px solid var(--border); }
	.table-head h3 { font-size: 15px; font-weight: 800; color: #18181B; margin: 0; letter-spacing: -0.2px; }
	.count { font-size: 12px; font-weight: 700; color: #A88B52; background: #FFF5D2; padding: 2px 9px; border-radius: 100px; }

	.dim-filter { padding: 10px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
	.dim-search { display: inline-flex; align-items: center; gap: 7px; width: 100%; max-width: 300px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px; background: #fff; }
	.dim-search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.12); }
	.dim-search svg { color: #B7A579; flex-shrink: 0; }
	.dim-search input { flex: 1; min-width: 0; border: none; background: none; outline: none; font-family: inherit; font-size: 13px; color: #3f3a33; }
	.dim-search input::placeholder { color: #B7A579; }
	.dim-search-clear { flex-shrink: 0; border: none; background: none; cursor: pointer; color: #A88B52; font-size: 16px; line-height: 1; }
	.hint { margin: 0; font-size: 12px; color: #A88B52; }

	.table-scroll { max-height: 640px; overflow: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
	thead th { position: sticky; top: 0; z-index: 1; background: #FBEFCB; color: #7B3803; font-weight: 800; text-align: left; padding: 11px 20px; white-space: nowrap; border-bottom: 1px solid var(--border); user-select: none; }
	th.num, td.num { text-align: right; white-space: nowrap; }
	.th-sort { cursor: pointer; }
	.th-sort:hover { background: #F8E6B0; }
	.th-sort.sorted { color: #B15A12; }
	tbody td { padding: 11px 20px; border-bottom: 1px solid #F5EDD8; color: #3f3a33; }
	tbody tr:nth-child(even) td { background: #FFFBEF; }
	tbody tr:hover td { background: #FFF5D2; }
	td.name { font-weight: 700; color: #18181B; }
	td.num { font-variant-numeric: tabular-nums; font-weight: 600; }
	td.num.nodata { color: #C7C7CC; font-weight: 500; }
	.muted { color: #C0AC7C; }
	.index-chip { display: inline-block; font-size: 12px; font-weight: 800; padding: 2px 9px; border-radius: 100px; }
	.index-chip.green { background: #EAF7EF; color: #16794C; }
	.index-chip.orange { background: #FDEBD2; color: #B4611A; }
	.index-chip.red { background: #FDECEC; color: #C4381B; }
	.empty { text-align: center; color: #A1A1AA; padding: 28px; }
</style>
