<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import SubTabs from '$lib/components/SubTabs.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();

	const GRAINS = [
		{ key: 'orders', label: 'Orders' },
		{ key: 'lines', label: 'Lines' },
		{ key: 'units', label: 'Units' },
	];
	let grain = $state('orders');
	// Granularity: auto-picked from the range length; a manual pick overrides
	// until the date range changes.
	let bucketOverride = $state(null);
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
		const stale = ageMs > 26 * 3600 * 1000; // cron is nightly
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
		while (d <= end && guard++ < 5000) { // safety cap ≈ 13 years
			out.push(d.toISOString().slice(0, 10));
			d.setUTCDate(d.getUTCDate() + 1);
		}
		return out;
	});

	// ≤ 31 days → Days · ≤ 6 months → Weeks · ≤ 2 years → Months · longer → Quarters
	const autoBucket = $derived(
		days.length <= 31 ? 'day' : days.length <= 183 ? 'week' : days.length <= 730 ? 'month' : 'quarter'
	);
	const bucketBy = $derived(bucketOverride ?? autoBucket);
	$effect(() => {
		data.from; data.to; // reset the manual pick whenever the range changes
		bucketOverride = null;
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
	// Long tooltip date, e.g. "Monday 2. nov. 2026".
	const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const MON_SHORT = ['jan.', 'feb.', 'mar.', 'apr.', 'may', 'jun.', 'jul.', 'aug.', 'sep.', 'oct.', 'nov.', 'dec.'];
	const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	function longDay(ymdStr) {
		const d = new Date(ymdStr + 'T00:00:00Z');
		return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}. ${MON_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
	}
	function isoWeek(ymdStr) {
		const d = new Date(ymdStr + 'T00:00:00Z');
		d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)); // Thursday of this week
		const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
		return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
	}
	function bucketOf(ymdStr, mode) {
		const [Y, M, D] = ymdStr.split('-');
		if (mode === 'week') {
			const mon = mondayOf(ymdStr); const [, mm, dd] = mon.split('-');
			return { key: mon, label: `${mm}/${dd}`, tip: `Week ${isoWeek(mon)} · ${longDay(mon)}` };
		}
		if (mode === 'month') return { key: `${Y}-${M}`, label: `${MON[+M - 1]} ${Y.slice(2)}`, tip: `${MON_LONG[+M - 1]} ${Y}` };
		if (mode === 'quarter') { const q = Math.floor((+M - 1) / 3) + 1; return { key: `${Y}-Q${q}`, label: `Q${q} ${Y.slice(2)}`, tip: `Q${q} ${Y}` }; }
		return { key: ymdStr, label: `${M}/${D}`, tip: longDay(ymdStr) };
	}
	const buckets = $derived.by(() => {
		const m = new Map();
		for (const p of series) {
			const b = bucketOf(p.d, bucketBy);
			const cur = m.get(b.key) || { key: b.key, label: b.label, tip: b.tip, inbound: 0, handled: 0 };
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
	// Net status: caught up (handled ≥ inbound) · a bit behind (≤ 10 % of inbound
	// left over) · a lot behind. Relative to inbound so it reads the same at any range.
	const net = $derived(inboundTotal - handledTotal);
	const netPct = $derived(inboundTotal ? (net / inboundTotal) * 100 : 0);
	const netStatus = $derived(net <= 0 ? 'ok' : netPct <= 10 ? 'warn' : 'bad');
	const NET_LABEL = { ok: 'Caught up', warn: 'Slightly behind', bad: 'Falling behind' };

	// ── Breakdown table (handled only): Products / Customers / Countries ────────
	const DIMS = [
		{ key: 'products', label: 'Products', search: 'products' },
		{ key: 'customers', label: 'Customers', search: 'customers' },
		{ key: 'countries', label: 'Countries', search: 'countries' },
	];
	let dim = $state('products');
	let tableSearch = $state('');
	let sortKey = $state('units');
	let sortDir = $state('desc');
	function setSort(k) {
		if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else { sortKey = k; sortDir = k === 'key' || k === 'label' ? 'asc' : 'desc'; }
	}
	function pickDim(k) { dim = k; tableSearch = ''; if (sortKey === 'key' && k !== 'products') sortKey = 'label'; }
	const dimLabel = $derived(DIMS.find((d) => d.key === dim)?.label ?? '');
	const nameHeader = $derived(dim === 'products' ? 'Product Name' : dim === 'customers' ? 'Customer Name' : 'Country');

	const tableRows = $derived.by(() => {
		const q = tableSearch.trim().toLowerCase();
		let out = (data.dims?.[dim] ?? []).map((r) => ({
			key: r.key ?? '', label: r.label ?? r.key ?? '',
			orders: Number(r.orders) || 0, lines: Number(r.lines) || 0, units: Number(r.units) || 0,
		}));
		if (q) out = out.filter((r) => r.label.toLowerCase().includes(q) || String(r.key).toLowerCase().includes(q));
		const dir = sortDir === 'asc' ? 1 : -1;
		out.sort((a, b) => {
			if (sortKey === 'key' || sortKey === 'label') {
				const av = String(a[sortKey]).toLowerCase(), bv = String(b[sortKey]).toLowerCase();
				return av < bv ? -dir : av > bv ? dir : 0;
			}
			return (a[sortKey] - b[sortKey]) * dir;
		});
		return out;
	});

	function exportCsv() {
		const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
		const head = dim === 'products' ? ['SKU', 'Product Name'] : [nameHeader];
		const lines = [[...head, 'Orders', 'Lines', 'Units'].join(',')];
		for (const r of tableRows) {
			const lead = dim === 'products' ? [esc(r.key), esc(r.label)] : [esc(r.label)];
			lines.push([...lead, r.orders, r.lines, r.units].join(','));
		}
		const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url; a.download = `warehouse-${dim}-${data.from}_${data.to}.csv`; a.click();
		URL.revokeObjectURL(url);
	}

	// ── Weekly scorecard ────────────────────────────────────────────────────────
	const SC_ROWS = [
		{ key: 'received', label: 'Orders received', kind: 'n', better: null },
		{ key: 'handled', label: 'Orders handled', kind: 'n', better: 'up' },
		{ key: 'units', label: 'Units handled', kind: 'n', better: 'up' },
		{ key: 'median', label: 'Median handling time', kind: 'days', better: 'down' },
		{ key: 'within1', label: 'Handled within 1 day', kind: 'pct', better: 'up' },
		{ key: 'backlog', label: 'Open orders at week end', kind: 'n', better: 'down' },
	];
	const scWeeks = $derived(data.scorecard?.weeks ?? []);
	const scCur = $derived(scWeeks.at(-1));
	const scPrev = $derived(scWeeks.at(-2));
	const scLy = $derived(data.scorecard?.lyWeeks?.at(-1));
	function scVal(v, kind) {
		if (v == null) return '—';
		if (kind === 'pct') return `${v.toFixed(1)}%`;
		if (kind === 'days') return `${v} ${v === 1 ? 'day' : 'days'}`;
		return fmt(v);
	}
	function scDelta(cur, prev, row) {
		if (cur == null || prev == null) return null;
		const diff = cur - prev;
		let text;
		if (row.kind === 'pct') text = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} pp`;
		else if (row.kind === 'days') text = `${diff >= 0 ? '+' : ''}${diff} d`;
		else if (!prev) text = diff ? 'new' : '±0';
		else { const p = (diff / prev) * 100; text = `${p >= 0 ? '+' : ''}${p.toFixed(0)}%`; }
		const cls = row.better && diff !== 0 ? ((diff > 0) === (row.better === 'up') ? 'good' : 'bad') : '';
		return { text, cls };
	}
	const SP_W = 110, SP_H = 28;
	function sparkPoints(key) {
		const vals = scWeeks.map((w) => w[key]);
		const nums = vals.filter((v) => v != null);
		if (nums.length < 2) return '';
		const lo = Math.min(...nums), hi = Math.max(...nums), span = hi - lo || 1;
		return vals
			.map((v, i) => (v == null ? null : `${((i / (vals.length - 1)) * SP_W).toFixed(1)},${(SP_H - 3 - ((v - lo) / span) * (SP_H - 6)).toFixed(1)}`))
			.filter(Boolean).join(' ');
	}
	const shortDate = (s) => { if (!s) return ''; const d = new Date(s + 'T00:00:00Z'); return `${d.getUTCDate()}. ${MON_SHORT[d.getUTCMonth()]}`; };

	// ── Order arrivals heatmap ──────────────────────────────────────────────────
	const HM_DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
	const HOURS = Array.from({ length: 24 }, (_, h) => h);
	const hm = $derived.by(() => {
		const cells = new Map();
		let max = 0;
		const dc = data.heatmap?.dayCount ?? [];
		for (const r of data.heatmap?.rows ?? []) {
			const v = (Number(r[grain]) || 0) / Math.max(1, dc[r.wd] || 0);
			cells.set(`${r.wd}-${r.hr}`, v);
			if (v > max) max = v;
		}
		return { cells, max };
	});
	const hmVal = (wd, hr) => hm.cells.get(`${wd}-${hr}`) ?? 0;
	const hmFmt = (v) => (v >= 10 ? Math.round(v).toString() : v >= 1 ? v.toFixed(1) : v > 0 ? v.toFixed(1) : '');
	const hmBg = (v) => (v > 0 ? `rgba(245,120,50,${(0.07 + 0.93 * (v / (hm.max || 1))).toFixed(3)})` : 'transparent');
	const hmRowAvg = (wd) => HOURS.reduce((s, h) => s + hmVal(wd, h), 0);

	// ── Tabs ─────────────────────────────────────────────────────────────────────
	// Operational follows the date picker (server load). Slow movers / Dead stock
	// is fetched lazily the first time its tab is opened — never on page load.
	let tab = $state('ops');
	let ds = $state(/** @type {any} */ (null)); // { rows, computed, trackingStart, missing? }
	let dsLoading = $state(false);
	let dsError = $state('');
	async function loadDs() {
		if (ds || dsLoading) return;
		dsLoading = true; dsError = '';
		try {
			const res = await fetch('/warehouse/dead-stock');
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `HTTP ${res.status}`);
			ds = await res.json();
		} catch (e) { dsError = e instanceof Error ? e.message : String(e); }
		finally { dsLoading = false; }
	}
	function openTab(k) { tab = k; if (k === 'dead') loadDs(); }

	// ── Slow movers / dead stock ────────────────────────────────────────────────
	const DS_MODES = [
		{ key: '90', label: 'No sales 90 days' },
		{ key: '180', label: 'No sales 180 days' },
		{ key: '365', label: 'No sales 365 days' },
		{ key: 'slow', label: 'Slow movers (> 12 mo cover)' },
	];
	let dsMode = $state('90');
	let dsSearch = $state('');
	let dsSortKey = $state('stock');
	let dsSortDir = $state('desc');
	function dsSetSort(k) {
		if (dsSortKey === k) dsSortDir = dsSortDir === 'asc' ? 'desc' : 'asc';
		else { dsSortKey = k; dsSortDir = ['sku', 'name', 'vendor'].includes(k) ? 'asc' : 'desc'; }
	}
	// Rows arrive pre-computed (idle days, units sold since last restock, cover)
	// from loadDeadStock — see $lib/server/warehouse.js for the rules.
	const dsAll = $derived((ds?.rows ?? []).map((r) => ({
		sku: r.sku, name: r.name || r.title || r.sku, vendor: r.vendor || '', category: r.category || '',
		stock: Number(r.stock) || 0, last: r.last_sale, restock: r.last_restock, restockQty: r.restock_qty, restockSort: r.last_restock || '',
		idle: r.idle ?? Infinity, sold: Number(r.sold) || 0, cover: r.cover ?? Infinity,
	})));
	const dsRows = $derived.by(() => {
		const q = dsSearch.trim().toLowerCase();
		let out = dsAll.filter((r) => (dsMode === 'slow' ? r.sold > 0 && r.cover > 365 : r.idle >= Number(dsMode)));
		if (q) out = out.filter((r) => [r.sku, r.name, r.vendor, r.category].some((s) => String(s).toLowerCase().includes(q)));
		const dir = dsSortDir === 'asc' ? 1 : -1;
		const key = dsSortKey === 'last' ? 'idle' : dsSortKey === 'restock' ? 'restockSort' : dsSortKey;
		out.sort((a, b) => {
			const av = a[key], bv = b[key];
			if (typeof av === 'string') return av.toLowerCase() < bv.toLowerCase() ? -dir : av.toLowerCase() > bv.toLowerCase() ? dir : 0;
			if (av === bv) return 0;
			return (av > bv ? 1 : -1) * dir; // Infinity-safe
		});
		return out;
	});
	const dsUnits = $derived(dsRows.reduce((s, r) => s + r.stock, 0));
	const coverLabel = (c) => (!Number.isFinite(c) ? '—' : c >= 60 ? `${Math.round(c / 30.4)} mo` : `${Math.round(c)} d`);
	function dsExport() {
		const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
		const lines = ['SKU,Product Name,Supplier,Category,Stock,Last restock,Restock qty,Last sale,Days idle,Sold since restock,Cover (days)'];
		for (const r of dsRows) lines.push([esc(r.sku), esc(r.name), esc(r.vendor), esc(r.category), r.stock, r.restock ?? '', r.restockQty ?? '', r.last ?? '', Number.isFinite(r.idle) ? r.idle : '', r.sold, Number.isFinite(r.cover) ? Math.round(r.cover) : ''].join(','));
		const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
		const a = document.createElement('a');
		a.href = url; a.download = `slow-dead-stock-${dsMode}.csv`; a.click();
		URL.revokeObjectURL(url);
	}

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

	// ── Hover crosshair + combined tooltip ──────────────────────────────────────
	let hoverI = $state(null);
	function onMove(e) {
		const n = buckets.length;
		if (!n) { hoverI = null; return; }
		const rect = e.currentTarget.getBoundingClientRect();
		const vbX = ((e.clientX - rect.left) / rect.width) * VB_W;
		const dataRatio = n <= 1 ? 0 : (vbX - PAD_L) / innerW;
		hoverI = Math.max(0, Math.min(n - 1, Math.round(dataRatio * (n - 1))));
	}
	// Index = handled / inbound × 100 (100 = handled exactly matches inbound).
	function idxLabel(b) {
		if (!b.inbound) return b.handled ? '∞' : '—';
		return `${Math.round((b.handled / b.inbound) * 100)}`;
	}
	function idxClass(b) {
		if (!b.inbound) return '';
		const v = (b.handled / b.inbound) * 100;
		if (v >= 100) return 'green';
		if (v >= 90) return 'orange';
		return 'red';
	}
</script>

<svelte:head><title>Warehouse — Stats</title></svelte:head>

<AppNav user={data.user} active="warehouse" />

<!-- Sticky date bar (DateBar-style) -->
<div class="date-bar">
	<div class="date-bar-inner">
		{#if fresh}
			<div class="freshness {fresh.cls}"><span class="dot"></span>{fresh.label}</div>
		{/if}
		{#if tab === 'dead'}
			<span class="range-note">As of last night’s sync — not affected by the date range</span>
		{:else}
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
		{/if}
	</div>
</div>

<SubTabs
	title="Warehouse"
	active={tab}
	onselect={openTab}
	tabs={[
		{ key: 'ops', label: 'Operational', icon: 'chart' },
		{ key: 'dead', label: 'Slow movers / Dead stock', icon: 'box_off' },
	]}
/>

<main>

	{#if tab === 'dead'}
		<div class="section-head ds-head">
			<h2>Slow movers &amp; dead stock</h2>
			<span class="sc-cap">
				{#if ds?.computed}computed {relTime(ds.computed)} · {/if}{fmt(dsRows.length)} SKUs · {fmt(dsUnits)} units in stock
			</span>
		</div>
		{#if ds && !ds.missing}
			<p class="ds-note">
				{#if ds.hasRestocks}Movement is counted from each product’s <b>last restock</b>: days idle since the later of last sale / last restock, and cover from the sales pace since the restock.
				Products restocked in the last {ds.grace} days are left out{#if ds.excluded?.restocked} ({fmt(ds.excluded.restocked)}){/if}.
				{:else}Restock dates aren’t synced yet — movement uses the last 12 months until the next nightly sync.{/if}
				The Marketing category is excluded{#if ds.excluded?.marketing} ({fmt(ds.excluded.marketing)}){/if}.
			</p>
		{/if}
		{#if dsLoading}
			<div class="empty"><p class="muted">Loading…</p></div>
		{:else if dsError}
			<div class="empty">
				<p><strong>Couldn’t load slow movers.</strong></p>
				<p class="muted err-detail">{dsError}</p>
				<p><button type="button" class="export-btn" onclick={() => { ds = null; loadDs(); }}>Try again</button></p>
			</div>
		{:else if ds?.missing}
			<div class="empty"><p class="muted">The nightly stock summary isn’t set up yet (table <code>wms_sku_activity</code>). It appears after migration 0106 and the next nightly sync.</p></div>
		{:else if ds}
			<section class="table-wrap ds-wrap">
				<div class="table-head">
					<div class="dim-tabs" role="tablist">
						{#each DS_MODES as m}
							<button class="dim-tab" class:on={dsMode === m.key} role="tab" aria-selected={dsMode === m.key} onclick={() => (dsMode = m.key)}>{m.label}</button>
						{/each}
					</div>
					<span class="count">{fmt(dsRows.length)}</span>
					<button class="export-btn" onclick={dsExport} type="button" title="Export the current view to CSV">
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
						</svg>
						Export CSV
					</button>
				</div>
				<div class="dim-filter">
					<div class="dim-search">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
						</svg>
						<input type="text" bind:value={dsSearch} placeholder="Search SKU, product, supplier…" aria-label="Filter slow and dead stock" />
						{#if dsSearch}
							<button class="dim-search-clear" onclick={() => (dsSearch = '')} aria-label="Clear search" title="Clear">×</button>
						{/if}
					</div>
				</div>
				<div class="table-scroll">
					<table>
						<colgroup>
							<col style="width:120px" /><col /><col style="width:84px" /><col style="width:112px" />
							<col style="width:112px" /><col style="width:84px" /><col style="width:104px" /><col style="width:84px" />
						</colgroup>
						<thead>
							<tr>
								{#each [['sku', 'SKU', false], ['name', 'Product Name', false], ['stock', 'Stock', true], ['restock', 'Last restock', true], ['last', 'Last sale', true], ['idle', 'Days idle', true], ['sold', 'Sold since restock', true], ['cover', 'Cover', true]] as [k, lbl, isNum]}
									<th class="th-sort" class:num={isNum} class:sorted={dsSortKey === k} onclick={() => dsSetSort(k)}>{lbl}{#if dsSortKey === k}<span class="caret">{dsSortDir === 'asc' ? '▲' : '▼'}</span>{/if}</th>
								{/each}
							</tr>
						</thead>
						<tbody>
							{#each dsRows as r (r.sku)}
								<tr>
									<td class="sku">{r.sku}</td>
									<td class="name">{r.name}{#if r.category || r.vendor}<span class="ds-cat">{[r.category, r.vendor].filter(Boolean).join(' · ')}</span>{/if}</td>
									<td class="num">{fmt(r.stock)}</td>
									<td class="num">
										{#if r.restock}{shortDate(r.restock)} {r.restock.slice(0, 4)}{#if r.restockQty}<span class="ds-ago">+{fmt(r.restockQty)}</span>{/if}
										{:else}<span class="ds-ago">—</span>{/if}
									</td>
									<td class="num">
										{#if r.last}{shortDate(r.last)} {r.last.slice(0, 4)}
										{:else}<span class="ds-never">None since {shortDate(ds.trackingStart)} {ds.trackingStart?.slice(0, 4)}</span>{/if}
									</td>
									<td class="num">{Number.isFinite(r.idle) ? fmt(r.idle) : '—'}</td>
									<td class="num">{fmt(r.sold)}{#if !r.restock}<span class="ds-ago" title="No restock logged — last 12 months">12 mo</span>{/if}</td>
									<td class="num">{coverLabel(r.cover)}</td>
								</tr>
							{/each}
							{#if dsRows.length === 0}
								<tr><td colspan="8" class="empty-row">Nothing matches this filter.</td></tr>
							{/if}
						</tbody>
					</table>
				</div>
			</section>
		{/if}
	{:else if !data.ready}
		<div class="empty">
			<p><strong>No warehouse data yet.</strong></p>
			{#if data.reason === 'no-table'}
				<p class="muted">The <code>wms_orders</code> tables don’t exist in <code>portal-db</code> yet — apply migration <code>0099_wms_orders.sql</code>, then run the <code>lagersystem-sync</code> worker.</p>
			{:else if data.reason === 'error'}
				<p class="muted">The warehouse data couldn’t be loaded right now — try reloading in a moment.</p>
				<p class="muted err-detail">{data.message}</p>
			{:else}
				<p class="muted">Database unavailable.</p>
			{/if}
		</div>
	{:else}
		<div class="section-head">
			<h2>Inbound vs handled</h2>
			<div class="pub-toggle" role="group" aria-label="Metric">
				{#each GRAINS as g}
					<button type="button" class:active={grain === g.key} onclick={() => (grain = g.key)}>{g.label}</button>
				{/each}
			</div>
		</div>

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
			<div class="kpi net {netStatus}">
				<span class="k-label">Net (in − handled) <span class="net-pill">{NET_LABEL[netStatus]}</span></span>
				<span class="k-val">{net > 0 ? '+' : ''}{fmt(net)}</span>
				<span class="k-sites">{#if net > 0}{netPct.toFixed(0)}% of inbound not yet handled{:else if inboundTotal}Handled {Math.round((handledTotal / inboundTotal) * 100)}% of inbound{:else}No inbound in range{/if} · {days.length} days</span>
			</div>
		</div>

		<!-- Estimated handling time -->
		{#if data.handling}
			<div class="ht-banner">
				<span class="ht-ico" aria-hidden="true">⏱</span>
				{#if data.handling.n}
					<span class="ht-main">Est. handling time <b>{data.handling.median === 0 ? 'same day' : `~${data.handling.median % 1 ? data.handling.median.toFixed(1) : data.handling.median} ${data.handling.median === 1 ? 'day' : 'days'}`}</b></span>
					<span class="ht-sub">median · avg {data.handling.avg.toFixed(1)}d · {data.handling.n} orders handled in last 7 days · excludes scheduled date-orders</span>
				{:else}
					<span class="ht-sub">No non-scheduled orders handled in the last 7 days to estimate from.</span>
				{/if}
			</div>
		{/if}

		<!-- Time series -->
		<section class="card">
			<div class="section-head">
				<div class="legend">
					<span class="lg"><i class="sw in"></i> Inbound</span>
					<span class="lg"><i class="sw hd"></i> Handled</span>
				</div>
				<div class="pub-toggle" role="group" aria-label="Break down by">
					{#each BUCKETS as b}
						<button type="button" class:active={bucketBy === b.key} onclick={() => (bucketOverride = b.key)}>{b.label}</button>
					{/each}
				</div>
			</div>
			<div class="chart-wrap" role="presentation" onpointermove={onMove} onpointerleave={() => (hoverI = null)}>
				<svg class="chart" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" role="img" aria-label="Inbound vs handled over time">
					<defs>
						<linearGradient id="inFill" x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stop-color="#E7D3A6" stop-opacity="0.55" />
							<stop offset="100%" stop-color="#E7D3A6" stop-opacity="0.04" />
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
								<circle cx={xAt(i)} cy={yAt(p.inbound)} r="3" class="dot in" />
								<circle cx={xAt(i)} cy={yAt(p.handled)} r="3" class="dot hd" />
							{/each}
						{/if}
						{#if hoverI !== null && buckets[hoverI]}
							<line class="crosshair" x1={xAt(hoverI)} y1={PAD_T} x2={xAt(hoverI)} y2={PAD_T + innerH} />
							<circle cx={xAt(hoverI)} cy={yAt(buckets[hoverI].inbound)} r="5" class="dot in hov" />
							<circle cx={xAt(hoverI)} cy={yAt(buckets[hoverI].handled)} r="5" class="dot hd hov" />
						{/if}
					</g>

					<!-- x labels -->
					{#each xTicks as i}
						<text x={xAt(i)} y={VB_H - 10} class="xlab" text-anchor="middle">{buckets[i]?.label}</text>
					{/each}
				</svg>

				{#if hoverI !== null && buckets[hoverI]}
					{@const b = buckets[hoverI]}
					<div class="tip" style={`left:${Math.min(92, Math.max(8, (xAt(hoverI) / VB_W) * 100))}%`}>
						<div class="tip-d">{b.tip}</div>
						<div class="tip-r"><i class="sw in"></i><span>Inbound</span><b>{fmt(b.inbound)}</b></div>
						<div class="tip-r"><i class="sw hd"></i><span>Handled</span><b>{fmt(b.handled)}</b></div>
						<div class="tip-r idx"><span>Index</span><b class={idxClass(b)}>{idxLabel(b)}</b></div>
					</div>
				{/if}
			</div>
		</section>

		<!-- Weekly scorecard -->
		{#if scCur}
			<section class="card">
				<div class="section-head">
					<h2>Weekly scorecard</h2>
					<span class="sc-cap">Week {scCur.week} · {shortDate(scCur.monday)} – {shortDate(scCur.sunday)}</span>
				</div>
				<div class="sc-scroll">
					<table class="sc">
						<thead>
							<tr>
								<th class="sc-k">KPI</th>
								<th class="sc-tr">Last 8 weeks</th>
								<th class="num">Week {scCur.week}</th>
								<th class="num">Week {scPrev?.week ?? '—'}</th>
								<th class="num">vs prev.</th>
								<th class="num">Week {scLy?.week ?? '—'} LY</th>
								<th class="num">vs LY</th>
							</tr>
						</thead>
						<tbody>
							{#each SC_ROWS as row}
								{@const cur = scCur[row.key]}
								{@const pd = scDelta(cur, scPrev?.[row.key], row)}
								{@const lyV = scLy?.covered ? scLy[row.key] : null}
								{@const ld = scDelta(cur, lyV, row)}
								<tr>
									<td class="sc-k">{row.label}</td>
									<td class="sc-tr">
										{#if sparkPoints(row.key)}
											<svg width={SP_W} height={SP_H} viewBox={`0 0 ${SP_W} ${SP_H}`} class="spark" aria-hidden="true">
												<polyline points={sparkPoints(row.key)} />
											</svg>
										{/if}
									</td>
									<td class="num strong">{scVal(cur, row.kind)}</td>
									<td class="num">{scVal(scPrev?.[row.key], row.kind)}</td>
									<td class="num"><span class="dl {pd?.cls ?? ''}">{pd?.text ?? '—'}</span></td>
									<td class="num">{scLy?.covered ? scVal(lyV, row.kind) : '—'}</td>
									<td class="num"><span class="dl {ld?.cls ?? ''}">{ld?.text ?? '—'}</span></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if scLy && !scLy.covered}
					<p class="sc-note">Last-year comparison starts once the same week has data (history begins {shortDate(data.scorecard.trackingStart)} {data.scorecard.trackingStart?.slice(0, 4)}).</p>
				{/if}
			</section>
		{/if}

		<!-- Order arrivals heatmap -->
		{#if data.heatmap}
			<section class="card">
				<div class="section-head">
					<h2>When orders arrive</h2>
					<span class="sc-cap">avg {grain} received per day · by hour</span>
				</div>
				<div class="hm-scroll">
					<div class="hm">
						<div class="hm-corner"></div>
						{#each HOURS as h}<div class="hm-h">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</div>{/each}
						<div class="hm-h hm-tot">Day</div>
						{#each HM_DAYS as [wd, lbl]}
							<div class="hm-d">{lbl}</div>
							{#each HOURS as h}
								{@const v = hmVal(wd, h)}
								<div class="hm-c" style:background={hmBg(v)} class:hot={v > hm.max * 0.55} title={`${lbl} ${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59 · avg ${v.toFixed(1)} ${grain}/day`}>{hmFmt(v)}</div>
							{/each}
							<div class="hm-c hm-tot" title={`${lbl}: avg ${hmRowAvg(wd).toFixed(1)} ${grain} per day`}>{hmFmt(hmRowAvg(wd))}</div>
						{/each}
					</div>
				</div>
			</section>
		{/if}

		<!-- Breakdown table -->
		<section class="table-wrap">
			<div class="table-head">
				<div class="dim-tabs" role="tablist">
					{#each DIMS as d}
						<button class="dim-tab" class:on={dim === d.key} role="tab" aria-selected={dim === d.key} onclick={() => pickDim(d.key)}>{d.label}</button>
					{/each}
				</div>
				<span class="count">{fmt(tableRows.length)}</span>
				<button class="export-btn" onclick={exportCsv} type="button" title="Export the current view to CSV">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
					</svg>
					Export CSV
				</button>
			</div>
			<div class="dim-filter">
				<div class="dim-search">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
					</svg>
					<input type="text" bind:value={tableSearch} placeholder="Search {dimLabel}…" aria-label="Filter {dimLabel}" />
					{#if tableSearch}
						<button class="dim-search-clear" onclick={() => (tableSearch = '')} aria-label="Clear search" title="Clear">×</button>
					{/if}
				</div>
			</div>
			<div class="table-scroll">
				<table>
					<colgroup>
						{#if dim === 'products'}<col style="width:140px" />{/if}
						<col />
						<col style="width:116px" />
						<col style="width:116px" />
						<col style="width:116px" />
					</colgroup>
					<thead>
						<tr>
							{#if dim === 'products'}
								<th class="th-sort" class:sorted={sortKey === 'key'} onclick={() => setSort('key')}>SKU{#if sortKey === 'key'}<span class="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}</th>
							{/if}
							<th class="th-sort" class:sorted={sortKey === 'label'} onclick={() => setSort('label')}>{nameHeader}{#if sortKey === 'label'}<span class="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}</th>
							{#each [['orders', 'Orders'], ['lines', 'Lines'], ['units', 'Units']] as [k, lbl]}
								<th class="th-sort num" class:sorted={sortKey === k} onclick={() => setSort(k)}>{lbl}{#if sortKey === k}<span class="caret">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each tableRows as r (r.key)}
							<tr>
								{#if dim === 'products'}<td class="sku">{r.key}</td>{/if}
								<td class="name">{r.label}</td>
								<td class="num">{fmt(r.orders)}</td>
								<td class="num">{fmt(r.lines)}</td>
								<td class="num">{fmt(r.units)}</td>
							</tr>
						{/each}
						{#if tableRows.length === 0}
							<tr><td colspan={dim === 'products' ? 5 : 4} class="empty-row">No handled {dimLabel.toLowerCase()} in this range.</td></tr>
						{/if}
					</tbody>
				</table>
			</div>
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

	/* Section header: title — border line — toggle (mirrors Product/Publishers). */
	.section-head { display: flex; align-items: center; gap: 14px; margin: 4px 0 14px; }
	.section-head h2 { font-size: 15px; font-weight: 800; letter-spacing: -0.2px; color: #18181B; margin: 0; white-space: nowrap; order: 0; }
	.section-head .legend { order: 1; }
	.section-head::after { content: ''; flex: 1; height: 1px; background: var(--border); order: 2; }
	.section-head .pub-toggle { order: 3; }
	.section-head.page { margin-bottom: 18px; }

	.empty { border: 1px dashed var(--border); border-radius: var(--radius-lg); padding: 40px; text-align: center; background: #FBFAF7; }
	.empty .muted { font-size: 13px; }
	.err-detail { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; margin-top: 6px; }
	code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; background: #F4F1EA; padding: 1px 5px; border-radius: 5px; }

	.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 18px; }
	.kpi { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 16px 18px; background: #fff; display: flex; flex-direction: column; gap: 4px; }
	.kpi.inbound { border-left: 4px solid #D4B977; }
	.kpi.handled { border-left: 4px solid var(--accent); }
	.kpi.net { border-left: 4px solid #D4CBB8; }
	.kpi.net .k-label { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.net-pill { font-size: 11px; font-weight: 800; letter-spacing: .02em; text-transform: none; padding: 2px 9px; border-radius: 100px; color: #fff; }
	.kpi.net.ok { background: #EAF6EE; border-color: #CBE7D4; border-left-color: #2F9E5B; }
	.kpi.net.ok .k-val, .kpi.net.ok .k-sites { color: #1E6B3C; }
	.kpi.net.ok .net-pill { background: #2F9E5B; }
	.kpi.net.warn { background: #FDF5DD; border-color: #F1E0A8; border-left-color: #E0A82E; }
	.kpi.net.warn .k-val, .kpi.net.warn .k-sites { color: #8A5E0B; }
	.kpi.net.warn .net-pill { background: #E0A82E; }
	.kpi.net.bad { background: #FCEBE8; border-color: #F2CBC4; border-left-color: #D2483A; }
	.kpi.net.bad .k-val, .kpi.net.bad .k-sites { color: #A52A1E; }
	.kpi.net.bad .net-pill { background: #D2483A; }
	.k-label { font-size: 12px; font-weight: 700; color: #9A8A6A; text-transform: uppercase; letter-spacing: .04em; }
	.k-val { font-size: 30px; font-weight: 800; color: #18181B; line-height: 1.1; }
	.k-sites { font-size: 12px; color: #8A8276; }

	.ht-banner { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; background: #FBF4E2; border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 13px 18px; margin-bottom: 18px; }
	.ht-ico { font-size: 15px; }
	.ht-main { font-size: 14px; color: #52525B; }
	.ht-main b { font-size: 16px; font-weight: 800; color: #8A5A20; }
	.ht-sub { font-size: 12px; color: #9A8A6A; }

	.card { border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 18px; background: #fff; margin-bottom: 18px; }
	.card h2 { font-size: 14px; font-weight: 800; color: #18181B; margin: 0 0 14px; }
	.muted { color: #9A8A6A; font-weight: 500; }

	.pub-toggle { display: inline-flex; border: 1px solid var(--border); border-radius: 100px; overflow: hidden; }
	.pub-toggle button { border: none; background: #fff; color: #71717A; font-size: 12px; font-weight: 700; font-family: inherit; padding: 6px 14px; cursor: pointer; white-space: nowrap; }
	.pub-toggle button.active { background: var(--accent); color: #fff; }
	.legend { display: flex; gap: 14px; }
	.lg { font-size: 12px; font-weight: 700; color: #6B6355; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
	.sw { width: 12px; height: 12px; border-radius: 3px; display: inline-block; flex-shrink: 0; }
	.sw.in { background: #D4B977; }
	.sw.hd { background: var(--accent); }

	.chart-wrap { position: relative; }
	.chart { width: 100%; height: 300px; display: block; }
	.chart .grid { stroke: #F0E9D4; stroke-width: 1; }
	.chart .ylab, .chart .xlab { font-size: 11px; fill: #A89C84; }
	.chart .line { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
	.chart .line.in { stroke: #D4B977; }
	.chart .line.hd { stroke: var(--accent); }
	.chart .dot.in { fill: #fff; stroke: #D4B977; stroke-width: 2; }
	.chart .dot.hd { fill: #fff; stroke: var(--accent); stroke-width: 2; }
	.chart .dot.hov.in { fill: #D4B977; stroke: #fff; }
	.chart .dot.hov.hd { fill: var(--accent); stroke: #fff; }
	.chart .crosshair { stroke: #C9B690; stroke-width: 1; stroke-dasharray: 3 3; }

	/* Hover tooltip */
	.tip { position: absolute; top: 10px; transform: translateX(-50%); background: #fff; border: 1px solid var(--border); border-radius: 10px; box-shadow: var(--shadow-lg); padding: 9px 11px; font-size: 12px; pointer-events: none; min-width: 148px; z-index: 5; }
	.tip-d { font-weight: 800; color: #18181B; margin-bottom: 6px; }
	.tip-r { display: flex; align-items: center; gap: 7px; margin-top: 3px; color: #52525B; }
	.tip-r span { flex: 1; }
	.tip-r b { color: #18181B; font-weight: 800; }
	.tip-r.idx { margin-top: 6px; padding-top: 6px; border-top: 1px solid #F0E9D4; }
	.tip-r.idx span { font-weight: 700; color: #6B6355; }
	.tip-r b.green { color: #16794C; } .tip-r b.orange { color: #B4611A; } .tip-r b.red { color: #C4381B; }

	/* Breakdown table — mirrors the Stats overview table (src/routes/+page.svelte) */
	.table-wrap { margin-top: 26px; background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow); overflow: hidden; }
	.table-head { display: flex; align-items: center; gap: 10px; padding: 16px 20px; border-bottom: 1px solid var(--border); }
	.count { font-size: 12px; font-weight: 700; color: #A88B52; background: #FFF5D2; padding: 2px 9px; border-radius: 100px; }
	.dim-tabs { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; min-width: 0; }
	.dim-tab { font-family: inherit; font-size: 13px; font-weight: 700; color: #6B7280; background: transparent; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer; white-space: nowrap; transition: background .12s, color .12s; }
	.dim-tab:hover { background: #F4F4F5; color: #18181B; }
	.dim-tab.on { background: #18181B; color: #fff; }
	.export-btn { display: inline-flex; align-items: center; gap: 6px; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #524431; background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 6px 11px; cursor: pointer; white-space: nowrap; transition: background .12s, color .12s, border-color .12s; }
	.export-btn:hover { background: #FFF5D2; color: #7B3803; border-color: #F4CE7A; }
	.dim-filter { padding: 10px 16px; border-bottom: 1px solid var(--border); }
	.dim-search { display: inline-flex; align-items: center; gap: 7px; width: 100%; max-width: 300px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px; background: #fff; transition: border-color .12s, box-shadow .12s; }
	.dim-search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245,120,50,.12); }
	.dim-search svg { color: #B7A579; flex-shrink: 0; }
	.dim-search input { flex: 1; min-width: 0; border: none; background: none; outline: none; font-family: inherit; font-size: 13px; color: #3f3a33; }
	.dim-search-clear { flex-shrink: 0; border: none; background: none; cursor: pointer; color: #A88B52; font-size: 16px; line-height: 1; padding: 0 2px; }
	.dim-search-clear:hover { color: #7B3803; }

	.table-scroll { max-height: 620px; overflow: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
	thead th { position: sticky; top: 0; z-index: 1; background: #FBEFCB; color: #7B3803; font-weight: 800; text-align: left; padding: 11px 20px; white-space: nowrap; border-bottom: 1px solid var(--border); user-select: none; }
	th.num, td.num { text-align: right; white-space: nowrap; }
	.th-sort { cursor: pointer; transition: background .12s; }
	.th-sort:hover { background: #F8E6B0; }
	.th-sort.sorted { color: #B15A12; }
	.caret { font-size: 9px; margin-left: 4px; }
	tbody td { padding: 11px 20px; border-bottom: 1px solid #F5EDD8; color: #3f3a33; vertical-align: middle; }
	tbody tr:nth-child(even) td { background: #FFFBEF; }
	tbody tr:hover td { background: #FFF5D2; }
	td.name { font-weight: 700; color: #18181B; }
	td.num { font-variant-numeric: tabular-nums; font-weight: 600; }
	td.sku { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; color: #8A7A5C; }
	.empty-row { text-align: center; color: #9A8A6A; padding: 28px; }

	/* Section caption (sits between the title and the border line) */
	.sc-cap { order: 1; font-size: 12px; font-weight: 600; color: #9A8A6A; white-space: nowrap; }

	/* Weekly scorecard */
	.sc-scroll { overflow-x: auto; }
	table.sc { font-size: 13px; }
	table.sc thead th { position: static; background: transparent; color: #9A8A6A; font-size: 11.5px; text-transform: uppercase; letter-spacing: .04em; padding: 6px 14px 8px; border-bottom: 1px solid var(--border); }
	table.sc tbody td { padding: 9px 14px; background: transparent !important; }
	table.sc tbody tr:hover td { background: #FFFBEF !important; }
	.sc-k { font-weight: 700; color: #27272A; white-space: nowrap; }
	.sc-tr { width: 130px; }
	td.strong { font-weight: 800; color: #18181B; }
	.spark polyline { fill: none; stroke: var(--accent); stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }
	.dl { font-size: 12px; font-weight: 800; padding: 2px 8px; border-radius: 999px; background: #F4F1EA; color: #71717A; }
	.dl.good { background: #EAF7EF; color: #16794C; }
	.dl.bad { background: #FDECEC; color: #C4381B; }
	.sc-note { font-size: 12px; color: #9A8A6A; margin: 10px 14px 0; }

	/* Arrivals heatmap */
	.hm-scroll { overflow-x: auto; }
	.hm { display: grid; grid-template-columns: 38px repeat(24, minmax(30px, 1fr)) 48px; gap: 3px; min-width: 900px; }
	.hm-corner { }
	.hm-h { font-size: 10.5px; font-weight: 700; color: #A89C84; text-align: left; padding: 0 0 2px 2px; }
	.hm-d { font-size: 12px; font-weight: 700; color: #6B6355; display: flex; align-items: center; }
	.hm-c { height: 30px; border-radius: 5px; font-size: 10.5px; font-weight: 700; color: #8A5A20; display: flex; align-items: center; justify-content: center; background: #FBF7EE; font-variant-numeric: tabular-nums; cursor: default; }
	.hm-c.hot { color: #fff; }
	.hm-c.hm-tot { background: #FBEFCB !important; color: #7B3803; }
	.hm-h.hm-tot { text-align: center; padding-left: 0; }

	.range-note { font-size: 12.5px; font-weight: 600; color: #A89C84; padding: 7px 0; }

	/* Slow & dead stock */
	.ds-head { margin-top: 4px; }
	.ds-note { font-size: 12.5px; color: #8A8276; margin: -6px 0 14px; line-height: 1.5; }
	.ds-note b { color: #52525B; }
	.ds-wrap { margin-top: 0; }
	.ds-cat { display: block; font-size: 11.5px; font-weight: 500; color: #A89C84; margin-top: 1px; }
	.ds-ven { color: #6b5e4e; font-size: 12.5px; }
	.ds-ago { display: block; font-size: 11.5px; font-weight: 500; color: #A89C84; }
	.ds-never { font-size: 12px; font-weight: 600; color: #C4381B; }

	@media (max-width: 720px) {
		.kpis { grid-template-columns: 1fr; }
		.sc-cap { display: none; }
	}
</style>
