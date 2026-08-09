<script>
	// Half-year attainment bar chart for completed forecasts: one bar per
	// half-year period that has any forecast, colored by bias, with a dashed
	// 100%-attainment reference line and a hover tooltip (forecast/actual units).
	let { periods = [] } = $props();

	const numFmt = new Intl.NumberFormat('da-DK');
	function pct(a) { return a === null || a === undefined ? '—' : Math.round(a * 100) + '%'; }

	const values = $derived(periods.map((p) => Math.round((p.attainment ?? 0) * 100)));
	const max = $derived(Math.max(100, ...values, 10) * 1.15);
	const barH = (v) => `${(Math.max(0, v) / max) * 100}%`;
	const refBottom = $derived(`${(100 / max) * 100}%`);

	const BIAS = {
		low:  { label: 'Forecasts too low',  cls: 'low' },
		high: { label: 'Forecasts too high', cls: 'high' },
		ok:   { label: 'Accurate',           cls: 'ok' },
		none: { label: '—',                  cls: 'none' }
	};
</script>

<section class="chart-card">
	<div class="chart-head">
		<h3>Attainment by half-year</h3>
		<div class="chart-legend">
			<span class="lg"><i class="sw low"></i>Too low</span>
			<span class="lg"><i class="sw ok"></i>Accurate</span>
			<span class="lg"><i class="sw high"></i>Too high</span>
		</div>
	</div>
	{#if periods.length}
		<div class="chart-plot">
			<div class="ref-line" style="bottom:{refBottom}"></div>
			{#each periods as p (p.key)}
				<div class="chart-col">
					<div class="chart-bars">
						<div class="bar {BIAS[p.bias].cls}" style="height:{barH(Math.round((p.attainment ?? 0) * 100))}"></div>
						<div class="chart-tip" role="tooltip">
							<div class="tip-h">{p.label}</div>
							<div class="tip-row"><span class="tip-k">Forecast units</span><span class="tip-v">{numFmt.format(Math.round(p.forecastUnits))}</span></div>
							<div class="tip-row"><span class="tip-k">Actual units</span><span class="tip-v">{numFmt.format(Math.round(p.actualUnits))}</span></div>
							<div class="tip-row tip-idx"><span class="tip-k">Attainment</span><span class="index-chip {BIAS[p.bias].cls}">{pct(p.attainment)}</span></div>
						</div>
					</div>
					<span class="chart-mlabel">{p.label}</span>
				</div>
			{/each}
		</div>
	{:else}
		<div class="empty">No completed forecasts with dates yet.</div>
	{/if}
</section>

<style>
	.chart-card { margin-bottom: 16px; background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow); padding: 18px 20px 14px; }
	.chart-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
	.chart-head h3 { font-size: 14px; font-weight: 800; color: #18181B; margin: 0; letter-spacing: -0.2px; }
	.chart-legend { display: flex; gap: 14px; }
	.chart-legend .lg { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #8A7550; }
	.chart-legend .sw { width: 10px; height: 10px; border-radius: 3px; }
	.sw.low { background: #1D4ED8; }
	.sw.high { background: #B42318; }
	.sw.ok { background: #16794C; }

	.chart-plot { position: relative; display: flex; align-items: flex-end; gap: 10px; height: 172px; padding-top: 8px; }
	.ref-line { position: absolute; left: 0; right: 0; border-top: 1px dashed #D8C79E; z-index: 0; }
	.chart-col { position: relative; flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; align-items: center; }
	.chart-bars { position: relative; flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
	.chart-bars .bar { width: 56%; max-width: 46px; border-radius: 4px 4px 0 0; transition: height 0.2s, opacity 0.12s; }
	.chart-bars .bar.low { background: #1D4ED8; }
	.chart-bars .bar.high { background: #B42318; }
	.chart-bars .bar.ok { background: #16794C; }
	.chart-bars .bar.none { background: #A88B52; }
	.chart-col:hover .bar { opacity: 0.85; }
	.chart-mlabel { margin-top: 8px; font-size: 11px; font-weight: 700; color: #A88B52; text-align: center; }

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
	.index-chip.low { background: #EEF4FF; color: #1D4ED8; }
	.index-chip.high { background: #FEF3F0; color: #B42318; }
	.index-chip.ok { background: #E7F6EC; color: #16794C; }
	.index-chip.none { background: #F1ECE1; color: #7a6b57; }

	.empty { padding: 30px 18px; text-align: center; color: #98876e; font-size: 13px; }
</style>
