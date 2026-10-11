<script>
	import { flagSvg } from '$lib/flags.js';
	let { data, metric = 'both' } = $props();

	let info = $state(null); // { title, body } shown in the info modal, or null
	const STORES_INFO = {
		title: 'About the “Stores” figure',
		body: [
			'This counts the distinct customer accounts that bought the product in the period.',
			'A number lower than last year does not necessarily mean fewer shops carry the product. When a product gets listed with a larger key account, that chain often starts ordering through a single central account instead of each individual store — so several shops can be served through one account.',
			'In other words, you may actually have gained presence in more shops even though this figure goes down, because the buying has moved to a central account.',
			'So treat this as a helpful indicator of reach, but keep in mind that central-buying setups can move the number for reasons unrelated to the product’s actual presence in stores.',
		],
	};

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
	{#if v != null}<span class="idx" class:up={v >= 100} class:mid={v >= 90 && v < 100} class:down={v < 90}>Index {v}</span>{/if}
{/snippet}

{#snippet metricIcon(kind)}
	<span class="metric-ico {kind}">
		{#if kind === 'rev'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M5 10v4M19 10v4"/></svg>
		{:else if kind === 'units'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
		{:else if kind === 'skus'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 20v-6h6v6"/></svg>
		{/if}
	</span>
{/snippet}

{#snippet tile(kind, label, value, prevValue, cur, prev, infoText = null)}
	<div class="tile">
		{#if infoText}<button class="tile-info" title="More info" aria-label="More info" onclick={() => (info = infoText)}>i</button>{/if}
		<div class="tile-head">{@render metricIcon(kind)}<span class="tile-k">{label}</span></div>
		<div class="tile-v">{value}</div>
		<div class="tile-foot"><span class="was">Last year: {prevValue}</span>{@render indexChip(cur, prev)}</div>
	</div>
{/snippet}

{#snippet devChart(key, keyPrev, fmt, maxV)}
	<div class="chart">
		{#each data.chart.monthly as m (m.month)}
			<div class="col">
				<div class="tip">
					<div class="tip-h">{MONTHS[m.month - 1]}</div>
					<div class="tip-row"><span class="tdot cur"></span>{data.chart.year}: <b>{fmt(m[key])}</b></div>
					{#if chartHasPrev}<div class="tip-row"><span class="tdot prev"></span>{data.chart.year - 1}: {fmt(m[keyPrev])}</div>{/if}
					{#if idx(m[key], m[keyPrev]) != null}<div class="tip-idx" class:up={idx(m[key], m[keyPrev]) >= 100} class:mid={idx(m[key], m[keyPrev]) >= 90 && idx(m[key], m[keyPrev]) < 100} class:down={idx(m[key], m[keyPrev]) < 90}>Index {idx(m[key], m[keyPrev])}</div>{/if}
				</div>
				<div class="pair">
					{#if chartHasPrev}<div class="bar prev" style="height:{Math.max(1, (m[keyPrev] / maxV) * 100)}%"></div>{/if}
					<div class="bar cur" style="height:{Math.max(1, (m[key] / maxV) * 100)}%"></div>
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
		{#if showRevenue}{@render tile('rev', 'Revenue', money(data.totals.revenue), money(data.totals.revenuePrev), data.totals.revenue, data.totals.revenuePrev)}{/if}
		{#if showUnits}{@render tile('units', 'Units sold', units(data.totals.units), units(data.totals.unitsPrev), data.totals.units, data.totals.unitsPrev)}{/if}
		{@render tile('skus', 'SKUs', units(data.totals.skus), units(data.totals.skusPrev), data.totals.skus, data.totals.skusPrev)}
		{@render tile('stores', 'Stores', units(data.totals.stores), units(data.totals.storesPrev), data.totals.stores, data.totals.storesPrev, STORES_INFO)}
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
					<span class="mk-pct">Last year: {primaryFmt(m[primary === 'revenue' ? 'revenuePrev' : 'unitsPrev'])}</span>
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

{#if info}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="info-backdrop" onclick={() => (info = null)}></div>
	<div class="info-modal">
		<div class="info-head"><h2>{info.title}</h2><button class="x" onclick={() => (info = null)} aria-label="Close">✕</button></div>
		<div class="info-body">{#each info.body as p}<p>{p}</p>{/each}</div>
	</div>
{/if}

<style>
	.muted { color: #9a9a9a; font-size: 13px; }
	.measure { display: inline-flex; border: 1px solid #ececec; border-radius: 9px; overflow: hidden; background: #fff; margin-bottom: 14px; }
	.measure button { font-family: inherit; font-size: 12.5px; font-weight: 700; color: #52525B; background: #fff; border: none; padding: 7px 16px; cursor: pointer; }
	.measure button + button { border-left: 1px solid #ececec; }
	.measure button.active { background: #F57832; color: #fff; }
	.tiles { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
	.tile { position: relative; flex: 1; min-width: 160px; background: #fff; border: none; border-radius: 16px; padding: 15px 16px; display: flex; flex-direction: column; box-shadow: 0 12px 32px rgba(60, 48, 25, 0.08); }
	.tile-info { position: absolute; top: 12px; right: 12px; width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid #d9d2c4; background: #fff; color: #a1917a; font-size: 11px; font-weight: 800; font-style: italic; font-family: Georgia, serif; line-height: 1; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
	.tile-info:hover { border-color: #F57832; color: #F57832; }

	.info-backdrop { position: fixed; inset: 0; background: rgba(40,25,0,0.35); z-index: 300; }
	.info-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 310; width: min(460px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; background: #fff; border-radius: 16px; box-shadow: 0 24px 60px rgba(50,30,0,0.28); }
	.info-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #eee; }
	.info-head h2 { font-size: 15px; font-weight: 800; margin: 0; color: #18181B; }
	.info-head .x { background: none; border: none; font-size: 15px; color: #8A7550; cursor: pointer; }
	.info-body { padding: 16px 20px; }
	.info-body p { font-size: 13.5px; color: #3a3228; line-height: 1.6; margin: 0 0 10px; }
	.info-body p:last-child { margin-bottom: 0; }
	.tile-head { display: flex; align-items: center; gap: 9px; margin-bottom: 8px; }
	.tile-k { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #a1a1aa; }
	.tile-v { font-size: 22px; font-weight: 800; color: #18181B; letter-spacing: -0.3px; }
	.tile-foot { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 10px; }
	.was { font-size: 11px; color: #a1a1aa; font-weight: 600; }
	.metric-ico { width: 28px; height: 28px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
	.metric-ico svg { width: 16px; height: 16px; }
	.metric-ico.rev { background: #FDEEE4; color: #B15A12; }
	.metric-ico.units { background: #EFEDFB; color: #6D5BD0; }
	.metric-ico.skus { background: #E7F1FF; color: #1D4ED8; }
	.metric-ico.stores { background: #E7F6EC; color: #16794C; }
	.idx { font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 100px; background: #F4F4F5; color: #71717A; white-space: nowrap; }
	.idx.up { background: #E7F6EC; color: #16794C; }
	.idx.mid { background: #FDF0E0; color: #B4690E; }
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
	.col { position: relative; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 5px; min-width: 0; }
	/* Hover tooltip */
	.tip { position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); z-index: 20; background: #1f2937; color: #fff; border-radius: 8px; padding: 8px 10px; font-size: 11.5px; line-height: 1.5; white-space: nowrap; box-shadow: 0 8px 22px rgba(0,0,0,0.22); opacity: 0; pointer-events: none; transition: opacity 0.12s; }
	.col:hover .tip { opacity: 1; }
	.tip-h { font-weight: 800; margin-bottom: 2px; }
	.tip-row { display: flex; align-items: center; gap: 5px; color: #e5e7eb; }
	.tip-row b { color: #fff; font-weight: 700; margin-left: 2px; }
	.tdot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
	.tdot.cur { background: #F57832; } .tdot.prev { background: #E6DCC6; }
	.tip-idx { margin-top: 3px; font-weight: 700; }
	.tip-idx.up { color: #86efac; } .tip-idx.mid { color: #fcd34d; } .tip-idx.down { color: #fca5a5; }
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
