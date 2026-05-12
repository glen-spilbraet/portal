<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	let search = $state('');

	const filtered = $derived(
		search.trim()
			? data.sheets.filter((s) => s.sku.toLowerCase().includes(search.trim().toLowerCase()))
			: data.sheets
	);

	const FIELD_LABELS = {
		ean: 'EAN',
		weight: 'Weight',
		height: 'Height',
		width: 'Width',
		depth: 'Depth',
		age: 'Age',
		time: 'Time',
		players: 'Players',
	};

	function fieldLabel(key) {
		return FIELD_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
	}

	function formatDate(ts) {
		if (!ts) return '—';
		return new Date(ts * 1000).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
		});
	}

	// camelCase → "Camel Case"
	function humanKey(key) {
		return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
	}

	const LANG_LABELS = { en: 'EN', da: 'DA', sv: 'SV', no: 'NO' };
</script>

<svelte:head>
	<title>Sheet Data — Admin</title>
</svelte:head>

<AppNav active="sheet-data" user={data.user} />

<main class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">Sheet Data</h1>
			<p class="page-sub">{data.sheets.length} sheets · All non-translatable field data</p>
		</div>
		<input type="search" bind:value={search} placeholder="Filter by SKU…" class="search-input" />
	</div>

	<div class="table-scroll">
		<table class="table">
			<thead>
				<tr>
					<th class="th-sku sticky-col">SKU</th>
					<th>Status</th>
					<th>Lang</th>
					<th class="th-center">USPs</th>
					<th class="th-center">Box img</th>
					<th>CTA</th>
					{#each data.fieldKeys as key}
						<th>{fieldLabel(key)}</th>
					{/each}
					<th>Hidden</th>
					<th>Created by</th>
					<th>Updated</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as sheet (sheet.id)}
					<tr>
						<td class="td-sku sticky-col">
							<span class="sku-text">{sheet.sku}</span>
						</td>
						<td>
							<span class="status-badge status-{sheet.status}">{sheet.status}</span>
						</td>
						<td>
							<span class="lang-badge"
								>{LANG_LABELS[sheet.primaryLanguage] ?? sheet.primaryLanguage ?? '—'}</span
							>
						</td>
						<td class="td-center">{sheet.uspCount}</td>
						<td class="td-center">
							{#if sheet.hasBoxImage}
								<span class="check">✓</span>
							{:else}
								<span class="muted">—</span>
							{/if}
						</td>
						<td class="td-muted">{sheet.ctaName ?? '—'}</td>
						{#each data.fieldKeys as key}
							<td class="td-data">{sheet.fieldMap[key] ?? ''}</td>
						{/each}
						<td>
							{#if sheet.hiddenKeys.length > 0}
								<div class="hidden-list">
									{#each sheet.hiddenKeys as k}
										<span class="hidden-badge">{humanKey(k)}</span>
									{/each}
								</div>
							{:else}
								<span class="muted">—</span>
							{/if}
						</td>
						<td class="td-muted">{sheet.creatorName ?? '—'}</td>
						<td class="td-muted">{formatDate(sheet.updatedAt)}</td>
						<td class="td-action">
							<a href="/sheet/{sheet.id}" class="edit-link" title="Open sheet">
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
									<polyline points="15 3 21 3 21 9" />
									<line x1="10" y1="14" x2="21" y2="3" />
								</svg>
							</a>
						</td>
					</tr>
				{/each}
				{#if filtered.length === 0}
					<tr>
						<td colspan={7 + data.fieldKeys.length + 3} class="td-empty">
							{search.trim() ? `No sheets matching "${search.trim()}"` : 'No sheets yet.'}
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</main>

<style>
	.page {
		padding: 40px 32px 80px;
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 28px;
	}

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

	.search-input {
		padding: 9px 14px;
		border: 1px solid var(--border);
		border-radius: 9px;
		font-size: 14px;
		font-family: inherit;
		outline: none;
		background: white;
		width: 220px;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.search-input:focus {
		border-color: #f57832;
		box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.12);
	}

	/* ── Table ─────────────────────────────────────────────────────────────────── */

	.table-scroll {
		overflow-x: auto;
		background: white;
		border: 1px solid var(--border);
		border-radius: 14px;
	}

	.table {
		width: 100%;
		border-collapse: collapse;
		white-space: nowrap;
		font-size: 13px;
	}

	.table thead tr {
		border-bottom: 1px solid var(--border);
	}

	.table th {
		padding: 10px 16px;
		font-size: 11px;
		font-weight: 700;
		color: #a0998a;
		text-align: left;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: #fafaf8;
	}

	.th-center {
		text-align: center;
	}

	.table tbody tr {
		border-bottom: 1px solid #f5f3ef;
		transition: background 0.1s;
	}

	.table tbody tr:last-child {
		border-bottom: none;
	}

	.table tbody tr:hover {
		background: #fdfcfa;
	}

	.table td {
		padding: 11px 16px;
		color: #3a3228;
		vertical-align: middle;
	}

	/* ── Sticky SKU column ─────────────────────────────────────────────────────── */

	.sticky-col {
		position: sticky;
		left: 0;
		z-index: 1;
	}

	.th-sku {
		background: #fafaf8;
		box-shadow: 1px 0 0 var(--border);
		z-index: 2;
	}

	.td-sku {
		background: white;
		box-shadow: 1px 0 0 #f0ede8;
	}

	.table tbody tr:hover .td-sku {
		background: #fdfcfa;
	}

	.sku-text {
		font-weight: 700;
		color: #18181b;
		letter-spacing: -0.2px;
	}

	/* ── Cell variants ─────────────────────────────────────────────────────────── */

	.td-center {
		text-align: center;
	}

	.td-muted {
		color: #a0998a;
	}

	.td-data {
		color: #52525b;
		font-variant-numeric: tabular-nums;
	}

	.td-action {
		text-align: right;
		padding-right: 12px;
	}

	.td-empty {
		text-align: center;
		color: #aaa;
		padding: 48px 0;
	}

	/* ── Badges ────────────────────────────────────────────────────────────────── */

	.status-badge {
		display: inline-block;
		padding: 2px 9px;
		border-radius: 100px;
		font-size: 11px;
		font-weight: 700;
		border: 1px solid transparent;
		text-transform: capitalize;
	}

	.status-published {
		background: #f0fdf4;
		color: #15803d;
		border-color: #bbf7d0;
	}

	.status-draft {
		background: #fafafa;
		color: #71717a;
		border-color: #e4e4e7;
	}

	.status-archived {
		background: #fef2f2;
		color: #dc2626;
		border-color: #fecaca;
	}

	.lang-badge {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 700;
		background: #f0f0ff;
		color: #4338ca;
		letter-spacing: 0.03em;
	}

	.check {
		color: #16a34a;
		font-weight: 700;
		font-size: 14px;
	}

	.muted {
		color: #d1d5db;
	}

	.hidden-list {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
	}

	.hidden-badge {
		display: inline-block;
		padding: 1px 7px;
		border-radius: 5px;
		font-size: 11px;
		font-weight: 600;
		background: #fff3cd;
		color: #92400e;
	}

	/* ── Edit link ─────────────────────────────────────────────────────────────── */

	.edit-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 7px;
		color: #a0998a;
		text-decoration: none;
		transition: background 0.12s, color 0.12s;
	}

	.edit-link:hover {
		background: #fff5d2;
		color: #7b3803;
	}
</style>
