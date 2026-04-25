<script>
	import SheetCanvas from '$lib/components/SheetCanvas.svelte';

	let { data } = $props();

	let language = $state(data.language);
	let translations = $state(data.translations);
	let baseTranslations = $state(data.baseTranslations);
	let saveStatus = $state('saved');
	let saveTimer = null;

	async function switchLanguage(code) {
		if (code === language) return;
		language = code;
		const [curRes, baseRes] = await Promise.all([
			fetch(`/api/sheets/${data.sheet.id}?lang=${code}`),
			fetch(`/api/sheets/${data.sheet.id}?lang=${data.primaryLanguage}`)
		]);
		if (curRes.ok) translations = await curRes.json();
		if (baseRes.ok) baseTranslations = await baseRes.json();
	}

	function handleChange(event) {
		saveStatus = 'saving';
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => { saveStatus = 'saved'; }, 1500);
		if (language === data.primaryLanguage && event?.type === 'translation') {
			baseTranslations = { ...baseTranslations, [event.key]: event.value };
		}
	}

	const statusLabel = $derived(
		saveStatus === 'saving' ? 'Saving…' : 'Saved'
	);

	let canvas = $state(null);

	let hiddenElements = $state(JSON.parse(data.sheet.hidden_elements || '{}'));
	let globalLabels = $state(data.globalLabels);
	let selectedCtaVersionId = $state(data.sheet.cta_version_id ?? null);

	async function toggleElement(key) {
		hiddenElements[key] = !hiddenElements[key];
		await fetch(`/api/sheets/${data.sheet.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'sheet', field: 'hidden_elements', value: JSON.stringify(hiddenElements) })
		});
	}

	async function selectCtaVersion(id) {
		selectedCtaVersionId = id;
		// Update globalLabels.cta reactively
		if (id) {
			const version = data.ctaVersions.find(v => v.id === id);
			globalLabels = { ...globalLabels, cta: version?.translations ?? {} };
		} else {
			const { cta: _, ...rest } = globalLabels;
			globalLabels = rest;
		}
		await fetch(`/api/sheets/${data.sheet.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'sheet', field: 'cta_version_id', value: id })
		});
	}

	const TOGGLES = [
		{ key: 'cta',         label: 'CTA' },
		{ key: 'stock_date',  label: 'Stock Date' },
		{ key: 'description', label: 'Description' },
		{ key: 'bullets',     label: 'Bullets' },
		{ key: 'badges',      label: 'ATA Icons' },
		{ key: 'data',        label: 'Data table' },
	];

	let ctaOpen = $state(false);
	let visibilityOpen = $state(false);
</script>

<div class="editor-page">
	<div class="toolbar">
		<div class="toolbar-left">
			<a href="/" class="back-link">
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="15 18 9 12 15 6"/>
				</svg>
				All sheets
			</a>
			<span class="divider"></span>
			<span class="sheet-sku">{data.sheet.sku}</span>
		</div>

		<div class="lang-tabs">
			{#each [...data.languages].sort((a, b) => (b.code === data.primaryLanguage ? 1 : 0) - (a.code === data.primaryLanguage ? 1 : 0)) as lang}
				<button
					class="lang-tab"
					class:active={language === lang.code}
					class:primary={lang.code === data.primaryLanguage}
					onclick={() => switchLanguage(lang.code)}
				>
					{lang.label}
					{#if lang.code === data.primaryLanguage}
						<span class="primary-badge">Primary</span>
					{/if}
				</button>
			{/each}
		</div>

		<div class="toolbar-right">
			<div class="save-indicator" class:saving={saveStatus === 'saving'}>
				<span class="save-dot"></span>
				{statusLabel}
			</div>
			<a href="/sheet/{data.sheet.id}/preview?lang={language}" target="_blank" class="btn-preview">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
					<polyline points="15 3 21 3 21 9"/>
					<line x1="10" y1="14" x2="21" y2="3"/>
				</svg>
				Preview
			</a>
		</div>
	</div>

	<div class="canvas-wrap">
		<SheetCanvas
			bind:this={canvas}
			sheetId={data.sheet.id}
			sheet={data.sheet}
			{translations}
			{baseTranslations}
			primaryLanguage={data.primaryLanguage}
			images={data.images}
			{language}
			editable={true}
			onchange={handleChange}
			{globalLabels}
		{hiddenElements}
		/>
	</div>

	<!-- Floating action panel -->
	<div class="action-panel">
		<button class="panel-btn" onclick={() => canvas?.addUspFromPanel()} title="Add bullet point">
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
				<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
			</svg>
			Add bullet
		</button>
		<div class="panel-divider"></div>
		<button class="panel-btn" onclick={() => canvas?.triggerPhotoUpload()} title="Add grid photo">
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="3" width="18" height="18" rx="2"/>
				<circle cx="8.5" cy="8.5" r="1.5"/>
				<polyline points="21 15 16 10 5 21"/>
			</svg>
			Add photo
		</button>
		<div class="panel-divider"></div>
		<button class="panel-btn visibility-toggle-btn" onclick={() => ctaOpen = !ctaOpen}>
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
			</svg>
			CTA
			<svg class="chevron" class:open={ctaOpen} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="6 9 12 15 18 9"/>
			</svg>
		</button>
		{#if ctaOpen}
			{#each data.ctaVersions as v}
				<button class="panel-btn cta-opt" class:cta-active={selectedCtaVersionId === v.id} onclick={() => selectCtaVersion(v.id)}>
					{v.name}
				</button>
			{/each}
		{/if}
		<div class="panel-divider"></div>
		<button class="panel-btn visibility-toggle-btn" onclick={() => visibilityOpen = !visibilityOpen}>
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
				<circle cx="12" cy="12" r="3"/>
			</svg>
			Visibility
			<svg class="chevron" class:open={visibilityOpen} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="6 9 12 15 18 9"/>
			</svg>
		</button>
		{#if visibilityOpen}
			{#each TOGGLES as t}
				<button
					class="panel-btn toggle-btn"
					class:hidden={hiddenElements[t.key]}
					onclick={() => toggleElement(t.key)}
					title="{hiddenElements[t.key] ? 'Show' : 'Hide'} {t.label}"
				>
					{#if hiddenElements[t.key]}
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
							<path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
							<line x1="1" y1="1" x2="23" y2="23"/>
						</svg>
					{:else}
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
							<circle cx="12" cy="12" r="3"/>
						</svg>
					{/if}
					{t.label}
				</button>
			{/each}
		{/if}
	</div>
</div>

<style>
	.editor-page { min-height: 100vh; display: flex; flex-direction: column; }

	/* ── Toolbar ─────────────────────────────────────────────────────────── */
	.toolbar {
		background: white;
		border-bottom: 1px solid var(--border);
		padding: 0 20px;
		height: 52px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		position: sticky;
		top: 0;
		z-index: 100;
	}

	.toolbar-left {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 160px;
	}

	.back-link {
		display: flex;
		align-items: center;
		gap: 3px;
		font-size: 13px;
		font-weight: 600;
		color: #71717A;
		text-decoration: none;
		transition: color 0.15s;
	}
	.back-link:hover { color: #18181B; }

	.divider {
		width: 1px;
		height: 16px;
		background: var(--border);
	}

	.sheet-sku {
		font-size: 12px;
		font-weight: 700;
		color: #52525B;
		background: #F4F4F5;
		padding: 3px 9px;
		border-radius: 100px;
		letter-spacing: 0.3px;
		text-transform: uppercase;
	}

	/* ── Language tabs ───────────────────────────────────────────────────── */
	.lang-tabs {
		display: flex;
		gap: 2px;
		background: #F4F4F5;
		border-radius: 9px;
		padding: 3px;
	}

	.lang-tab {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 4px 13px;
		border: none;
		background: none;
		border-radius: 7px;
		font-size: 12.5px;
		font-weight: 600;
		color: #71717A;
		transition: background 0.15s, color 0.15s;
		white-space: nowrap;
	}
	.lang-tab:hover:not(.active) { color: #3F3F46; }
	.lang-tab.active {
		background: white;
		color: #18181B;
		box-shadow: 0 1px 3px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04);
	}

	.primary-badge {
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0.3px;
		text-transform: uppercase;
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		border-radius: 4px;
		padding: 1px 5px;
		flex-shrink: 0;
	}

	.lang-tab.active .primary-badge {
		color: var(--accent);
	}

	/* ── Toolbar right ───────────────────────────────────────────────────── */
	.toolbar-right {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 180px;
		justify-content: flex-end;
	}

	.save-indicator {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 500;
		color: #A1A1AA;
	}

	.save-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #A3E635;
		transition: background 0.3s;
	}

	.save-indicator.saving .save-dot {
		background: #FCD34D;
		animation: pulse 1s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.btn-preview {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		background: #F57832;
		color: white;
		border-radius: 100px;
		font-size: 12.5px;
		font-weight: 600;
		text-decoration: none;
		transition: background 0.15s, transform 0.1s;
		letter-spacing: -0.1px;
		box-shadow: 0 2px 10px rgba(245, 120, 50, 0.35);
	}
	.btn-preview:hover { background: #E06820; }
	.btn-preview:active { transform: scale(0.97); }

	/* ── Canvas wrap ─────────────────────────────────────────────────────── */
	.canvas-wrap {
		flex: 1;
		display: flex;
		justify-content: center;
		padding: 40px 24px 80px;
		overflow-x: auto;
	}

	/* ── Floating action panel ───────────────────────────────────────────── */
	.action-panel {
		position: fixed;
		right: 28px;
		top: 50%;
		transform: translateY(-50%);
		background: white;
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 6px;
		box-shadow: 0 4px 20px rgba(50, 30, 0, 0.10);
		display: flex;
		flex-direction: column;
		gap: 2px;
		z-index: 50;
		width: 180px;
	}

	.panel-btn {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 8px 12px;
		border-radius: 9px;
		background: none;
		border: none;
		font-size: 12.5px;
		font-weight: 600;
		color: #52525B;
		white-space: nowrap;
		transition: background 0.15s, color 0.15s;
		text-align: left;
	}
	.panel-btn:hover { background: #F4F4F5; color: #18181B; }
	.panel-btn svg { flex-shrink: 0; color: #71717A; }
	.panel-btn:hover svg { color: #18181B; }

	.panel-divider {
		height: 1px;
		background: var(--border);
		margin: 2px 4px;
	}

	.visibility-toggle-btn {
		color: #52525B;
		font-weight: 600;
		justify-content: flex-start;
	}
	.visibility-toggle-btn:hover { background: #F4F4F5; color: #18181B; }
	.visibility-toggle-btn .chevron {
		margin-left: auto;
		transition: transform 0.18s;
	}
	.visibility-toggle-btn .chevron.open { transform: rotate(180deg); }

	.toggle-btn { color: #52525B; padding-left: 24px; }
	.toggle-btn.hidden { color: #A1A1AA; }
	.toggle-btn.hidden svg { opacity: 0.5; }
	.toggle-btn:hover { background: #F4F4F5; color: #18181B; }
	.toggle-btn.hidden:hover { color: #52525B; }

	.panel-section-label { font-size: 10px; font-weight: 700; color: #A1A1AA; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 12px 2px; }
	.cta-opt { color: #52525B; }
	.cta-opt.cta-active { color: #148246; font-weight: 700; background: #F0FDF4; }
	.cta-opt:hover { background: #F4F4F5; color: #18181B; }
	.cta-opt.cta-active:hover { background: #DCFCE7; }
</style>
