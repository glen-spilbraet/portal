<script>
	// Monthly revenue bar chart: current year vs a faint prior year, with a hover
	// tooltip (both years' revenue + colored index chip).
	let { monthly, title = 'Revenue by month' } = $props();
	const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const dkkFmt = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 });
	const formatDkk = (n) => dkkFmt.format(Math.round(n ?? 0)) + ' kr';
	const max = $derived(Math.max(1, ...(monthly?.cur ?? []), ...(monthly?.prior ?? [])));
	const barH = (v) => `${((v || 0) / max) * 100}%`;
	function indexClass(idx) {
		if (idx === null || idx === undefined) return '';
		if (idx >= 100) return 'green';
		if (idx >= 96) return 'orange';
		return 'red';
	}
</script>

<section class="chart-card">
	<div class="chart-head">
		<h3>{title} · {monthly.year}</h3>
		<div class="chart-legend">
			<span class="lg"><i class="sw prior"></i>{monthly.year - 1}</span>
			<span class="lg"><i class="sw cur"></i>{monthly.year}</span>
		</div>
	</div>
	<div class="chart-plot">
		{#each monthLabels as ml, i}
			{@const cur = monthly.cur[i]}
			{@const prior = monthly.prior[i]}
			{@const idx = prior > 0 ? Math.round((cur / prior) * 100) : null}
			<div class="chart-col">
				<div class="chart-bars">
					<div class="bar prior" style="height:{barH(prior)}"></div>
					<div class="bar cur" style="height:{barH(cur)}"></div>
					<div class="chart-tip" role="tooltip">
						<div class="tip-h">{ml} {monthly.year}</div>
						<div class="tip-row"><span class="tip-k">{monthly.year - 1} Revenue</span><span class="tip-v">{formatDkk(prior)}</span></div>
						<div class="tip-row"><span class="tip-k">{monthly.year} Revenue</span><span class="tip-v">{formatDkk(cur)}</span></div>
						<div class="tip-row tip-idx"><span class="tip-k">Index</span><span class="index-chip {indexClass(idx)}">{idx ?? '—'}</span></div>
					</div>
				</div>
				<span class="chart-mlabel">{ml}</span>
			</div>
		{/each}
	</div>
</section>

<style>
	.chart-card { margin-top: 14px; background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow); padding: 18px 20px 14px; }
	.chart-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
	.chart-head h3 { font-size: 14px; font-weight: 800; color: #18181B; margin: 0; letter-spacing: -0.2px; }
	.chart-legend { display: flex; gap: 14px; }
	.chart-legend .lg { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #8A7550; }
	.chart-legend .sw { width: 10px; height: 10px; border-radius: 3px; }
	.sw.cur { background: #F57832; }
	.sw.prior { background: #E7D3A6; }
	.chart-plot { display: flex; align-items: flex-end; gap: 8px; height: 172px; }
	.chart-col { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; align-items: center; }
	.chart-bars { position: relative; flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 3px; }
	.chart-bars .bar { width: 44%; max-width: 22px; border-radius: 4px 4px 0 0; transition: height 0.2s, background 0.12s; }
	.chart-bars .bar.cur { background: #F57832; }
	.chart-bars .bar.prior { background: #E7D3A6; }
	.chart-col:hover .bar.cur { background: #E06820; }
	.chart-col:hover .bar.prior { background: #DcC492; }
	.chart-mlabel { margin-top: 8px; font-size: 11px; font-weight: 700; color: #A88B52; }
	.chart-tip { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); margin-bottom: 9px; width: max-content; max-width: 300px; display: none; z-index: 30; pointer-events: none; background: #fff; border: 1px solid var(--border); border-radius: 11px; box-shadow: 0 8px 24px rgba(0,0,0,0.14); padding: 11px 13px; }
	.chart-tip::after { content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 6px solid transparent; border-top-color: #fff; filter: drop-shadow(0 1px 0 var(--border)); }
	.chart-col:hover .chart-tip { display: block; }
	.chart-col:first-child .chart-tip { left: 0; transform: none; }
	.chart-col:first-child .chart-tip::after { left: 30px; }
	.chart-col:last-child .chart-tip { left: auto; right: 0; transform: none; }
	.chart-col:last-child .chart-tip::after { left: auto; right: 30px; transform: none; }
	.tip-h { font-size: 11px; font-weight: 800; color: #A88B52; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px; }
	.tip-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 3px 0; }
	.tip-k { font-size: 12px; font-weight: 600; color: #71717A; white-space: nowrap; }
	.tip-v { font-size: 13px; font-weight: 800; color: #18181B; font-variant-numeric: tabular-nums; white-space: nowrap; }
	.tip-idx { margin-top: 5px; padding-top: 8px; border-top: 1px solid var(--border); }
	.index-chip { display: inline-block; font-size: 12px; font-weight: 800; padding: 2px 9px; border-radius: 100px; }
	.index-chip.green { background: #EAF7EF; color: #16794C; }
	.index-chip.orange { background: #FDEBD2; color: #B4611A; }
	.index-chip.red { background: #FDECEC; color: #C4381B; }
</style>
