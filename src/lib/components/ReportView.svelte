<script>
	let { data, metric = 'both' } = $props();

	const showRevenue = $derived(metric === 'revenue' || metric === 'both');
	const showUnits = $derived(metric === 'units' || metric === 'both');
	const primary = $derived(showRevenue ? 'revenue' : 'units'); // measure used for bars/top ordering

	const nf = new Intl.NumberFormat('da-DK');
	const money = (v) => nf.format(Math.round(v || 0)) + ' kr';
	const units = (v) => nf.format(Math.round(v || 0));
	const monShort = (ym) => { const [y, m] = ym.split('-'); return new Date(Date.UTC(+y, +m - 1, 1)).toLocaleDateString('en-GB', { month: 'short' }); };

	const MARKET_COLORS = { Denmark: '#C8102E', Sweden: '#006AA7', Norway: '#00205B', International: '#8a7f6a' };

	const maxRev = $derived(Math.max(1, ...(data?.monthly ?? []).map((m) => m.revenue)));
	const maxUnits = $derived(Math.max(1, ...(data?.monthly ?? []).map((m) => m.units)));
	const topMax = $derived(Math.max(1, ...(data?.topProducts ?? []).map((p) => p[primary])));
	const marketTotal = $derived(Math.max(1, (data?.market ?? []).reduce((s, m) => s + (m[primary] || 0), 0)));
</script>

{#if !data}
	<p class="muted">No data.</p>
{:else}
	<!-- Headline totals -->
	<div class="tiles">
		{#if showRevenue}<div class="tile"><span class="tile-k">Revenue</span><span class="tile-v">{money(data.totals.revenue)}</span></div>{/if}
		{#if showUnits}<div class="tile"><span class="tile-k">Units sold</span><span class="tile-v">{units(data.totals.units)}</span></div>{/if}
		<div class="tile sub"><span class="tile-k">Period</span><span class="tile-v sm">{data.period?.label ?? 'Last 12 months'}</span></div>
	</div>

	<!-- Development over time -->
	<section class="block">
		<h3>Development over time</h3>
		{#if showRevenue}
			<div class="chart">
				{#each data.monthly as m (m.ym)}
					<div class="col" title="{monShort(m.ym)}: {money(m.revenue)}">
						<div class="bar rev" style="height:{Math.max(2, (m.revenue / maxRev) * 100)}%"></div>
						<span class="col-lbl">{monShort(m.ym)}</span>
					</div>
				{/each}
			</div>
			{#if showUnits}<p class="chart-cap">Revenue (kr) per month</p>{/if}
		{/if}
		{#if showUnits}
			<div class="chart">
				{#each data.monthly as m (m.ym)}
					<div class="col" title="{monShort(m.ym)}: {units(m.units)} units">
						<div class="bar unit" style="height:{Math.max(2, (m.units / maxUnits) * 100)}%"></div>
						<span class="col-lbl">{monShort(m.ym)}</span>
					</div>
				{/each}
			</div>
			{#if showRevenue}<p class="chart-cap">Units per month</p>{/if}
		{/if}
	</section>

	<div class="two">
		<!-- Top products -->
		<section class="block">
			<h3>Best sellers</h3>
			{#if !data.topProducts.length}
				<p class="muted">No products in range.</p>
			{:else}
				<div class="rows">
					{#each data.topProducts as p (p.sku)}
						<div class="row">
							<div class="row-top"><span class="row-name" title={p.name}>{p.name || p.sku}</span>
								<span class="row-val">{showUnits ? units(p.units) + ' pcs' : ''}{showUnits && showRevenue ? ' · ' : ''}{showRevenue ? money(p.revenue) : ''}</span>
							</div>
							<div class="track"><div class="fill" style="width:{(p[primary] / topMax) * 100}%"></div></div>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- Market split -->
		<section class="block">
			<h3>By market</h3>
			<div class="rows">
				{#each data.market as m (m.market)}
					{@const val = m[primary]}
					<div class="row">
						<div class="row-top"><span class="row-name">{m.market}</span>
							<span class="row-val">{showUnits ? units(m.units) + ' pcs' : ''}{showUnits && showRevenue ? ' · ' : ''}{showRevenue ? money(m.revenue) : ''} <span class="pct">({Math.round((val / marketTotal) * 100)}%)</span></span>
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

	.block { background: #fff; border: 1px solid #ececec; border-radius: 14px; padding: 16px 18px; margin-bottom: 16px; }
	.block h3 { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #8a7550; margin: 0 0 14px; }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
	@media (max-width: 760px) { .two { grid-template-columns: 1fr; } }

	.chart { display: flex; align-items: flex-end; gap: 6px; height: 140px; padding-top: 6px; }
	.col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 5px; min-width: 0; }
	.bar { width: 100%; max-width: 30px; border-radius: 4px 4px 0 0; transition: height 0.2s; }
	.bar.rev { background: #F57832; }
	.bar.unit { background: #6D5BD0; }
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
