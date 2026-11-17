<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { goto } from '$app/navigation';
	import { fade, scale } from 'svelte/transition';

	let { data } = $props();

	// Writable deriveds: reset from the server on year change, mutated locally after saves.
	let items = $derived(data.items ?? []);
	let themes = $derived(data.themes ?? []);
	let activities = $derived(data.activities ?? []);
	const year = $derived(data.year);

	// ── Calendar maths (ISO weeks, UTC to dodge DST) ─────────────────────────
	const DAY = 86400000;
	const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
	const MON3 = MONTHS.map((m) => m.slice(0, 3));

	function isoWeek1Monday(y) {
		const jan4 = Date.UTC(y, 0, 4);
		const dow = (new Date(jan4).getUTCDay() + 6) % 7; // Mon=0
		return jan4 - dow * DAY;
	}
	function weeksInYear(y) {
		const jan1 = new Date(Date.UTC(y, 0, 1)).getUTCDay(); // Sun=0
		const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
		return jan1 === 4 || (leap && jan1 === 3) ? 53 : 52;
	}
	const N = $derived(weeksInYear(year));
	const w1 = $derived(isoWeek1Monday(year));
	const weeks = $derived(Array.from({ length: N }, (_, i) => i + 1));

	const fmtDay = (t) => { const d = new Date(t); return `${d.getUTCDate()} ${MON3[d.getUTCMonth()]}`; };
	const weekRange = (w) => { const s = w1 + (w - 1) * 7 * DAY; return `${fmtDay(s)} – ${fmtDay(s + 6 * DAY)}`; };
	const frac = (t) => Math.max(0, Math.min(1, (t - w1) / (7 * N * DAY)));

	// "Now" (only shown when looking at the current ISO year)
	const todayUTC = Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
	const nowFrac = $derived(todayUTC >= w1 && todayUTC < w1 + 7 * N * DAY ? (todayUTC - w1) / (7 * N * DAY) : null);
	const currentWeek = $derived(nowFrac == null ? null : Math.floor(nowFrac * N) + 1);

	// ── Geometry ─────────────────────────────────────────────────────────────
	const C = 500;
	const R_CENTER = 112;
	const R_PLAN_IN = 124;
	const R_PLAN_OUT = 338;
	const R_WEEK_OUT = 376;
	const R_MONTH_OUT = 436;
	const R_THEME0 = 452;
	const LANE = 24;
	const DOT_R = 6.5;
	const DOT_STEP = 15.5;

	const TAU = Math.PI * 2;
	const pt = (r, f) => [C + r * Math.sin(f * TAU), C - r * Math.cos(f * TAU)];
	const P = (r, f) => pt(r, f).map((v) => v.toFixed(2)).join(' ');
	function sector(r1, r2, f1, f2) {
		const large = f2 - f1 > 0.5 ? 1 : 0;
		return `M ${P(r2, f1)} A ${r2} ${r2} 0 ${large} 1 ${P(r2, f2)} L ${P(r1, f2)} A ${r1} ${r1} 0 ${large} 0 ${P(r1, f1)} Z`;
	}
	// Arc path for text; reversed in the lower half so labels read upright.
	function textArc(r, f1, f2) {
		const mid = (f1 + f2) / 2;
		const large = f2 - f1 > 0.5 ? 1 : 0;
		if (mid > 0.25 && mid < 0.75) return `M ${P(r, f2)} A ${r} ${r} 0 ${large} 0 ${P(r, f1)}`;
		return `M ${P(r, f1)} A ${r} ${r} 0 ${large} 1 ${P(r, f2)}`;
	}
	const lowerHalf = (f) => f > 0.25 && f < 0.75;
	const wf = (w) => (w - 1) / N; // week start fraction
	function rotFor(f) { const deg = f * 360; return lowerHalf(f) ? deg + 180 : deg; }

	// Months (by real dates, mapped into week space)
	const months = $derived(MONTHS.map((name, m) => {
		const f1 = frac(Date.UTC(year, m, 1));
		const f2 = frac(Date.UTC(year, m + 1, 1));
		return { name, m, f1, f2 };
	}).filter((m) => m.f2 - m.f1 > 0.004));

	// ── Derived planning data ────────────────────────────────────────────────
	const actById = $derived(Object.fromEntries(activities.map((a) => [a.id, a])));
	/** @type {any} */
	let activityFilter = $state(null);
	const matches = (it) => !activityFilter || it.activity_ids.includes(activityFilter);

	const byWeek = $derived.by(() => {
		const m = {};
		for (const it of items) (m[it.week] ??= []).push(it);
		return m;
	});
	const maxCount = $derived(Math.max(1, ...Object.values(byWeek).map((l) => l.length)));
	const plannedWeeks = $derived(Object.keys(byWeek).filter((w) => Number(w) <= N).length);
	const themesInWeek = (w) => themes.filter((t) => w >= t.start_week && w <= t.end_week);

	// Theme lanes: greedy interval packing so overlapping themes stack outward.
	const themeLanes = $derived.by(() => {
		/** @type {number[]} */
		const lanes = [];
		const out = {};
		for (const t of [...themes].sort((a, b) => a.start_week - b.start_week || b.end_week - a.end_week)) {
			let l = lanes.findIndex((end) => end < t.start_week);
			if (l === -1) { l = lanes.length; lanes.push(0); }
			lanes[l] = t.end_week;
			out[t.id] = l;
		}
		return { byId: out, count: lanes.length };
	});
	const outerR = $derived(R_THEME0 + Math.max(1, themeLanes.count) * LANE);
	const VB = $derived(`${C - outerR - 8} ${C - outerR - 8} ${(outerR + 8) * 2} ${(outerR + 8) * 2}`);

	// Dots per week: stacked from the outer edge inward, up to what fits.
	const maxDots = Math.floor((R_PLAN_OUT - R_PLAN_IN - 14) / DOT_STEP);
	function dotColors(it) {
		const cs = it.activity_ids.map((id) => actById[id]?.color).filter(Boolean);
		return cs.length ? cs : ['#A1A1AA'];
	}
	function pie(cx, cy, r, colors) {
		if (colors.length === 1) return [{ d: null, c: colors[0] }];
		return colors.map((c, i) => {
			const a1 = (i / colors.length) * TAU, a2 = ((i + 1) / colors.length) * TAU;
			const x1 = cx + r * Math.sin(a1), y1 = cy - r * Math.cos(a1);
			const x2 = cx + r * Math.sin(a2), y2 = cy - r * Math.cos(a2);
			return { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`, c };
		});
	}

	const KIND_LABEL = { product: 'Product', series: 'Series', publisher: 'Publisher' };
	const itemLabel = (it) => it.ref_label || it.ref_id;

	// ── Hover tooltip ────────────────────────────────────────────────────────
	/** @type {any} */
	let tip = $state(null); // { x, y, kind, ... }
	/** @type {any} */
	let hoverWeek = $state(null);
	/** @type {any} */
	let hoverTheme = $state(null);
	function moveTip(e, payload) { tip = { x: e.clientX, y: e.clientY, ...payload }; }
	function clearTip() { tip = null; hoverWeek = null; hoverTheme = null; }

	// ── Year navigation ──────────────────────────────────────────────────────
	function gotoYear(y) { clearTip(); goto(`?year=${y}`, { noScroll: true, keepFocus: true }); }

	// ── API ──────────────────────────────────────────────────────────────────
	let busy = $state(false);
	let errMsg = $state('');
	async function api(op, body = {}) {
		busy = true; errMsg = '';
		try {
			const r = await fetch('/api/wheel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, ...body }) });
			if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || `Request failed (${r.status})`);
			return await r.json();
		} catch (e) { errMsg = /** @type {Error} */ (e).message; throw e; }
		finally { busy = false; }
	}

	// ── Modals ───────────────────────────────────────────────────────────────
	/** @type {any} */
	let modal = $state(null); // 'week' | 'item' | 'theme' | 'activities'
	/** @type {any} */
	let weekOpen = $state(null);
	/** @type {any} */
	let itemDraft = $state(null);
	/** @type {any} */
	let themeDraft = $state(null);
	let returnToWeek = $state(false);

	function closeModal() {
		if ((modal === 'item') && returnToWeek && weekOpen) { modal = 'week'; itemDraft = null; return; }
		modal = null; itemDraft = null; themeDraft = null; returnToWeek = false; errMsg = '';
	}
	function openWeek(w) { clearTip(); weekOpen = w; modal = 'week'; }
	function openItem(it, fromWeek = false) {
		clearTip();
		returnToWeek = fromWeek;
		itemDraft = it
			? { ...it, activity_ids: [...it.activity_ids] }
			: { id: null, kind: 'product', ref_id: '', ref_label: '', week: weekOpen ?? currentWeek ?? 1, notes: '', activity_ids: [] };
		pickQ = ''; pickResults = [];
		modal = 'item';
	}
	function openTheme(t) {
		clearTip();
		themeDraft = t ? { ...t } : { id: null, name: '', color: THEME_COLORS[themes.length % THEME_COLORS.length], start_week: currentWeek ?? 1, end_week: Math.min(N, (currentWeek ?? 1) + 4), description: '' };
		modal = 'theme';
	}

	async function saveItem() {
		const d = itemDraft;
		if (!d.ref_id) { errMsg = `Pick a ${KIND_LABEL[d.kind].toLowerCase()} first.`; return; }
		const payload = { year, week: Number(d.week), kind: d.kind, ref_id: d.ref_id, ref_label: d.ref_label, notes: d.notes, activity_ids: d.activity_ids };
		if (d.id) {
			const res = await api('item.update', { id: d.id, ...payload });
			items = items.map((i) => (i.id === d.id ? { ...i, ...res } : i));
		} else {
			const res = await api('item.create', payload);
			items = [...items, res];
		}
		if (returnToWeek) weekOpen = Number(d.week);
		closeModal();
	}
	async function deleteItem() {
		if (!confirm('Delete this instance?')) return;
		await api('item.delete', { id: itemDraft.id });
		items = items.filter((i) => i.id !== itemDraft.id);
		closeModal();
	}
	async function saveTheme() {
		const d = themeDraft;
		if (!d.name?.trim()) { errMsg = 'Give the theme a name.'; return; }
		const payload = { year, name: d.name, color: d.color, start_week: Number(d.start_week), end_week: Number(d.end_week), description: d.description };
		if (d.id) {
			const res = await api('theme.update', { id: d.id, ...payload });
			themes = themes.map((t) => (t.id === d.id ? { ...t, ...res } : t));
		} else {
			themes = [...themes, await api('theme.create', payload)];
		}
		closeModal();
	}
	async function deleteTheme() {
		if (!confirm(`Delete the theme "${themeDraft.name}"?`)) return;
		await api('theme.delete', { id: themeDraft.id });
		themes = themes.filter((t) => t.id !== themeDraft.id);
		closeModal();
	}

	// Activities management
	let newAct = $state({ name: '', color: '#7C3AED' });
	async function addActivity() {
		if (!newAct.name.trim()) return;
		const { id } = await api('activity.create', newAct);
		activities = [...activities, { id, name: newAct.name.trim(), color: newAct.color }];
		newAct = { name: '', color: ACT_COLORS[(activities.length) % ACT_COLORS.length] };
	}
	async function patchActivity(a, patch) {
		await api('activity.update', { id: a.id, ...patch });
		activities = activities.map((x) => (x.id === a.id ? { ...x, ...patch } : x));
	}
	async function archiveActivity(a) {
		if (!confirm(`Remove "${a.name}" from the activity list? It's also removed from planned instances.`)) return;
		await api('activity.archive', { id: a.id });
		activities = activities.filter((x) => x.id !== a.id);
		items = items.map((i) => ({ ...i, activity_ids: i.activity_ids.filter((x) => x !== a.id) }));
		if (activityFilter === a.id) activityFilter = null;
	}

	const ACT_COLORS = ['#F57832', '#2563EB', '#DC2626', '#7C3AED', '#0891B2', '#CA8A04', '#DB2777', '#16A34A', '#475569'];
	const THEME_COLORS = ['#17834F', '#7C3AED', '#0E7490', '#B45309', '#BE185D', '#4338CA', '#65A30D'];

	// Picker
	let pickQ = $state('');
	/** @type {any[]} */
	let pickResults = $state([]);
	let pickLoading = $state(false);
	/** @type {any} */
	let pickTimer;
	function onPickInput() {
		clearTimeout(pickTimer);
		const q = pickQ.trim();
		if (q.length < 2) { pickResults = []; return; }
		pickTimer = setTimeout(async () => {
			pickLoading = true;
			try {
				const r = await fetch(`/api/wheel?type=${itemDraft.kind}&q=${encodeURIComponent(q)}`);
				pickResults = r.ok ? await r.json() : [];
			} finally { pickLoading = false; }
		}, 220);
	}
	function choose(r) {
		itemDraft.ref_id = r.ref_id;
		itemDraft.ref_label = r.label;
		pickQ = ''; pickResults = [];
	}
	function setKind(k) {
		if (itemDraft.kind === k) return;
		itemDraft.kind = k; itemDraft.ref_id = ''; itemDraft.ref_label = '';
		pickQ = ''; pickResults = [];
	}
	function toggleAct(id) {
		const s = itemDraft.activity_ids;
		itemDraft.activity_ids = s.includes(id) ? s.filter((x) => x !== id) : [...s, id];
	}

	function onKey(e) { if (e.key === 'Escape' && modal) closeModal(); }

	// Sidebar lists
	const actCounts = $derived(Object.fromEntries(activities.map((a) => [a.id, items.filter((i) => i.activity_ids.includes(a.id)).length])));
	const upcoming = $derived(currentWeek == null ? [] : items.filter((i) => i.week >= currentWeek && i.week < currentWeek + 4).sort((a, b) => a.week - b.week));
</script>

<svelte:window onkeydown={onKey} />
<svelte:head><title>Marketing Wheel {year} · Portal</title></svelte:head>

<div class="page">
	<AppNav active="" user={data.user} />

	<div class="layout">
		<!-- ── Wheel ──────────────────────────────────────────────── -->
		<div class="wheel-wrap">
			<svg class="wheel" viewBox={VB} role="img" aria-label="Marketing wheel {year}">
				<defs>
					{#each months as m (m.m)}
						<path id="mpath-{m.m}" d={textArc((R_WEEK_OUT + R_MONTH_OUT) / 2, m.f1, m.f2)} />
					{/each}
					{#each themes as t (t.id)}
						<path id="tpath-{t.id}" d={textArc(R_THEME0 + themeLanes.byId[t.id] * LANE + LANE / 2 - 0.5, wf(t.start_week), t.end_week / N)} />
					{/each}
				</defs>

				<!-- Planning area: one wedge per week, tinted by load -->
				{#each weeks as w (w)}
					{@const list = byWeek[w] ?? []}
					{@const n = list.filter(matches).length}
					{@const inTheme = hoverTheme && w >= hoverTheme.start_week && w <= hoverTheme.end_week}
					<path
						class="wedge"
						class:hover={hoverWeek === w}
						class:themed={inTheme}
						d={sector(R_PLAN_IN, R_PLAN_OUT, wf(w), w / N)}
						fill={n ? `rgba(245,120,50,${(0.07 + 0.3 * (n / maxCount)).toFixed(3)})` : '#FFFFFF'}
						role="button" tabindex="-1" aria-label="Week {w}"
						onmousemove={(e) => { hoverWeek = w; moveTip(e, { kind: 'week', week: w }); }}
						onmouseleave={clearTip}
						onclick={() => openWeek(w)}
						onkeydown={() => {}}
					/>
				{/each}

				<!-- Guide rings -->
				{#each [0.33, 0.66] as g}
					<circle cx={C} cy={C} r={R_PLAN_IN + (R_PLAN_OUT - R_PLAN_IN) * g} class="guide" />
				{/each}
				{#each months as m (m.m)}
					<line class="guide" x1={pt(R_PLAN_IN, m.f1)[0]} y1={pt(R_PLAN_IN, m.f1)[1]} x2={pt(R_PLAN_OUT, m.f1)[0]} y2={pt(R_PLAN_OUT, m.f1)[1]} />
				{/each}

				<!-- Item dots -->
				{#each weeks as w (w)}
					{@const list = byWeek[w] ?? []}
					{@const fmid = (w - 0.5) / N}
					{#each list.slice(0, maxDots) as it, i (it.id)}
						{@const [x, y] = pt(R_PLAN_OUT - 12 - i * DOT_STEP, fmid)}
						<g
							class="dot"
							class:dim={!matches(it)}
							role="button" tabindex="-1" aria-label={itemLabel(it)}
							onmousemove={(e) => { e.stopPropagation(); hoverWeek = w; moveTip(e, { kind: 'item', item: it }); }}
							onmouseleave={clearTip}
							onclick={(e) => { e.stopPropagation(); weekOpen = w; openItem(it); }}
							onkeydown={() => {}}
						>
							{#each pie(x, y, DOT_R, dotColors(it)) as s}
								{#if s.d}<path d={s.d} fill={s.c} />{:else}<circle cx={x} cy={y} r={DOT_R} fill={s.c} />{/if}
							{/each}
							<circle cx={x} cy={y} r={DOT_R} class="dot-ring" />
						</g>
					{/each}
					{#if list.length > maxDots}
						{@const [x, y] = pt(R_PLAN_OUT - 12 - maxDots * DOT_STEP, fmid)}
						<text class="more" {x} {y} dy="3">+{list.length - maxDots}</text>
					{/if}
				{/each}

				<!-- Week numbers -->
				{#each weeks as w (w)}
					{@const fmid = (w - 0.5) / N}
					{@const [x, y] = pt((R_PLAN_OUT + R_WEEK_OUT) / 2, fmid)}
					<path
						class="weekcell"
						class:current={w === currentWeek}
						class:hover={hoverWeek === w}
						class:has={(byWeek[w]?.length ?? 0) > 0}
						d={sector(R_PLAN_OUT + 1, R_WEEK_OUT, wf(w), w / N)}
						role="button" tabindex="-1" aria-label="Week {w}"
						onmousemove={(e) => { hoverWeek = w; moveTip(e, { kind: 'week', week: w }); }}
						onmouseleave={clearTip}
						onclick={() => openWeek(w)}
						onkeydown={() => {}}
					/>
					<text class="weeknum" class:current={w === currentWeek} {x} {y} dy="4" transform="rotate({rotFor(fmid)} {x} {y})">{w}</text>
				{/each}

				<!-- Months -->
				{#each months as m (m.m)}
					<path class="month" d={sector(R_WEEK_OUT + 2, R_MONTH_OUT, m.f1, m.f2)} />
					<text class="monthlabel">
						<textPath href="#mpath-{m.m}" startOffset="50%" text-anchor="middle">{m.name.toUpperCase()}</textPath>
					</text>
				{/each}

				<!-- Themes -->
				{#each themes as t (t.id)}
					{@const lane = themeLanes.byId[t.id]}
					{@const r1 = R_THEME0 + lane * LANE}
					{@const f1 = wf(t.start_week) + 0.0015}
					{@const f2 = t.end_week / N - 0.0015}
					{@const arcLen = (f2 - f1) * TAU * (r1 + LANE / 2)}
					<g
						class="theme"
						class:hover={hoverTheme?.id === t.id}
						role="button" tabindex="-1" aria-label="Theme {t.name}"
						onmousemove={(e) => { hoverTheme = t; moveTip(e, { kind: 'theme', theme: t }); }}
						onmouseleave={clearTip}
						onclick={() => openTheme(t)}
						onkeydown={() => {}}
					>
						<path d={sector(r1 + 2, r1 + LANE - 2, f1, f2)} fill={t.color} />
						{#if arcLen > t.name.length * 7 + 12}
							<text class="themelabel">
								<textPath href="#tpath-{t.id}" startOffset="50%" text-anchor="middle">{t.name}</textPath>
							</text>
						{/if}
					</g>
				{/each}

				<!-- Today hand -->
				{#if nowFrac != null}
					{@const [x1, y1] = pt(R_CENTER + 4, nowFrac)}
					{@const [x2, y2] = pt(R_MONTH_OUT, nowFrac)}
					<line class="today" {x1} {y1} {x2} {y2} />
					<circle class="today-dot" cx={x2} cy={y2} r="4" />
				{/if}

				<!-- Centre -->
				<circle cx={C} cy={C} r={R_CENTER} class="hub" />
				<text x={C} y={C - 34} class="hub-kicker">MARKETING WHEEL</text>
				<text x={C} y={C + 18} class="hub-year">{year}</text>
				<text x={C} y={C + 48} class="hub-sub">{items.length} planned · {plannedWeeks}/{N} weeks</text>
				<g class="hub-nav" role="button" tabindex="0" aria-label="Previous year" onclick={() => gotoYear(year - 1)} onkeydown={(e) => e.key === 'Enter' && gotoYear(year - 1)}>
					<circle cx={C - 78} cy={C + 6} r="16" />
					<path d="M {C - 75} {C - 1} l -7 7 l 7 7" />
				</g>
				<g class="hub-nav" role="button" tabindex="0" aria-label="Next year" onclick={() => gotoYear(year + 1)} onkeydown={(e) => e.key === 'Enter' && gotoYear(year + 1)}>
					<circle cx={C + 78} cy={C + 6} r="16" />
					<path d="M {C + 75} {C - 1} l 7 7 l -7 7" />
				</g>
			</svg>
		</div>

		<!-- ── Sidebar ────────────────────────────────────────────── -->
		<aside class="side">
			<div class="side-head">
				<h1>Marketing Wheel</h1>
				<div class="yearnav">
					<button class="icon-btn" onclick={() => gotoYear(year - 1)} aria-label="Previous year">‹</button>
					<span>{year}</span>
					<button class="icon-btn" onclick={() => gotoYear(year + 1)} aria-label="Next year">›</button>
				</div>
			</div>

			<div class="actions">
				<button class="btn primary" onclick={() => { weekOpen = null; openItem(null); }}>+ Instance</button>
				<button class="btn" onclick={() => openTheme(null)}>+ Theme</button>
			</div>

			<div class="stats">
				<div><b>{items.length}</b><span>instances</span></div>
				<div><b>{plannedWeeks}<small>/{N}</small></b><span>weeks planned</span></div>
				<div><b>{themes.length}</b><span>themes</span></div>
			</div>

			<section>
				<div class="sec-head">
					<span class="sec-label">Activities</span>
					<button class="link" onclick={() => { modal = 'activities'; }}>Edit list</button>
				</div>
				{#each activities as a (a.id)}
					<button class="legend" class:active={activityFilter === a.id} class:muted={activityFilter && activityFilter !== a.id}
						onclick={() => (activityFilter = activityFilter === a.id ? null : a.id)}
						title={activityFilter === a.id ? 'Show all' : 'Highlight only this activity'}>
						<span class="swatch" style:background={a.color}></span>
						<span class="lg-name">{a.name}</span>
						<span class="lg-count">{actCounts[a.id] ?? 0}</span>
					</button>
				{:else}
					<p class="empty">No activities yet.</p>
				{/each}
			</section>

			<section>
				<div class="sec-head"><span class="sec-label">Themes</span></div>
				{#each [...themes].sort((a, b) => a.start_week - b.start_week) as t (t.id)}
					<button class="legend" onclick={() => openTheme(t)}
						onmouseenter={() => (hoverTheme = t)} onmouseleave={() => (hoverTheme = null)}>
						<span class="swatch bar" style:background={t.color}></span>
						<span class="lg-name">{t.name}</span>
						<span class="lg-count">w{t.start_week}–{t.end_week}</span>
					</button>
				{:else}
					<p class="empty">No themes for {year}.</p>
				{/each}
			</section>

			{#if currentWeek != null}
				<section>
					<div class="sec-head"><span class="sec-label">Next 4 weeks</span></div>
					{#each upcoming as it (it.id)}
						<button class="up" onclick={() => { weekOpen = it.week; openItem(it); }}>
							<span class="up-week">w{it.week}</span>
							<span class="up-name">{itemLabel(it)}</span>
							<span class="up-dots">{#each it.activity_ids as id}<span class="mini" style:background={actById[id]?.color}></span>{/each}</span>
						</button>
					{:else}
						<p class="empty">Nothing planned in the next 4 weeks.</p>
					{/each}
				</section>
			{/if}
		</aside>
	</div>
</div>

<!-- ── Tooltip ────────────────────────────────────────────────────── -->
{#if tip && !modal}
	<div class="tip" style:left="{tip.x + 16}px" style:top="{tip.y + 16}px">
		{#if tip.kind === 'week'}
			{@const list = byWeek[tip.week] ?? []}
			{@const th = themesInWeek(tip.week)}
			<div class="tip-title">Week {tip.week} <span>{weekRange(tip.week)}</span></div>
			{#if th.length}
				<div class="tip-themes">{#each th as t}<span class="tchip" style:background={t.color}>{t.name}</span>{/each}</div>
			{/if}
			{#if list.length}
				<ul>
					{#each list.slice(0, 8) as it}
						<li>
							<span class="tip-dots">{#each dotColors(it) as c}<span class="mini" style:background={c}></span>{/each}</span>
							{itemLabel(it)} <em>{KIND_LABEL[it.kind]}</em>
						</li>
					{/each}
					{#if list.length > 8}<li class="more-li">+{list.length - 8} more</li>{/if}
				</ul>
			{:else}
				<div class="tip-empty">Nothing planned — click to add</div>
			{/if}
		{:else if tip.kind === 'item'}
			<div class="tip-title">{itemLabel(tip.item)} <span>{KIND_LABEL[tip.item.kind]} · week {tip.item.week}</span></div>
			<div class="tip-acts">
				{#each tip.item.activity_ids as id}<span class="achip"><span class="mini" style:background={actById[id]?.color}></span>{actById[id]?.name}</span>{:else}<span class="tip-empty">No activities</span>{/each}
			</div>
			{#if tip.item.notes}<div class="tip-notes">{tip.item.notes}</div>{/if}
		{:else if tip.kind === 'theme'}
			<div class="tip-title"><span class="mini" style:background={tip.theme.color}></span> {tip.theme.name}</div>
			<div class="tip-sub">Week {tip.theme.start_week} – {tip.theme.end_week} · {fmtDay(w1 + (tip.theme.start_week - 1) * 7 * DAY)} – {fmtDay(w1 + (tip.theme.end_week * 7 - 1) * DAY)}</div>
			{#if tip.theme.description}<div class="tip-notes">{tip.theme.description}</div>{/if}
		{/if}
	</div>
{/if}

<!-- ── Modals ──────────────────────────────────────────────────────── -->
{#if modal}
	<div class="backdrop" transition:fade={{ duration: 120 }} onclick={closeModal} role="presentation"></div>
{/if}

{#if modal === 'week' && weekOpen != null}
	{@const list = byWeek[weekOpen] ?? []}
	{@const th = themesInWeek(weekOpen)}
	<div class="modal" role="dialog" aria-modal="true" transition:scale={{ start: 0.97, duration: 140 }}>
		<header>
			<div>
				<h2>Week {weekOpen}</h2>
				<p class="sub">{weekRange(weekOpen)} {year}</p>
			</div>
			<div class="wk-nav">
				<button class="icon-btn" disabled={weekOpen <= 1} onclick={() => weekOpen--} aria-label="Previous week">‹</button>
				<button class="icon-btn" disabled={weekOpen >= N} onclick={() => weekOpen++} aria-label="Next week">›</button>
				<button class="icon-btn" onclick={closeModal} aria-label="Close">×</button>
			</div>
		</header>
		{#if th.length}
			<div class="wk-themes">
				{#each th as t}<button class="tchip" style:background={t.color} onclick={() => openTheme(t)}>{t.name} · w{t.start_week}–{t.end_week}</button>{/each}
			</div>
		{/if}
		<div class="wk-list">
			{#each list as it (it.id)}
				<button class="wk-item" onclick={() => openItem(it, true)}>
					<span class="kind k-{it.kind}">{KIND_LABEL[it.kind]}</span>
					<span class="wk-name">{itemLabel(it)}{#if it.notes}<small>{it.notes}</small>{/if}</span>
					<span class="wk-acts">
						{#each it.activity_ids as id}<span class="achip"><span class="mini" style:background={actById[id]?.color}></span>{actById[id]?.name}</span>{/each}
					</span>
				</button>
			{:else}
				<p class="empty pad">Nothing planned this week yet.</p>
			{/each}
		</div>
		<footer>
			<button class="btn primary" onclick={() => openItem(null, true)}>+ Add instance to week {weekOpen}</button>
		</footer>
	</div>
{/if}

{#if modal === 'item' && itemDraft}
	<div class="modal" role="dialog" aria-modal="true" transition:scale={{ start: 0.97, duration: 140 }}>
		<header>
			<h2>{itemDraft.id ? 'Edit instance' : 'New instance'}</h2>
			<button class="icon-btn" onclick={closeModal} aria-label="Close">×</button>
		</header>
		<div class="form">
			<label class="fl">What</label>
			<div class="seg">
				{#each ['product', 'series', 'publisher'] as k}
					<button class:active={itemDraft.kind === k} onclick={() => setKind(k)}>{KIND_LABEL[k]}</button>
				{/each}
			</div>
			{#if itemDraft.ref_id}
				<div class="chosen">
					<span class="kind k-{itemDraft.kind}">{KIND_LABEL[itemDraft.kind]}</span>
					<span class="wk-name">{itemDraft.ref_label || itemDraft.ref_id}</span>
					<button class="link" onclick={() => { itemDraft.ref_id = ''; itemDraft.ref_label = ''; }}>Change</button>
				</div>
			{:else}
				<div class="picker">
					<!-- svelte-ignore a11y_autofocus -->
					<input autofocus placeholder="Search {KIND_LABEL[itemDraft.kind].toLowerCase()}s…" bind:value={pickQ} oninput={onPickInput} />
					{#if pickLoading}<span class="pk-load">…</span>{/if}
					{#if pickResults.length}
						<ul class="pk-results">
							{#each pickResults as r}
								<li><button onclick={() => choose(r)}>{r.label}{#if r.sub && r.sub !== r.label}<small>{r.sub}</small>{/if}</button></li>
							{/each}
						</ul>
					{:else if pickQ.trim().length >= 2 && !pickLoading}
						<p class="pk-none">No matches.</p>
					{/if}
				</div>
			{/if}

			<label class="fl" for="wk-sel">Week</label>
			<select id="wk-sel" bind:value={itemDraft.week}>
				{#each weeks as w}<option value={w}>Week {w} · {weekRange(w)}</option>{/each}
			</select>

			<label class="fl">Activities</label>
			<div class="act-pills">
				{#each activities as a (a.id)}
					{@const on = itemDraft.activity_ids.includes(a.id)}
					<button class="act-pill" class:on style:--c={a.color} onclick={() => toggleAct(a.id)}>
						<span class="mini" style:background={a.color}></span>{a.name}
					</button>
				{/each}
				<button class="link" onclick={() => { modal = 'activities'; }}>Edit list</button>
			</div>

			<label class="fl" for="it-notes">Notes</label>
			<textarea id="it-notes" rows="3" bind:value={itemDraft.notes} placeholder="Angle, owner, links…"></textarea>
			{#if errMsg}<p class="err">{errMsg}</p>{/if}
		</div>
		<footer>
			{#if itemDraft.id}<button class="btn danger" onclick={deleteItem} disabled={busy}>Delete</button>{/if}
			<span class="spacer"></span>
			<button class="btn" onclick={closeModal}>Cancel</button>
			<button class="btn primary" onclick={saveItem} disabled={busy}>Save</button>
		</footer>
	</div>
{/if}

{#if modal === 'theme' && themeDraft}
	<div class="modal" role="dialog" aria-modal="true" transition:scale={{ start: 0.97, duration: 140 }}>
		<header>
			<h2>{themeDraft.id ? 'Edit theme' : 'New theme'}</h2>
			<button class="icon-btn" onclick={closeModal} aria-label="Close">×</button>
		</header>
		<div class="form">
			<label class="fl" for="th-name">Name</label>
			<!-- svelte-ignore a11y_autofocus -->
			<input id="th-name" autofocus bind:value={themeDraft.name} placeholder="e.g. Pocket Games" />
			<div class="row2">
				<div>
					<label class="fl" for="th-s">From</label>
					<select id="th-s" bind:value={themeDraft.start_week}>
						{#each weeks as w}<option value={w}>Week {w} · {weekRange(w).split(' – ')[0]}</option>{/each}
					</select>
				</div>
				<div>
					<label class="fl" for="th-e">To</label>
					<select id="th-e" bind:value={themeDraft.end_week}>
						{#each weeks as w}<option value={w}>Week {w} · {weekRange(w).split(' – ')[1]}</option>{/each}
					</select>
				</div>
			</div>
			<label class="fl">Colour</label>
			<div class="swatches">
				{#each THEME_COLORS as c}
					<button class="sw" class:on={themeDraft.color === c} style:background={c} onclick={() => (themeDraft.color = c)} aria-label={c}></button>
				{/each}
				<input type="color" bind:value={themeDraft.color} title="Custom colour" />
			</div>
			<label class="fl" for="th-desc">Description</label>
			<textarea id="th-desc" rows="3" bind:value={themeDraft.description} placeholder="What's the idea behind this theme?"></textarea>
			{#if errMsg}<p class="err">{errMsg}</p>{/if}
		</div>
		<footer>
			{#if themeDraft.id}<button class="btn danger" onclick={deleteTheme} disabled={busy}>Delete</button>{/if}
			<span class="spacer"></span>
			<button class="btn" onclick={closeModal}>Cancel</button>
			<button class="btn primary" onclick={saveTheme} disabled={busy}>Save</button>
		</footer>
	</div>
{/if}

{#if modal === 'activities'}
	<div class="modal" role="dialog" aria-modal="true" transition:scale={{ start: 0.97, duration: 140 }}>
		<header>
			<h2>Activities</h2>
			<button class="icon-btn" onclick={() => { modal = itemDraft ? 'item' : null; }} aria-label="Close">×</button>
		</header>
		<div class="form">
			{#each activities as a (a.id)}
				<div class="act-row">
					<input type="color" value={a.color} onchange={(e) => patchActivity(a, { color: e.currentTarget.value })} />
					<input class="grow" value={a.name} onchange={(e) => e.currentTarget.value.trim() && patchActivity(a, { name: e.currentTarget.value.trim() })} />
					<button class="icon-btn" title="Remove" onclick={() => archiveActivity(a)}>×</button>
				</div>
			{/each}
			<div class="act-row new">
				<input type="color" bind:value={newAct.color} />
				<input class="grow" bind:value={newAct.name} placeholder="New activity, e.g. Instagram post" onkeydown={(e) => e.key === 'Enter' && addActivity()} />
				<button class="btn" onclick={addActivity} disabled={busy || !newAct.name.trim()}>Add</button>
			</div>
			{#if errMsg}<p class="err">{errMsg}</p>{/if}
		</div>
		<footer>
			<span class="spacer"></span>
			<button class="btn primary" onclick={() => { modal = itemDraft ? 'item' : null; }}>Done</button>
		</footer>
	</div>
{/if}

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; background: #FFF6DA; }
	.layout { flex: 1; display: flex; gap: 24px; padding: 20px 24px 32px; max-width: 1500px; width: 100%; margin: 0 auto; align-items: flex-start; }
	.wheel-wrap { flex: 1; min-width: 0; display: flex; justify-content: center; }
	.wheel { width: 100%; max-width: 920px; max-height: calc(100vh - 110px); height: auto; user-select: none; }

	/* Wheel parts */
	.wedge { stroke: #EEF0E6; stroke-width: 1; cursor: pointer; transition: fill .15s; }
	.wedge.hover { fill: #FDE3CF; }
	.wedge.themed { stroke: #17834F; stroke-width: 1.5; }
	.guide { fill: none; stroke: #E8EBDD; stroke-width: 1.2; pointer-events: none; }
	.dot { cursor: pointer; transition: opacity .15s; }
	.dot:hover .dot-ring { stroke: #18181B; stroke-width: 2; }
	.dot-ring { fill: none; stroke: #fff; stroke-width: 1.5; }
	.dot.dim { opacity: .12; }
	.more { font-size: 10px; font-weight: 800; fill: #9A5B00; text-anchor: middle; pointer-events: none; }
	.weekcell { fill: #FFF6DA; stroke: #FFFFFF; stroke-width: 1.5; cursor: pointer; }
	.weekcell.has { fill: #FFE7BF; }
	.weekcell.hover { fill: #FBC9A3; }
	.weekcell.current { fill: #17834F; }
	.weeknum { font-size: 12px; font-weight: 800; fill: #7A4A12; text-anchor: middle; pointer-events: none; }
	.weeknum.current { fill: #fff; }
	.month { fill: #F57832; stroke: #fff; stroke-width: 3; }
	.monthlabel { font-size: 19px; font-weight: 800; letter-spacing: .08em; fill: #fff; pointer-events: none; dominant-baseline: middle; }
	.theme { cursor: pointer; }
	.theme path { opacity: .88; transition: opacity .12s; }
	.theme.hover path, .theme:hover path { opacity: 1; filter: drop-shadow(0 1px 2px rgba(0,0,0,.25)); }
	.themelabel { font-size: 12px; font-weight: 800; fill: #fff; pointer-events: none; dominant-baseline: middle; }
	.today { stroke: #17834F; stroke-width: 2; stroke-dasharray: 4 3; pointer-events: none; }
	.today-dot { fill: #17834F; pointer-events: none; }
	.hub { fill: #17834F; }
	.hub-kicker { font-size: 12px; font-weight: 800; letter-spacing: .2em; fill: #CDEBD9; text-anchor: middle; }
	.hub-year { font-size: 56px; font-weight: 900; fill: #fff; text-anchor: middle; }
	.hub-sub { font-size: 11.5px; font-weight: 700; fill: #CDEBD9; text-anchor: middle; }
	.hub-nav { cursor: pointer; }
	.hub-nav circle { fill: rgba(255,255,255,.12); transition: fill .12s; }
	.hub-nav:hover circle { fill: rgba(255,255,255,.28); }
	.hub-nav path { fill: none; stroke: #fff; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
	.hub-nav:focus { outline: none; }

	/* Sidebar */
	.side { width: 300px; flex-shrink: 0; background: #fff; border-radius: var(--radius-lg); box-shadow: var(--shadow); padding: 18px; display: flex; flex-direction: column; gap: 18px; position: sticky; top: 16px; }
	.side-head { display: flex; align-items: center; justify-content: space-between; }
	h1 { font-size: 20px; font-weight: 900; }
	.yearnav { display: flex; align-items: center; gap: 4px; font-weight: 800; }
	.actions { display: flex; gap: 8px; }
	.actions .btn { flex: 1; justify-content: center; }
	.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
	.stats div { background: #FFF6DA; border-radius: 10px; padding: 9px 8px; text-align: center; display: flex; flex-direction: column; }
	.stats b { font-size: 20px; font-weight: 900; color: #18181B; }
	.stats small { font-size: 12px; color: #A1A1AA; }
	.stats span { font-size: 11px; color: #71717A; font-weight: 600; }
	section { display: flex; flex-direction: column; gap: 2px; }
	.sec-head { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 4px; }
	.sec-label { font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #A1A1AA; }
	.legend, .up { display: flex; align-items: center; gap: 9px; width: 100%; border: 0; background: none; padding: 6px 6px; border-radius: 8px; text-align: left; font-size: 14px; color: #3F3F46; transition: opacity .12s; }
	.legend:hover, .up:hover { background: #FFF6DA; }
	.legend.active { background: #FDEFE2; font-weight: 800; }
	.legend.muted { opacity: .45; }
	.swatch { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
	.swatch.bar { width: 18px; height: 8px; border-radius: 4px; }
	.lg-name, .up-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.lg-count { font-size: 12px; color: #A1A1AA; font-weight: 700; }
	.up-week { font-size: 11px; font-weight: 800; color: #17834F; background: #E3F3EA; border-radius: 6px; padding: 2px 6px; }
	.up-dots { display: flex; gap: 3px; }
	.mini { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
	.empty { font-size: 13px; color: #A1A1AA; padding: 4px 6px; }
	.empty.pad { padding: 18px 4px; text-align: center; }

	.btn { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--border); background: #fff; border-radius: 9px; padding: 8px 14px; font-size: 14px; font-weight: 700; color: #3F3F46; }
	.btn:hover { background: #FAF6EE; }
	.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
	.btn.primary:hover { background: var(--accent-hover); }
	.btn.danger { color: var(--danger); border-color: #F5C2C2; }
	.btn:disabled { opacity: .55; cursor: default; }
	.icon-btn { width: 30px; height: 30px; border: 0; background: none; border-radius: 8px; font-size: 20px; line-height: 1; color: #52525B; display: inline-flex; align-items: center; justify-content: center; }
	.icon-btn:hover:not(:disabled) { background: #F4F1EA; }
	.icon-btn:disabled { opacity: .3; cursor: default; }
	.link { border: 0; background: none; color: #9A5B00; font-size: 12.5px; font-weight: 700; padding: 2px 4px; }
	.link:hover { text-decoration: underline; }
	.spacer { flex: 1; }

	/* Tooltip */
	.tip { position: fixed; z-index: 300; pointer-events: none; background: #18181B; color: #fff; border-radius: 10px; padding: 10px 12px; max-width: 300px; font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,.2); }
	.tip-title { font-weight: 800; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
	.tip-title span { font-weight: 600; color: #A1A1AA; font-size: 12px; }
	.tip-sub { color: #D4D4D8; font-size: 12px; margin-top: 3px; }
	.tip ul { list-style: none; margin-top: 6px; display: flex; flex-direction: column; gap: 3px; }
	.tip li { display: flex; align-items: center; gap: 6px; }
	.tip li em { color: #A1A1AA; font-style: normal; font-size: 11px; }
	.tip-dots { display: inline-flex; gap: 2px; }
	.tip-empty { color: #A1A1AA; font-size: 12px; margin-top: 4px; }
	.tip-themes, .tip-acts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
	.tip .achip { background: #27272A; color: #fff; }
	.tip-notes { margin-top: 6px; color: #D4D4D8; font-size: 12px; white-space: pre-wrap; }
	.more-li { color: #A1A1AA; font-size: 12px; }
	.tchip { border: 0; color: #fff; font-size: 12px; font-weight: 800; border-radius: 999px; padding: 3px 10px; }
	button.tchip:hover { filter: brightness(1.08); }
	.achip { display: inline-flex; align-items: center; gap: 5px; background: #F4F4F5; color: #3F3F46; border-radius: 999px; padding: 2px 9px; font-size: 12px; font-weight: 600; }

	/* Modals */
	.backdrop { position: fixed; inset: 0; z-index: 200; background: rgba(24,24,27,.35); }
	.modal { position: fixed; z-index: 201; top: 50%; left: 50%; translate: -50% -50%; width: min(540px, calc(100vw - 32px)); max-height: 86vh; display: flex; flex-direction: column; background: #fff; border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); }
	.modal header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 20px 10px; }
	.modal h2 { font-size: 20px; font-weight: 900; }
	.modal .sub { font-size: 13px; color: #71717A; font-weight: 600; margin-top: 2px; }
	.modal footer { display: flex; align-items: center; gap: 8px; padding: 12px 20px 18px; border-top: 1px solid #F4F4F5; }
	.wk-nav { display: flex; gap: 2px; }
	.wk-themes { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 20px 10px; }
	.wk-list { overflow-y: auto; padding: 0 12px 10px; display: flex; flex-direction: column; gap: 4px; }
	.wk-item { display: flex; align-items: center; gap: 10px; border: 1px solid #F1EDE3; background: #fff; border-radius: 10px; padding: 9px 10px; text-align: left; flex-wrap: wrap; }
	.wk-item:hover { border-color: var(--accent); background: #FFFBF3; }
	.wk-name { flex: 1; min-width: 120px; font-weight: 700; font-size: 14px; color: #18181B; display: flex; flex-direction: column; }
	.wk-name small { font-weight: 500; color: #71717A; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.wk-acts { display: flex; flex-wrap: wrap; gap: 4px; }
	.kind { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; border-radius: 6px; padding: 3px 7px; flex-shrink: 0; }
	.k-product { background: #FDEFE2; color: #9A5B00; }
	.k-series { background: #EDE9FE; color: #5B21B6; }
	.k-publisher { background: #E3F3EA; color: #17663F; }

	.form { padding: 4px 20px 14px; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
	.fl { font-size: 12px; font-weight: 800; color: #71717A; margin-top: 8px; }
	.form input:not([type=color]), .form select, .form textarea { width: 100%; border: 1px solid var(--border); border-radius: 9px; padding: 9px 11px; font: inherit; font-size: 14px; background: #fff; }
	.form input:focus, .form select:focus, .form textarea:focus { outline: none; border-color: var(--accent); }
	.form textarea { resize: vertical; }
	.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	.row2 > div { display: flex; flex-direction: column; gap: 6px; }
	.seg { display: inline-flex; background: #EFEDE8; border-radius: 9px; padding: 3px; align-self: flex-start; }
	.seg button { border: 0; background: none; border-radius: 7px; padding: 6px 14px; font-size: 13px; font-weight: 700; color: #52525B; }
	.seg button.active { background: #fff; color: #18181B; box-shadow: 0 1px 2px rgba(0,0,0,.08); }
	.chosen { display: flex; align-items: center; gap: 10px; border: 1px solid var(--border); border-radius: 9px; padding: 8px 10px; background: #FFFBF3; }
	.picker { position: relative; }
	.pk-load { position: absolute; right: 12px; top: 9px; color: #A1A1AA; }
	.pk-results { list-style: none; border: 1px solid #F1EDE3; border-radius: 9px; margin-top: 4px; max-height: 220px; overflow-y: auto; }
	.pk-results button { width: 100%; text-align: left; border: 0; background: none; padding: 8px 11px; font-size: 14px; display: flex; justify-content: space-between; gap: 10px; }
	.pk-results button:hover { background: #FFF6DA; }
	.pk-results small { color: #A1A1AA; font-size: 12px; }
	.pk-none { font-size: 13px; color: #A1A1AA; padding: 6px 2px; }
	.act-pills { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
	.act-pill { display: inline-flex; align-items: center; gap: 6px; border: 1.5px solid #E4E4E7; background: #fff; border-radius: 999px; padding: 5px 12px; font-size: 13px; font-weight: 700; color: #52525B; }
	.act-pill.on { border-color: var(--c); background: color-mix(in srgb, var(--c) 12%, white); color: #18181B; }
	.swatches { display: flex; gap: 8px; align-items: center; }
	.sw { width: 26px; height: 26px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px #E4E4E7; }
	.sw.on { box-shadow: 0 0 0 2px #18181B; }
	input[type=color] { width: 32px; height: 30px; border: 1px solid var(--border); border-radius: 8px; padding: 2px; background: #fff; cursor: pointer; }
	.act-row { display: flex; align-items: center; gap: 8px; }
	.act-row .grow { flex: 1; }
	.act-row.new { margin-top: 8px; padding-top: 10px; border-top: 1px dashed #EDE7D6; }
	.err { color: var(--danger); font-size: 13px; font-weight: 600; margin-top: 6px; }

	@media (max-width: 1000px) {
		.layout { flex-direction: column; padding: 12px 16px 24px; }
		.side { width: 100%; position: static; }
	}
</style>
