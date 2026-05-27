<script>
	import { enhance } from '$app/forms';
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	const PAGE_SIZE = 30;

	function formatDate(ts) {
		return new Date(ts * 1000).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	const LANGS = ['en', 'da', 'sv', 'no'];

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
			_display: sheet.name_en || sheet.name_da || sheet.name_sv || sheet.name_no || '',
		};
	}

	// ── Paginated sheets list ─────────────────────────────────────────────
	let loadedSheets = $state(data.sheets.map(decorate));
	let totalCount   = $state(data.totalCount);
	let loadingMore  = $state(false);
	const hasMore    = $derived(!query.trim() && loadedSheets.length < totalCount);

	async function loadMore() {
		if (loadingMore) return;
		loadingMore = true;
		try {
			const res = await fetch(`/api/sheets?offset=${loadedSheets.length}`);
			if (res.ok) {
				const { sheets } = await res.json();
				loadedSheets = [...loadedSheets, ...sheets.map(decorate)];
			}
		} finally {
			loadingMore = false;
		}
	}

	// ── Search (server-side so it spans ALL sheets) ───────────────────────
	let query        = $state('');
	let searchResults = $state(/** @type {any[]|null} */ (null));
	let searching    = $state(false);
	let searchTimer  = /** @type {ReturnType<typeof setTimeout>|null} */ (null);

	$effect(() => {
		const q = query.trim();
		clearTimeout(searchTimer ?? undefined);
		if (!q) {
			searchResults = null;
			return;
		}
		searching = true;
		searchTimer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/sheets?q=${encodeURIComponent(q)}`);
				if (res.ok) {
					const { sheets } = await res.json();
					searchResults = sheets.map(decorate);
				}
			} finally {
				searching = false;
			}
		}, 220);
	});

	const displayed = $derived(query.trim() ? (searchResults ?? []) : loadedSheets);
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
				<a href="/sheet/new" class="btn-new">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
						<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
					</svg>
					New Sheet
				</a>
			</div>
		</div>

		{#if totalCount === 0}
			<div class="empty">
				<div class="empty-icon">
					<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
						<polyline points="14 2 14 8 20 8"/>
					</svg>
				</div>
				<p class="empty-title">No sales sheets yet</p>
				<p class="empty-sub">Create your first sheet to get started.</p>
				<a href="/sheet/new" class="btn-new">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
						<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
					</svg>
					New Sheet
				</a>
			</div>
		{:else if query.trim() && searchResults !== null && searchResults.length === 0}
			<div class="no-results">No sheets match "<strong>{query}</strong>"</div>
		{:else if query.trim() && searchResults === null}
			<!-- searching spinner state — grid already shows while debouncing -->
		{:else}
			<div class="grid">
				{#each displayed as sheet}
					<div class="card">
						<a href="/sheet/{sheet.id}" class="card-thumb">
							{#if sheet.box_image_key}
								<img src="/api/img/{sheet.box_image_key}" alt={sheet._display ?? sheet.sku} />
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
								<div class="lang-pills">
									{#each LANGS as lang}
										{@const status = langStatus(sheet, lang)}
										{#if status !== 'empty'}
											<span class="lang-pill lang-pill-{status}" title="{lang.toUpperCase()}: {status}">
												{lang.toUpperCase()}
											</span>
										{/if}
									{/each}
								</div>
							</div>
							<h2>{sheet._display || '(untitled)'}</h2>
							<p class="date">
								{formatDate(sheet.updated_at)}
								{#if creatorName(sheet)}<span class="created-by">· {creatorName(sheet)}</span>{/if}
							</p>
						</div>

						<div class="card-footer">
							<a href="/sheet/{sheet.id}" class="action-btn" title="Edit">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
									<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
									<path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
								</svg>
								Edit
							</a>
							<a href="/sheet/{sheet.id}/preview" target="_blank" class="action-btn" title="Preview">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
									<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
									<polyline points="15 3 21 3 21 9"/>
									<line x1="10" y1="14" x2="21" y2="3"/>
								</svg>
								Preview
							</a>
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

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	main {
		flex: 1;
		max-width: 1140px;
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
	.search-input::placeholder { color: #A1A1AA; }
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
