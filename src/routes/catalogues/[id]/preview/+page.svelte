<script>
	import { SVG_AGE, SVG_TIME, SVG_PLAYERS } from '$lib/ata-svgs.js';
	import * as XLSX from 'xlsx';
	import { zipSync } from 'fflate';

	let { data } = $props();

	const { catalogue, items, globalLabels, itemPrices } = data;

	let downloading = $state(false);
	let exportingExcel = $state(false);
	let zippingPhotos = $state(false);
	let zipProgress = $state(0); // 0–100

	async function downloadPhotos() {
		zippingPhotos = true;
		zipProgress = 0;
		try {
			const photoItems = items.filter(item => (!item.type || item.type === 'sheet') && item.box_image_key);
			if (!photoItems.length) { alert('No product photos found in this catalogue.'); return; }

			const files = {};
			for (let i = 0; i < photoItems.length; i++) {
				const item = photoItems[i];
				const fields = getDataFields(item.data_fields);
				const sku  = fieldVal(fields, 'sku') || `product-${i + 1}`;
				const name = item.product_name?.trim() || '';
				const ext  = item.box_image_key.split('.').pop() || 'jpg';
				const filename = name ? `${sku} – ${name}.${ext}` : `${sku}.${ext}`;

				const res = await fetch(`/api/img/${item.box_image_key}`);
				if (!res.ok) continue;
				const buf = await res.arrayBuffer();
				files[filename] = new Uint8Array(buf);
				zipProgress = Math.round(((i + 1) / photoItems.length) * 90);
			}

			const zipped = zipSync(files, { level: 0 }); // level 0 = store, fast for images
			zipProgress = 100;

			const blob = new Blob([zipped], { type: 'application/zip' });
			const url  = URL.createObjectURL(blob);
			const a    = document.createElement('a');
			a.href     = url;
			a.download = `${catalogue.name} – Photos.zip`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			alert('Photo download failed. Please try again.');
		} finally {
			zippingPhotos = false;
			zipProgress = 0;
		}
	}

	const EXCEL_PRIORITY = ['sku', 'ean', 'weight', 'height', 'width', 'depth'];
	const EXCEL_BADGE    = ['age', 'time', 'players'];
	const EXCEL_SKIP     = ['stock_date', 'colli'];

	function downloadExcel() {
		exportingExcel = true;
		try {
			const sheetItems = items.filter(item => !item.type || item.type === 'sheet');

			// Gather all data field keys + labels across all products
			const allKeys = new Set();
			const keyLabels = {};
			for (const item of sheetItems) {
				for (const f of getDataFields(item.data_fields)) {
					if (!EXCEL_SKIP.includes(f.key)) { allKeys.add(f.key); keyLabels[f.key] = f.label; }
				}
			}

			// Order: priority keys → other data keys → badge keys
			const priorityOrdered = EXCEL_PRIORITY.filter(k => allKeys.has(k));
			const otherKeys       = [...allKeys].filter(k => !EXCEL_PRIORITY.includes(k) && !EXCEL_BADGE.includes(k));
			const badgeOrdered    = EXCEL_BADGE.filter(k => allKeys.has(k));
			const dataKeys        = [...priorityOrdered, ...otherKeys, ...badgeOrdered];

			// Build header row — insert "Product Name" after SKU (or at front if no SKU)
			const headers = [];
			let nameInserted = false;
			for (const k of dataKeys) {
				headers.push(keyLabels[k] ?? k);
				if (k === 'sku') { headers.push('Product Name'); nameInserted = true; }
			}
			if (!nameInserted) headers.unshift('Product Name');

			const hasDesc   = sheetItems.some(i => i.product_description?.trim());
			if (hasDesc) headers.push('Short description');
			const maxBullets = Math.max(0, ...sheetItems.map(i => i.usps?.length ?? 0));
			for (let i = 1; i <= maxBullets; i++) headers.push(`Bullet ${i}`);

			// Build data rows
			const rows = [headers];
			for (const item of sheetItems) {
				const fields = getDataFields(item.data_fields);
				const row = [];
				let namePushed = false;
				for (const k of dataKeys) {
					row.push(fieldVal(fields, k));
					if (k === 'sku') { row.push(item.product_name ?? ''); namePushed = true; }
				}
				if (!namePushed) row.unshift(item.product_name ?? '');
				if (hasDesc) row.push(item.product_description ?? '');
				const usps = item.usps ?? [];
				for (let i = 0; i < maxBullets; i++) row.push(usps[i] ?? '');
				rows.push(row);
			}

			// Auto-size columns
			const ws = XLSX.utils.aoa_to_sheet(rows);
			ws['!cols'] = headers.map((h, i) => ({
				wch: Math.min(Math.max(h.length, ...rows.slice(1).map(r => String(r[i] ?? '').length)) + 2, 60)
			}));

			const wb = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(wb, ws, 'Products');
			XLSX.writeFile(wb, `${catalogue.name} – Products.xlsx`);
		} finally {
			exportingExcel = false;
		}
	}

	async function downloadPdf() {
		downloading = true;
		try {
			const res = await fetch(`/api/catalogues/${catalogue.id}/pdf`);
			if (!res.ok) throw new Error('PDF generation failed');
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${catalogue.name}.pdf`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			alert('PDF generation failed. Please try again.');
		} finally {
			downloading = false;
		}
	}

	const lang = catalogue.language ?? 'en';
	const BADGE_KEYS = ['age', 'time', 'players'];
	const RIGHT_KEYS = ['height', 'width', 'depth'];
	const EXCLUDE_KEYS = ['stock_date', 'colli', ...BADGE_KEYS];

	function getDataFields(raw) {
		try { return JSON.parse(raw || '[]'); } catch { return []; }
	}
	function getHidden(raw) {
		try { return JSON.parse(raw || '{}'); } catch { return {}; }
	}
	function fieldVal(fields, key) {
		return fields.find(f => f.key === key)?.value ?? '';
	}
	function globalLabel(key) {
		return globalLabels[key]?.[lang] ?? globalLabels[key]?.['en'] ?? null;
	}
	function dataColLeft(fields) {
		return fields.filter(f => f.value?.trim() && !EXCLUDE_KEYS.includes(f.key) && !RIGHT_KEYS.includes(f.key));
	}
	function dataColRight(fields) {
		return fields.filter(f => f.value?.trim() && RIGHT_KEYS.includes(f.key));
	}

	// Build pages respecting image section sizes:
	//   type='sheet' or 'image_half' → 1 half-page slot
	//   type='image_full'             → fills entire page (2 slots)
	let pages = $derived((() => {
		const result = [];
		let current = [];
		for (const item of items) {
			if (item.type === 'image_full') {
				if (current.length > 0) { result.push([...current]); current = []; }
				result.push([item]);
			} else {
				current.push(item);
				if (current.length === 2) { result.push([...current]); current = []; }
			}
		}
		if (current.length > 0) result.push(current);
		return result;
	})());
</script>

<svelte:head>
	<title>{catalogue.name} — Preview</title>
</svelte:head>

<div class="preview-page">
	<div class="topbar no-print">
		<a href="/catalogues/{catalogue.id}" class="back-link">
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="15 18 9 12 15 6"/>
			</svg>
			Edit
		</a>
		<span class="topbar-title">{catalogue.name}</span>
		<div class="dl-bar">
			<div class="dl-icon">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
					<polyline points="7 10 12 15 17 10"/>
					<line x1="12" y1="15" x2="12" y2="3"/>
				</svg>
			</div>
			<button class="dl-btn" onclick={downloadPhotos} disabled={zippingPhotos}>
				{#if zippingPhotos}
					<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin">
						<path d="M21 12a9 9 0 11-6.219-8.56"/>
					</svg>
					{zipProgress < 100 ? `${zipProgress}%` : '…'}
				{:else}
					Photos
				{/if}
			</button>
			<div class="dl-divider"></div>
			<button class="dl-btn" onclick={downloadExcel} disabled={exportingExcel}>
				{#if exportingExcel}
					<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin">
						<path d="M21 12a9 9 0 11-6.219-8.56"/>
					</svg>
					…
				{:else}
					Data
				{/if}
			</button>
			<div class="dl-divider"></div>
			<button class="dl-btn dl-btn-primary" onclick={downloadPdf} disabled={downloading}>
				{#if downloading}
					<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="spin">
						<path d="M21 12a9 9 0 11-6.219-8.56"/>
					</svg>
					Exporting PDF…
				{:else}
					PDF
				{/if}
			</button>
		</div>
	</div>

	<div class="pages-wrap">

		<!-- Front cover -->
		<div class="a4-page front-page">
			<!-- Cover photo fills top half (placed first so pattern renders on top) -->
			{#if catalogue.cover_image_key}
				<div class="cover-image-wrap">
					<img
						src="/api/img/{catalogue.cover_image_key}?size=1600"
						alt=""
						class="cover-image"
						style="object-position: {catalogue.cover_crop_x ?? 50}% {catalogue.cover_crop_y ?? 50}%"
					/>
				</div>
			{/if}
			<img class="pattern-overlay" src="/pattern.png" alt="" aria-hidden="true" />

			<!-- Language-matched logo at the bottom -->
			<img
				src={lang === 'sv' ? '/logo-se.svg' : lang === 'no' ? '/logo-no.svg' : '/logo-da.svg'}
				alt="Logo"
				class="front-logo"
			/>

			<!-- Logo + title: logo centered at the 50% mark so it straddles the cover photo -->
			<div class="front-content">
				{#if catalogue.logo_key}
					<div class="logo-card" style="background: {catalogue.logo_bg_color ?? '#FFFFFF'}">
						<img src="/api/img/{catalogue.logo_key}" alt="Logo" class="logo-img" />
					</div>
				{:else}
					<div class="logo-card logo-card-empty">
						<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
							<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
							<polyline points="21 15 16 10 5 21"/>
						</svg>
					</div>
				{/if}
				{#if catalogue.title}
					<h1 class="front-title">{catalogue.title}</h1>
				{/if}
			</div>
		</div>

		<!-- Content pages -->
		{#each pages as pagePair}
			{#if pagePair.length === 1 && pagePair[0].type === 'image_full'}
				<!-- Full-page image section -->
				<div class="a4-page image-full-page">
					{#if pagePair[0].section_image_key}
						<img src="/api/img/{pagePair[0].section_image_key}?size=1600" alt="" class="section-img-full" />
					{:else}
						<div class="section-placeholder">
							<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
								<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
								<polyline points="21 15 16 10 5 21"/>
							</svg>
							<span>Full page image</span>
						</div>
					{/if}
					{#if pagePair[0].section_text}
						<div class="section-text-pill">{pagePair[0].section_text}</div>
					{/if}
				</div>
			{:else}
				<!-- Regular content page: up to 2 half-page slots -->
				<div class="a4-page content-page">
					<img class="pattern-overlay" src="/pattern.png" alt="" aria-hidden="true" />

					{#each pagePair as item, slotIdx}
						{#if item.type === 'image_half'}
							<!-- Half-page image section -->
							<div class="product-half" class:divider-above={slotIdx === 1}>
								{#if item.section_image_key}
									<img src="/api/img/{item.section_image_key}?size=1600" alt="" class="section-img-half" />
								{:else}
									<div class="section-placeholder">
										<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
											<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
											<polyline points="21 15 16 10 5 21"/>
										</svg>
										<span>Half page image</span>
									</div>
								{/if}
								{#if item.section_text}
									<div class="section-text-pill">{item.section_text}</div>
								{/if}
							</div>
						{:else if item.type === 'grid'}
							{@const gridSize = item.section_grid_size ?? 4}
							{@const gridProducts = item.grid_products ?? Array(gridSize).fill(null)}
							<!-- Product grid section (2x2 or 2x3) -->
							<div class="product-half grid-half" class:divider-above={slotIdx === 1}>
								<div class="grid-section" class:grid-6={gridSize === 6} style="grid-template-columns: repeat({gridSize === 6 ? 3 : 2}, 1fr);">
									{#each gridProducts as product}
										{@const gridFields = getDataFields(product?.data_fields)}
										{@const gridAge = fieldVal(gridFields, 'age')}
										{@const gridTime = fieldVal(gridFields, 'time')}
										{@const gridPlayers = fieldVal(gridFields, 'players')}
										<div class="grid-cell">
											<div class="grid-cell-box">
												{#if product?.box_image_key}
													<img src="/api/img/{product.box_image_key}?size=600" alt={product.product_name ?? ''} class="grid-cell-img" />
												{:else}
													<div class="grid-cell-placeholder">
														<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.2">
															<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
														</svg>
													</div>
												{/if}
											</div>
											{#if gridSize === 4 && (gridAge || gridTime || gridPlayers)}
												<div class="grid-cell-badges">
													{#if gridAge}<div class="badge-hex-wrap">{@html SVG_AGE}<span class="badge-val">{gridAge}</span></div>{/if}
													{#if gridTime}<div class="badge-hex-wrap">{@html SVG_TIME}<span class="badge-val">{gridTime}</span></div>{/if}
													{#if gridPlayers}<div class="badge-hex-wrap">{@html SVG_PLAYERS}<span class="badge-val">{gridPlayers}</span></div>{/if}
												</div>
											{/if}
											<p class="grid-cell-name">{product?.product_name ?? ''}</p>
										</div>
									{/each}
								</div>
							</div>
						{:else}
							{@const fields = getDataFields(item.data_fields)}
							{@const hidden = getHidden(item.hidden_elements)}
							{@const stockDate = fieldVal(fields, 'stock_date')}
							{@const age = fieldVal(fields, 'age')}
							{@const time = fieldVal(fields, 'time')}
							{@const players = fieldVal(fields, 'players')}
							{@const leftCols = dataColLeft(fields)}
							{@const rightCols = dataColRight(fields)}

							<!-- Each product half: info section + data table -->
							<div class="product-half" class:divider-above={slotIdx === 1}>

								<!-- Image + info row -->
								<div class="product-section">
									<!-- Left: white box card -->
									<div class="product-image-col">
										<div class="box-frame">
											<div class="box-area">
												{#if item.box_image_key}
													<img src="/api/img/{item.box_image_key}?size=1000" alt={item.product_name} class="box-img" />
												{:else}
													<div class="box-placeholder">
														<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.2">
															<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
														</svg>
													</div>
												{/if}
											</div>
											{#if !hidden.badges && (age || time || players)}
												<div class="badges-side">
													{#if age}<div class="badge-hex-wrap">{@html SVG_AGE}<span class="badge-val">{age}</span></div>{/if}
													{#if time}<div class="badge-hex-wrap">{@html SVG_TIME}<span class="badge-val">{time}</span></div>{/if}
													{#if players}<div class="badge-hex-wrap">{@html SVG_PLAYERS}<span class="badge-val">{players}</span></div>{/if}
												</div>
											{/if}
										</div>
										{#if !hidden.stock_date && stockDate}
											<div class="stock-tag-wrap">
												<div class="stock-tag">
													<span class="stock-label">{globalLabel('stock_date') ?? 'Est. Stock Date'}</span>
													<span class="stock-value">{stockDate}</span>
												</div>
											</div>
										{/if}
									</div>

									<!-- Right: product info -->
									<div class="product-info-col">
										<h2 class="product-name">{item.product_name || ''}</h2>

										{#if itemPrices?.[fieldVal(getDataFields(item.data_fields), 'sku')]}
											{@const listPrice = itemPrices[fieldVal(getDataFields(item.data_fields), 'sku')]}
											{@const currency = ({ da: 'DKK', sv: 'SEK', no: 'NOK', en: 'EUR' })[lang] ?? 'EUR'}
											{@const listLabel = globalLabel('listpris') ?? 'List price'}
											<p class="list-price"><strong>{listLabel}:</strong> {currency} {listPrice.toFixed(2)}</p>
										{/if}

										{#if !hidden.description && item.product_description}
											<p class="product-desc">{item.product_description}</p>
										{/if}

										{#if !hidden.bullets && item.usps?.length > 0}
											<ul class="usp-list">
												{#each item.usps as usp}
													<li class="usp-item">
														<svg class="bullet" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
															<path d="M3 8.5L6.5 12L13 4.5" stroke="#F57832" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
														</svg>
														<span class="usp-text">{usp}</span>
													</li>
												{/each}
											</ul>
										{/if}
									</div>
								</div>

								<!-- Data table — shown if not hidden and has data -->
								{#if !hidden.data && (leftCols.length > 0 || rightCols.length > 0)}
									<div class="data-bottom">
										<div class="data-cols">
											<table class="data-table">
												<tbody>
													{#each leftCols as field}
														<tr class="data-row">
															<td class="data-label">{globalLabel(field.key) ?? field.label}</td>
															<td class="data-value">{field.value}</td>
														</tr>
													{/each}
												</tbody>
											</table>
											<table class="data-table">
												<tbody>
													{#each rightCols as field}
														<tr class="data-row">
															<td class="data-label">{globalLabel(field.key) ?? field.label}</td>
															<td class="data-value">{field.value}</td>
														</tr>
													{/each}
												</tbody>
											</table>
										</div>
									</div>
								{/if}

							</div>
						{/if}
					{/each}
				</div>
			{/if}
		{/each}

	</div>
</div>

<style>
	/* ── Topbar ──────────────────────────────────────────────────────────── */
	.topbar {
		background: white; border-bottom: 1px solid var(--border);
		padding: 0 20px; height: 52px;
		display: flex; align-items: center; justify-content: space-between; gap: 16px;
		position: sticky; top: 0; z-index: 100;
	}
	.back-link { display: flex; align-items: center; gap: 4px; font-size: 13px; color: #71717A; text-decoration: none; font-weight: 500; transition: color 0.15s; }
	.back-link:hover { color: #18181B; }
	.topbar-title { font-size: 14px; font-weight: 700; color: #18181B; letter-spacing: -0.2px; }
	.dl-bar {
		display: inline-flex; align-items: center;
		background: white; border: 1px solid var(--border);
		border-radius: 100px; overflow: hidden;
		box-shadow: 0 1px 4px rgba(100,60,0,0.08);
	}
	.dl-icon {
		display: flex; align-items: center; justify-content: center;
		width: 34px; height: 32px;
		color: #A89060; flex-shrink: 0;
		border-right: 1px solid var(--border);
	}
	.dl-btn {
		display: inline-flex; align-items: center; justify-content: center; gap: 5px;
		padding: 0 14px; height: 32px;
		background: transparent; border: none;
		font-size: 12.5px; font-weight: 700; font-family: inherit;
		color: #52525B; cursor: pointer;
		transition: background 0.12s, color 0.12s;
		white-space: nowrap;
	}
	.dl-btn:hover:not(:disabled) { background: #FFF5D2; color: #7B3803; }
	.dl-btn:disabled { opacity: 0.55; cursor: not-allowed; }
	.dl-btn-primary { color: #52525B; }
	.dl-btn-primary:hover:not(:disabled) { background: #FFF5D2; color: #7B3803; }
	.dl-divider { width: 1px; height: 18px; background: var(--border); flex-shrink: 0; }
	.spin { animation: spin 0.8s linear infinite; flex-shrink: 0; }
	@keyframes spin { to { transform: rotate(360deg); } }

	/* ── Wrapper ─────────────────────────────────────────────────────────── */
	.preview-page { min-height: 100vh; background: #E8E3DB; }
	.pages-wrap { display: flex; flex-direction: column; align-items: center; gap: 32px; padding: 40px 24px 60px; }

	/* ── A4 base ─────────────────────────────────────────────────────────── */
	.a4-page {
		width: 794px; height: 1123px;
		background: #FFF5D2;
		position: relative; overflow: hidden;
		box-shadow: 0 4px 24px rgba(50,30,0,0.18);
		flex-shrink: 0;
		font-family: 'Nunito', sans-serif;
	}
	.pattern-overlay {
		position: absolute; inset: 0; width: 100%; height: 100%;
		object-fit: fill; opacity: 0.15; pointer-events: none; z-index: 0;
	}

	/* ── Front cover ─────────────────────────────────────────────────────── */
	.front-page { position: relative; }

	.front-logo {
		position: absolute;
		bottom: 40px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 2;
		max-height: 52px;
		max-width: 220px;
		object-fit: contain;
	}

	/* Cover photo: fills the top half, edge to edge */
	.cover-image-wrap {
		position: absolute;
		top: 0; left: 0; right: 0;
		height: 50%;
		overflow: hidden;
		z-index: 0;
	}
	.cover-image { width: 100%; height: 100%; object-fit: cover; display: block; }

	/* Front content: logo centered exactly at the cover/lower boundary */
	.front-content {
		position: absolute;
		left: 50%;
		top: calc(50% - 130px); /* 130px = half logo height, puts logo center at 50% */
		transform: translateX(-50%);
		z-index: 2;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 36px;
		width: 100%;
	}
	.logo-card { width: 260px; height: 260px; border-radius: 28px; box-shadow: 0 12px 48px rgba(50,30,0,0.20), 0 2px 8px rgba(50,30,0,0.10); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
	.logo-card-empty { background: #F4F4F5; color: #D4D4D8; }
	.logo-img { width: 100%; height: 100%; object-fit: contain; padding: 24px; box-sizing: border-box; }
	.front-title { font-size: 42px; font-weight: 800; color: #18181B; letter-spacing: -1px; text-align: center; line-height: 1.15; max-width: 640px; padding: 0 48px; box-sizing: border-box; white-space: normal; word-break: break-word; }

	/* ── Content pages ───────────────────────────────────────────────────── */
	.content-page { display: flex; flex-direction: column; }

	/* Each product half takes exactly half the page */
	.product-half {
		height: 561px;
		display: flex;
		flex-direction: column;
		position: relative;
		z-index: 1;
		box-sizing: border-box;
	}
	.product-half.divider-above {
		border-top: 1px solid #FFE6A5;
		height: 560px;
	}

	/* Product info row (image + text) */
	.product-section {
		display: flex; flex-direction: row; align-items: flex-start;
		padding: 48px 48px 16px;
		gap: 32px;
		flex-shrink: 0;
	}

	/* ── Box image col ───────────────────────────────────────────────────── */
	.product-image-col { flex: 0 0 45%; display: flex; flex-direction: column; align-items: stretch; }

	/* Box frame: wrapper so badges can sit outside the overflow:hidden box */
	.box-frame { position: relative; width: 100%; }

	.box-area {
		background: white; border-radius: 24px;
		box-shadow: 0 16px 56px rgba(0,0,0,0.10);
		padding: 20px; aspect-ratio: 1 / 1; width: 100%;
		box-sizing: border-box;
		display: flex; align-items: center; justify-content: center; overflow: hidden;
	}
	.box-img { width: 100%; height: 100%; object-fit: contain; }
	.box-placeholder { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }

	/* ATA badges — vertically stacked on left edge of box frame */
	.badges-side {
		position: absolute; left: 0; top: 50%;
		transform: translate(-50%, -50%);
		display: flex; flex-direction: column; gap: 8px;
		z-index: 3; align-items: center;
	}
	.badge-hex-wrap { position: relative; width: 57px; flex-shrink: 0; }
	.badge-hex-wrap :global(svg) { width: 100%; height: auto; display: block; }
	.badge-val {
		position: absolute; left: 50%; bottom: 13px;
		transform: translateX(-50%);
		font-size: 14px; font-weight: 400; color: #007E3A;
		text-align: center; white-space: nowrap;
		font-family: 'Nunito', sans-serif; line-height: 1;
	}

	.stock-tag-wrap { display: flex; justify-content: center; margin-top: -15px; position: relative; z-index: 2; }
	.stock-tag { display: inline-flex; align-items: center; gap: 6px; background: #F57832; border-radius: 100px; padding: 6px 16px; font-size: 11.5px; box-shadow: 0 4px 14px rgba(245,120,50,0.45); white-space: nowrap; }
	.stock-label { font-weight: 700; color: rgba(255,255,255,0.85); letter-spacing: 0.1px; }
	.stock-value { color: white; font-weight: 700; }

	/* ── Product info col ────────────────────────────────────────────────── */
	.product-info-col { flex: 1; min-width: 0; display: flex; flex-direction: column; padding-top: 4px; gap: 8px; }
	.product-name { font-size: 26px; font-weight: 800; color: #111827; letter-spacing: -0.5px; line-height: 1.2; margin-bottom: 0; }
	.list-price { font-size: 13px; font-weight: 500; color: #7B3803; margin-top: -5px; margin-bottom: 2px; }
	.list-price strong { font-weight: 800; }

	.product-desc { font-size: 15px; font-weight: 500; color: #374151; line-height: 1.5; margin: 0 0 4px; }

	/* ── Product grid section (2x2 / 2x3) ───────────────────────────────── */
	.grid-half { padding: 40px; box-sizing: border-box; }
	/* Fill the whole half-page: two equal rows, gaps matching the 40px side
	   padding, so products sit in an even grid with no wasted space. */
	.grid-section {
		display: grid;
		gap: 40px;
		height: 100%;
		grid-template-rows: repeat(2, 1fr);
	}
	.grid-cell { display: flex; flex-direction: column; align-items: center; gap: 8px; min-height: 0; }
	/* Box flexes to fill the cell (minus the name), giving a tall, ~square card. */
	.grid-cell-box {
		width: 100%; flex: 1; min-height: 0;
		background: white; border-radius: 16px;
		box-shadow: 0 10px 32px rgba(0,0,0,0.10);
		display: flex; align-items: center; justify-content: center;
		overflow: hidden; box-sizing: border-box; padding: 12px;
	}
	.grid-cell-img { width: 100%; height: 100%; object-fit: contain; }
	.grid-cell-placeholder { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
	.grid-cell-name { font-size: 14px; font-weight: 700; color: #18181B; text-align: center; line-height: 1.25; margin: 0; }
	.grid-cell-badges { display: flex; gap: 6px; justify-content: center; }
	.grid-cell-badges .badge-hex-wrap { position: relative; width: 26px; flex-shrink: 0; }
	.grid-cell-badges .badge-val { font-size: 8px; bottom: 6px; }

	/* USPs — exact match */
	.usp-list { list-style: none; display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; }
	.usp-item { display: flex; align-items: center; gap: 8px; line-height: 1.4; }
	.bullet { flex-shrink: 0; display: block; }
	.usp-text { font-size: 17px; color: #374151; }

	/* ── Data table — white card, same as SheetCanvas ───────────────────── */
	.data-bottom {
		background: white;
		border-radius: 24px;
		box-shadow: 0 16px 56px rgba(0,0,0,0.10);
		margin: 12px 48px 20px;
		padding: 14px 24px;
		position: relative; z-index: 1;
	}
	.data-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
	.data-table { width: 100%; border-collapse: collapse; }
	.data-row td { padding: 6px 0; font-size: 13px; vertical-align: middle; }
	.data-row:not(:last-child) td { border-bottom: 1px solid #FFE6A5; }
	.data-label { width: 38%; color: #6b7280; font-weight: 500; padding-right: 12px; }
	.data-value { color: #111827; font-weight: 600; font-family: 'Nunito', sans-serif; font-size: 13px; }

	/* ── Image section pages ─────────────────────────────────────────────── */
	.image-full-page { position: relative; }

	.section-img-full {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		z-index: 1;
	}

	.section-img-half {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		position: absolute;
		inset: 0;
	}

	.section-placeholder {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		color: #C4B99A;
		font-size: 14px;
		font-weight: 500;
	}

	.section-text-pill {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 3;
		background: #FFE6A5;
		color: #7B3803;
		padding: 18px 48px;
		border-radius: 100px;
		font-size: 36px;
		font-weight: 800;
		letter-spacing: -0.5px;
		white-space: nowrap;
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
		font-family: 'Nunito', sans-serif;
	}

	/* ── Print ───────────────────────────────────────────────────────────── */
	@media print {
		.no-print { display: none !important; }
		.preview-page { background: none; }
		.pages-wrap { padding: 0; gap: 0; }
		.a4-page { box-shadow: none; page-break-after: always; break-after: page; }
		.a4-page:last-child { page-break-after: avoid; break-after: avoid; }

		/* Ensure background colours and images print */
		* {
			-webkit-print-color-adjust: exact;
			print-color-adjust: exact;
		}

		/* Remove box-shadows — Chrome PDF renderer turns them into grey filled boxes
		   when combined with overflow:hidden or stacking contexts with opacity */
		.box-area,
		.logo-card,
		.data-bottom,
		.stock-tag,
		.section-text-pill {
			box-shadow: none !important;
		}
	}
	@page { size: A4; margin: 0; }
</style>
