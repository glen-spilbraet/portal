<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();

	const SITES = { 1: 'DK', 2: 'SE', 3: 'NO' };
	const GRAINS = [
		{ key: 'orders', label: 'Orders' },
		{ key: 'lines', label: 'Lines' },
		{ key: 'units', label: 'Units' },
	];
	let grain = $state('orders');
	let bucketBy = $state('day');
	const BUCKETS = [
		{ key: 'day', label: 'Days' },
		{ key: 'week', label: 'Weeks' },
		{ key: 'month', label: 'Months' },
		{ key: 'quarter', label: 'Quarters' },
	];
	let busy = $state(false);

	// ── Date control (DateBar-style, independent state) ─────────────────────────
	async function pickPreset(e) {
		const key = e.currentTarget.value;
		const p = data.presets.find((x) => x.key === key);
		if (!p || busy) return;
		busy = true;
		try { await goto(`?from=${p.from}&to=${p.to}`, { noScroll: true, keepFocus: true }); }
		finally { busy = false; }
	}
	async function applyCustom(e) {
		e.preventDefault();
		if (busy) return;
		const f = e.currentTarget;
		if (!f.from.value || !f.to.value) return;
		busy = true;
		try { await goto(`?from=${f.from.value}&to=${f.to.value}`, { noScroll: true, keepFocus: true }); }
		finally { busy = false; }
	}

	function relTime(iso) {
		const t = Date.parse(iso);
		if (!Number.isFinite(t)) return 'unknown';
		const mins = Math.round((Date.now() - t) / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins} min ago`;
		const hrs = Math.round(mins / 60);
		if (hrs < 24) return `${hrs} h ago`;
		const days = Math.round(hrs / 24);
		return days === 1 ? 'yesterday' : `${days} days ago`;
	}
	const fresh = $derived.by(() => {
		const sm = data.syncMeta;
		if (!sm?.last_run) return null;
		const ageMs = Date.now() - Date.parse(sm.last_run);
		const stale = ageMs > 3 * 3600 * 1000; // cron is hourly
		if (sm.status === 'error') return { cls: 'bad', label: 'Sync error' };
		if (stale) return { cls: 'warn', label: `Stale · ${relTime(sm.last_run)}` };
		return { cls: 'ok', label: `Updated ${relTime(sm.last_run)}` };
	});

	// ── Day axis ────────────────────────────────────────────────────────────────
	const days = $derived.by(() => {
		const out = [];
		if (!data.from || !data.to) return out;
		let d = new Date(data.from + 'T00:00:00Z');
		const end = new Date(data.to + 'T00:00:00Z');
		let guard = 0;
		while (d <= end && guard++ < 500) {
			out.push(d.toISOString().slice(0, 10));
			d.setUTCDate(d.getUTCDate() + 1);
		}
		return out;
	});

	function byDay(rows) {
		const m = new Map();
		for (const r of rows ?? []) m.set(r.d, (m.get(r.d) ?? 0) + (Number(r[grain]) || 0));
		return m;
	}
	const inboundByDay = $derived(byDay(data.inbound));
	const handledByDay = $derived(byDay(data.handled));
	const series = $derived(days.map((d) => ({ d, inbound: inboundByDay.get(d) ?? 0, handled: handledByDay.get(d) ?? 0 })));

	// ── Time bucketing (day / week / month / quarter) ───────────────────────────
	const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	function mondayOf(ymdStr) {
		const d = new Date(ymdStr + 'T00:00:00Z');
		d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
		return d.toISOString().slice(0, 10);
	}
	function bucketOf(ymdStr, mode) {
		const [Y, M, D] = ymdStr.split('-');
		if (mode === 'week') { const mon = mondayOf(ymdStr); const [, mm, dd] = mon.split('-'); return { key: mon, label: `${mm}/${dd}` }; }
		if (mode === 'month') return { key: `${Y}-${M}`, label: `${MON[+M - 1]} ${Y.slice(2)}` };
		if (mode === 'quarter') { const q = Math.floor((+M - 1) / 3) + 1; return { key: `${Y}-Q${q}`, label: `Q${q} ${Y.slice(2)}` }; }
		return { key: ymdStr, label: `${M}/${D}` };
	}
	const buckets = $derived.by(() => {
		const m = new Map();
		for (const p of series) {
			const b = bucketOf(p.d, bucketBy);
			const cur = m.get(b.key) || { key: b.key, label: b.label, inbound: 0, handled: 0 };
			cur.inbound += p.inbound; cur.handled += p.handled;
			m.set(b.key, cur);
		}
		return [...m.values()];
	});

	function sum(rows) { return (rows ?? []).reduce((s, r) => s + (Number(r[grain]) || 0), 0); }
	function bySite(rows) {
		const m = { 1: 0, 2: 0, 3: 0 };
		for (const r of rows ?? []) if (m[r.site] != null) m[r.site] += Number(r[grain]) || 0;
		return m;
	}
	const inboundTotal = $derived(sum(data.inbound));
	const handledTotal = $derived(sum(data.handled));
	const inboundSite = $derived(bySite(data.inbound));
	const handledSite = $derived(bySite(data.handled));

	const topCustomers = $derived(
		[...(data.customers ?? [])]
			.map((c) => ({ name: c.name, site: c.site, value: Number(c[grain]) || 0 }))
			.sort((a, b) => b.value - a.value)
			.slice(0, 12)
	);
	const customerMax = $derived(Math.max(1, ...topCustomers.map((c) => c.value)));

	const nf = new Intl.NumberFormat('en-US');
	const fmt = (n) => nf.format(Math.round(n || 0));

	// ── Smooth line/area chart geometry ─────────────────────────────────────────
	const VB_W = 1000, VB_H = 300, PAD_L = 44, PAD_R = 14, PAD_T = 16, PAD_B = 30;
	const innerW = VB_W - PAD_L - PAD_R;
	const innerH = VB_H - PAD_T - PAD_B;

	function niceMax(v) {
		if (v <= 0) return 4;
		const p = Math.pow(10, Math.floor(Math.log10(v)));
		const n = v / p;
		const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
		return nice * p;
	}
	const yMax = $derived(niceMax(Math.max(1, ...buckets.map((p) => Math.max(p.inbound, p.handled)))));
	const yTicks = $derived([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * yMax)));

	const xAt = (i) => PAD_L + (buckets.length <= 1 ? innerW / 2 : (i / (buckets.length - 1)) * innerW);
	const yAt = (v) => PAD_T + innerH - (v / yMax) * innerH;

	// Catmull-Rom → cubic bézier smooth path through the points.
	function smoothLine(vals) {
		const pts = vals.map((v, i) => [xAt(i), yAt(v)]);
		if (pts.length === 0) return '';
		if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
		let d = `M ${pts[0][0]} ${pts[0][1]}`;
		for (let i = 0; i < pts.length - 1; i++) {
			const p0 = pts[i - 1] || pts[i];
			const p1 = pts[i];
			const p2 = pts[i + 1];
			const p3 = pts[i + 2] || p2;
			const c1x = p1[0] + (p2[0] - p0[0]) / 6;
			const c1y = p1[1] + (p2[1] - p0[1]) / 6;
			const c2x = p2[0] - (p3[0] - p1[0]) / 6;
			const c2y = p2[1] - (p3[1] - p1[1]) / 6;
			d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
		}
		return d;
	}
	function smoothArea(vals) {
		const line = smoothLine(vals);
		if (!line) return '';
		const x0 = xAt(0), xN = xAt(vals.length - 1), base = yAt(0);
		return `${line} L ${xN} ${base} L ${x0} ${base} Z`;
	}
	const inLine = $derived(smoothLine(buckets.map((p) => p.inbound)));
	const inArea = $derived(smoothArea(buckets.map((p) => p.inbound)));
	const hdLine = $derived(smoothLine(buckets.map((p) => p.handled)));
	const hdArea = $derived(smoothArea(buckets.map((p) => p.handled)));
	const showDots = $derived(buckets.length <= 45);

	const xTicks = $derived.by(() => {
		const n = buckets.length;
		if (!n) return [];
		const step = Math.max(1, Math.round(n / 8));
		const out = [];
		for (let i = 0; i < n; i += step) out.push(i);
		if (out[out.length - 1] !== n - 1) out.push(n - 1);
		return out;
	});
</script>

<svelte:head><title>Warehouse — Stats</title></svelte:head>

<AppNav user={data.user} active="warehouse" />

<!-- Sticky date bar (DateBar-style) -->
<div class="date-bar">
	<div class="date-bar-inner">
		{#if fresh}
			<div class="freshness {fresh.cls}"><span class="dot"></span>{fresh.label}</div>
		{/if}
		<div class="range-controls" class:busy aria-busy={busy}>
			<select class="quick-select" class:active={data.selected !== 'custom'} aria-label="Quick select" onchange={pickPreset} disabled={busy}>
				<option value="" disabled selected={data.selected === 'custom'}>Custom range</option>
				{#each data.presets as p}
					<option value={p.key} selected={data.selected === p.key}>{p.label}</option>
				{/each}
			</select>
			<form class="custom-range" onsubmit={applyCustom}>
				<input type="date" name="from" value={data.from} max={data.to} class="date-input" aria-label="From date" disabled={busy} />
				<span class="range-dash">–</span>
				<input type="date" name="to" value={data.to} min={data.from} class="date-input" aria-label="To date" disabled={busy} />
				<button type="submit" class="apply-btn" class:active={data.selected === 'custom'} disabled={busy}>
					{#if busy}<span class="spinner" aria-hidden="true"></span>Loading{:else}Apply{/if}
				</button>
			</form>
		</div>
	</div>
</div>

<main>
	<header class="head">
		<div>
			<h1>Warehouse</h1>
			<p class="sub">Inbound (orders received) vs handled (picked &amp; shipped), from the Lagersystem mirror.</p>
		</div>
		<div class="grain">
			{#each GRAINS as g}
				<button type="button" class="seg" class:on={grain === g.key} onclick={() => (grain = g.key)}>{g.label}</button>
			{/each}
		</div>
	</header>

	{#if !data.ready}
		<div class="empty">
			<p><strong>No warehouse data yet.</strong></p>
			{#if data.reason === 'no-table'}
				<p class="muted">The <code>wms_orders</code> tables aren’t created on this environment yet — apply migration <code>0099_wms_orders.sql</code>, then run the <code>lagersystem-sync</code> worker.</p>
			{:else}
				<p class="muted">Database unavailable.</p>
			{/if}
		</div>
	{:else}
		<!-- KPI row -->
		<div class="kpis">
			<div class="kpi inbound">
				<span class="k-label">Inbound</span>
				<span class="k-val">{fmt(inboundTotal)}</span>
				<span class="k-sites">DK {fmt(inboundSite[1])} · SE {fmt(inboundSite[2])} · NO {fmt(inboundSite[3])}</span>
			</div>
			<div class="kpi handled">
				<span class="k-label">Handled</span>
				<span class="k-val">{fmt(handledTotal)}</span>
				<span class="k-sites">DK {fmt(handledSite[1])} · SE {fmt(handledSite[2])} · NO {fmt(handledSite[3])}</span>
			</div>
			<div class="kpi net">
				<span class="k-label">Net (in − handled)</span>
				<span class="k-val" class:pos={inboundTotal - handledTotal > 0}>{inboundTotal - handledTotal > 0 ? '+' : ''}{fmt(inboundTotal - handledTotal)}</span>
				<span class="k-sites">{grain} · {days.length} days</span>
			</div>
		</div>

		<!-- Time series -->
		<section class="card">
			<div class="chart-head">
				<div class="legend">
					<span class="lg"><i class="sw in"></i> Inbound</span>
					<span class="lg"><i class="sw hd"></i> Handled</span>
				</div>
				<div class="pub-toggle" role="group" aria-label="Break down by">
					{#each BUCKETS as b}
						<button type="button" class:active={bucketBy === b.key} onclick={() => (bucketBy = b.key)}>{b.label}</button>
					{/each}
				</div>
			</div>
			<svg class="chart" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" role="img" aria-label="Inbound vs handled over time">
				<defs>
					<linearGradient id="inFill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color="#3B82F6" stop-opacity="0.18" />
						<stop offset="100%" stop-color="#3B82F6" stop-opacity="0.01" />
					</linearGradient>
					<linearGradient id="hdFill" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color="#F57832" stop-opacity="0.20" />
						<stop offset="100%" stop-color="#F57832" stop-opacity="0.01" />
					</linearGradient>
					<clipPath id="plot"><rect x={PAD_L} y={PAD_T - 4} width={innerW} height={innerH + 4} /></clipPath>
				</defs>

				<!-- y gridlines + labels -->
				{#each yTicks as t}
					<line x1={PAD_L} y1={yAt(t)} x2={VB_W - PAD_R} y2={yAt(t)} class="grid" />
					<text x={PAD_L - 8} y={yAt(t) + 4} class="ylab" text-anchor="end">{fmt(t)}</text>
				{/each}

				<g clip-path="url(#plot)">
					<path d={inArea} fill="url(#inFill)" />
					<path d={hdArea} fill="url(#hdFill)" />
					<path d={inLine} class="line in" />
					<path d={hdLine} class="line hd" />
					{#if showDots}
						{#each buckets as p, i}
							<circle cx={xAt(i)} cy={yAt(p.inbound)} r="3" class="dot in"><title>{p.label} · inbound {fmt(p.inbound)}</title></circle>
							<circle cx={xAt(i)} cy={yAt(p.handled)} r="3" class="dot hd"><title>{p.label} · handled {fmt(p.handled)}</title></circle>
						{/each}
					{/if}
				</g>

				<!-- x labels -->
				{#each xTicks as i}
					<text x={xAt(i)} y={VB_H - 10} class="xlab" text-anchor="middle">{buckets[i]?.label}</text>
				{/each}
			</svg>
		</section>

		<!-- Top customers -->
		<section class="card">
			<h2>Top customers <span class="muted">· handled · {grain}</span></h2>
			{#if topCustomers.length === 0}
				<p class="muted">No handled orders in this range.</p>
			{:else}
				<div class="bars">
					{#each topCustomers as c}
						<div class="row">
							<span class="name" title={c.name}>{c.name}</span>
							<span class="site-tag">{SITES[c.site] ?? '—'}</span>
							<span class="track"><span class="fill" style={`width:${(c.value / customerMax) * 100}%`}></span></span>
							<span class="val">{fmt(c.value)}</span>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</main>

<style>
	/* Date bar — mirrors $lib/components/DateBar.svelte */
	.date-bar { position: sticky; top: 0; z-index: 30; background: #fff; border-bottom: 1px solid var(--border); }
	.date-bar-inner { max-width: 1200px; margin: 0 auto; padding: 9px 28px; display: flex; align-items: center; justify-content: flex-end; box-sizing: border-box; }
	.range-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; transition: opacity .15s; }
	.range-controls.busy { opacity: .75; }
	.freshness { margin-right: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 100px; white-space: nowrap; }
	.freshness .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
	.freshness.ok { background: #EAF7EF; color: #16794C; } .freshness.ok .dot { background: #16794C; }
	.freshness.warn { background: #FDEBD2; color: #B4611A; } .freshness.warn .dot { background: #E0892B; }
	.freshness.bad { background: #FDECEC; color: #C4381B; } .freshness.bad .dot { background: #C4381B; }
	@media (max-width: 640px) { .freshness { display: none; } }
	.quick-select { font-family: inherit; font-size: 13px; font-weight: 700; color: #524431; background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px; cursor: pointer; }
	.quick-select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245,120,50,.15); }
	.quick-select.active { background: #FFE6A5; color: #7B3803; border-color: #F4CE7A; }
	.custom-range { display: flex; align-items: center; gap: 6px; }
	.date-input { font-family: inherit; font-size: 13px; font-weight: 600; color: #524431; background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; }
	.date-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245,120,50,.15); }
	.range-dash { color: #A88B52; font-weight: 700; }
	.apply-btn { display: inline-flex; align-items: center; gap: 6px; font-family: inherit; font-size: 13px; font-weight: 700; color: #fff; background: var(--accent); border: none; border-radius: 8px; padding: 7px 14px; cursor: pointer; transition: background .15s; }
	.apply-btn:hover { background: var(--accent-hover); }
	.apply-btn.active { box-shadow: 0 0 0 3px rgba(245,120,50,.2); }
	.spinner { width: 12px; height: 12px; border-radius: 50%; border: 2px solid rgba(255,255,255,.45); border-top-color: #fff; animation: db-spin .6s linear infinite; }
	@keyframes db-spin { to { transform: rotate(360deg); } }

	main { max-width: 1200px; margin: 0 auto; width: 100%; padding: 28px 28px 80px; box-sizing: border-box; }
	.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
	h1 { font-size: 22px; font-weight: 800; color: #18181B; margin: 0; }
	.sub { font-size: 13px; color: #71717A; margin: 4px 0 0; }

	.grain { display: inline-flex; background: #F4F1EA; border-radius: 10px; padding: 3px; align-self: center; }
	.seg { border: 0; background: transparent; padding: 6px 14px; font-size: 13px; font-weight: 700; color: #6B6355; border-radius: 8px; cursor: pointer; }
	.seg.on { background: #fff; color: #18181B; box-shadow: var(--shadow); }

	.empty { border: 1px dashed var(--border); border-radius: var(--radius-lg); padding: 40px; text-align: center; background: #FBFAF7; }
	.empty .muted { font-size: 13px; }
	code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; background: #F4F1EA; padding: 1px 5px; border-radius: 5px; }

	.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 18px; }
	.kpi { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px 18px; background: #fff; display: flex; flex-direction: column; gap: 4px; }
	.kpi.inbound { border-left: 4px solid #3B82F6; }
	.kpi.handled { border-left: 4px solid var(--accent); }
	.kpi.net { border-left: 4px solid #D4CBB8; }
	.k-label { font-size: 12px; font-weight: 700; color: #9A8A6A; text-transform: uppercase; letter-spacing: .04em; }
	.k-val { font-size: 30px; font-weight: 800; color: #18181B; line-height: 1.1; }
	.k-val.pos { color: #2563EB; }
	.k-sites { font-size: 12px; color: #8A8276; }

	.card { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px; background: #fff; margin-bottom: 18px; }
	.card h2 { font-size: 14px; font-weight: 800; color: #18181B; margin: 0 0 14px; }
	.muted { color: #9A8A6A; font-weight: 500; }

	.chart-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; flex-wrap: wrap; }
	.pub-toggle { display: inline-flex; border: 1px solid var(--border); border-radius: 100px; overflow: hidden; }
	.pub-toggle button { border: none; background: #fff; color: #71717A; font-size: 12px; font-weight: 700; font-family: inherit; padding: 6px 14px; cursor: pointer; white-space: nowrap; }
	.pub-toggle button.active { background: var(--accent); color: #fff; }
	.legend { display: flex; gap: 18px; }
	.lg { font-size: 12px; font-weight: 700; color: #6B6355; display: inline-flex; align-items: center; gap: 6px; }
	.sw { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
	.sw.in { background: #3B82F6; }
	.sw.hd { background: var(--accent); }

	.chart { width: 100%; height: 300px; display: block; }
	.chart .grid { stroke: #F0E9D4; stroke-width: 1; }
	.chart .ylab, .chart .xlab { font-size: 11px; fill: #A89C84; }
	.chart .line { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
	.chart .line.in { stroke: #3B82F6; }
	.chart .line.hd { stroke: var(--accent); }
	.chart .dot.in { fill: #fff; stroke: #3B82F6; stroke-width: 2; }
	.chart .dot.hd { fill: #fff; stroke: var(--accent); stroke-width: 2; }
	.chart .dot:hover { r: 4.5; }

	.bars { display: flex; flex-direction: column; gap: 8px; }
	.row { display: grid; grid-template-columns: minmax(120px, 1.6fr) 34px 1fr 64px; align-items: center; gap: 10px; }
	.name { font-size: 13px; color: #3F3F46; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.site-tag { font-size: 11px; font-weight: 700; color: #6B6355; background: #F4F1EA; border-radius: 6px; padding: 2px 0; text-align: center; }
	.track { background: #F4F1EA; border-radius: 6px; height: 14px; overflow: hidden; }
	.fill { display: block; height: 100%; background: var(--accent); border-radius: 6px; }
	.val { font-size: 13px; font-weight: 700; color: #18181B; text-align: right; }

	@media (max-width: 720px) {
		.kpis { grid-template-columns: 1fr; }
		.head { flex-direction: column; }
	}
</style>
