<script>
	import { SVG_AGE, SVG_TIME, SVG_PLAYERS } from '$lib/ata-svgs.js';
	import * as XLSX from 'xlsx';
	import { zipSync } from 'fflate';

	let { data } = $props();
	const { catalogue, items, globalLabels, itemPrices, token } = data;

	let downloading = $state(false);
	let exportingExcel = $state(false);
	let zippingPhotos = $state(false);
	let zipProgress = $state(0);

	// ── Analytics ──────────────────────────────────────────────────────────────
	// Fire-and-forget — never blocks the UI, never throws to the user.
	let _sessionId = /** @type {string|null} */ (null);

	/** @param {string} eventType @param {number|null} [page] */
	function _track(eventType, page = null) {
		if (!_sessionId) return;
		fetch(`/api/share/${token}/analytics`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'event', session_id: _sessionId, event_type: eventType, page }),
			keepalive: true,
		}).catch(() => {});
	}

	$effect(() => {
		/** @type {IntersectionObserver[]} */
		const observers = [];

		fetch(`/api/share/${token}/analytics`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'session' }),
		})
			.then((r) => r.json())
			.then(({ session_id }) => {
				_sessionId = session_id;

				const pageEls = /** @type {Element[]} */ ([...document.querySelectorAll('.a4-page')]);
				const tracked = new Set();

				// Fire "view_page" when the middle of a page enters the middle band of the viewport
				const pageObs = new IntersectionObserver(
					(entries) => {
						for (const entry of entries) {
							if (entry.isIntersecting) {
								const i = pageEls.indexOf(entry.target);
								if (i !== -1 && !tracked.has(i)) {
									tracked.add(i);
									_track('view_page', i + 1);
								}
							}
						}
					},
					{ rootMargin: '-40% 0px -40% 0px', threshold: 0 }
				);
				pageEls.forEach((el) => pageObs.observe(el));
				observers.push(pageObs);

				// Fire "view_end" when a sentinel after the last page becomes visible
				const wrap = document.querySelector('.pages-wrap');
				if (wrap) {
					const sentinel = document.createElement('div');
					sentinel.setAttribute('data-analytics-sentinel', '1');
					wrap.appendChild(sentinel);

					let endFired = false;
					const endObs = new IntersectionObserver(
						(entries) => {
							if (entries[0].isIntersecting && !endFired) {
								endFired = true;
								_track('view_end');
							}
						},
						{ threshold: 1.0 }
					);
					endObs.observe(sentinel);
					observers.push(endObs);
				}
			})
			.catch(() => {});

		return () => {
			observers.forEach((o) => o.disconnect());
			document.querySelector('[data-analytics-sentinel]')?.remove();
		};
	});

	async function downloadPhotos() {
		_track('download_photos');
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

			const zipped = zipSync(files, { level: 0 });
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
		_track('download_excel');
		exportingExcel = true;
		try {
			const sheetItems = items.filter(item => !item.type || item.type === 'sheet');

			const allKeys = new Set();
			const keyLabels = {};
			for (const item of sheetItems) {
				for (const f of getDataFields(item.data_fields)) {
					if (!EXCEL_SKIP.includes(f.key)) { allKeys.add(f.key); keyLabels[f.key] = f.label; }
				}
			}

			const priorityOrdered = EXCEL_PRIORITY.filter(k => allKeys.has(k));
			const otherKeys       = [...allKeys].filter(k => !EXCEL_PRIORITY.includes(k) && !EXCEL_BADGE.includes(k));
			const badgeOrdered    = EXCEL_BADGE.filter(k => allKeys.has(k));
			const dataKeys        = [...priorityOrdered, ...otherKeys, ...badgeOrdered];

			const headers = [];
			let nameInserted = false;
			for (const k of dataKeys) {
				headers.push(keyLabels[k] ?? k);
				if (k === 'sku') { headers.push('Product Name'); nameInserted = true; }
			}
			if (!nameInserted) headers.unshift('Product Name');

			const hasDesc    = sheetItems.some(i => i.product_description?.trim());
			if (hasDesc) headers.push('Short description');
			const maxBullets = Math.max(0, ...sheetItems.map(i => i.usps?.length ?? 0));
			for (let i = 1; i <= maxBullets; i++) headers.push(`Bullet ${i}`);

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
		_track('download_pdf');
		downloading = true;
		try {
			const res = await fetch(`/api/share/${token}/pdf`);
			if (!res.ok) throw new Error('PDF generation failed');
			const blob = await res.blob();
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = `${catalogue.name}.pdf`;
			a.click();
			URL.revokeObjectURL(a.href);
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

	function getDataFields(raw) { try { return JSON.parse(raw || '[]'); } catch { return []; } }
	function getHidden(raw) { try { return JSON.parse(raw || '{}'); } catch { return {}; } }
	function fieldVal(fields, key) { return fields.find(f => f.key === key)?.value ?? ''; }
	function globalLabel(key) { return globalLabels[key]?.[lang] ?? globalLabels[key]?.['en'] ?? null; }
	function dataColLeft(fields) { return fields.filter(f => f.value?.trim() && !EXCLUDE_KEYS.includes(f.key) && !RIGHT_KEYS.includes(f.key)); }
	function dataColRight(fields) { return fields.filter(f => f.value?.trim() && RIGHT_KEYS.includes(f.key)); }

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
	<title>{catalogue.name}</title>
</svelte:head>

<div class="preview-page">
	<div class="topbar no-print">
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
					<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 0.8s linear infinite; flex-shrink:0">
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
					<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 0.8s linear infinite; flex-shrink:0">
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
					<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 0.8s linear infinite; flex-shrink:0">
						<path d="M21 12a9 9 0 11-6.219-8.56"/>
					</svg>
					…
				{:else}
					PDF
				{/if}
			</button>
		</div>
	</div>

	<div class="pages-wrap">

		<!-- Front cover -->
		<div class="a4-page front-page">
			{#if catalogue.cover_image_key}
				<div class="cover-image-wrap">
					<img src="/api/img/{catalogue.cover_image_key}" alt="" class="cover-image"
						style="object-position: {catalogue.cover_crop_x ?? 50}% {catalogue.cover_crop_y ?? 50}%" />
				</div>
			{/if}
			<img class="pattern-overlay" src="/pattern.png" alt="" aria-hidden="true" />
			<img src={lang === 'sv' ? '/logo-se.svg' : lang === 'no' ? '/logo-no.svg' : '/logo-da.svg'} alt="Logo" class="front-logo" />
			<div class="front-content">
				{#if catalogue.logo_key}
					<div class="logo-card" style="background: {catalogue.logo_bg_color ?? '#FFFFFF'}">
						<img src="/api/img/{catalogue.logo_key}" alt="Logo" class="logo-img" />
					</div>
				{:else}
					<div class="logo-card logo-card-empty">
						<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
							<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
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
						<img src="/api/img/{pagePair[0].section_image_key}" alt="" class="section-img-full" />
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
									<img src="/api/img/{item.section_image_key}" alt="" class="section-img-half" />
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
						{:else}
							{@const fields = getDataFields(item.data_fields)}
							{@const hidden = getHidden(item.hidden_elements)}
							{@const stockDate = fieldVal(fields, 'stock_date')}
							{@const age = fieldVal(fields, 'age')}
							{@const time = fieldVal(fields, 'time')}
							{@const players = fieldVal(fields, 'players')}
							{@const leftCols = dataColLeft(fields)}
							{@const rightCols = dataColRight(fields)}

							<div class="product-half" class:divider-above={slotIdx === 1}>
								<div class="product-section">
									<div class="product-image-col">
										<div class="box-frame">
											<div class="box-area">
												{#if item.box_image_key}
													<img src="/api/img/{item.box_image_key}" alt={item.product_name} class="box-img" />
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
									<div class="product-info-col">
										<h2 class="product-name">{item.product_name || ''}</h2>

										{#if itemPrices?.[fieldVal(fields, 'sku')]}
											{@const listPrice = itemPrices[fieldVal(fields, 'sku')]}
											{@const currency = ({ da: 'DKK', sv: 'SEK', no: 'NOK', en: 'EUR' })[catalogue.language ?? 'en'] ?? 'EUR'}
											{@const listLabel = globalLabels['listpris']?.[catalogue.language ?? 'en'] ?? globalLabels['listpris']?.['en'] ?? 'List price'}
											<p class="list-price"><strong>{listLabel}:</strong> {currency} {listPrice.toFixed(2)}</p>
										{/if}

										{#if !hidden.description && item.product_description}
											<p class="product-desc">{item.product_description}</p>
										{/if}
										{#if !hidden.bullets && item.usps?.length > 0}
											<ul class="usp-list">
												{#each item.usps as usp}
													<li class="usp-item">
														<svg class="bullet" width="16" height="16" viewBox="0 0 16 16" fill="none">
															<path d="M3 8.5L6.5 12L13 4.5" stroke="#F57832" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
														</svg>
														<span class="usp-text">{usp}</span>
													</li>
												{/each}
											</ul>
										{/if}
									</div>
								</div>

								{#if !hidden.data && (leftCols.length > 0 || rightCols.length > 0)}
									<div class="data-bottom">
										<div class="data-cols">
											<table class="data-table"><tbody>
												{#each leftCols as field}
													<tr class="data-row">
														<td class="data-label">{globalLabel(field.key) ?? field.label}</td>
														<td class="data-value">{field.value}</td>
													</tr>
												{/each}
											</tbody></table>
											<table class="data-table"><tbody>
												{#each rightCols as field}
													<tr class="data-row">
														<td class="data-label">{globalLabel(field.key) ?? field.label}</td>
														<td class="data-value">{field.value}</td>
													</tr>
												{/each}
											</tbody></table>
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
	@keyframes spin { to { transform: rotate(360deg); } }

	.topbar {
		background: white; border-bottom: 1px solid #E4E4E7;
		padding: 0 24px; height: 52px;
		display: flex; align-items: center; justify-content: space-between;
		position: sticky; top: 0; z-index: 100;
		font-family: 'Nunito', sans-serif;
	}
	.topbar-title { font-size: 15px; font-weight: 700; color: #18181B; letter-spacing: -0.2px; }
	.dl-bar {
		display: inline-flex; align-items: center;
		background: white; border: 1px solid #E4E4E7;
		border-radius: 100px; overflow: hidden;
		box-shadow: 0 1px 4px rgba(0,0,0,0.06);
	}
	.dl-icon {
		display: flex; align-items: center; justify-content: center;
		width: 34px; height: 32px;
		color: #A89060; flex-shrink: 0;
		border-right: 1px solid #E4E4E7;
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
	.dl-divider { width: 1px; height: 18px; background: #E4E4E7; flex-shrink: 0; }

	.preview-page { min-height: 100vh; background: #E8E3DB; font-family: 'Nunito', sans-serif; }
	.pages-wrap { display: flex; flex-direction: column; align-items: center; gap: 32px; padding: 40px 24px 60px; }

	.a4-page { width: 794px; height: 1123px; background: #FFF5D2; position: relative; overflow: hidden; box-shadow: 0 4px 24px rgba(50,30,0,0.18); flex-shrink: 0; font-family: 'Nunito', sans-serif; }
	.pattern-overlay { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; opacity: 0.15; pointer-events: none; z-index: 0; }

	.front-page { position: relative; }
	.front-logo { position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%); z-index: 2; max-height: 52px; max-width: 220px; object-fit: contain; }
	.cover-image-wrap { position: absolute; top: 0; left: 0; right: 0; height: 50%; overflow: hidden; z-index: 0; }
	.cover-image { width: 100%; height: 100%; object-fit: cover; display: block; }
	.front-content { position: absolute; left: 50%; top: calc(50% - 130px); transform: translateX(-50%); z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 36px; width: 100%; }
	.logo-card { width: 260px; height: 260px; border-radius: 28px; box-shadow: 0 12px 48px rgba(50,30,0,0.20), 0 2px 8px rgba(50,30,0,0.10); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; }
	.logo-card-empty { background: #F4F4F5; color: #D4D4D8; }
	.logo-img { width: 100%; height: 100%; object-fit: contain; padding: 24px; box-sizing: border-box; }
	.front-title { font-size: 42px; font-weight: 800; color: #18181B; letter-spacing: -1px; text-align: center; line-height: 1.15; max-width: 640px; padding: 0 48px; box-sizing: border-box; white-space: normal; word-break: break-word; }

	.content-page { display: flex; flex-direction: column; }
	.product-half { height: 561px; display: flex; flex-direction: column; position: relative; z-index: 1; box-sizing: border-box; }
	.product-half.divider-above { border-top: 1px solid #FFE6A5; height: 560px; }
	.product-section { display: flex; flex-direction: row; align-items: flex-start; padding: 48px 48px 16px; gap: 32px; flex-shrink: 0; }

	.product-image-col { flex: 0 0 45%; display: flex; flex-direction: column; align-items: stretch; }
	.box-frame { position: relative; width: 100%; }
	.box-area { background: white; border-radius: 24px; box-shadow: 0 16px 56px rgba(0,0,0,0.10); padding: 20px; aspect-ratio: 1/1; width: 100%; box-sizing: border-box; display: flex; align-items: center; justify-content: center; overflow: hidden; }
	.box-img { width: 100%; height: 100%; object-fit: contain; }
	.box-placeholder { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }

	.badges-side { position: absolute; left: 0; top: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; gap: 8px; z-index: 3; align-items: center; }
	.badge-hex-wrap { position: relative; width: 57px; flex-shrink: 0; }
	.badge-hex-wrap :global(svg) { width: 100%; height: auto; display: block; }
	.badge-val { position: absolute; left: 50%; bottom: 13px; transform: translateX(-50%); font-size: 14px; font-weight: 400; color: #007E3A; text-align: center; white-space: nowrap; font-family: 'Nunito', sans-serif; line-height: 1; }

	.stock-tag-wrap { display: flex; justify-content: center; margin-top: -15px; position: relative; z-index: 2; }
	.stock-tag { display: inline-flex; align-items: center; gap: 6px; background: #F57832; border-radius: 100px; padding: 6px 16px; font-size: 11.5px; box-shadow: 0 4px 14px rgba(245,120,50,0.45); white-space: nowrap; }
	.stock-label { font-weight: 700; color: rgba(255,255,255,0.85); letter-spacing: 0.1px; }
	.stock-value { color: white; font-weight: 700; }

	.product-info-col { flex: 1; min-width: 0; display: flex; flex-direction: column; padding-top: 4px; gap: 8px; }
	.product-name { font-size: 26px; font-weight: 800; color: #111827; letter-spacing: -0.5px; line-height: 1.2; margin-bottom: 0; }
	.list-price { font-size: 13px; font-weight: 500; color: #7B3803; margin-top: -5px; margin-bottom: 2px; }
	.list-price strong { font-weight: 800; }
	.product-desc { font-size: 15px; font-weight: 500; color: #374151; line-height: 1.5; margin: 0 0 4px; }
	.usp-list { list-style: none; display: flex; flex-direction: column; gap: 4px; margin: 0; padding: 0; }
	.usp-item { display: flex; align-items: center; gap: 8px; line-height: 1.4; }
	.bullet { flex-shrink: 0; display: block; }
	.usp-text { font-size: 17px; color: #374151; }

	.data-bottom { background: white; border-radius: 24px; box-shadow: 0 16px 56px rgba(0,0,0,0.10); margin: 12px 48px 20px; padding: 14px 24px; position: relative; z-index: 1; }
	.data-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
	.data-table { width: 100%; border-collapse: collapse; }
	.data-row td { padding: 6px 0; font-size: 13px; vertical-align: middle; }
	.data-row:not(:last-child) td { border-bottom: 1px solid #FFE6A5; }
	.data-label { width: 38%; color: #6b7280; font-weight: 500; padding-right: 12px; }
	.data-value { color: #111827; font-weight: 600; font-family: 'Nunito', sans-serif; font-size: 13px; }

	/* ── Image sections ──────────────────────────────────────────────────── */
	.image-full-page { position: relative; }

	.section-img-full {
		position: absolute; inset: 0;
		width: 100%; height: 100%;
		object-fit: cover; display: block; z-index: 1;
	}

	.section-img-half {
		position: absolute; inset: 0;
		width: 100%; height: 100%;
		object-fit: cover; display: block;
	}

	.section-placeholder {
		position: absolute; inset: 0;
		display: flex; flex-direction: column;
		align-items: center; justify-content: center;
		gap: 12px; color: #C4B99A;
		font-size: 14px; font-weight: 500;
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

	@media print {
		.no-print { display: none !important; }
		.preview-page { background: none; }
		.pages-wrap { padding: 0; gap: 0; }
		.a4-page { box-shadow: none; page-break-after: always; break-after: page; }
		.a4-page:last-child { page-break-after: avoid; break-after: avoid; }
		* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
		.box-area, .logo-card, .data-bottom, .stock-tag { box-shadow: none !important; }
	}
	@page { size: A4; margin: 0; }
</style>
