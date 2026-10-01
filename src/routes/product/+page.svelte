<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import DateBar from '$lib/components/DateBar.svelte';
	import BreakdownTable from '$lib/components/BreakdownTable.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let { data } = $props();

	function openPublisher(row) {
		const pq = data.pub === 'mapped' ? '?pub=mapped' : '';
		goto(`/product/${encodeURIComponent(row.key)}${pq}`);
	}

	function setPub(mode) {
		const u = new URL($page.url);
		if (mode === 'mapped') u.searchParams.set('pub', 'mapped');
		else u.searchParams.delete('pub');
		goto(u, { keepFocus: true, noScroll: true });
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
	<div class="section-head">
		<h2>Publishers</h2>
		<div class="pub-toggle">
			<button class:active={data.pub !== 'mapped'} onclick={() => setPub('sku')}>SKU publisher</button>
			<button class:active={data.pub === 'mapped'} onclick={() => setPub('mapped')}>Mapped publisher</button>
		</div>
	</div>

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
	.section-head h2 { font-size: 15px; font-weight: 800; letter-spacing: -0.2px; color: #18181B; margin: 0; white-space: nowrap; order: 0; }
	.section-head::after { content: ''; flex: 1; height: 1px; background: var(--border); order: 1; }
	.pub-toggle { order: 2; display: inline-flex; border: 1px solid var(--border); border-radius: 100px; overflow: hidden; }
	.pub-toggle button { border: none; background: white; color: #71717A; font-size: 12px; font-weight: 700; font-family: inherit; padding: 6px 14px; cursor: pointer; white-space: nowrap; }
	.pub-toggle button.active { background: #F57832; color: white; }
</style>
