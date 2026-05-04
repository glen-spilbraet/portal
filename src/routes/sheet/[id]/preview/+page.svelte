<script>
	import SheetCanvas from '$lib/components/SheetCanvas.svelte';
	let { data } = $props();

	let language = $state(data.language);
	let translations = $state(data.translations);
	let downloading = $state(false);

	async function switchLanguage(code) {
		language = code;
		const res = await fetch(`/api/sheets/${data.sheet.id}?lang=${code}`);
		if (res.ok) translations = await res.json();
		const url = new URL(window.location.href);
		url.searchParams.set('lang', code);
		window.history.replaceState({}, '', url.toString());
	}

	async function downloadPdf() {
		downloading = true;
		try {
			const res = await fetch(`/api/sheets/${data.sheet.id}/pdf?lang=${language}`);
			if (!res.ok) throw new Error('PDF generation failed');
			const blob = await res.blob();
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = `sheet-${data.sheet.id}-${language}.pdf`;
			a.click();
			URL.revokeObjectURL(a.href);
		} catch (e) {
			alert('PDF generation failed. Please try again.');
		} finally {
			downloading = false;
		}
	}
</script>

<div class="preview-page">
	<div class="topbar no-print">
		<div class="topbar-left">
			<a href="/sheet/{data.sheet.id}" class="back-link">
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="15 18 9 12 15 6"/>
				</svg>
				Edit
			</a>
			<span class="divider"></span>
			<div class="lang-tabs">
				{#each data.languages as lang}
					<button
						class="lang-tab"
						class:active={language === lang.code}
						onclick={() => switchLanguage(lang.code)}
					>
						{lang.label}
					</button>
				{/each}
			</div>
		</div>

		<button class="btn-print" onclick={downloadPdf} disabled={downloading}>
			{#if downloading}
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="spin">
					<path d="M21 12a9 9 0 11-6.219-8.56"/>
				</svg>
				Exporting PDF…
			{:else}
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
					<polyline points="7 10 12 15 17 10"/>
					<line x1="12" y1="15" x2="12" y2="3"/>
				</svg>
				Download PDF
			{/if}
		</button>
	</div>

	<div class="sheet-wrap">
		<SheetCanvas
			sheetId={data.sheet.id}
			sheet={data.sheet}
			{translations}
			baseTranslations={data.baseTranslations}
			primaryLanguage={data.primaryLanguage}
			images={data.images}
			{language}
			editable={false}
			globalLabels={data.globalLabels}
		hiddenElements={JSON.parse(data.sheet.hidden_elements || '{}')}
		/>
	</div>
</div>

<style>
	.preview-page { min-height: 100vh; background: #F5F2EC; }

	/* ── Topbar ──────────────────────────────────────────────────────────── */
	.topbar {
		background: white;
		border-bottom: 1px solid var(--border);
		padding: 0 20px;
		height: 52px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.topbar-left { display: flex; align-items: center; gap: 10px; }

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

	/* ── Language tabs ───────────────────────────────────────────────────── */
	.lang-tabs {
		display: flex;
		gap: 2px;
		background: #F4F4F5;
		border-radius: 9px;
		padding: 3px;
	}

	.lang-tab {
		padding: 4px 13px;
		border: none;
		background: none;
		border-radius: 7px;
		font-size: 12.5px;
		font-weight: 600;
		color: #71717A;
		transition: background 0.15s, color 0.15s;
	}
	.lang-tab:hover:not(.active) { color: #3F3F46; }
	.lang-tab.active {
		background: white;
		color: #18181B;
		box-shadow: 0 1px 3px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04);
	}

	/* ── Print button ────────────────────────────────────────────────────── */
	.btn-print {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		padding: 6px 16px;
		background: #F57832;
		color: white;
		border: none;
		border-radius: 100px;
		font-size: 12.5px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s, transform 0.1s;
		letter-spacing: -0.1px;
		min-width: 140px;
		box-shadow: 0 2px 10px rgba(245, 120, 50, 0.35);
	}
	.btn-print:hover:not(:disabled) { background: #E06820; }
	.btn-print:active:not(:disabled) { transform: scale(0.97); }
	.btn-print:disabled { opacity: 0.7; cursor: not-allowed; }
	.spin { animation: spin 0.8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.sheet-wrap { display: flex; justify-content: center; padding: 40px 24px 80px; }

	@page {
		size: A4 portrait;
		margin: 0;
	}

	@media print {
		:global(html, body) { margin: 0; padding: 0; background: #FFF5D2; }
		.no-print { display: none !important; }
		.preview-page { background: #FFF5D2; }
		.sheet-wrap { padding: 0; margin: 0; }
		:global(.sheet) {
			box-shadow: none !important;
			width: 210mm !important;
			height: 297mm !important;
			min-height: unset !important;
			overflow: hidden !important;
			margin: 0 !important;
			page-break-after: avoid;
		}
		:global(.sheet .bottom) {
			min-height: unset !important;
			overflow: hidden !important;
		}
		:global(.sheet .cell),
		:global(.sheet .cell img),
		:global(.sheet .grid),
		:global(.sheet .grid-wrap) {
			min-height: unset !important;
			overflow: hidden !important;
		}

		/* Ensure background colours and images print */
		* {
			-webkit-print-color-adjust: exact;
			print-color-adjust: exact;
		}

		/* Remove box-shadows — Chrome PDF renderer renders them as grey filled boxes */
		:global(.sheet .box-area),
		:global(.sheet .data-bottom),
		:global(.sheet .stock-tag) {
			box-shadow: none !important;
		}
	}
</style>
