<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();

	let searchInput = $state(data.q);
	let searchTimer;

	function navigate(patch) {
		const params = new URLSearchParams({
			market: data.market,
			q:      data.q,
			page:   String(data.page),
			...patch,
		});
		if (!params.get('q')) params.delete('q');
		if (params.get('page') === '1') params.delete('page');
		goto(`/price-lists?${params}`, { replaceState: false, keepFocus: true });
	}

	function onSearch(e) {
		clearTimeout(searchTimer);
		const val = e.target.value;
		searchTimer = setTimeout(() => navigate({ q: val, page: '1' }), 350);
	}

	function setMarket(key) {
		navigate({ market: key, page: '1', q: '' });
		searchInput = '';
	}

	function exportUrl() {
		const params = new URLSearchParams({ market: data.market });
		if (data.q) params.set('q', data.q);
		return `/price-lists/export?${params}`;
	}

	const currencyLabel = $derived(data.markets.find(m => m.key === data.market)?.label ?? '');

	function formatPrice(val) {
		if (val == null || val === '') return '—';
		const n = parseFloat(val);
		return isNaN(n) ? val : n.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}
</script>

<svelte:head>
	<title>Price List — {currencyLabel}</title>
</svelte:head>

<AppNav active="price-lists" user={data.user} />

<main class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">Price List</h1>
			<p class="page-sub">{data.total.toLocaleString()} product{data.total !== 1 ? 's' : ''}</p>
		</div>
		<a href={exportUrl()} class="btn-export" download>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
				<polyline points="7 10 12 15 17 10"/>
				<line x1="12" y1="15" x2="12" y2="3"/>
			</svg>
			Export CSV
		</a>
	</div>

	<!-- Market tabs + search -->
	<div class="toolbar">
		<div class="tabs">
			{#each data.markets as m}
				<button
					class="tab"
					class:active={data.market === m.key}
					onclick={() => setMarket(m.key)}
				>
					{m.label}
				</button>
			{/each}
		</div>

		<div class="search-wrap">
			<svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
			</svg>
			<input
				class="search"
				type="text"
				placeholder="Search SKU, EAN or name…"
				bind:value={searchInput}
				oninput={onSearch}
			/>
			{#if searchInput}
				<button class="search-clear" onclick={() => { searchInput = ''; navigate({ q: '', page: '1' }); }} aria-label="Clear">
					<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			{/if}
		</div>
	</div>

	<!-- Table -->
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>SKU</th>
					<th>Name</th>
					<th>EAN</th>
					<th class="num">Price ({currencyLabel})</th>
					<th class="num">Stock</th>
				</tr>
			</thead>
			<tbody>
				{#if data.products.length === 0}
					<tr>
						<td colspan="5" class="empty">No products found{data.q ? ` for "${data.q}"` : ''}.</td>
					</tr>
				{:else}
					{#each data.products as p (p.sku)}
						<tr>
							<td class="mono">{p.sku ?? '—'}</td>
							<td>{p.name ?? '—'}</td>
							<td class="mono">{p.ean ?? '—'}</td>
							<td class="num">{formatPrice(p.price)}</td>
							<td class="num stock" class:low={p.stock != null && p.stock <= 0}>{p.stock ?? '—'}</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>

	<!-- Pagination -->
	{#if data.totalPages > 1}
		<div class="pagination">
			<button
				class="page-btn"
				disabled={data.page <= 1}
				onclick={() => navigate({ page: String(data.page - 1) })}
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
				Previous
			</button>

			<span class="page-info">Page {data.page} of {data.totalPages}</span>

			<button
				class="page-btn"
				disabled={data.page >= data.totalPages}
				onclick={() => navigate({ page: String(data.page + 1) })}
			>
				Next
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
			</button>
		</div>
	{/if}
</main>

<style>
	.page {
		max-width: 1140px;
		margin: 0 auto;
		padding: 40px 28px 80px;
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 28px;
	}

	.page-title {
		font-size: 26px; font-weight: 800;
		color: #18181B; letter-spacing: -0.5px; margin: 0 0 4px;
	}
	.page-sub { font-size: 14px; color: #A89060; font-weight: 500; margin: 0; }

	.btn-export {
		display: inline-flex; align-items: center; gap: 7px;
		padding: 9px 18px;
		background: white; color: #52525B;
		border: 1px solid var(--border);
		border-radius: 9px;
		font-size: 13px; font-weight: 600; font-family: inherit;
		text-decoration: none;
		cursor: pointer; white-space: nowrap;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
		flex-shrink: 0;
	}
	.btn-export:hover { background: #FFFBF0; border-color: #F57832; color: #7B3803; }

	/* Toolbar */
	.toolbar {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 16px;
		flex-wrap: wrap;
	}

	.tabs {
		display: flex;
		background: #F4F4F5;
		border-radius: 10px;
		padding: 3px;
		gap: 2px;
		flex-shrink: 0;
	}

	.tab {
		padding: 6px 18px;
		border-radius: 8px;
		font-size: 13px; font-weight: 700;
		border: none; background: none; cursor: pointer;
		color: #71717A; font-family: inherit;
		transition: background 0.15s, color 0.15s;
		white-space: nowrap;
	}
	.tab:hover { color: #18181B; }
	.tab.active { background: white; color: #18181B; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }

	.search-wrap {
		position: relative;
		flex: 1;
		min-width: 200px;
		max-width: 340px;
	}

	.search-icon {
		position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
		color: #A1A1AA; pointer-events: none;
	}

	.search {
		width: 100%;
		padding: 9px 36px 9px 34px;
		border: 1px solid var(--border);
		border-radius: 9px;
		font-size: 13px; font-family: inherit;
		outline: none; background: white;
		transition: border-color 0.15s, box-shadow 0.15s;
		box-sizing: border-box;
	}
	.search:focus {
		border-color: #F57832;
		box-shadow: 0 0 0 3px rgba(245,120,50,0.12);
	}
	.search-clear {
		position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
		border: none; background: none; cursor: pointer; color: #A1A1AA;
		display: flex; align-items: center; justify-content: center;
		padding: 2px;
	}
	.search-clear:hover { color: #52525B; }

	/* Table */
	.table-wrap {
		background: white;
		border: 1px solid var(--border);
		border-radius: 14px;
		overflow: hidden;
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}

	thead th {
		padding: 11px 16px;
		text-align: left;
		font-size: 11px; font-weight: 700;
		color: #71717A; text-transform: uppercase; letter-spacing: 0.05em;
		border-bottom: 1px solid var(--border);
		background: #FAFAF9;
		white-space: nowrap;
	}
	thead th.num { text-align: right; }

	tbody tr {
		border-bottom: 1px solid #F4F4F5;
		transition: background 0.1s;
	}
	tbody tr:last-child { border-bottom: none; }
	tbody tr:hover { background: #FFFBF0; }

	tbody td {
		padding: 11px 16px;
		color: #18181B;
	}
	td.num { text-align: right; font-variant-numeric: tabular-nums; }
	td.mono { font-family: ui-monospace, monospace; font-size: 12px; color: #52525B; }
	td.stock.low { color: #dc2626; font-weight: 600; }

	.empty {
		text-align: center; color: #A1A1AA;
		padding: 48px 16px !important;
		font-size: 14px;
	}

	/* Pagination */
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		margin-top: 24px;
	}

	.page-btn {
		display: inline-flex; align-items: center; gap: 6px;
		padding: 8px 16px;
		background: white; color: #52525B;
		border: 1px solid var(--border);
		border-radius: 9px;
		font-size: 13px; font-weight: 600; font-family: inherit;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.page-btn:hover:not(:disabled) { background: #FFFBF0; color: #7B3803; border-color: #F57832; }
	.page-btn:disabled { opacity: 0.4; cursor: default; }

	.page-info { font-size: 13px; color: #71717A; font-weight: 500; }
</style>
