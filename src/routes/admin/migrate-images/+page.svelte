<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	// ── Resize helpers ────────────────────────────────────────────────────
	function resizeToBlob(blob, maxSize) {
		return new Promise((resolve) => {
			const img = new Image();
			const objectUrl = URL.createObjectURL(blob);
			img.onload = () => {
				URL.revokeObjectURL(objectUrl);
				const scale = Math.min(1, maxSize / img.naturalWidth, maxSize / img.naturalHeight);
				const w = Math.round(img.naturalWidth  * scale);
				const h = Math.round(img.naturalHeight * scale);
				const canvas = document.createElement('canvas');
				canvas.width  = w;
				canvas.height = h;
				canvas.getContext('2d').drawImage(img, 0, 0, w, h);
				canvas.toBlob(resolve, 'image/webp', 0.88);
			};
			img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null); };
			img.src = objectUrl;
		});
	}

	function mkVariantKey(originalKey, size) {
		const lastSlash = originalKey.lastIndexOf('/');
		const lastDot   = originalKey.lastIndexOf('.');
		return lastDot > lastSlash
			? originalKey.slice(0, lastDot) + `_${size}.webp`
			: originalKey + `_${size}.webp`;
	}

	/** Fetch with an AbortController timeout (ms). */
	function fetchWithTimeout(url, opts = {}, ms = 30_000) {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), ms);
		return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
	}

	/** Wrap a promise with a timeout that rejects with a descriptive error. */
	function withTimeout(promise, ms, label) {
		return Promise.race([
			promise,
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error(`${label} timed out`)), ms)
			)
		]);
	}

	/**
	 * Migrate a single item: fetch original, resize to each size, upload variant.
	 * Updates `statusMap[item.id]` in place.
	 */
	async function migrateItem(item, sizes, uploadUrl, statusMap) {
		statusMap[item.id] = { status: 'running' };
		try {
			const imgRes = await fetchWithTimeout(`/api/img/${item.image_key}`, {}, 30_000);
			if (!imgRes.ok) throw new Error(`Fetch failed: HTTP ${imgRes.status}`);
			const originalBlob = await imgRes.blob();

			const uploaded = [];
			for (const size of sizes) {
				const vKey = mkVariantKey(item.image_key, size);

				// Skip if variant already exists
				const checkRes = await fetchWithTimeout(`/api/img/${vKey}`, { method: 'HEAD' }, 15_000).catch(() => null);
				if (checkRes?.ok) { uploaded.push(`${size}px ✓ (existed)`); continue; }

				const resizedBlob = await withTimeout(resizeToBlob(originalBlob, size), 20_000, `Resize ${size}px`);
				if (!resizedBlob) throw new Error(`Resize to ${size}px failed`);

				const fd = new FormData();
				fd.append('file', new File([resizedBlob], `variant_${size}.webp`, { type: 'image/webp' }));
				fd.append('variantKey', vKey);
				const up = await fetchWithTimeout(uploadUrl, { method: 'POST', body: fd }, 30_000);
				if (!up.ok) throw new Error(`Upload ${size}px: HTTP ${up.status}`);
				uploaded.push(`${size}px ✓`);
			}
			statusMap[item.id] = { status: 'ok', sizes: uploaded };
		} catch (err) {
			statusMap[item.id] = { status: 'error', msg: err.name === 'AbortError' ? 'Timed out' : err.message };
		}
	}

	// ── Box photos (sheets) — 1000px + 300px ─────────────────────────────
	let sheetStatus   = $state('idle');
	let sheetProgress = $state(0);
	let sheetStatuses = $state(
		Object.fromEntries(data.sheets.map(s => [s.id, { status: 'pending' }]))
	);

	async function runSheets() {
		if (sheetStatus === 'running') return;
		sheetStatus = 'running'; sheetProgress = 0;
		for (const sheet of data.sheets) {
			await migrateItem(sheet, [1000, 300], '/api/images', sheetStatuses);
			sheetProgress++;
		}
		sheetStatus = 'done';
	}

	// ── Cover images — 1600px + 400px ────────────────────────────────────
	let coverStatus   = $state('idle');
	let coverProgress = $state(0);
	let coverStatuses = $state(
		Object.fromEntries(data.covers.map(c => [c.id, { status: 'pending' }]))
	);

	async function runCovers() {
		if (coverStatus === 'running') return;
		coverStatus = 'running'; coverProgress = 0;
		for (const cover of data.covers) {
			const url = `/api/catalogues/${cover.id}/cover`;
			await migrateItem(cover, [1600, 400], url, coverStatuses);
			coverProgress++;
		}
		coverStatus = 'done';
	}

	// ── Section images — 1600px + 400px ──────────────────────────────────
	let sectionStatus   = $state('idle');
	let sectionProgress = $state(0);
	let sectionStatuses = $state(
		Object.fromEntries(data.sections.map(s => [s.id, { status: 'pending' }]))
	);

	async function runSections() {
		if (sectionStatus === 'running') return;
		sectionStatus = 'running'; sectionProgress = 0;
		for (const section of data.sections) {
			// image_key: catalogue-sections/{catalogueId}/{itemId}/uuid.ext
			const parts = section.image_key.split('/');
			const url = `/api/catalogues/${parts[1]}/items/${parts[2]}/image`;
			await migrateItem(section, [1600, 400], url, sectionStatuses);
			sectionProgress++;
		}
		sectionStatus = 'done';
	}

	// ── Run all ───────────────────────────────────────────────────────────
	let runningAll = $state(false);
	async function runAll() {
		if (runningAll) return;
		runningAll = true;
		await runSheets();
		await runCovers();
		await runSections();
		runningAll = false;
	}

	// ── Derived stats ─────────────────────────────────────────────────────
	const sheetDone = $derived(Object.values(sheetStatuses).filter(s => s.status === 'ok').length);
	const sheetErr  = $derived(Object.values(sheetStatuses).filter(s => s.status === 'error').length);
	const coverDone = $derived(Object.values(coverStatuses).filter(s => s.status === 'ok').length);
	const coverErr  = $derived(Object.values(coverStatuses).filter(s => s.status === 'error').length);
	const sectDone  = $derived(Object.values(sectionStatuses).filter(s => s.status === 'ok').length);
	const sectErr   = $derived(Object.values(sectionStatuses).filter(s => s.status === 'error').length);

	const totalImages = $derived(data.sheets.length + data.covers.length + data.sections.length);
</script>

<svelte:head>
	<title>Migrate Images — Admin</title>
</svelte:head>

<div class="page">
	<AppNav active="migrate-images" user={data.user} />

	<main>
		<div class="page-header">
			<h1 class="page-title">Image Migration</h1>
			<p class="page-sub">
				Generates resized variants for all existing photos. New uploads create variants automatically — this back-fills the existing ones.
			</p>
		</div>

		<div class="summary-row">
			<div class="summary-card">
				<span class="sv">{data.sheets.length}</span>
				<span class="sl">box photos</span>
				<span class="sh">→ 1000px + 300px</span>
			</div>
			<div class="summary-card">
				<span class="sv">{data.covers.length}</span>
				<span class="sl">cover images</span>
				<span class="sh">→ 1600px + 400px</span>
			</div>
			<div class="summary-card">
				<span class="sv">{data.sections.length}</span>
				<span class="sl">section images</span>
				<span class="sh">→ 1600px + 400px</span>
			</div>
		</div>

		<button
			class="btn-run-all"
			onclick={runAll}
			disabled={runningAll || totalImages === 0}
		>
			{#if runningAll}Running…{:else}Run migration for all {totalImages} images{/if}
		</button>

		<!-- Box photos -->
		<section class="img-section">
			<div class="section-head">
				<h2>Box photos <span class="count">({data.sheets.length})</span></h2>
				{#if sheetStatus === 'done'}
					<span class="done-chip">{sheetDone} done{sheetErr > 0 ? ` · ${sheetErr} errors` : ''}</span>
				{:else}
					<button class="btn-run-section" onclick={runSheets} disabled={sheetStatus === 'running' || data.sheets.length === 0}>
						{sheetStatus === 'running' ? 'Running…' : 'Run'}
					</button>
				{/if}
			</div>
			{#if sheetStatus !== 'idle'}
				{@render progressBar(sheetProgress, data.sheets.length)}
				{@render resultsTable(data.sheets, sheetStatuses, 'sku', null)}
			{/if}
		</section>

		<!-- Cover images -->
		<section class="img-section">
			<div class="section-head">
				<h2>Cover images <span class="count">({data.covers.length})</span></h2>
				{#if coverStatus === 'done'}
					<span class="done-chip">{coverDone} done{coverErr > 0 ? ` · ${coverErr} errors` : ''}</span>
				{:else}
					<button class="btn-run-section" onclick={runCovers} disabled={coverStatus === 'running' || data.covers.length === 0}>
						{coverStatus === 'running' ? 'Running…' : 'Run'}
					</button>
				{/if}
			</div>
			{#if coverStatus !== 'idle'}
				{@render progressBar(coverProgress, data.covers.length)}
				{@render resultsTable(data.covers, coverStatuses, 'name', null)}
			{/if}
		</section>

		<!-- Section images -->
		<section class="img-section">
			<div class="section-head">
				<h2>Section images <span class="count">({data.sections.length})</span></h2>
				{#if sectionStatus === 'done'}
					<span class="done-chip">{sectDone} done{sectErr > 0 ? ` · ${sectErr} errors` : ''}</span>
				{:else}
					<button class="btn-run-section" onclick={runSections} disabled={sectionStatus === 'running' || data.sections.length === 0}>
						{sectionStatus === 'running' ? 'Running…' : 'Run'}
					</button>
				{/if}
			</div>
			{#if sectionStatus !== 'idle'}
				{@render progressBar(sectionProgress, data.sections.length)}
				{@render resultsTable(data.sections, sectionStatuses, 'catalogue_name', 'item_type')}
			{/if}
		</section>
	</main>
</div>

<!-- ── Snippets ───────────────────────────────────────────────────────── -->

{#snippet progressBar(value, max)}
	<div class="progress-wrap">
		<div class="progress-bar" style="width: {max > 0 ? (value / max) * 100 : 0}%"></div>
	</div>
	<p class="progress-label">{value} / {max}</p>
{/snippet}

{#snippet resultsTable(items, statuses, labelKey, sublabelKey)}
	<table class="results-table">
		<thead>
			<tr><th>Label</th><th>Status</th><th>Details</th></tr>
		</thead>
		<tbody>
			{#each items as item}
				{@const s = statuses[item.id]}
				<tr>
					<td class="col-label">
						{item[labelKey]}
						{#if sublabelKey && item[sublabelKey]}
							<span class="sublabel">{item[sublabelKey]}</span>
						{/if}
					</td>
					<td class="col-status">
						{#if s.status === 'pending'}
							<span class="badge pending">Pending</span>
						{:else if s.status === 'running'}
							<span class="badge running">Running…</span>
						{:else if s.status === 'ok'}
							<span class="badge ok">Done</span>
						{:else}
							<span class="badge error">Error</span>
						{/if}
					</td>
					<td class="col-detail">
						{#if s.status === 'ok'}
							{s.sizes?.join(', ')}
						{:else if s.status === 'error'}
							<span class="err-msg">{s.msg}</span>
						{:else}—{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

<style>
	.page { display: flex; flex-direction: column; min-height: 100vh; background: #f8f8f6; }
	main  { max-width: 900px; margin: 0 auto; padding: 40px 24px; width: 100%; }

	.page-header { margin-bottom: 28px; }
	.page-title  { font-size: 24px; font-weight: 800; color: #111827; margin-bottom: 6px; }
	.page-sub    { color: #6b7280; font-size: 14px; max-width: 580px; line-height: 1.5; }

	.summary-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
	.summary-card {
		background: white; border: 1px solid #e5e7eb; border-radius: 12px;
		padding: 14px 20px; min-width: 140px; display: flex; flex-direction: column; gap: 2px;
	}
	.sv { font-size: 22px; font-weight: 800; color: #111827; }
	.sl { font-size: 12px; color: #6b7280; }
	.sh { font-size: 11px; color: #9ca3af; font-family: monospace; }

	.btn-run-all {
		background: #027E3A; color: white; border: none; border-radius: 10px;
		padding: 12px 28px; font-size: 15px; font-weight: 700;
		font-family: 'Nunito', sans-serif; cursor: pointer;
		transition: background 0.15s; margin-bottom: 36px; display: block;
	}
	.btn-run-all:hover:not(:disabled) { background: #025c2a; }
	.btn-run-all:disabled { background: #d1d5db; color: #9ca3af; cursor: default; }

	.img-section { margin-bottom: 32px; }
	.section-head {
		display: flex; align-items: center; justify-content: space-between;
		margin-bottom: 12px;
	}
	.section-head h2 { font-size: 15px; font-weight: 700; color: #111827; margin: 0; }
	.count { font-weight: 400; color: #9ca3af; }

	.btn-run-section {
		background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 8px;
		padding: 5px 14px; font-size: 13px; font-weight: 600; cursor: pointer;
		transition: background 0.15s; font-family: 'Nunito', sans-serif;
	}
	.btn-run-section:hover:not(:disabled) { background: #e5e7eb; }
	.btn-run-section:disabled { opacity: 0.5; cursor: default; }

	.done-chip {
		font-size: 12px; font-weight: 600; color: #15803d;
		background: #dcfce7; border-radius: 100px; padding: 3px 10px;
	}

	.progress-wrap {
		background: #e5e7eb; border-radius: 100px; height: 6px;
		overflow: hidden; margin-bottom: 6px;
	}
	.progress-bar { height: 100%; background: #027E3A; transition: width 0.2s; border-radius: 100px; }
	.progress-label { font-size: 12px; color: #9ca3af; margin-bottom: 12px; }

	.results-table {
		width: 100%; border-collapse: collapse; background: white;
		border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
	}
	.results-table thead th {
		background: #f9fafb; font-size: 11px; text-transform: uppercase;
		letter-spacing: 0.5px; color: #6b7280; font-weight: 700;
		padding: 9px 14px; text-align: left;
	}
	.results-table tbody tr { border-top: 1px solid #f3f4f6; }
	.results-table tbody td { padding: 9px 14px; font-size: 13px; vertical-align: middle; }

	.col-label  { font-weight: 600; color: #111827; }
	.col-status { width: 100px; }
	.col-detail { color: #6b7280; }
	.sublabel   { font-size: 11px; color: #9ca3af; font-weight: 400; margin-left: 6px; }

	.badge {
		display: inline-block; padding: 2px 9px; border-radius: 100px;
		font-size: 11px; font-weight: 700;
	}
	.badge.pending { background: #f3f4f6; color: #9ca3af; }
	.badge.running { background: #fef9c3; color: #a16207; }
	.badge.ok      { background: #dcfce7; color: #15803d; }
	.badge.error   { background: #fee2e2; color: #dc2626; }
	.err-msg { color: #dc2626; font-size: 12px; }
</style>
