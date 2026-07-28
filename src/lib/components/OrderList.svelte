<script>
	let { orders, portal } = $props();

	const dkk = new Intl.NumberFormat('da-DK');
	const fdkk = (n) => dkk.format(Math.round(n || 0)) + ' kr';
	const dealUrl = (id) => `https://app.hubspot.com/contacts/${portal}/record/0-3/${id}`;

	let sortKey = $state('date'); // 'date' | 'rev'
	let sortDir = $state('desc');

	function setSort(k) {
		if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else { sortKey = k; sortDir = 'desc'; }
	}

	const sorted = $derived(
		[...orders].sort((a, b) => {
			const av = sortKey === 'rev' ? a.dkk : a.date;
			const bv = sortKey === 'rev' ? b.dkk : b.date;
			if (av < bv) return sortDir === 'asc' ? -1 : 1;
			if (av > bv) return sortDir === 'asc' ? 1 : -1;
			return 0;
		})
	);
</script>

<div class="ol">
	<div class="ol-head">
		<button class="olh olh-date" class:sorted={sortKey === 'date'} onclick={() => setSort('date')}>
			Order Date{#if sortKey === 'date'}<span class="car">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
		</button>
		<button class="olh olh-rev" class:sorted={sortKey === 'rev'} onclick={() => setSort('rev')}>
			Revenue{#if sortKey === 'rev'}<span class="car">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}
		</button>
		<span class="olh-link"></span>
	</div>
	<div class="ol-body">
		{#each sorted as o (o.id)}
			<div class="orow">
				<span class="odate">{o.date}</span>
				<span class="orev" class:neg={o.dkk < 0}>{fdkk(o.dkk)}</span>
				<a class="olink" href={dealUrl(o.id)} target="_blank" rel="noopener" title="Open deal in HubSpot">↗</a>
			</div>
		{:else}
			<div class="empty">No orders</div>
		{/each}
	</div>
</div>

<style>
	.ol { display: flex; flex-direction: column; }
	.ol-head { display: flex; align-items: center; gap: 10px; padding: 0 4px 6px; border-bottom: 1px solid var(--border); }
	.olh {
		background: none; border: none; font-family: inherit; cursor: pointer;
		font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px;
		color: #A88B52; padding: 2px 0; display: inline-flex; align-items: center; gap: 3px;
	}
	.olh:hover { color: #7B3803; }
	.olh.sorted { color: #B15A12; }
	.olh-date { width: 92px; justify-content: flex-start; }
	.olh-rev { flex: 1; justify-content: flex-end; }
	.olh-link { width: 22px; flex-shrink: 0; }
	.car { font-size: 8px; }

	.ol-body { display: flex; flex-direction: column; max-height: 240px; overflow-y: auto; }
	.orow { display: flex; align-items: center; gap: 10px; padding: 8px 4px; border-bottom: 1px solid #F5EDD8; font-size: 13px; }
	.orow:hover { background: #FFFBEF; }
	.odate { color: #8A7550; font-weight: 600; width: 92px; }
	.orev { flex: 1; font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; color: #18181B; }
	.orev.neg { color: #C4381B; }
	.olink { color: var(--accent); text-decoration: none; font-weight: 800; width: 22px; text-align: right; flex-shrink: 0; }
	.olink:hover { color: var(--accent-hover); }
	.empty { padding: 16px 4px; color: #A1A1AA; font-size: 13px; }
</style>
