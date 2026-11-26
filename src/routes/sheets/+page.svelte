<script>
	import { LANGS, MARKETS, langShort, sheetName } from '$lib/languages.js';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	const canEdit = $derived(data.user?.permissions?.sheetsEdit ?? false);

	const PAGE_SIZE = 30;

	function formatDate(ts) {
		return new Date(ts * 1000).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}


	function langStatus(sheet, lang) {
		const name = sheet[`name_${lang}`];
		if (!name?.trim()) return 'empty';
		const needed = sheet.usp_count ?? 3;
		const filled = sheet[`usp_filled_${lang}`] ?? 0;
		return (needed === 0 || filled >= needed) ? 'complete' : 'partial';
	}

	function creatorName(sheet) {
		if (sheet.creator_first_name) return sheet.creator_first_name;
		if (sheet.created_by) return sheet.created_by.split('@')[0];
		return null;
	}

	function decorate(sheet) {
		return {
			...sheet,
			_display: sheetName(sheet) || '',
		};
	}

	// ── Relations: count badge per card + read-only modal ─────────────────
	/** @type {Record<string, number>} lower-case SKU → relations (both directions) */
	let relCounts = $state({});
	const relCount = (/** @type {any} */ sh) => relCounts[String(sh.sku ?? '').trim().toLowerCase()] ?? 0;
	onMount(async () => {
		try {
			const res = await fetch('/api/sheets/relations');
			if (res.ok) relCounts = (await res.json()).counts ?? {};
		} catch { /* badge just stays hidden */ }
	});
	/** @type {{ sheet: any, groups: { key: string, label: string, items: any[] }[] | null, error: string } | null} */
	let relModal = $state(null);
	async function openRelations(/** @type {any} */ sh) {
		relModal = { sheet: sh, groups: null, error: '' };
		try {
			const res = await fetch(`/api/sheets/${sh.id}/relations`);
			if (!res.ok) throw new Error();
			const { types, relations } = await res.json();
			const en = (/** @type {any} */ t) => t.labels?.en ?? t.labels?.da ?? Object.values(t.labels ?? {})[0] ?? { name: t.id };
			const groups = [];
			for (const t of types) {
				const l = en(t);
				const f = relations.outgoing.filter((/** @type {any} */ r) => r.type_id === t.id);
				if (f.length) groups.push({ key: `f:${t.id}`, label: l.forward || `${l.name} for`, items: f });
				const i = relations.incoming.filter((/** @type {any} */ r) => r.type_id === t.id);
				if (i.length) groups.push({ key: `i:${t.id}`, label: l.inverse || l.name, items: i });
			}
			if (relModal?.sheet === sh) relModal = { sheet: sh, groups, error: '' };
		} catch {
			if (relModal?.sheet === sh) relModal = { sheet: sh, groups: null, error: 'Could not load relations.' };
		}
	}

	// ── Paginated sheets list ─────────────────────────────────────────────
	let loadedSheets = $state(data.sheets.map(decorate));
	let totalCount   = $state(data.totalCount);
	let loadingMore  = $state(false);
	const hasMore    = $derived(!todo && !featuredOnly && !advActive && !query.trim() && loadedSheets.length < totalCount);

	async function loadMore() {
		if (loadingMore) return;
		loadingMore = true;
		try {
			const res = await fetch(`/api/sheets?offset=${loadedSheets.length}&${barredQ()}`);
			if (res.ok) {
				const { sheets } = await res.json();
				loadedSheets = [...loadedSheets, ...sheets.map(decorate)];
			}
		} finally {
			loadingMore = false;
		}
	}

	// ── Hide Barred (on by default): sheets barred in Rackbeat are left out of
	// every view. Switching it off counts as a filter (Reset all turns it back on).
	let hideBarred = $state(true);
	const barredQ = () => `barred=${hideBarred ? 0 : 1}`;
	let barredShown = true; // what the server-rendered first page was loaded with
	$effect(() => {
		const hb = hideBarred;
		if (hb === barredShown) return;
		barredShown = hb;
		(async () => {
			const res = await fetch(`/api/sheets?offset=0&barred=${hb ? 0 : 1}`);
			if (res.ok && hideBarred === hb) {
				const body = await res.json();
				loadedSheets = body.sheets.map(decorate);
				if (typeof body.totalCount === 'number') totalCount = body.totalCount;
			}
		})();
		todoSheets = null;
		if (todo) loadTodo();
		if (featuredOnly) loadFeatured();
	});

	// ── Search (server-side so it spans ALL sheets) ───────────────────────
	let query        = $state('');
	let searchResults = $state(/** @type {any[]|null} */ (null));
	let searching    = $state(false);
	let searchTimer  = /** @type {ReturnType<typeof setTimeout>|null} */ (null);

	$effect(() => {
		const q = query.trim();
		const bq = barredQ();
		clearTimeout(searchTimer ?? undefined);
		if (!q) {
			searchResults = null;
			return;
		}
		searching = true;
		searchTimer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/sheets?q=${encodeURIComponent(q)}&${bq}`);
				if (res.ok) {
					const { sheets } = await res.json();
					searchResults = sheets.map(decorate);
				}
			} finally {
				searching = false;
			}
		}, 220);
	});

	// ── Todo filter: sheets missing required info (edit access only) ──────────
	let todo = $state(false);
	let todoSheets = $state(/** @type {any[]|null} */ (null));
	let todoLoading = $state(false);
	async function loadTodo() {
		if (todoSheets !== null) return;
		todoLoading = true;
		try {
			const res = await fetch(`/api/sheets?todo=1&${barredQ()}`);
			if (res.ok) { const { sheets } = await res.json(); todoSheets = sheets.map(decorate); }
		} finally { todoLoading = false; }
	}
	async function setTodo(on) {
		todo = on;
		if (on) { featuredOnly = false; f = blankFilter(); }
		if (on) await loadTodo();
	}
	const toggleTodo = () => setTodo(!todo);

	// ── Featured (★ starred for the webshop's "Featured Products") ─────────
	// Star state per sheet id, so a toggle shows everywhere the sheet appears.
	let starred = $state(/** @type {Record<string, boolean>} */ ({}));
	const isStarred = (sh) => starred[sh.id] ?? !!sh.featured_at;
	let featuredOnly = $state(false);
	let featuredSheets = $state(/** @type {any[]|null} */ (null));
	async function loadFeatured() {
		const res = await fetch(`/api/sheets?featured=1&${barredQ()}`);
		if (res.ok) featuredSheets = (await res.json()).sheets.map(decorate);
	}
	async function toggleFeaturedOnly() {
		featuredOnly = !featuredOnly;
		if (featuredOnly) {
			if (todo) setTodo(false);
			await loadFeatured();
		}
	}
	async function toggleStar(sh, ev) {
		ev.preventDefault(); ev.stopPropagation();
		const next = !isStarred(sh);
		starred[sh.id] = next; // optimistic
		try {
			const res = await fetch(`/api/sheets/${sh.id}/featured`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ featured: next }) });
			if (!res.ok) throw new Error();
		} catch { starred[sh.id] = !next; alert('Couldn’t update the star — try again.'); }
	}

	// ── Advanced filters (edit access): publisher, missing info, markets, dates ─
	const MISSING_OPTS = [['age', 'Age'], ['time', 'Time'], ['players', 'Players'], ['pieces', 'Pieces'], ['gametype', 'Game Type'], ['type', 'Type'], ['short', 'Short text'], ['bullets', 'Bullets'], ['long', 'Long text']];
	const MISSING_LABEL = Object.fromEntries(MISSING_OPTS);
	const MARKET_OPTS = MARKETS;
	const blankFilter = () => ({ pub: '', pubMode: 'mapped', missing: /** @type {string[]} */ ([]), missingMode: 'any', markets: /** @type {string[]} */ ([]), preorder: '', restock: '' });
	let filterOpen = $state(false);
	let f = $state(blankFilter());
	let filterOptions = $state(/** @type {{ publishers: string[] } | null} */ (null));
	let advResults = $state(/** @type {any[]|null} */ (null));
	let advLoading = $state(false);
	let advError = $state('');
	const advActive = $derived(!!(f.pub || f.missing.length || f.markets.length || f.preorder || f.restock));
	const advCount = $derived([f.pub, f.missing.length, f.markets.length, f.preorder, f.restock].filter(Boolean).length);
	const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

	async function openFilters() {
		filterOpen = !filterOpen;
		if (filterOpen && !filterOptions) {
			const res = await fetch('/api/sheets/filter?options=1');
			if (res.ok) filterOptions = await res.json();
		}
	}
	function clearFilters() { f = blankFilter(); }

	// Re-run the filter (debounced) whenever a filter, the search text or the
	// Featured toggle changes.
	let advTimer = /** @type {ReturnType<typeof setTimeout>|null} */ (null);
	let advSeq = 0;
	$effect(() => {
		const snap = JSON.stringify(f);
		const q = query.trim();
		const feat = featuredOnly;
		const hb = hideBarred;
		clearTimeout(advTimer ?? undefined);
		if (!advActive) { advResults = null; return; }
		if (todo) setTodo(false); // filters replace the Todo view
		advLoading = true;
		advTimer = setTimeout(async () => {
			const seq = ++advSeq;
			const p = new URLSearchParams({ pubMode: f.pubMode, missingMode: f.missingMode });
			if (f.pub) p.set('pub', f.pub);
			if (q) p.set('q', q);
			if (f.missing.length) p.set('missing', f.missing.join(','));
			if (f.markets.length) p.set('markets', f.markets.join(','));
			if (f.preorder) p.set('preorder', f.preorder);
			if (f.restock) p.set('restock', f.restock);
			if (feat) p.set('featured', '1');
			p.set('barred', hb ? '0' : '1');
			try {
				const res = await fetch(`/api/sheets/filter?${p}`);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const body = await res.json();
				if (seq === advSeq) { advResults = body.sheets.map(decorate); advError = ''; }
			} catch (e) { if (seq === advSeq) advError = 'Couldn’t apply the filters — try again.'; }
			finally { if (seq === advSeq) advLoading = false; }
		}, 250);
		void snap;
	});
	// ── Remember search + Featured + Todo + advanced filters per browser, so a
	// refresh or going into a sheet and back shows exactly the same list. ────
	const STATE_KEY = 'sheets.view.v2';
	let restored = false;
	onMount(() => {
		try {
			let saved = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
			if (!saved) {
				// Pick up the older per-filter keys once.
				const adv = JSON.parse(localStorage.getItem('sheets.filters.v1') || 'null');
				saved = { f: adv, todo: localStorage.getItem('sheets.todo.on') === '1' };
			}
			if (saved && typeof saved === 'object') {
				if (typeof saved.q === 'string') query = saved.q;
				if (saved.showBarred === true) hideBarred = false;
				if (canEdit && saved.f && typeof saved.f === 'object') {
					const nf = { ...blankFilter(), ...saved.f };
					// 'category' was split into 'gametype' + 'type'.
					if (Array.isArray(nf.missing) && nf.missing.includes('category')) nf.missing = [...nf.missing.filter((k) => k !== 'category'), 'gametype', 'type'];
					f = nf;
				}
				if (canEdit && saved.open) openFilters();
				if (saved.featured) { featuredOnly = true; loadFeatured(); }
				else if (canEdit && saved.todo && !advActive) { todo = true; loadTodo(); }
			}
		} catch { /* ignore */ }
		restored = true;
	});
	$effect(() => {
		const state = JSON.stringify({ q: query, featured: featuredOnly, todo, f, open: filterOpen, showBarred: !hideBarred });
		if (!restored) return;
		try { localStorage.setItem(STATE_KEY, state); } catch { /* ignore */ }
	});

	const anyActive = $derived(!!query.trim() || featuredOnly || todo || advActive || !hideBarred);
	function resetAll() {
		query = '';
		featuredOnly = false;
		todo = false;
		f = blankFilter();
		hideBarred = true;
	}

	const displayed = $derived.by(() => {
		if (advActive) return (advResults ?? []).filter((sh) => !featuredOnly || isStarred(sh));
		if (featuredOnly) {
			const base = (featuredSheets ?? []).filter(isStarred);
			const q = query.trim().toLowerCase();
			return q ? base.filter((s) => s.sku.toLowerCase().includes(q) || (s._display || '').toLowerCase().includes(q)) : base;
		}
		if (todo) {
			const base = todoSheets ?? [];
			const q = query.trim().toLowerCase();
			return q ? base.filter((s) => s.sku.toLowerCase().includes(q) || (s._display || '').toLowerCase().includes(q)) : base;
		}
		return query.trim() ? (searchResults ?? []) : loadedSheets;
	});
</script>

<svelte:head>
	<title>Sheets — Product Portal</title>
</svelte:head>


<div class="page">
	<AppNav active="sheets" user={data.user} />

	<main>
		<div class="page-header">
			<div class="title-row">
				<h1 class="page-title">Sheets</h1>
				<span class="total-badge">{totalCount} total</span>
			</div>
			<div class="header-right">
				{#if anyActive}
					<button class="btn-reset" onclick={resetAll} title="Clear search, Featured, Todo, Hide Barred and all filters">
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
						Reset all filters
					</button>
				{/if}
				<div class="search-wrap">
					<svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
					</svg>
					<input
						class="search-input"
						type="search"
						placeholder="Search SKU, EAN or name…"
						bind:value={query}
					/>
					{#if searching}
						<svg class="search-spinner" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
							<path d="M21 12a9 9 0 11-6.219-8.56"/>
						</svg>
					{/if}
				</div>
				{#if canEdit}
					<button class="btn-todo" class:on={advActive} class:open={filterOpen} onclick={openFilters} title="Filter by publisher, missing info, markets and dates" aria-expanded={filterOpen}>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18M6 12h12M10 19h4"/></svg>
						Filters{#if advCount}<span class="todo-n">{advCount}</span>{/if}
					</button>
				{/if}
				<label class="switch" title="Hide products barred in Rackbeat">
					<input type="checkbox" bind:checked={hideBarred} />
					<span class="track" aria-hidden="true"><span class="knob"></span></span>
					Hide Barred
				</label>
				{#if canEdit}
					<button class="btn-icon" class:on={todo} onclick={toggleTodo} title="Todo — only sheets missing short description, long description, bullets, or a box image (3D or flat front) — or whose 3D box photo is a legacy crop" aria-label="Todo" aria-pressed={todo}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
						</svg>
						{#if todo && todoSheets}<span class="todo-n">{displayed.length}</span>{/if}
					</button>
				{/if}
				<button class="btn-icon" class:on={featuredOnly} onclick={toggleFeaturedOnly} title="Featured — only products starred for the webshop" aria-label="Featured" aria-pressed={featuredOnly}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/></svg>
					{#if featuredOnly && featuredSheets}<span class="todo-n">{displayed.length}</span>{/if}
				</button>
				{#if canEdit}
					<a href="/sheet/new" class="btn-new icon" title="New Sheet" aria-label="New Sheet">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
							<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
						</svg>
					</a>
				{/if}
			</div>
		</div>

		{#if canEdit && filterOpen}
			<section class="filters" aria-label="Sheet filters">
				<div class="f-row">
					<div class="f-grp">
						<span class="f-lbl">Publisher</span>
						<select bind:value={f.pub} class="f-sel">
							<option value="">All publishers</option>
							{#each filterOptions?.publishers ?? [] as p}<option value={p}>{p}</option>{/each}
						</select>
						<div class="seg" role="group" aria-label="Publisher model">
							<button type="button" class:on={f.pubMode === 'mapped'} onclick={() => (f.pubMode = 'mapped')} title="Per-product mapping, falling back to the SKU prefix">Mapped</button>
							<button type="button" class:on={f.pubMode === 'sku'} onclick={() => (f.pubMode = 'sku')} title="By SKU prefix only">SKU</button>
						</div>
					</div>
					<div class="f-grp">
						<span class="f-lbl">Pre-order date</span>
						<div class="seg">{#each [['', 'Any'], ['yes', 'Has'], ['no', 'None']] as [v, l]}<button type="button" class:on={f.preorder === v} onclick={() => (f.preorder = v)}>{l}</button>{/each}</div>
					</div>
					<div class="f-grp">
						<span class="f-lbl">Restock date</span>
						<div class="seg">{#each [['', 'Any'], ['yes', 'Has'], ['no', 'None']] as [v, l]}<button type="button" class:on={f.restock === v} onclick={() => (f.restock = v)}>{l}</button>{/each}</div>
					</div>
				</div>
				<div class="f-row">
					<div class="f-grp wrap">
						<span class="f-lbl">Missing</span>
						{#each MISSING_OPTS as [k, l]}
							<button type="button" class="chip" class:on={f.missing.includes(k)} onclick={() => (f.missing = toggleIn(f.missing, k))}>{l}</button>
						{/each}
						{#if f.missing.length > 1}
							<div class="seg small" title="Missing any of the ticked items, or all of them">
								<button type="button" class:on={f.missingMode === 'any'} onclick={() => (f.missingMode = 'any')}>Any</button>
								<button type="button" class:on={f.missingMode === 'all'} onclick={() => (f.missingMode = 'all')}>All</button>
							</div>
						{/if}
					</div>
				</div>
				<div class="f-row">
					<div class="f-grp wrap">
						<span class="f-lbl">Webshop</span>
						{#each MARKET_OPTS as m}
							<button type="button" class="chip" class:on={f.markets.includes(m)} onclick={() => (f.markets = toggleIn(f.markets.filter((x) => x !== 'none'), m))}>{m}</button>
						{/each}
						<button type="button" class="chip warn" class:on={f.markets.includes('none')} onclick={() => (f.markets = f.markets.includes('none') ? [] : ['none'])} title="Published in no market at all">Not published</button>
						<span class="f-hint">{f.markets.includes('none') ? 'Products not published in any market' : f.markets.length ? `Published in ${f.markets.join(' or ')}` : 'Any'}</span>
					</div>
					<div class="f-end">
						{#if advActive}
							<span class="f-count">{advLoading ? 'Filtering…' : `${displayed.length} match${displayed.length === 1 ? '' : 'es'}`}</span>
							<button type="button" class="f-clear" onclick={clearFilters}>Clear filters</button>
						{/if}
					</div>
				</div>
				<p class="f-note">Search text above also narrows the filter (name or SKU). “Game Type” / “Type” = nothing selected in that category group. Texts and bullets are checked in the language of every market the sheet is published in (Denmark → Danish, Poland → Polish, Finland → Finnish, …); a sheet that is not published anywhere is checked in its primary language.</p>
			</section>
		{/if}

		{#if advActive && advError}
			<div class="no-results">{advError}</div>
		{:else if advActive && advResults === null}
			<div class="no-results">Filtering sheets…</div>
		{:else if advActive && displayed.length === 0}
			<div class="no-results">No sheets match these filters.</div>
		{:else if totalCount === 0}
			<div class="empty">
				<div class="empty-icon">
					<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
						<polyline points="14 2 14 8 20 8"/>
					</svg>
				</div>
				<p class="empty-title">No sales sheets yet</p>
				<p class="empty-sub">Create your first sheet to get started.</p>
				{#if canEdit}
					<a href="/sheet/new" class="btn-new">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
							<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
						</svg>
						New Sheet
					</a>
				{/if}
			</div>
		{:else if !advActive && featuredOnly && featuredSheets === null}
			<div class="no-results">Loading featured products…</div>
		{:else if !advActive && featuredOnly && displayed.length === 0}
			<div class="no-results">{query.trim() ? `No featured products match "${query}"` : 'No featured products yet — click the ☆ on a sheet to feature it in the webshop.'}</div>
		{:else if todo && todoLoading && todoSheets === null}
			<div class="no-results">Finding sheets that need work…</div>
		{:else if todo && displayed.length === 0}
			<div class="no-results">{query.trim() ? `No to-do sheets match "${query}"` : '🎉 Nothing to do — every sheet has age, time, players, a 3D box image, short description and bullets.'}</div>
		{:else if !advActive && !featuredOnly && !todo && query.trim() && searchResults !== null && searchResults.length === 0}
			<div class="no-results">No sheets match "<strong>{query}</strong>"</div>
		{:else if !advActive && !featuredOnly && !todo && query.trim() && searchResults === null}
			<!-- searching spinner state — grid already shows while debouncing -->
		{:else}
			<div class="grid">
				{#each displayed as sheet}
					<div class="card" class:featured={isStarred(sheet)}>
						{#if canEdit}
							<button class="star" class:on={isStarred(sheet)} onclick={(e) => toggleStar(sheet, e)}
								title={isStarred(sheet) ? 'Featured in the webshop — click to remove' : 'Feature in the webshop'} aria-pressed={isStarred(sheet)} aria-label="Featured">
								<svg width="17" height="17" viewBox="0 0 24 24" fill={isStarred(sheet) ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/></svg>
							</button>
						{:else if isStarred(sheet)}
							<span class="star on ro" title="Featured in the webshop"><svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/></svg></span>
						{/if}
						<a href={canEdit ? `/sheet/${sheet.id}` : `/sheet/${sheet.id}/preview`} class="card-thumb">
							{#if sheet.box_image_key}
								<img src="/api/img/{sheet.box_image_key}?size=300" alt={sheet._display ?? sheet.sku} />
							{:else}
								<div class="no-img">
									<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
										<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
										<polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
										<line x1="12" y1="22.08" x2="12" y2="12"/>
									</svg>
								</div>
							{/if}
						</a>

						<div class="card-body">
							<div class="card-meta">
								<span class="sku">{sheet.sku}</span>
								{#if sheet.rb_barred}<span class="barred" title="Barred in Rackbeat">Barred</span>{/if}
								<div class="lang-pills">
									{#each LANGS as lang}
										{@const status = langStatus(sheet, lang)}
										{#if status !== 'empty'}
											<span class="lang-pill lang-pill-{status}" title="{langShort(lang)}: {status}">
												{langShort(lang)}
											</span>
										{/if}
									{/each}
								</div>
							</div>
							<h2>{sheet._display || '(untitled)'}</h2>
							{#if advActive && sheet.missing}
								<div class="miss" title={sheet.missing.length ? 'Missing: ' + sheet.missing.map((k) => MISSING_LABEL[k]).join(', ') : 'Nothing missing'}>
									{#if sheet.missing.length}
										{#each sheet.missing as k}<span class="miss-chip" class:hit={f.missing.includes(k)}>{MISSING_LABEL[k]}</span>{/each}
									{:else}<span class="miss-ok">Complete</span>{/if}
								</div>
								<div class="mk">{sheet.publisher ?? '—'} · {sheet.markets?.length ? sheet.markets.join(' ') : 'Not published'}</div>
							{/if}
							<p class="date">
								{formatDate(sheet.updated_at)}
								{#if creatorName(sheet)}<span class="created-by">· {creatorName(sheet)}</span>{/if}
							</p>
						</div>

						<div class="card-footer">
							{#if canEdit}
								<a href="/sheet/{sheet.id}" class="action-btn" title="Edit">
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
										<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
										<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
									</svg>
									Edit
								</a>
							{/if}
							<a href="/sheet/{sheet.id}/preview" target="_blank" class="action-btn" title="View">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
									<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
									<polyline points="15 3 21 3 21 9"/>
									<line x1="10" y1="14" x2="21" y2="3"/>
								</svg>
								View
							</a>
							{#if relCount(sheet)}
								<button type="button" class="action-btn rel-btn" title="Relations" onclick={() => openRelations(sheet)}>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 10.9l7.4-3.7M8.3 13.1l7.4 3.7"/></svg>
									{relCount(sheet)}
								</button>
							{/if}
							{#if canEdit}
							<form method="POST" action="?/delete" use:enhance style="margin-left: auto">
								<input type="hidden" name="id" value={sheet.id} />
								<button
									type="submit"
									class="action-btn danger"
									title="Delete"
									onclick={(e) => { if (!confirm('Delete this sheet?')) e.preventDefault(); }}
								>
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
										<polyline points="3 6 5 6 21 6"/>
										<path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
										<path d="M10 11v6M14 11v6"/>
										<path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
									</svg>
								</button>
							</form>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			{#if hasMore}
				<div class="load-more-row">
					<button class="btn-load-more" onclick={loadMore} disabled={loadingMore}>
						{#if loadingMore}
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="animation: spin 0.7s linear infinite; flex-shrink:0">
								<path d="M21 12a9 9 0 11-6.219-8.56"/>
							</svg>
							Loading…
						{:else}
							Load more
							<span class="load-more-count">({totalCount - loadedSheets.length} remaining)</span>
						{/if}
					</button>
				</div>
			{/if}
		{/if}
	</main>
</div>

{#if relModal}
	<div class="rel-backdrop" onclick={() => (relModal = null)} role="presentation"></div>
	<div class="rel-modal" role="dialog" aria-modal="true" aria-label="Relations">
		<div class="rel-head">
			<div><h2>Relations</h2><p>{relModal.sheet._display || relModal.sheet.sku}</p></div>
			<button type="button" class="rel-x" aria-label="Close" onclick={() => (relModal = null)}>✕</button>
		</div>
		<div class="rel-body">
			{#if relModal.error}
				<p class="rel-msg">{relModal.error}</p>
			{:else if relModal.groups === null}
				<p class="rel-msg">Loading…</p>
			{:else if relModal.groups.length === 0}
				<p class="rel-msg">No relations.</p>
			{:else}
				{#each relModal.groups as g (g.key)}
					<div class="rel-group">
						<span class="rel-label">{g.label}</span>
						<ul>
							{#each g.items as r (r.sku)}
								<li>
									{#if r.sheet_id}<a href={canEdit ? `/sheet/${r.sheet_id}` : `/sheet/${r.sheet_id}/preview`}>{r.name ?? r.sku}</a>{:else}<span>{r.name ?? r.sku}</span>{/if}
									<span class="rel-sku">{r.sku}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			{/if}
		</div>
	</div>
{/if}

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	main {
		flex: 1;
		max-width: 1200px;
		margin: 0 auto;
		width: 100%;
		padding: 32px 28px 80px;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 24px;
		gap: 16px;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.page-title {
		font-size: 18px;
		font-weight: 700;
		color: #18181B;
		letter-spacing: -0.3px;
		flex-shrink: 0;
	}

	.total-badge {
		font-size: 12px;
		font-weight: 600;
		color: #A1A1AA;
		background: #F4F4F5;
		border-radius: 100px;
		padding: 2px 10px;
		flex-shrink: 0;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.search-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute;
		left: 10px;
		color: #A1A1AA;
		pointer-events: none;
		flex-shrink: 0;
	}

	.search-input {
		padding: 7px 12px 7px 32px;
		border: 1px solid var(--border);
		border-radius: 100px;
		font-size: 13px;
		font-family: inherit;
		color: #18181B;
		background: white;
		width: 240px;
		outline: none;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	.search-input:focus {
		border-color: #A1A1AA;
		box-shadow: 0 0 0 3px rgba(0,0,0,0.05);
	}

	.search-spinner {
		position: absolute;
		right: 10px;
		color: #A1A1AA;
		pointer-events: none;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	.no-results {
		padding: 60px 24px;
		text-align: center;
		font-size: 14px;
		color: #71717A;
	}

	.btn-new {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 7px 16px;
		background: #F57832;
		color: white;
		border-radius: 100px;
		font-size: 13px;
		font-weight: 600;
		text-decoration: none;
		border: none;
		transition: background 0.15s, transform 0.1s;
		letter-spacing: -0.1px;
	}
	.btn-new:hover { background: #E06820; }
	.btn-new:active { transform: scale(0.98); }

	.btn-todo {
		display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px;
		background: #fff; color: #52525B; border: 1px solid var(--border, #E4E4E7);
		border-radius: 100px; font-size: 13px; font-weight: 700; font-family: inherit;
		cursor: pointer; letter-spacing: -0.1px; white-space: nowrap;
	}
	.btn-todo:hover { border-color: #F57832; color: #B15A12; }
	.btn-todo.on { background: #F57832; border-color: #F57832; color: #fff; }
	.btn-todo.open:not(.on) { border-color: #F57832; color: #B15A12; }

	/* Icon-only toolbar buttons (Todo, Featured, New) */
	.btn-new.icon { padding: 0; width: 34px; height: 34px; justify-content: center; }
	.btn-icon {
		display: inline-flex; align-items: center; justify-content: center; gap: 5px;
		min-width: 34px; height: 34px; padding: 0 9px;
		background: #fff; color: #52525B; border: 1px solid var(--border, #E4E4E7);
		border-radius: 100px; font-size: 12px; font-weight: 700; font-family: inherit; cursor: pointer;
	}
	.btn-icon:hover { border-color: #F57832; color: #B15A12; }
	.btn-icon.on { background: #F57832; border-color: #F57832; color: #fff; }
	.btn-icon .todo-n { background: rgba(255,255,255,0.3); border-radius: 100px; font-size: 11px; font-weight: 800; padding: 0 6px; }

	/* Hide Barred on/off switch */
	.switch {
		display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px 7px 10px;
		background: #fff; border: 1px solid var(--border, #E4E4E7); border-radius: 100px;
		font-size: 13px; font-weight: 700; color: #52525B; cursor: pointer; white-space: nowrap; user-select: none; letter-spacing: -0.1px;
	}
	.switch:hover { border-color: #F57832; color: #B15A12; }
	.switch input { position: absolute; opacity: 0; width: 0; height: 0; }
	.switch .track { position: relative; width: 32px; height: 18px; border-radius: 100px; background: #D4D4D8; transition: background 0.15s; flex-shrink: 0; }
	.switch .knob { position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.2); transition: transform 0.15s; }
	.switch input:checked + .track { background: #F57832; }
	.switch input:checked + .track .knob { transform: translateX(14px); }
	.switch input:focus-visible + .track { outline: 2px solid #F57832; outline-offset: 2px; }

	.filters { background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 14px 16px 10px; margin: 0 0 18px; display: flex; flex-direction: column; gap: 12px; box-shadow: var(--shadow); }
	.f-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 22px; }
	.f-grp { display: flex; align-items: center; gap: 8px; }
	.f-grp.wrap { flex-wrap: wrap; }
	.f-lbl { font-size: 11.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; color: #A89C84; min-width: 62px; }
	.f-sel { font-family: inherit; font-size: 13px; font-weight: 600; color: #3F3A31; border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; background: #fff; max-width: 220px; }
	.seg { display: inline-flex; border: 1px solid var(--border); border-radius: 100px; overflow: hidden; }
	.seg button { border: none; background: #fff; color: #71717A; font-family: inherit; font-size: 12px; font-weight: 700; padding: 5px 11px; cursor: pointer; }
	.seg button.on { background: #F57832; color: #fff; }
	.seg.small button { padding: 4px 9px; font-size: 11.5px; }
	.chip { font-family: inherit; font-size: 12.5px; font-weight: 700; color: #6B6355; background: #FBF7EF; border: 1px solid #EDE6D6; border-radius: 100px; padding: 5px 11px; cursor: pointer; }
	.chip:hover { border-color: #F4CE7A; }
	.chip.on { background: #FFE6A5; border-color: #F4CE7A; color: #7B3803; }
	.chip.warn.on { background: #FDECEC; border-color: #F3B9B0; color: #A2301A; }
	.f-hint { font-size: 12px; color: #A89C84; font-weight: 600; }
	.f-end { margin-left: auto; display: flex; align-items: center; gap: 12px; }
	.f-count { font-size: 13px; font-weight: 700; color: #3F3A31; }
	.f-clear { font-family: inherit; font-size: 12.5px; font-weight: 700; color: #B15A12; background: none; border: none; cursor: pointer; text-decoration: underline; }
	.f-note { margin: 0; font-size: 11.5px; color: #A89C84; }
	.miss { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 2px; }
	.miss-chip { font-size: 10.5px; font-weight: 700; color: #8A7E68; background: #F4EFE4; border-radius: 100px; padding: 1px 7px; }
	.miss-chip.hit { background: #FDECEC; color: #A2301A; }
	.miss-ok { font-size: 10.5px; font-weight: 700; color: #16794C; background: #EAF7EF; border-radius: 100px; padding: 1px 7px; }
	.mk { font-size: 11px; color: #A89C84; font-weight: 600; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.btn-reset {
		display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px;
		background: #FDECEC; color: #A2301A; border: 1px solid #F3B9B0;
		border-radius: 100px; font-size: 13px; font-weight: 700; font-family: inherit;
		cursor: pointer; white-space: nowrap;
	}
	.btn-reset:hover { background: #FBD9D4; border-color: #E89A8E; }
	.btn-todo .todo-n { background: rgba(255,255,255,0.3); border-radius: 100px; font-size: 11px; font-weight: 800; padding: 0 7px; }

	/* ── Empty state ─────────────────────────────────────────────────────── */
	.empty {
		text-align: center;
		padding: 100px 24px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}

	.empty-icon {
		width: 56px;
		height: 56px;
		background: white;
		border: 1px solid var(--border);
		border-radius: 14px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #A1A1AA;
		margin-bottom: 4px;
	}

	.empty-title { font-size: 16px; font-weight: 700; color: #18181B; }
	.empty-sub { font-size: 14px; color: #71717A; margin-bottom: 4px; }

	/* ── Cards grid ──────────────────────────────────────────────────────── */
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(272px, 1fr));
		gap: 18px;
	}

	.card {
		position: relative;
		background: white;
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		transition: box-shadow 0.2s, transform 0.15s;
	}
	.card:hover {
		box-shadow: var(--shadow-lg);
		transform: translateY(-1px);
	}

	.star { position: absolute; top: 8px; right: 8px; z-index: 2; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; border: 1px solid var(--border); background: rgba(255,255,255,.92); color: #B8AE9C; cursor: pointer; padding: 0; opacity: 0; transition: opacity .12s, color .12s, transform .12s; }
	.card:hover .star, .star:focus-visible, .star.on { opacity: 1; }
	.star:hover { color: #E0A21B; transform: scale(1.08); }
	.star.on { color: #E8A317; border-color: #F4D58A; background: #FFF8E1; }
	.star.ro { cursor: default; }
	@media (hover: none) { .star { opacity: 1; } }

	.card-thumb {
		display: block;
		height: 176px;
		background: white;
		overflow: hidden;
		text-decoration: none;
		border-bottom: 1px solid var(--border);
	}

	.card-thumb img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		padding: 20px;
		transition: transform 0.2s;
	}
	.card:hover .card-thumb img { transform: scale(1.03); }

	.no-img {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #D4CFC5;
	}

	.card-body {
		padding: 14px 18px 10px;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.card-meta {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-bottom: 2px;
	}

	.barred { font-size: 10px; font-weight: 700; color: #B91C1C; background: #FEE2E2; border-radius: 4px; padding: 1px 6px; white-space: nowrap; }
	.sku {
		font-size: 11px;
		font-weight: 600;
		color: #71717A;
		letter-spacing: 0.4px;
		text-transform: uppercase;
	}

	.lang-pills {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}

	.lang-pill {
		font-size: 10px;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 100px;
		letter-spacing: 0.3px;
	}

	.lang-pill-complete  { background: #DCFCE7; color: #15803D; }
	.lang-pill-partial   { background: #F4F4F5; color: #71717A; }

	h2 {
		font-size: 15px;
		font-weight: 700;
		color: #18181B;
		line-height: 1.3;
		letter-spacing: -0.2px;
	}

	.date {
		font-size: 11.5px;
		color: #A1A1AA;
		font-weight: 500;
		margin-top: 1px;
	}
	.created-by { color: #C4B99A; }

	.card-footer {
		padding: 10px 14px 12px;
		display: flex;
		gap: 4px;
		align-items: center;
		border-top: 1px solid var(--border);
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 10px;
		border-radius: 7px;
		font-size: 12px;
		font-weight: 600;
		color: #52525B;
		background: none;
		border: none;
		text-decoration: none;
		transition: background 0.15s, color 0.15s;
	}
	.action-btn:hover { background: #F4F4F5; color: #18181B; }
	.action-btn.danger { color: #A1A1AA; }
	.rel-btn { cursor: pointer; font-family: inherit; font-variant-numeric: tabular-nums; color: #B4541A; }
	.rel-btn:hover { background: #FFF4EC; color: #F57832; }

	.rel-backdrop { position: fixed; inset: 0; background: rgba(40,25,0,0.35); z-index: 300; }
	.rel-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 310; width: min(460px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; background: #fff; border-radius: 16px; box-shadow: 0 24px 60px rgba(50,30,0,0.28); }
	.rel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--border); }
	.rel-head h2 { font-size: 15px; font-weight: 800; margin: 0; color: #18181B; }
	.rel-head p { font-size: 12.5px; color: #A89060; margin: 2px 0 0; font-weight: 600; }
	.rel-x { border: 0; background: none; font-size: 16px; cursor: pointer; color: #A1A1AA; }
	.rel-body { padding: 8px 20px 16px; }
	.rel-msg { font-size: 13px; color: #A1A1AA; margin: 10px 0; }
	.rel-group { padding: 10px 0; border-bottom: 1px solid #F5EDD8; }
	.rel-group:last-child { border-bottom: none; }
	.rel-label { font-size: 11px; font-weight: 800; color: #8a7550; }
	.rel-group ul { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
	.rel-group li { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; font-size: 13.5px; }
	.rel-group li a { color: #18181B; font-weight: 600; text-decoration: none; }
	.rel-group li a:hover { color: #F57832; }
	.rel-sku { font-size: 11.5px; color: #A1A1AA; white-space: nowrap; }
	.action-btn.danger:hover { background: #FEF2F2; color: var(--danger); }

	/* ── Load more ───────────────────────────────────────────────────────── */
	.load-more-row {
		display: flex;
		justify-content: center;
		margin-top: 32px;
	}

	.btn-load-more {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 9px 24px;
		background: white;
		border: 1px solid var(--border);
		border-radius: 100px;
		font-size: 13px;
		font-weight: 600;
		color: #52525B;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
		box-shadow: var(--shadow);
	}
	.btn-load-more:hover:not(:disabled) { background: #F4F4F5; color: #18181B; border-color: #D4D4D8; }
	.btn-load-more:disabled { opacity: 0.65; cursor: default; }

	.load-more-count {
		font-weight: 500;
		color: #A1A1AA;
	}
</style>
