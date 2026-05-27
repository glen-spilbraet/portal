<script>
	let { data } = $props();

	const LANGUAGES = [
		{ code: 'en', label: 'English' },
		{ code: 'da', label: 'Dansk' },
		{ code: 'sv', label: 'Svenska' },
		{ code: 'no', label: 'Norsk' }
	];

	// Editable fields
	let name = $state(data.catalogue.name);
	let language = $state(data.catalogue.language);
	let title = $state(data.catalogue.title);
	let logoKey = $state(data.catalogue.logo_key);
	let logoBgColor = $state(data.catalogue.logo_bg_color ?? '#FFFFFF');
	let items = $state([...data.items]);

	// Sheet search
	let sheetQuery = $state('');
	let addingSheet = $state(false);

	// Sheet index for search
	let sheetIndex = $derived(
		data.sheets.map(s => {
			const fields = JSON.parse(s.data_fields || '[]');
			const sku = fields.find(f => f.key === 'sku')?.value || s.sku || '';
			return {
				...s,
				_display: s.name_en || s.name_da || s.name_sv || s.name_no || sku || '(untitled)',
				_search: [s.sku, s.name_en, s.name_da, s.name_sv, s.name_no].filter(Boolean).join(' ').toLowerCase()
			};
		})
	);

	let sheetResults = $derived(
		sheetQuery.trim().length < 1
			? []
			: sheetIndex.filter(s => s._search.includes(sheetQuery.toLowerCase().trim())).slice(0, 8)
	);

	// Check if sheet is already added
	function isAdded(sheetId) {
		return items.some(i => i.sheet_id === sheetId);
	}

	// Save helpers
	async function savePatch(patch) {
		await fetch(`/api/catalogues/${data.catalogue.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(patch)
		});
	}

	function blurName() { savePatch({ name }); }
	function blurTitle() { savePatch({ title }); }

	async function changeLanguage(e) {
		language = e.target.value;
		await savePatch({ language });
	}

	// Cover photo upload + crop
	let coverFileInput;
	let coverImageKey = $state(data.catalogue.cover_image_key ?? null);
	let coverUploading = $state(false);
	let coverCropX = $state(data.catalogue.cover_crop_x ?? 50);
	let coverCropY = $state(data.catalogue.cover_crop_y ?? 50);
	let coverDragState = $state(null);

	async function handleCoverUpload(e) {
		const file = e.target.files?.[0];
		if (!file) return;
		coverUploading = true;
		try {
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch(`/api/catalogues/${data.catalogue.id}/cover`, {
				method: 'POST',
				body: fd
			});
			if (res.ok) {
				const { key } = await res.json();
				coverImageKey = key;
				coverCropX = 50;
				coverCropY = 50;
			}
		} finally {
			coverUploading = false;
		}
		e.target.value = '';
	}

	function startCoverDrag(e) {
		e.preventDefault();
		coverDragState = { startX: e.clientX, startY: e.clientY, startCX: coverCropX, startCY: coverCropY };
	}

	function onWindowMouseMove(e) {
		if (!coverDragState) return;
		coverCropX = Math.max(0, Math.min(100, coverDragState.startCX + (e.clientX - coverDragState.startX) * -0.08));
		coverCropY = Math.max(0, Math.min(100, coverDragState.startCY + (e.clientY - coverDragState.startY) * -0.08));
	}

	function onWindowMouseUp() {
		if (!coverDragState) return;
		coverDragState = null;
		savePatch({ cover_crop_x: coverCropX, cover_crop_y: coverCropY });
	}

	// Logo upload
	let logoFileInput;
	let logoUploading = $state(false);

	async function detectBgColor(file) {
		return new Promise((resolve) => {
			const img = new Image();
			const url = URL.createObjectURL(file);
			img.onload = () => {
				const canvas = document.createElement('canvas');
				canvas.width = img.width; canvas.height = img.height;
				const ctx = canvas.getContext('2d');
				ctx.drawImage(img, 0, 0);
				const corners = [
					ctx.getImageData(0, 0, 1, 1).data,
					ctx.getImageData(img.width - 1, 0, 1, 1).data,
					ctx.getImageData(0, img.height - 1, 1, 1).data,
					ctx.getImageData(img.width - 1, img.height - 1, 1, 1).data,
				];
				const avg = corners.reduce((acc, c) => [acc[0]+c[0], acc[1]+c[1], acc[2]+c[2]], [0,0,0]).map(v => Math.round(v/corners.length));
				const hex = '#' + avg.map(v => v.toString(16).padStart(2,'0')).join('');
				URL.revokeObjectURL(url);
				resolve(hex);
			};
			img.src = url;
		});
	}

	async function handleLogoUpload(e) {
		const file = e.target.files?.[0];
		if (!file) return;
		logoUploading = true;
		try {
			// Detect bg color from the image
			const detectedColor = await detectBgColor(file);

			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch(`/api/catalogues/${data.catalogue.id}/logo`, {
				method: 'POST',
				body: fd
			});
			if (res.ok) {
				const { key } = await res.json();
				logoKey = key;
				logoBgColor = detectedColor;
				// Save the detected bg color
				await savePatch({ logo_bg_color: detectedColor });
			}
		} finally {
			logoUploading = false;
		}
		e.target.value = '';
	}

	// Add sheet to catalogue
	async function addSheet(sheetId) {
		if (isAdded(sheetId) || addingSheet) return;
		addingSheet = true;
		try {
			const res = await fetch(`/api/catalogues/${data.catalogue.id}/items`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sheetId })
			});
			if (res.ok) {
				const { id } = await res.json();
				const sheet = data.sheets.find(s => s.id === sheetId);
				const productName = sheet?.name_en || sheet?.name_da || sheet?.name_sv || sheet?.name_no || '';
				items = [...items, {
					id,
					catalogue_id: data.catalogue.id,
					sheet_id: sheetId,
					display_order: items.length,
					box_image_key: sheet?.box_image_key ?? null,
					product_name: productName,
					data_fields: sheet?.data_fields ?? '[]'
				}];
				sheetQuery = '';
			}
		} finally {
			addingSheet = false;
		}
	}

	// Add all visible search results that aren't already added
	let addingAll = $state(false);
	async function addAllSheets() {
		const toAdd = sheetResults.filter(s => !isAdded(s.id));
		if (toAdd.length === 0 || addingAll) return;
		addingAll = true;
		try {
			for (const sheet of toAdd) {
				const res = await fetch(`/api/catalogues/${data.catalogue.id}/items`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ sheetId: sheet.id })
				});
				if (res.ok) {
					const { id } = await res.json();
					const productName = sheet?.name_en || sheet?.name_da || sheet?.name_sv || sheet?.name_no || '';
					items = [...items, {
						id,
						catalogue_id: data.catalogue.id,
						sheet_id: sheet.id,
						display_order: items.length,
						box_image_key: sheet?.box_image_key ?? null,
						product_name: productName,
						data_fields: sheet?.data_fields ?? '[]'
					}];
				}
			}
			sheetQuery = '';
		} finally {
			addingAll = false;
		}
	}

	// Remove item
	async function removeItem(itemId) {
		const res = await fetch(`/api/catalogues/${data.catalogue.id}/items`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ itemId })
		});
		if (res.ok) {
			items = items.filter(i => i.id !== itemId);
		}
	}

	// Settings modal
	let settingsOpen      = $state(false);
	let settingsName      = $state(data.catalogue.name);
	let settingsLanguage  = $state(data.catalogue.language ?? 'da');
	let settingsListPrice = $state(!!(data.catalogue.show_list_price));
	let settingsSaving    = $state(false);

	async function saveSettings() {
		if (settingsSaving) return;
		settingsSaving = true;
		await savePatch({ name: settingsName, language: settingsLanguage, show_list_price: settingsListPrice ? 1 : 0 });
		name = settingsName;
		language = settingsLanguage;
		settingsSaving = false;
		settingsOpen = false;
	}

	// Share link
	let sharePopoverOpen = $state(false);
	let shareToken = $state(data.catalogue.share_token ?? null);
	let shareLoading = $state(false);
	let shareCopied = $state(false);

	let shareTrackingId = $state('');

	let shareUrl = $derived((() => {
		if (!shareToken) return '';
		const base = `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${shareToken}`;
		const tid = shareTrackingId.trim();
		return tid ? `${base}/${encodeURIComponent(tid)}` : base;
	})());

	async function openShare() {
		sharePopoverOpen = true;
		if (!shareToken) {
			shareLoading = true;
			try {
				const res = await fetch(`/api/catalogues/${data.catalogue.id}/share`, { method: 'POST' });
				if (res.ok) {
					const { shareToken: tok } = await res.json();
					shareToken = tok;
				}
			} finally {
				shareLoading = false;
			}
		}
	}

	async function copyShareLink() {
		if (!shareUrl) return;
		await navigator.clipboard.writeText(shareUrl);
		shareCopied = true;
		setTimeout(() => shareCopied = false, 2000);
	}

	// Title textarea auto-height
	let titleTextarea = $state(null);
	$effect(() => {
		if (titleTextarea) {
			titleTextarea.style.height = 'auto';
			titleTextarea.style.height = titleTextarea.scrollHeight + 'px';
		}
	});

	// ── Image sections ────────────────────────────────────────────────────────
	let sectionFileInputs = $state({});
	let sectionUploadingId = $state(null);
	let addingSectionType = $state(null); // 'image_half' | 'image_full'

	// Text overlay modal
	let editingSectionId = $state(null);
	let editingSectionText = $state('');

	function openSectionTextModal(item) {
		editingSectionId = item.id;
		editingSectionText = item.section_text ?? '';
	}

	function closeSectionTextModal() {
		editingSectionId = null;
		editingSectionText = '';
	}

	async function toggleSectionType(item) {
		const newType = item.type === 'image_half' ? 'image_full' : 'image_half';
		items = items.map(i => i.id === item.id ? { ...i, type: newType } : i);
		await fetch(`/api/catalogues/${data.catalogue.id}/items/${item.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: newType })
		});
	}

	async function saveSectionText() {
		const id = editingSectionId;
		const val = editingSectionText.trim();
		items = items.map(i => i.id === id ? { ...i, section_text: val } : i);
		closeSectionTextModal();
		await fetch(`/api/catalogues/${data.catalogue.id}/items/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ section_text: val })
		});
	}

	async function addImageSection(type) {
		if (addingSectionType) return;
		addingSectionType = type;
		try {
			const res = await fetch(`/api/catalogues/${data.catalogue.id}/items`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ type })
			});
			if (res.ok) {
				const { id } = await res.json();
				items = [...items, {
					id,
					catalogue_id: data.catalogue.id,
					sheet_id: null,
					type,
					section_image_key: null,
					display_order: items.length
				}];
			}
		} finally {
			addingSectionType = null;
		}
	}

	async function uploadSectionImage(item, e) {
		const file = e.target.files?.[0];
		if (!file) return;
		sectionUploadingId = item.id;
		try {
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch(`/api/catalogues/${data.catalogue.id}/items/${item.id}/image`, {
				method: 'POST',
				body: fd
			});
			if (res.ok) {
				const { key } = await res.json();
				items = items.map(i =>
					i.id === item.id ? { ...i, section_image_key: key } : i
				);
			}
		} finally {
			sectionUploadingId = null;
		}
		e.target.value = '';
	}

	// Drag-and-drop reorder
	let dragIndex = $state(-1);
	let dragOverIndex = $state(-1);

	function onDragStart(e, index) {
		dragIndex = index;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', String(index));
	}

	function onDragOver(e, index) {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		dragOverIndex = index;
	}

	function onDragLeave() {
		dragOverIndex = -1;
	}

	async function onDrop(e, index) {
		e.preventDefault();
		if (dragIndex === -1 || dragIndex === index) { dragIndex = -1; dragOverIndex = -1; return; }
		const newItems = [...items];
		const [moved] = newItems.splice(dragIndex, 1);
		newItems.splice(index, 0, moved);
		items = newItems;
		dragIndex = -1;
		dragOverIndex = -1;
		await fetch(`/api/catalogues/${data.catalogue.id}/items`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ orderedIds: newItems.map(i => i.id) })
		});
	}

	function onDragEnd() {
		dragIndex = -1;
		dragOverIndex = -1;
	}

	function getSheetDisplay(item) {
		if (item.product_name) return item.product_name;
		const sheet = data.sheets.find(s => s.id === item.sheet_id);
		return sheet?.name_en || sheet?.name_da || sheet?.name_sv || sheet?.name_no || '(untitled)';
	}

	function getSheetSku(item) {
		try {
			const fields = JSON.parse(item.data_fields || '[]');
			return fields.find(f => f.key === 'sku')?.value || '';
		} catch { return ''; }
	}
</script>

<svelte:head>
	<title>{name || 'Catalogue'} — Catalogues</title>
</svelte:head>

<svelte:window onmousemove={onWindowMouseMove} onmouseup={onWindowMouseUp} />

<div class="page">
	<!-- Toolbar -->
	<div class="toolbar">
		<div class="toolbar-left">
			<a href="/catalogues" class="back-link">
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="15 18 9 12 15 6"/>
				</svg>
				Catalogues
			</a>
			<span class="divider"></span>
			<input
				class="name-input"
				type="text"
				placeholder="Catalogue name"
				bind:value={name}
				onblur={blurName}
			/>
		</div>
		<div class="toolbar-right">
			<!-- Share button + popover -->
			<div class="share-wrap">
				<button class="btn-share" onclick={openShare}>
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
						<line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
						<line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
					</svg>
					Share
				</button>

				{#if sharePopoverOpen}
					<!-- Click-outside backdrop -->
					<div class="share-backdrop" onclick={() => sharePopoverOpen = false} role="presentation"></div>

					<div class="share-popover">
						<p class="share-popover-label">Share link</p>
						{#if shareLoading}
							<div class="share-loading">
								<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 0.7s linear infinite">
									<path d="M21 12a9 9 0 11-6.219-8.56"/>
								</svg>
								Generating link…
							</div>
						{:else if shareUrl}
							<div class="share-link-row">
								<input class="share-link-input" type="text" readonly value={shareUrl} onclick={(e) => e.target.select()} />
								<button class="btn-copy" onclick={copyShareLink} class:copied={shareCopied}>
									{#if shareCopied}
										<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
											<polyline points="20 6 9 17 4 12"/>
										</svg>
										Copied!
									{:else}
										<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
											<path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
										</svg>
										Copy
									{/if}
								</button>
							</div>
							<div class="share-tracking-row">
							<label class="share-tracking-label" for="share-tracking-input">Tracking ID <span class="share-tracking-optional">(optional)</span></label>
							<input
								id="share-tracking-input"
								class="share-tracking-input"
								type="text"
								placeholder="e.g. newsletter-jan"
								bind:value={shareTrackingId}
							/>
						</div>
						<p class="share-hint">Anyone with this link can view and download the catalogue.</p>
						{/if}
					</div>
				{/if}
			</div>

			<button class="btn-settings" onclick={() => { settingsName = name; settingsLanguage = language; settingsOpen = true; }}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="3"/>
					<path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
				</svg>
				Settings
			</button>

			<a href="/catalogues/{data.catalogue.id}/preview" target="_blank" class="btn-preview">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
					<polyline points="15 3 21 3 21 9"/>
					<line x1="10" y1="14" x2="21" y2="3"/>
				</svg>
				Preview
			</a>
		</div>
	</div>

	<div class="layout">
		<!-- Left: Front page preview -->
		<div class="canvas-col">
			<p class="col-label">Front Page</p>
			<div class="a4-card">
				<!-- Cover photo: only shown when uploaded, draggable to reposition -->
				{#if coverImageKey}
					<div
						class="cover-image-wrap"
						class:dragging={!!coverDragState}
						onmousedown={startCoverDrag}
						role="img"
						aria-label="Cover photo"
						tabindex="-1"
					>
						<img
							src="/api/img/{coverImageKey}"
							alt="Cover"
							class="cover-img"
							style="object-position: {coverCropX}% {coverCropY}%"
							draggable="false"
						/>
						<div class="cover-drag-hint">Drag to reposition</div>
					</div>
				{/if}
				<input bind:this={coverFileInput} type="file" accept="image/*" style="display:none" onchange={handleCoverUpload} />

				<img class="pattern-overlay" src="/pattern.png" alt="" aria-hidden="true" />

				<!-- Logo — centered at the midpoint between cover and lower half -->
				<div class="logo-section">
					<button
						class="logo-box"
						style="background: {logoBgColor}"
						onclick={() => logoFileInput.click()}
						disabled={logoUploading}
						title="Click to upload logo"
					>
						{#if logoUploading}
							<div class="logo-spinner"></div>
						{:else if logoKey}
							<img src="/api/img/{logoKey}" alt="Catalogue logo" class="logo-img" />
							<div class="logo-replace-hint">Replace logo</div>
						{:else}
							<div class="logo-placeholder">
								<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
									<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
									<polyline points="21 15 16 10 5 21"/>
								</svg>
								<span>Upload logo</span>
							</div>
						{/if}
					</button>
					<input bind:this={logoFileInput} type="file" accept="image/*" style="display:none" onchange={handleLogoUpload} />
				</div>

				<!-- Language-matched logo at the bottom -->
				<img
					src={language === 'sv' ? '/logo-se.svg' : language === 'no' ? '/logo-no.svg' : '/logo-da.svg'}
					alt="Logo"
					class="front-logo"
				/>

				<!-- Title -->
				<div class="title-section">
					<textarea
						class="title-input"
						placeholder="Catalogue title…"
						bind:value={title}
						bind:this={titleTextarea}
						onblur={blurTitle}
						rows="1"
						oninput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
					></textarea>
				</div>
			</div>
			<p class="col-hint">Click the logo box to upload a logo. Drag the cover photo to reposition.</p>
		</div>

		<!-- Right: Sheet search + items list -->
		<div class="panel-col">
			<!-- Front cover upload -->
			<div class="panel-section">
				<p class="col-label">Front Cover</p>
				<button class="cover-upload-btn" onclick={() => coverFileInput.click()} disabled={coverUploading}>
					{#if coverUploading}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 0.7s linear infinite">
							<path d="M21 12a9 9 0 11-6.219-8.56"/>
						</svg>
						Uploading…
					{:else if coverImageKey}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
							<polyline points="17 8 12 3 7 8"/>
							<line x1="12" y1="3" x2="12" y2="15"/>
						</svg>
						Replace cover photo
					{:else}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
							<polyline points="17 8 12 3 7 8"/>
							<line x1="12" y1="3" x2="12" y2="15"/>
						</svg>
						Upload cover photo
					{/if}
				</button>
				{#if coverImageKey}
					<p class="cover-hint">Drag the photo on the canvas to reposition</p>
				{/if}
			</div>

			<!-- Search panel -->
			<div class="panel-section">
				<p class="col-label">Add Sheets</p>
				<div class="search-wrap">
					<svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
					</svg>
					<input
						class="search-input"
						type="search"
						placeholder="Search sheets by SKU or name…"
						bind:value={sheetQuery}
					/>
				</div>

				{#if sheetResults.length > 0}
					{@const unadded = sheetResults.filter(s => !isAdded(s.id))}
					{#if unadded.length > 1}
						<button
							class="add-all-btn"
							onclick={addAllSheets}
							disabled={addingAll}
						>
							{#if addingAll}
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="spin">
									<path d="M21 12a9 9 0 11-6.219-8.56"/>
								</svg>
								Adding…
							{:else}
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
									<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
								</svg>
								Add all {unadded.length}
							{/if}
						</button>
					{/if}
					<div class="results-list">
						{#each sheetResults as sheet}
							<button
								class="result-item"
								class:already-added={isAdded(sheet.id)}
								onclick={() => addSheet(sheet.id)}
								disabled={isAdded(sheet.id) || addingSheet}
							>
								{#if sheet.box_image_key}
									<img src="/api/img/{sheet.box_image_key}?size=300" alt="" class="result-thumb" />
								{:else}
									<div class="result-thumb-empty">
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
											<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
										</svg>
									</div>
								{/if}
								<div class="result-info">
									<span class="result-name">{sheet._display}</span>
									<span class="result-sku">{sheet.sku}</span>
								</div>
								{#if isAdded(sheet.id)}
									<span class="added-tag">Added</span>
								{:else}
									<svg class="add-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
										<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
									</svg>
								{/if}
							</button>
						{/each}
					</div>
				{:else if sheetQuery.trim().length > 0}
					<p class="no-results">No sheets match "{sheetQuery}"</p>
				{/if}
			</div>

			<!-- Items list -->
			<div class="panel-section">
				<p class="col-label">
					Items in Catalogue
					<span class="count-badge">{items.length}</span>
				</p>

				{#if items.length === 0}
					<div class="empty-items">
						<p>No items added yet. Search above to add sheets.</p>
					</div>
				{:else}
					<div class="items-list">
						{#each items as item, idx}
							<div
								class="item-row"
								class:drag-over={dragOverIndex === idx && dragIndex !== idx}
								class:dragging={dragIndex === idx}
								draggable="true"
								ondragstart={(e) => onDragStart(e, idx)}
								ondragover={(e) => onDragOver(e, idx)}
								ondragleave={onDragLeave}
								ondrop={(e) => onDrop(e, idx)}
								ondragend={onDragEnd}
							>
								<div class="drag-handle" title="Drag to reorder">
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
										<circle cx="9" cy="5" r="1" fill="currentColor" stroke="none"/>
										<circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/>
										<circle cx="9" cy="19" r="1" fill="currentColor" stroke="none"/>
										<circle cx="15" cy="5" r="1" fill="currentColor" stroke="none"/>
										<circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/>
										<circle cx="15" cy="19" r="1" fill="currentColor" stroke="none"/>
									</svg>
								</div>

								{#if item.type === 'image_half' || item.type === 'image_full'}
									<!-- Image section item -->
									{#if item.section_image_key}
										<div class="item-section-preview">
											<img
												src="/api/img/{item.section_image_key}"
												alt=""
												class="item-section-img"
											/>
										</div>
									{:else}
										<button
											class="item-section-upload"
											disabled={sectionUploadingId === item.id}
											onclick={() => sectionFileInputs[item.id]?.click()}
											title="Upload photo"
										>
											{#if sectionUploadingId === item.id}
												<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="animation: spin 0.7s linear infinite">
													<path d="M21 12a9 9 0 11-6.219-8.56"/>
												</svg>
											{:else}
												<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
													<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
													<polyline points="21 15 16 10 5 21"/>
												</svg>
											{/if}
										</button>
									{/if}
									<input
										type="file"
										accept="image/*"
										style="display:none"
										bind:this={sectionFileInputs[item.id]}
										onchange={(e) => uploadSectionImage(item, e)}
									/>
									<div class="item-info">
										<button class="section-text-btn" onclick={() => openSectionTextModal(item)}>
											{#if item.section_text}
												<span class="section-text-value">{item.section_text}</span>
											{:else}
												<span class="section-text-empty">No text</span>
											{/if}
										</button>
										<span class="item-sku">
											{item.type === 'image_full' ? 'Full page' : 'Half page'} · <button class="item-replace-link" onclick={() => sectionFileInputs[item.id]?.click()}>{item.section_image_key ? 'Replace photo' : 'Upload photo'}</button>
										</span>
									</div>
									<button
									class="item-type-badge"
									class:full={item.type === 'image_full'}
									onclick={() => toggleSectionType(item)}
									title={item.type === 'image_full' ? 'Switch to half page' : 'Switch to full page'}
								>{item.type === 'image_full' ? 'Full' : '½'}</button>
								{:else}
									<!-- Sheet item -->
									{#if item.box_image_key}
										<img src="/api/img/{item.box_image_key}?size=300" alt="" class="item-thumb" />
									{:else}
										<div class="item-thumb-empty">
											<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
												<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
											</svg>
										</div>
									{/if}
									<div class="item-info">
										<span class="item-name">{getSheetDisplay(item)}</span>
										<span class="item-sku">{getSheetSku(item)}</span>
									</div>
								{/if}

								<div class="item-actions">
									<button class="icon-btn danger" onclick={() => removeItem(item.id)} title="Remove">
										<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
										</svg>
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Add image section buttons -->
				<div class="add-section-row">
					<button
						class="btn-add-section"
						onclick={() => addImageSection('image_half')}
						disabled={addingSectionType !== null}
						title="Add a half-page image section"
					>
						{#if addingSectionType === 'image_half'}
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="animation: spin 0.7s linear infinite">
								<path d="M21 12a9 9 0 11-6.219-8.56"/>
							</svg>
						{:else}
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
								<polyline points="21 15 16 10 5 21"/>
							</svg>
						{/if}
						Half page image
					</button>
					<button
						class="btn-add-section"
						onclick={() => addImageSection('image_full')}
						disabled={addingSectionType !== null}
						title="Add a full-page image section"
					>
						{#if addingSectionType === 'image_full'}
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="animation: spin 0.7s linear infinite">
								<path d="M21 12a9 9 0 11-6.219-8.56"/>
							</svg>
						{:else}
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
								<polyline points="21 15 16 10 5 21"/>
							</svg>
						{/if}
						Full page image
					</button>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Text overlay modal -->
{#if editingSectionId}
	<div class="text-modal-backdrop" onclick={closeSectionTextModal} role="presentation"></div>
	<div class="text-modal">
		<p class="text-modal-label">Text overlay</p>
		<input
			class="text-modal-input"
			type="text"
			placeholder="Enter text…"
			bind:value={editingSectionText}
			onkeydown={(e) => { if (e.key === 'Enter') saveSectionText(); if (e.key === 'Escape') closeSectionTextModal(); }}
			autofocus
		/>
		<div class="text-modal-actions">
			<button class="text-modal-cancel" onclick={closeSectionTextModal}>Cancel</button>
			<button class="text-modal-save" onclick={saveSectionText}>Save</button>
		</div>
	</div>
{/if}

<!-- ── Settings modal ──────────────────────────────────────────────────────── -->
{#if settingsOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="settings-overlay" onclick={(e) => { if (e.target === e.currentTarget) settingsOpen = false; }}>
		<div class="settings-dialog">
			<div class="settings-dialog-header">
				<h2>Catalogue Settings</h2>
				<button class="settings-close" onclick={() => settingsOpen = false} aria-label="Close">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
				</button>
			</div>

			<div class="settings-field">
				<label for="settings-name">Catalogue Name</label>
				<input id="settings-name" type="text" bind:value={settingsName} placeholder="Catalogue name…" />
			</div>

			<div class="settings-field">
				<label for="settings-lang">Language</label>
				<select id="settings-lang" bind:value={settingsLanguage}>
					{#each LANGUAGES as l}
						<option value={l.code}>{l.label}</option>
					{/each}
				</select>
			</div>

			<div class="settings-field">
				<label class="settings-toggle-label">
					<span class="settings-toggle-text">
						<span class="settings-toggle-title">Price List Visibility</span>
						<span class="settings-toggle-sub">Show Listepris on each product, overriding sheet-level visibility</span>
					</span>
					<button
						class="toggle-switch"
						class:toggle-on={settingsListPrice}
						onclick={() => settingsListPrice = !settingsListPrice}
						role="switch"
						aria-checked={settingsListPrice}
						type="button"
					>
						<span class="toggle-knob"></span>
					</button>
				</label>
			</div>

			<div class="settings-dialog-footer">
				<button class="settings-btn-cancel" onclick={() => settingsOpen = false}>Cancel</button>
				<button class="settings-btn-save" onclick={saveSettings} disabled={settingsSaving}>
					{settingsSaving ? 'Saving…' : 'Save settings'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: #F2F2F3;
	}

	/* ── Toolbar ─────────────────────────────────────────────────────────── */
	.toolbar {
		background: white;
		border-bottom: 1px solid var(--border);
		padding: 0 24px;
		height: 52px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-shrink: 0;
	}

	.toolbar-left {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}

	.toolbar-right {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.back-link {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 13px;
		color: #71717A;
		text-decoration: none;
		font-weight: 500;
		flex-shrink: 0;
		transition: color 0.15s;
	}
	.back-link:hover { color: #18181B; }

	.divider {
		width: 1px;
		height: 18px;
		background: var(--border);
		flex-shrink: 0;
	}

	.name-input {
		font-size: 14px;
		font-weight: 700;
		color: #18181B;
		border: none;
		background: transparent;
		outline: none;
		font-family: inherit;
		min-width: 180px;
		max-width: 340px;
		width: 100%;
		letter-spacing: -0.2px;
		padding: 4px 6px;
		border-radius: 6px;
		transition: background 0.15s;
	}
	.name-input:hover { background: #F4F4F5; }
	.name-input:focus { background: #F4F4F5; }

	.lang-select {
		font-size: 13px;
		font-family: inherit;
		color: #52525B;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: white;
		padding: 5px 10px;
		outline: none;
		cursor: pointer;
		transition: border-color 0.15s;
	}
	.lang-select:focus { border-color: #A1A1AA; }

	.btn-preview {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		background: #F57832;
		color: white;
		border-radius: 100px;
		font-size: 13px;
		font-weight: 600;
		text-decoration: none;
		transition: background 0.15s;
		letter-spacing: -0.1px;
	}
	.btn-preview:hover { background: #E06820; }

	/* ── Settings button ─────────────────────────────────────────────────── */
	.btn-settings {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		background: #F97316;
		border: none;
		border-radius: 100px;
		color: #fff;
		font-size: 13px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s;
		white-space: nowrap;
	}
	.btn-settings:hover { background: #E06820; }

	/* ── Settings modal ──────────────────────────────────────────────────── */
	.settings-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.45);
		z-index: 300;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.settings-dialog {
		background: #fff;
		border-radius: 14px;
		width: 420px;
		max-width: calc(100vw - 32px);
		box-shadow: 0 8px 40px rgba(0,0,0,0.18);
		overflow: hidden;
	}
	.settings-dialog-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 24px 16px;
		border-bottom: 1px solid #efefed;
	}
	.settings-dialog-header h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 700;
		color: #1a1a18;
	}
	.settings-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: none;
		border: none;
		border-radius: 6px;
		color: #888;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.settings-close:hover { background: #f1f1f0; color: #222; }

	.settings-field {
		padding: 16px 24px;
		border-bottom: 1px solid #f3f3f1;
	}
	.settings-field:last-of-type { border-bottom: none; }
	.settings-field > label {
		display: block;
		font-size: 12px;
		font-weight: 600;
		color: #666;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		margin-bottom: 8px;
	}
	.settings-field input,
	.settings-field select {
		width: 100%;
		box-sizing: border-box;
		padding: 8px 11px;
		border: 1px solid #ddd;
		border-radius: 8px;
		font-size: 14px;
		font-family: inherit;
		color: #1a1a18;
		background: #fafaf9;
		outline: none;
		transition: border-color 0.15s;
	}
	.settings-field input:focus,
	.settings-field select:focus { border-color: #F97316; background: #fff; }

	.settings-toggle-label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		cursor: pointer;
	}
	.settings-toggle-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.settings-toggle-title {
		font-size: 14px;
		font-weight: 600;
		color: #1a1a18;
	}
	.settings-toggle-sub {
		font-size: 12px;
		color: #888;
		line-height: 1.4;
	}
	.toggle-switch {
		position: relative;
		flex-shrink: 0;
		width: 44px;
		height: 24px;
		background: #d1d5db;
		border: none;
		border-radius: 12px;
		cursor: pointer;
		transition: background 0.2s;
		padding: 0;
	}
	.toggle-switch.toggle-on { background: #F97316; }
	.toggle-knob {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 18px;
		height: 18px;
		background: #fff;
		border-radius: 50%;
		box-shadow: 0 1px 3px rgba(0,0,0,0.2);
		transition: transform 0.2s;
	}
	.toggle-switch.toggle-on .toggle-knob { transform: translateX(20px); }

	.settings-dialog-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		padding: 16px 24px;
		border-top: 1px solid #efefed;
		background: #fafaf9;
	}
	.settings-btn-cancel {
		padding: 8px 16px;
		background: none;
		border: 1px solid #ddd;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		color: #555;
		cursor: pointer;
		transition: background 0.15s;
	}
	.settings-btn-cancel:hover { background: #f1f1f0; }
	.settings-btn-save {
		padding: 8px 18px;
		background: #F97316;
		border: none;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 700;
		color: #fff;
		cursor: pointer;
		transition: background 0.15s;
	}
	.settings-btn-save:hover:not(:disabled) { background: #E06820; }
	.settings-btn-save:disabled { opacity: 0.6; cursor: not-allowed; }

	/* ── Layout ──────────────────────────────────────────────────────────── */
	.layout {
		flex: 1;
		display: grid;
		grid-template-columns: 860px 1fr;
		gap: 32px;
		padding: 32px 28px 60px;
		max-width: 1400px;
		margin: 0 auto;
		width: 100%;
	}

	.col-label {
		font-size: 11px;
		font-weight: 700;
		color: #A1A1AA;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		margin-bottom: 10px;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.col-hint {
		font-size: 12px;
		color: #A1A1AA;
		margin-top: 8px;
	}

	/* ── A4 Canvas ───────────────────────────────────────────────────────── */
	.canvas-col {
		min-width: 0;
	}

	.a4-card {
		width: 794px;
		height: 1123px;
		background: #FFF5D2;
		border-radius: 4px;
		box-shadow: 0 4px 24px rgba(50,30,0,0.14);
		position: relative;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0;
	}

	.pattern-overlay {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0.15;
		pointer-events: none;
	}

	/* ── Cover photo (top half of a4-card, only shown when uploaded) ──────── */
	.cover-image-wrap {
		position: absolute;
		top: 0; left: 0; right: 0;
		height: 50%;
		overflow: hidden;
		z-index: 1;
		cursor: grab;
		user-select: none;
	}
	.cover-image-wrap.dragging { cursor: grabbing; }

	.cover-img {
		width: 100%; height: 100%;
		object-fit: cover;
		display: block;
		pointer-events: none;
	}

	.cover-drag-hint {
		position: absolute;
		bottom: 12px; left: 50%;
		transform: translateX(-50%);
		font-size: 11px;
		font-weight: 600;
		background: rgba(0,0,0,0.5);
		color: rgba(255,255,255,0.9);
		padding: 3px 10px;
		border-radius: 100px;
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.2s;
		white-space: nowrap;
	}
	.cover-image-wrap:hover .cover-drag-hint { opacity: 1; }

	/* ── Cover upload button (panel) ─────────────────────────────────────── */
	.cover-upload-btn {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 8px 14px;
		background: #F57832;
		color: white;
		border: none;
		border-radius: 100px;
		font-size: 13px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s;
		width: 100%;
		justify-content: center;
	}
	.cover-upload-btn:hover { background: #E06820; }
	.cover-upload-btn:disabled { opacity: 0.6; cursor: not-allowed; }

	.cover-hint {
		font-size: 12px;
		color: #A1A1AA;
		margin-top: 8px;
		text-align: center;
	}

	/* ── Logo section ────────────────────────────────────────────────────── */
	.logo-section {
		position: absolute;
		z-index: 3;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.logo-box {
		width: 220px;
		height: 220px;
		border-radius: 24px;
		box-shadow: 0 8px 32px rgba(50,30,0,0.18), 0 2px 8px rgba(50,30,0,0.10);
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		overflow: hidden;
		border: none;
		cursor: pointer;
		transition: box-shadow 0.2s, transform 0.15s;
		font-family: inherit;
	}
	.logo-box:hover { box-shadow: 0 12px 40px rgba(50,30,0,0.22); transform: translateY(-2px); }
	.logo-box:disabled { cursor: not-allowed; opacity: 0.8; }

	.logo-img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		padding: 20px;
	}

	.logo-replace-hint {
		position: absolute;
		inset: 0;
		background: rgba(0,0,0,0.45);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 13px;
		font-weight: 600;
		opacity: 0;
		transition: opacity 0.2s;
		border-radius: 24px;
	}
	.logo-box:hover .logo-replace-hint { opacity: 1; }

	.logo-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		color: #A1A1AA;
		font-size: 13px;
		font-weight: 500;
	}

	.logo-spinner {
		width: 32px;
		height: 32px;
		border: 3px solid rgba(0,0,0,0.1);
		border-top-color: #18181B;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	/* ── Language logo (bottom of front page) ───────────────────────────── */
	.front-logo {
		position: absolute;
		bottom: 40px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 3;
		max-height: 52px;
		max-width: 220px;
		object-fit: contain;
	}

	/* ── Title section ───────────────────────────────────────────────────── */
	.title-section {
		position: absolute;
		z-index: 3;
		left: 50%;
		top: calc(50% + 110px + 40px); /* 110px = half logo height, 40px = gap */
		transform: translateX(-50%);
		width: 500px;
		text-align: center;
	}

	.title-input {
		width: 100%;
		background: transparent;
		border: none;
		outline: none;
		font-size: 42px;
		font-weight: 800;
		color: #18181B;
		text-align: center;
		font-family: inherit;
		letter-spacing: -1px;
		padding: 4px 0;
		border-radius: 0;
		resize: none;
		overflow: hidden;
		display: block;
		line-height: 1.15;
		box-sizing: border-box;
	}
	.title-input::placeholder { color: #C4B99A; }

	/* ── Panel column ────────────────────────────────────────────────────── */
	.panel-col {
		display: flex;
		flex-direction: column;
		gap: 24px;
		min-width: 0;
	}

	.panel-section {
		background: white;
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
		box-shadow: var(--shadow);
		padding: 18px 20px;
	}

	/* ── Sheet search ────────────────────────────────────────────────────── */
	.search-wrap {
		position: relative;
		display: flex;
		align-items: center;
		margin-bottom: 12px;
	}

	.search-icon {
		position: absolute;
		left: 10px;
		color: #A1A1AA;
		pointer-events: none;
	}

	.search-input {
		width: 100%;
		padding: 8px 12px 8px 32px;
		border: 1px solid var(--border);
		border-radius: 100px;
		font-size: 13px;
		font-family: inherit;
		color: #18181B;
		background: white;
		outline: none;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	.search-input::placeholder { color: #A1A1AA; }
	.search-input:focus {
		border-color: #A1A1AA;
		box-shadow: 0 0 0 3px rgba(0,0,0,0.05);
	}

	@keyframes spin { to { transform: rotate(360deg); } }
	.spin { animation: spin 0.7s linear infinite; }

	.add-all-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		width: 100%;
		padding: 7px 12px;
		margin-bottom: 6px;
		background: white;
		border: 1px solid var(--border);
		border-radius: 9px;
		font-size: 12.5px;
		font-weight: 700;
		font-family: inherit;
		color: #52525B;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
	}
	.add-all-btn:hover:not(:disabled) {
		background: #F57832;
		border-color: #F57832;
		color: white;
	}
	.add-all-btn:disabled { opacity: 0.6; cursor: default; }

	.results-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.result-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border-radius: 8px;
		border: none;
		background: none;
		font-family: inherit;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition: background 0.12s;
	}
	.result-item:hover:not(:disabled) { background: #F4F4F5; }
	.result-item.already-added { opacity: 0.6; cursor: not-allowed; }

	.result-thumb {
		width: 36px;
		height: 36px;
		border-radius: 6px;
		object-fit: contain;
		background: #F9F7F3;
		flex-shrink: 0;
		border: 1px solid var(--border);
	}

	.result-thumb-empty {
		width: 36px;
		height: 36px;
		border-radius: 6px;
		background: #F4F4F5;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #D4D4D8;
		flex-shrink: 0;
		border: 1px solid var(--border);
	}

	.result-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.result-name {
		font-size: 13px;
		font-weight: 600;
		color: #18181B;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.result-sku {
		font-size: 11px;
		color: #A1A1AA;
		font-weight: 500;
	}

	.added-tag {
		font-size: 11px;
		font-weight: 600;
		color: #16a34a;
		background: #DCFCE7;
		padding: 2px 7px;
		border-radius: 100px;
		flex-shrink: 0;
	}

	.add-icon {
		color: #A1A1AA;
		flex-shrink: 0;
	}

	.no-results {
		font-size: 13px;
		color: #A1A1AA;
		padding: 8px 4px;
	}

	/* ── Items list ──────────────────────────────────────────────────────── */
	.count-badge {
		font-size: 11px;
		font-weight: 700;
		padding: 1px 7px;
		background: #F4F4F5;
		color: #71717A;
		border-radius: 100px;
		text-transform: none;
		letter-spacing: 0;
	}

	.empty-items {
		padding: 24px 0;
		text-align: center;
		font-size: 13px;
		color: #A1A1AA;
	}

	.items-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.item-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 6px;
		border-radius: 8px;
		transition: background 0.12s, opacity 0.12s;
		cursor: default;
	}
	.item-row:hover { background: #F9F9F9; }
	.item-row.dragging { opacity: 0.4; }
	.item-row.drag-over { background: #EEF2FF; outline: 2px dashed #A5B4FC; outline-offset: -2px; }

	.drag-handle {
		color: #C4C4C4;
		cursor: grab;
		display: flex;
		align-items: center;
		padding: 2px;
		flex-shrink: 0;
		transition: color 0.12s;
	}
	.item-row:hover .drag-handle { color: #A1A1AA; }
	.drag-handle:active { cursor: grabbing; }

	.item-thumb {
		width: 36px;
		height: 36px;
		border-radius: 6px;
		object-fit: contain;
		background: #F9F7F3;
		flex-shrink: 0;
		border: 1px solid var(--border);
	}

	.item-thumb-empty {
		width: 36px;
		height: 36px;
		border-radius: 6px;
		background: #F4F4F5;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #D4D4D8;
		flex-shrink: 0;
		border: 1px solid var(--border);
	}

	.item-info {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.item-name {
		font-size: 13px;
		font-weight: 600;
		color: #18181B;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.item-sku {
		font-size: 11px;
		color: #A1A1AA;
		font-weight: 500;
	}

	.item-actions {
		display: flex;
		align-items: center;
		gap: 2px;
		flex-shrink: 0;
	}

	.icon-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: none;
		border-radius: 6px;
		color: #71717A;
		cursor: pointer;
		font-family: inherit;
		transition: background 0.12s, color 0.12s;
	}
	.icon-btn:hover:not(:disabled) { background: #F4F4F5; color: #18181B; }
	.icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }
	.icon-btn.danger:hover:not(:disabled) { background: #FEF2F2; color: var(--danger); }

	/* ── Share button + popover ──────────────────────────────────────────── */
	.share-wrap {
		position: relative;
	}

	.btn-share {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 14px;
		background: #F57832;
		color: white;
		border: none;
		border-radius: 100px;
		font-size: 13px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s;
		letter-spacing: -0.1px;
	}
	.btn-share:hover { background: #e06820; }

	.share-backdrop {
		position: fixed;
		inset: 0;
		z-index: 99;
	}

	.share-popover {
		position: absolute;
		top: calc(100% + 10px);
		right: 0;
		z-index: 100;
		background: white;
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow: 0 8px 32px rgba(0,0,0,0.12);
		padding: 16px;
		width: 360px;
	}

	.share-popover-label {
		font-size: 11px;
		font-weight: 700;
		color: #A1A1AA;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		margin-bottom: 10px;
	}

	.share-loading {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		color: #71717A;
		padding: 4px 0;
	}

	.share-link-row {
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.share-link-input {
		flex: 1;
		min-width: 0;
		font-size: 12px;
		font-family: inherit;
		color: #52525B;
		background: #F4F4F5;
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 7px 10px;
		outline: none;
		cursor: text;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.btn-copy {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 7px 12px;
		background: #F57832;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.15s;
		flex-shrink: 0;
		white-space: nowrap;
	}
	.btn-copy:hover { background: #E06820; }
	.btn-copy.copied { background: #16a34a; }

	.share-tracking-row {
		margin-top: 10px;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.share-tracking-label {
		font-size: 11px;
		font-weight: 700;
		color: #71717A;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.share-tracking-optional {
		font-weight: 500;
		text-transform: none;
		color: #A1A1AA;
		letter-spacing: 0;
	}

	.share-tracking-input {
		width: 100%;
		box-sizing: border-box;
		padding: 7px 10px;
		border: 1px solid var(--border);
		border-radius: 8px;
		font-size: 13px;
		font-family: inherit;
		color: #18181B;
		outline: none;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	.share-tracking-input:focus {
		border-color: #F57832;
		box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.12);
	}
	.share-tracking-input::placeholder { color: #D4D4D8; }

	.share-hint {
		font-size: 12px;
		color: #A1A1AA;
		margin-top: 8px;
	}

	/* ── Image section items ─────────────────────────────────────────────── */
	.item-section-preview {
		width: 36px;
		height: 36px;
		border-radius: 6px;
		overflow: hidden;
		flex-shrink: 0;
		border: 1px solid var(--border);
	}

	.item-section-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.item-section-upload {
		width: 36px;
		height: 36px;
		border-radius: 6px;
		background: #F4F4F5;
		border: 1px dashed #D4D4D8;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #A1A1AA;
		flex-shrink: 0;
		cursor: pointer;
		transition: background 0.12s, color 0.12s;
		font-family: inherit;
	}
	.item-section-upload:hover:not(:disabled) { background: #EBEBEC; color: #71717A; }
	.item-section-upload:disabled { opacity: 0.5; cursor: not-allowed; }

	.item-type-badge {
		font-size: 10px;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 5px;
		background: #EEF2FF;
		color: #6366F1;
		flex-shrink: 0;
		white-space: nowrap;
		border: none;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.12s, color 0.12s;
	}
	.item-type-badge:hover { background: #C7D2FE; color: #4338CA; }
	.item-type-badge.full { background: #FDF2FF; color: #A855F7; }
	.item-type-badge.full:hover { background: #F3E8FF; color: #7E22CE; }

	.item-replace-link {
		font-size: 11px;
		color: #6366F1;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-family: inherit;
		text-align: left;
		text-decoration: underline;
		text-underline-offset: 2px;
		transition: color 0.12s;
	}
	.item-replace-link:hover { color: #4F46E5; }

	/* Clickable text label in item row */
	.section-text-btn {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		font-family: inherit;
		text-align: left;
		width: 100%;
		min-width: 0;
	}
	.section-text-value {
		font-size: 13px;
		font-weight: 600;
		color: #18181B;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
	}
	.section-text-empty {
		font-size: 13px;
		font-weight: 500;
		color: #C4C4C4;
		display: block;
	}
	.section-text-btn:hover .section-text-value,
	.section-text-btn:hover .section-text-empty {
		color: #6366F1;
	}

	/* Text overlay modal */
	.text-modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: rgba(0,0,0,0.25);
	}
	.text-modal {
		position: fixed;
		z-index: 201;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: white;
		border-radius: 16px;
		box-shadow: 0 16px 48px rgba(0,0,0,0.18);
		padding: 20px 20px 16px;
		width: 320px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.text-modal-label {
		font-size: 11px;
		font-weight: 700;
		color: #A1A1AA;
		text-transform: uppercase;
		letter-spacing: 0.6px;
	}
	.text-modal-input {
		width: 100%;
		font-size: 14px;
		font-family: inherit;
		color: #18181B;
		background: #F4F4F5;
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 9px 12px;
		outline: none;
		box-sizing: border-box;
		transition: border-color 0.12s, background 0.12s;
	}
	.text-modal-input:focus { border-color: #A1A1AA; background: white; }
	.text-modal-input::placeholder { color: #C4C4C4; }
	.text-modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
	}
	.text-modal-cancel {
		padding: 7px 14px;
		border-radius: 8px;
		border: none;
		background: #F4F4F5;
		color: #52525B;
		font-size: 13px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.12s;
	}
	.text-modal-cancel:hover { background: #E4E4E7; }
	.text-modal-save {
		padding: 7px 16px;
		border-radius: 8px;
		border: none;
		background: #F57832;
		color: white;
		font-size: 13px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.12s;
	}
	.text-modal-save:hover { background: #E06820; }

	/* ── Add image section buttons ───────────────────────────────────────── */
	.add-section-row {
		display: flex;
		gap: 6px;
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
	}

	.btn-add-section {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		padding: 7px 10px;
		background: #F4F4F5;
		color: #52525B;
		border: 1px dashed #D4D4D8;
		border-radius: 8px;
		font-size: 12px;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: background 0.12s, color 0.12s, border-color 0.12s;
		white-space: nowrap;
	}
	.btn-add-section:hover:not(:disabled) {
		background: #EBEBEC;
		color: #18181B;
		border-color: #A1A1AA;
	}
	.btn-add-section:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
