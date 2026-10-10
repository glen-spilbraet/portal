<script>
	let { data, metric = 'both' } = $props();

	const showRevenue = $derived(metric === 'revenue' || metric === 'both');
	const showUnits = $derived(metric === 'units' || metric === 'both');
	const primary = $derived(showRevenue ? 'revenue' : 'units');

	const nf = new Intl.NumberFormat('da-DK');
	const money = (v) => nf.format(Math.round(v || 0)) + ' kr';
	const units = (v) => nf.format(Math.round(v || 0));
	const monShort = (ym) => { const [y, m] = ym.split('-'); return new Date(Date.UTC(+y, +m - 1, 1)).toLocaleDateString('en-GB', { month: 'short' }); };
	const idx = (cur, prev) => (prev && prev > 0 ? Math.round((cur / prev) * 100) : null);

	const MARKET_COLORS = { Denmark: '#C8102E', Sweden: '#006AA7', Norway: '#00205B', International: '#8a7f6a' };

	// Scale bars across BOTH this-year and last-year values so the comparison is honest.
	const maxRev = $derived(Math.max(1, ...(data?.monthly ?? []).flatMap((m) => [m.revenue, m.revenuePrev])));
	const maxUnits = $derived(Math.max(1, ...(data?.monthly ?? []).flatMap((m) => [m.units, m.unitsPrev])));
	const topMax = $derived(Math.max(1, ...(data?.topProducts ?? []).map((p) => p[primary])));
	const marketTotal = $derived(Math.max(1, (data?.market ?? []).reduce((s, m) => s + (m[primary] || 0), 0)));
	const hasPrev = $derived((data?.monthly ?? []).some((m) => m.revenuePrev > 0 || m.unitsPrev > 0));
</script>

{#snippet indexChip(cur, prev)}
	{@const v = idx(cur, prev)}
	{#if v != null}<span class="idx" class:up={v >= 100} class:down={v < 100}>Index {v}</span>{/if}
{/snippet}

{#snippet devChart(key, keyPrev, fmt, maxV)}
	<div class="chart">
		{#each data.monthly as m (m.ym)}
			<div class="col">
				<div class="pair">
					{#if hasPrev}<div class="bar prev" style="height:{Math.max(1, (m[keyPrev] / maxV) * 100)}%" title="{monShort(m.ym)} last year: {fmt(m[keyPrev])}"></div>{/if}
					<div class="bar cur" style="height:{Math.max(1, (m[key] / maxV) * 100)}%" title="{monShort(m.ym)}: {fmt(m[key])}"></div>
				</div>
				<span class="col-lbl">{monShort(m.ym)}</span>
			</div>
		{/each}
	</div>
{/snippet}

{#if !data}
	<p class="muted">No data.</p>
{:else}
	<div class="tiles">
		{#if showRevenue}
			<div class="tile"><span class="tile-k">Revenue</span><span class="tile-v">{money(data.totals.revenue)}</span>{@render indexChip(data.totals.revenue, data.totals.revenuePrev)}</div>
		{/if}
		{#if showUnits}
			<div class="tile"><span class="tile-k">Units sold</span><span class="tile-v">{units(data.totals.units)}</span>{@render indexChip(data.totals.units, data.totals.unitsPrev)}</div>
		{/if}
		<div class="tile sub"><span class="tile-k">Period</span><span class="tile-v sm">{data.period?.label ?? 'Last 12 months'}</span></div>
	</div>

	<section class="block">
		<div class="block-head">
			<h3>Development over time</h3>
			{#if hasPrev}<span class="legend"><span class="dot prev"></span>Last year<span class="dot cur"></span>This year</span>{/if}
		</div>
		{#if showRevenue}
			{@render devChart('revenue', 'revenuePrev', money, maxRev)}
			{#if showUnits}<p class="chart-cap">Revenue per month</p>{/if}
		{/if}
		{#if showUnits}
			{@render devChart('units', 'unitsPrev', units, maxUnits)}
			{#if showRevenue}<p class="chart-cap">Units per month</p>{/if}
		{/if}
	</section>

	<div class="two">
		<section class="block">
			<h3>Best sellers</h3>
			{#if !data.topProducts.length}
				<p class="muted">No products in range.</p>
			{:else}
				<div class="rows">
					{#each data.topProducts as p (p.sku)}
						<div class="row">
							<div class="row-top">
								<span class="row-name" title={p.name}>{p.name || p.sku}</span>
								<span class="row-val">{showUnits ? units(p.units) + ' pcs' : ''}{showUnits && showRevenue ? ' · ' : ''}{showRevenue ? money(p.revenue) : ''} {@render indexChip(p[primary], p[primary === 'revenue' ? 'revenuePrev' : 'unitsPrev'])}</span>
							</div>
							<div class="track"><div class="fill" style="width:{(p[primary] / topMax) * 100}%"></div></div>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<section class="block">
			<h3>By market</h3>
			<div class="rows">
				{#each data.market as m (m.market)}
					{@const val = m[primary]}
					<div class="row">
						<div class="row-top">
							<span class="row-name">{m.market}</span>
							<span class="row-val">{showUnits ? units(m.units) + ' pcs' : ''}{showUnits && showRevenue ? ' · ' : ''}{showRevenue ? money(m.revenue) : ''} <span class="pct">({Math.round((val / marketTotal) * 100)}%)</span> {@render indexChip(val, m[primary === 'revenue' ? 'revenuePrev' : 'unitsPrev'])}</span>
						</div>
						<div class="track"><div class="fill" style="width:{(val / marketTotal) * 100}%; background:{MARKET_COLORS[m.market]}"></div></div>
					</div>
				{/each}
			</div>
		</section>
	</div>
{/if}

<style>
	.muted { color: #9a9a9a; font-size: 13px; }
	.tiles { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
	.tile { flex: 1; min-width: 150px; background: #fff; border: 1px solid #ececec; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
	.tile.sub { background: #fafafa; }
	.tile-k { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #a1a1aa; }
	.tile-v { font-size: 22px; font-weight: 800; color: #18181B; letter-spacing: -0.3px; }
	.tile-v.sm { font-size: 14px; font-weight: 700; }
	.idx { align-self: flex-start; margin-top: 2px; font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 100px; background: #F4F4F5; color: #71717A; }
	.idx.up { background: #E7F6EC; color: #16794C; }
	.idx.down { background: #FDECEA; color: #C0392B; }

	.block { background: #fff; border: 1px solid #ececec; border-radius: 14px; padding: 16px 18px; margin-bottom: 16px; }
	.block-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
	.block h3 { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #8a7550; margin: 0; }
	.legend { font-size: 11px; color: #a1a1aa; font-weight: 600; display: inline-flex; align-items: center; gap: 5px; }
	.legend .dot { width: 9px; height: 9px; border-radius: 2px; display: inline-block; margin-left: 8px; }
	.legend .dot.cur { background: #F57832; } .legend .dot.prev { background: #E6DCC6; }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
	@media (max-width: 760px) { .two { grid-template-columns: 1fr; } }

	.chart { display: flex; align-items: flex-end; gap: 6px; height: 150px; padding-top: 6px; }
	.col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 5px; min-width: 0; }
	.pair { display: flex; align-items: flex-end; justify-content: center; gap: 3px; width: 100%; height: 100%; }
	.bar { width: 100%; max-width: 16px; border-radius: 3px 3px 0 0; transition: height 0.2s; }
	.bar.cur { background: #F57832; }
	.bar.prev { background: #E6DCC6; }
	.col-lbl { font-size: 10px; color: #a1a1aa; font-weight: 600; }
	.chart-cap { font-size: 11px; color: #a1a1aa; margin: 6px 0 14px; font-weight: 600; }

	.rows { display: flex; flex-direction: column; gap: 10px; }
	.row-top { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; margin-bottom: 3px; }
	.row-name { font-weight: 600; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.row-val { color: #6b6b6b; white-space: nowrap; font-variant-numeric: tabular-nums; }
	.pct { color: #a1a1aa; }
	.track { height: 8px; background: #f3f0ea; border-radius: 100px; overflow: hidden; }
	.fill { height: 100%; background: #F57832; border-radius: 100px; }
</style>
