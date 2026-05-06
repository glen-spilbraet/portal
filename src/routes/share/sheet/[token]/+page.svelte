<script>
	import SheetCanvas from '$lib/components/SheetCanvas.svelte';
	let { data } = $props();

	let language = $state(data.language);
	let translations = $state(data.translations);

	async function switchLanguage(code) {
		language = code;
		const res = await fetch(`/api/sheets/${data.sheet.id}?lang=${code}`);
		if (res.ok) translations = await res.json();
		const url = new URL(window.location.href);
		url.searchParams.set('lang', code);
		window.history.replaceState({}, '', url.toString());
	}

	let downloading = $state(false);
	async function downloadPdf() {
		downloading = true;
		try {
			const res = await fetch(`/api/sheets/${data.sheet.id}/pdf?lang=${language}`);
			if (!res.ok) throw new Error();
			const blob = await res.blob();
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = `${data.sheet.sku}-${language}.pdf`;
			a.click();
			URL.revokeObjectURL(a.href);
		} catch {
			alert('PDF export failed. Please try again.');
		} finally {
			downloading = false;
		}
	}
</script>

<svelte:head>
	<title>{data.sheet.sku} — Sales Sheet</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="share-page">
	<div class="topbar no-print">
		<div class="topbar-left">
			<img src="/logo-da.svg" alt="Logo" class="logo" />
			{#if data.languages.length > 1}
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
			{/if}
		</div>

		<button class="btn-pdf" onclick={downloadPdf} disabled={downloading}>
			{#if downloading}
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="spin">
					<path d="M21 12a9 9 0 11-6.219-8.56"/>
				</svg>
				Exporting…
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
			salesPrices={data.salesPrices}
		/>
	</div>
</div>

<style>
	.share-page { min-height: 100vh; background: #F5F2EC; }

	.topbar {
		background: white;
		border-bottom: 1px solid var(--border);
		padding: 0 24px;
		height: 52px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	.topbar-left { display: flex; align-items: center; gap: 12px; }

	.logo { height: 26px; width: auto; display: block; }

	.divider { width: 1px; height: 18px; background: var(--border); }

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
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.lang-tab:hover:not(.active) { color: #3F3F46; }
	.lang-tab.active {
		background: white;
		color: #18181B;
		box-shadow: 0 1px 3px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.04);
	}

	.btn-pdf {
		display: inline-flex;
		align-items: center;
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
		justify-content: center;
		box-shadow: 0 2px 10px rgba(245, 120, 50, 0.35);
	}
	.btn-pdf:hover:not(:disabled) { background: #E06820; }
	.btn-pdf:active:not(:disabled) { transform: scale(0.97); }
	.btn-pdf:disabled { opacity: 0.7; cursor: not-allowed; }

	.sheet-wrap { display: flex; justify-content: center; padding: 40px 24px 80px; }

	@keyframes spin { to { transform: rotate(360deg); } }
	.spin { animation: spin 0.8s linear infinite; }

	@page { size: A4 portrait; margin: 0; }

	@media print {
		:global(html, body) { margin: 0; padding: 0; background: #FFF5D2; }
		.no-print { display: none !important; }
		.share-page { background: #FFF5D2; }
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
		:global(.sheet .bottom) { min-height: unset !important; overflow: hidden !important; }
		:global(.sheet .cell), :global(.sheet .cell img),
		:global(.sheet .grid), :global(.sheet .grid-wrap) {
			min-height: unset !important; overflow: hidden !important;
		}
		* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
		:global(.sheet .box-area), :global(.sheet .data-bottom), :global(.sheet .stock-tag) {
			box-shadow: none !important;
		}
	}
</style>
