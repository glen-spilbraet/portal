<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import DateBar from '$lib/components/DateBar.svelte';
	import BreakdownTable from '$lib/components/BreakdownTable.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();

	function openPublisher(row) {
		goto(`/product/${encodeURIComponent(row.key)}`);
	}
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

	<BreakdownTable
		title="Revenue by publisher"
		rows={data.publishers}
		leadCols={[{ key: 'label', header: 'Publisher', bold: true }]}
		yearCols={data.yearCols}
		colNoData={data.colNoData}
		searchPlaceholder="Search publishers…"
		caption="Click a publisher for a full breakdown · unmapped publishers show their SKU prefix · Index = newest vs one year earlier"
		onRowClick={openPublisher}
	/>
</main>

<style>
	.wrap { max-width: 1140px; margin: 0 auto; padding: 20px 28px 60px; }
	.section-head { display: flex; align-items: center; gap: 14px; margin: 4px 0 14px; }
	.section-head h2 { font-size: 15px; font-weight: 800; letter-spacing: -0.2px; color: #18181B; margin: 0; white-space: nowrap; }
	.section-head::after { content: ''; flex: 1; height: 1px; background: var(--border); }
</style>
