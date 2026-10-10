<script>
	import { flagSvg } from '$lib/flags.js';
	let { data, metric = 'both' } = $props();

	const showRevenue = $derived(metric === 'revenue' || metric === 'both');
	const showUnits = $derived(metric === 'units' || metric === 'both');
	// When both are available, a toggle swaps which measure the chart/markets/pivot show.
	let view = $state('revenue');
	const primary = $derived(metric === 'both' ? view : (metric === 'units' ? 'units' : 'revenue'));
	const primaryFmt = $derived(primary === 'revenue' ? money : (v) => units(v) + ' pcs');

	const nf = new Intl.NumberFormat('da-DK');
	const money = (v) => nf.format(Math.round(v || 0)) + ' kr';
	const units = (v) => nf.format(Math.round(v || 0));
	const fmtP = $derived(primary === 'revenue' ? money : units);
	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const MK_SHORT = { Denmark: 'DK', Sweden: 'SE', Norway: 'NO', International: 'Int.' };
	const idx = (cur, prev) => (prev && prev > 0 ? Math.round((cur / prev) * 100) : null);

	const maxRev = $derived(Math.max(1, ...(data?.chart?.monthly ?? []).flatMap((m) => [m.revenue, m.revenuePrev])));
	const maxUnits = $derived(Math.max(1, ...(data?.chart?.monthly ?? []).flatMap((m) => [m.units, m.unitsPrev])));
	const marketTotal = $derived(Math.max(1, (data?.market ?? []).reduce((s, m) => s + (m[primary] || 0), 0)));
	const chartHasPrev = $derived((data?.chart?.monthly ?? []).some((m) => m.revenuePrev > 0 || m.unitsPrev > 0));
</script>

{#snippet indexChip(cur, prev)}
	{@const v = idx(cur, prev)}
	{#if v != null}<span class="idx" class:up={v >= 100} class:down={v < 100}>Index {v}</span>{/if}
{/snippet}

{#snippet devChart(key, keyPrev, fmt, maxV)}
	<div class="chart">
		{#each data.chart.monthly as m (m.month)}
			<div class="col">
				<div class="pair">
					{#if chartHasPrev}<div class="bar prev" style="height:{Math.max(1, (m[keyPrev] / maxV) * 100)}%" title="{MONTHS[m.month - 1]} {data.chart.year - 1}: {fmt(m[keyPrev])}"></div>{/if}
					<div class="bar cur" style="height:{Math.max(1, (m[key] / maxV) * 100)}%" title="{MONTHS[m.month - 1]} {data.chart.year}: {fmt(m[key])}"></div>
				</div>
				<span class="col-lbl">{MONTHS[m.month - 1]}</span>
			</div>
		{/each}
	</div>
{/snippet}

{#if !data}
	<p class="muted">No data.</p>
{:else}
	{#if metric === 'both'}
		<div class="measure" role="group" aria-label="Measure">
			<button class:active={view === 'revenue'} onclick={() => (view = 'revenue')}>Revenue</button>
			<button class:active={view === 'units'} onclick={() => (view = 'units')}>Units</button>
		</div>
	{/if}
	<div class="tiles">
		{#if showRevenue}<div class="tile"><span class="tile-k">Revenue</span><span class="tile-v">{money(data.totals.revenue)}</span><span class="corner">{@render indexChip(data.totals.revenue, data.totals.revenuePrev)}</span></div>{/if}
		{#if showUnits}<div class="tile"><span class="tile-k">Units sold</span><span class="tile-v">{units(data.totals.units)}</span><span class="corner">{@render indexChip(data.totals.units, data.totals.unitsPrev)}</span></div>{/if}
		<div class="tile"><span class="tile-k">SKUs</span><span class="tile-v">{units(data.totals.skus)}</span></div>
		<div class="tile"><span class="tile-k">Stores</span><span class="tile-v">{units(data.totals.stores)}</span></div>
	</div>

	<!-- By market: four widgets side by side -->
	<div class="markets">
		{#each data.market as m (m.market)}
			<div class="mk">
				<div class="mk-head">
					<span class="mk-flag">{#if flagSvg(m.market)}{@html flagSvg(m.market)}{:else}🌍{/if}</span>
					<span class="mk-name">{m.market}</span>
				</div>
				<div class="mk-v">{primaryFmt(m[primary])}</div>
				<div class="mk-foot">
					<span class="mk-pct">{Math.round((m[primary] / marketTotal) * 100)}% of total</span>
					{@render indexChip(m[primary], m[primary === 'revenue' ? 'revenuePrev' : 'unitsPrev'])}
				</div>
			</div>
		{/each}
	</div>

	<!-- Development chart: always the calendar year vs last year -->
	<section class="block">
		<div class="block-head">
			<h3>Development over time · {data.chart.year}</h3>
			{#if chartHasPrev}<span class="legend"><span class="dot prev"></span>{data.chart.year - 1}<span class="dot cur"></span>{data.chart.year}</span>{/if}
		</div>
		{#if primary === 'revenue'}
			{@render devChart('revenue', 'revenuePrev', money, maxRev)}
		{:else}
			{@render devChart('units', 'unitsPrev', units, maxUnits)}
		{/if}
	</section>

	<!-- Best sellers: pivot by market -->
	<section class="block">
		<div class="block-head"><h3>Best sellers</h3><span class="legend">{primary === 'revenue' ? 'Revenue (kr)' : 'Units'} · by market</span></div>
		{#if !data.topProducts.length}
			<p class="muted">No products in range.</p>
		{:else}
			<div class="pivot-scroll">
				<table class="pivot">
					<thead>
						<tr><th class="l">Product</th>{#each data.markets as mk}<th>{MK_SHORT[mk] ?? mk}</th>{/each}<th>Total</th><th>Index</th></tr>
					</thead>
					<tbody>
						{#each data.topProducts as p (p.sku)}
							<tr>
								<td class="l"><span class="p-name" title={p.name}>{p.name || p.sku}</span><span class="p-sku">{p.sku}</span></td>
								{#each data.markets as mk}<td>{p.markets[mk][primary] ? fmtP(p.markets[mk][primary]) : '–'}</td>{/each}
								<td class="tot">{fmtP(p.total[primary])}</td>
								<td class="ix">{@render indexChip(p.total[primary], p.totalPrev[primary])}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
{/if}

<style>
	.muted { color: #9a9a9a; font-size: 13px; }
	.measure { display: inline-flex; border: 1px solid #ececec; border-radius: 9px; overflow: hidden; background: #fff; margin-bottom: 14px; }
	.measure button { font-family: inherit; font-size: 12.5px; font-weight: 700; color: #52525B; background: #fff; border: none; padding: 7px 16px; cursor: pointer; }
	.measure button + button { border-left: 1px solid #ececec; }
	.measure button.active { background: #F57832; color: #fff; }
	.tiles { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
	.tile { position: relative; flex: 1; min-width: 150px; background: #fff; border: none; border-radius: 16px; padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 12px 32px rgba(60, 48, 25, 0.08); }
	.corner { position: absolute; top: 12px; right: 12px; }
	.tile-k { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #a1a1aa; }
	.tile-v { font-size: 22px; font-weight: 800; color: #18181B; letter-spacing: -0.3px; }
	.tile-v.sm { font-size: 14px; font-weight: 700; }
	.idx { font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 100px; background: #F4F4F5; color: #71717A; white-space: nowrap; }
	.idx.up { background: #E7F6EC; color: #16794C; }
	.idx.down { background: #FDECEA; color: #C0392B; }

	/* Market widgets */
	.markets { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
	@media (max-width: 760px) { .markets { grid-template-columns: repeat(2, 1fr); } }
	.mk { background: #fff; border: none; border-radius: 16px; padding: 15px 16px; box-shadow: 0 12px 32px rgba(60, 48, 25, 0.08); }
	.mk-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
	.mk-flag { display: inline-flex; line-height: 0; border-radius: 2px; overflow: hidden; box-shadow: 0 0 0 1px rgba(0,0,0,0.08); font-size: 16px; }
	.mk-flag :global(svg) { width: 22px; height: 15px; display: block; }
	.mk-name { font-size: 13px; font-weight: 700; color: #18181B; }
	.mk-v { font-size: 18px; font-weight: 800; color: #18181B; letter-spacing: -0.2px; }
	.mk-v.sm { font-size: 12.5px; font-weight: 600; color: #6b6b6b; }
	.mk-foot { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 10px; }
	.mk-pct { font-size: 11px; color: #a1a1aa; font-weight: 600; }

	.block { background: #fff; border: none; border-radius: 18px; padding: 18px 20px; margin-bottom: 18px; box-shadow: 0 14px 38px rgba(60, 48, 25, 0.08); }
	.block-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; gap: 10px; }
	.block h3 { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #8a7550; margin: 0; }
	.legend { font-size: 11px; color: #a1a1aa; font-weight: 600; display: inline-flex; align-items: center; gap: 5px; }
	.legend .dot { width: 9px; height: 9px; border-radius: 2px; display: inline-block; margin-left: 8px; }
	.legend .dot.cur { background: #F57832; } .legend .dot.prev { background: #E6DCC6; }

	.chart { display: flex; align-items: flex-end; gap: 6px; height: 150px; padding-top: 6px; }
	.col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 5px; min-width: 0; }
	.pair { display: flex; align-items: flex-end; justify-content: center; gap: 3px; width: 100%; height: 100%; }
	.bar { width: 100%; max-width: 16px; border-radius: 3px 3px 0 0; transition: height 0.2s; }
	.bar.cur { background: #F57832; }
	.bar.prev { background: #E6DCC6; }
	.col-lbl { font-size: 10px; color: #a1a1aa; font-weight: 600; }
	.chart-cap { font-size: 11px; color: #a1a1aa; margin: 6px 0 14px; font-weight: 600; }

	.pivot-scroll { overflow-x: auto; }
	.pivot { width: 100%; border-collapse: collapse; font-size: 12.5px; }
	.pivot th { text-align: right; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #a88b52; padding: 6px 10px; border-bottom: 1px solid #eee; white-space: nowrap; }
	.pivot th.l { text-align: left; }
	.pivot td { text-align: right; padding: 8px 10px; border-bottom: 1px solid #f3efe6; color: #3f3a33; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.pivot tbody tr:last-child td { border-bottom: none; }
	.pivot td.l { text-align: left; max-width: 240px; }
	.p-name { display: block; font-weight: 600; color: #18181B; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.p-sku { display: block; font-size: 10.5px; color: #a1a1aa; }
	.pivot td.tot { font-weight: 800; color: #18181B; }
	.pivot td.ix { text-align: right; }
</style>
