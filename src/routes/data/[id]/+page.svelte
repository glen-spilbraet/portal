<script>
	import * as XLSX from 'xlsx';

	let { data } = $props();
	const p = data.product;

	// ── State ──────────────────────────────────────────────────────────────────
	let name = $state(p.name);
	let headers = $state(JSON.parse(p.template_headers || '[]'));
	let mappings = $state(JSON.parse(p.mappings || '{}'));
	let skuText = $state(JSON.parse(p.skus || '[]').join('\n'));
	let hasTemplateFile = $state(!!p.template_key);
	// 'upload' = use R2 file, 'custom' = manually defined headers
	let templateMode = $state(
		p.template_key
			? 'upload'
			: (JSON.parse(p.template_headers || '[]').length > 0 ? 'custom' : 'upload')
	);
	let hasTemplate = $derived(templateMode === 'upload' ? hasTemplateFile : headers.length > 0);

	// Custom header builder state
	let newHeaderInput = $state('');
	let customHeadersDirty = $state(false);
	let savingCustomHeaders = $state(false);

	// UI state
	let templateUploading = $state(false);
	let savingMappings = $state(false);
	let savedMappingsJson = $state(p.mappings || '{}');
	let mappingsDirty = $derived(JSON.stringify(mappings) !== savedMappingsJson);
	let hasCostMapping = $derived(Object.values(mappings).some(v => typeof v === 'string' && v.endsWith(':cost')));
	let exporting = $state(false);
	let exportProgress = $state({ done: 0, total: 0 }); // SKU fetch progress
	let exportResult = $state(null);

	// Rackbeat field definitions (loaded dynamically)
	let standardFields = $state([
		{ key: 'sku',            label: 'Item Number (SKU)' },
		{ key: 'name',           label: 'Product Name' },
		{ key: 'description',    label: 'Description' },
		{ key: 'ean',            label: 'EAN / Barcode' },
		{ key: 'sales_price',    label: 'Sales Price' },
		{ key: 'purchase_price', label: 'Purchase Price' },
		{ key: 'currency',       label: 'Currency' },
		{ key: 'unit',           label: 'Unit' },
		{ key: 'colli',          label: 'Colli / Package Size' },
		{ key: 'height',         label: 'Height' },
		{ key: 'width',          label: 'Width' },
		{ key: 'depth',          label: 'Depth' },
		{ key: 'weight',         label: 'Weight' },
		{ key: 'size_unit',      label: 'Size Unit' },
		{ key: 'weight_unit',    label: 'Weight Unit' },
		{ key: 'is_active',      label: 'Active' },
	]);
	let customFields = $state([]);
	let priceFields  = $state([]);
	let fieldsLoading = $state(false);
	let fieldsLoaded = $state(false);
	let fieldsSkuInput = $state('LPFI403');
	let sampleData = $state(null);
	let sampleSku  = $state('');

	// Searchable dropdown state
	let openDropdown = $state(null);   // header string of the open dropdown
	let dropdownSearch = $state('');
	let searchInputEl = $state(null);

	function allFields() {
		return [
			...standardFields.map(f => ({ ...f, group: 'Standard Fields' })),
			...priceFields.map(f => ({ ...f, group: 'Prices' })),
			...customFields.map(f => ({ ...f, group: 'Custom Fields' }))
		];
	}

	function filteredFields() {
		const q = dropdownSearch.toLowerCase().trim();
		const fields = allFields();
		if (!q) return fields;
		return fields.filter(f => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q));
	}

	function groupedFiltered() {
		const fields = filteredFields();
		const groups = {};
		for (const f of fields) {
			if (!groups[f.group]) groups[f.group] = [];
			groups[f.group].push(f);
		}
		return Object.entries(groups).map(([label, items]) => ({ label, items }));
	}

	function getLabelForKey(key) {
		if (!key) return '';
		return allFields().find(f => f.key === key)?.label ?? key;
	}

	function openDd(header) {
		openDropdown = header;
		dropdownSearch = '';
		// Focus search after render
		setTimeout(() => searchInputEl?.focus(), 20);
	}

	function closeDd() {
		openDropdown = null;
		dropdownSearch = '';
	}

	function selectField(header, key) {
		mappings[header] = key;
		closeDd();
	}

	async function loadRackbeatFields(skuOverride) {
		const sku = (skuOverride || fieldsSkuInput || 'LPFI403').trim();
		fieldsLoading = true;
		try {
			const [defsRes, sampleRes] = await Promise.all([
				fetch(`/api/data-products/${p.id}/rackbeat-fields?sku=${encodeURIComponent(sku)}`),
				fetch(`/api/data-products/${p.id}/rackbeat-sku?sku=${encodeURIComponent(sku)}`)
			]);
			if (!defsRes.ok) { alert(`Could not load fields: ${defsRes.statusText}`); return; }
			const defs = await defsRes.json();
			standardFields = defs.standardFields;
			customFields   = defs.customFields;
			priceFields    = defs.priceFields ?? [];
			fieldsLoaded = true;
			if (sampleRes.ok) {
				const { data } = await sampleRes.json();
				sampleData = data;
				sampleSku = sku;
			}
		} finally {
			fieldsLoading = false;
		}
	}

	$effect(() => {
		if (!fieldsLoaded && headers.length > 0) {
			loadRackbeatFields('LPFI403');
		}
	});

	function sampleValue(fieldKey) {
		if (!sampleData || !fieldKey) return null;
		const v = sampleData[fieldKey];
		if (v === null || v === undefined || v === '') return null;
		return String(v);
	}

	// ── Helpers ────────────────────────────────────────────────────────────────
	function parseSkus(text) {
		return [...new Set(
			text.split(/[\n,;]+/)
				.map(s => s.trim())
				.filter(Boolean)
		)];
	}

	let skuList = $derived(parseSkus(skuText));

	function formatDate(ts) {
		return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	// ── Save helpers ───────────────────────────────────────────────────────────
	async function savePatch(patch) {
		await fetch(`/api/data-products/${p.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(patch)
		});
	}

	function blurName() { savePatch({ name }); }

	async function saveMappings() {
		savingMappings = true;
		const json = JSON.stringify(mappings);
		await savePatch({ mappings: json });
		savedMappingsJson = json;
		savingMappings = false;
	}

	async function saveSkus() {
		await savePatch({ skus: JSON.stringify(skuList) });
	}

	// ── Custom header builder ──────────────────────────────────────────────────
	function addCustomHeader() {
		const h = newHeaderInput.trim();
		if (!h || headers.includes(h)) return;
		headers = [...headers, h];
		newHeaderInput = '';
		customHeadersDirty = true;
	}

	function removeCustomHeader(index) {
		const removed = headers[index];
		headers = headers.filter((_, i) => i !== index);
		const updated = { ...mappings };
		delete updated[removed];
		mappings = updated;
		customHeadersDirty = true;
	}

	async function saveCustomHeaders() {
		savingCustomHeaders = true;
		try {
			const res = await fetch(`/api/data-products/${p.id}/template`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ headers })
			});
			if (res.ok) {
				customHeadersDirty = false;
			} else {
				alert('Failed to save headers.');
			}
		} finally {
			savingCustomHeaders = false;
		}
	}

	// ── Template upload ────────────────────────────────────────────────────────
	let templateInput;

	async function handleTemplateUpload(e) {
		const file = e.target.files?.[0];
		if (!file) return;
		templateUploading = true;
		try {
			// Read file in browser
			const arrayBuffer = await file.arrayBuffer();
			const wb = XLSX.read(arrayBuffer, { type: 'array' });
			const firstSheet = wb.Sheets[wb.SheetNames[0]];
			const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
			const extractedHeaders = (rows[0] || []).map(String).filter(Boolean);

			if (extractedHeaders.length === 0) {
				alert('No headers found in the first row of the spreadsheet.');
				return;
			}

			// Convert file to base64
			const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

			// Send to server
			const res = await fetch(`/api/data-products/${p.id}/template`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ headers: extractedHeaders, fileBase64: base64 })
			});

			if (res.ok) {
				headers = extractedHeaders;
				mappings = {};
				savedMappingsJson = '{}';
				templateMode = 'upload';
				hasTemplateFile = true;
			} else {
				alert('Failed to upload template.');
			}
		} catch (err) {
			alert(`Error reading file: ${err.message}`);
		} finally {
			templateUploading = false;
			e.target.value = '';
		}
	}

	// ── Export ─────────────────────────────────────────────────────────────────
	async function runExport() {
		if (skuList.length === 0) { alert('Add at least one SKU before exporting.'); return; }
		if (!hasTemplate) {
			alert(templateMode === 'custom' ? 'Add at least one column header first.' : 'Upload a template first.');
			return;
		}
		exporting = true;
		exportResult = null;
		try {
			// 1. Fetch Rackbeat data — one Worker call per SKU to stay within
			//    Cloudflare's 50-subrequest-per-invocation limit.
			//    Client runs up to 4 in parallel for speed.
			const CONCURRENCY = 4;
			const rbData = {};
			const rbErrors = {};
			exportProgress = { done: 0, total: skuList.length };

			const queue = [...skuList];
			async function fetchOne(sku) {
				try {
					const res = await fetch(
						`/api/data-products/${p.id}/rackbeat-sku?sku=${encodeURIComponent(sku)}`
					);
					if (!res.ok) {
						let msg = res.statusText;
						try { const b = await res.json(); msg = b?.message ?? b?.error ?? msg; } catch {}
						rbErrors[sku] = `HTTP ${res.status}: ${msg}`;
						rbData[sku] = null;
					} else {
						const { data } = await res.json();
						rbData[sku] = data;
					}
				} catch (e) {
					rbErrors[sku] = e?.message ?? String(e);
					rbData[sku] = null;
				}
				exportProgress = { done: exportProgress.done + 1, total: skuList.length };
			}

			// Run with limited concurrency
			const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
				while (queue.length > 0) {
					const sku = queue.shift();
					if (sku) await fetchOne(sku);
				}
			});
			await Promise.all(workers);

			// 2. Build / download workbook
			let wb, ws;
			if (templateMode === 'custom') {
				// Custom mode: create a fresh workbook with the defined headers
				wb = XLSX.utils.book_new();
				ws = XLSX.utils.aoa_to_sheet([headers]);
				XLSX.utils.book_append_sheet(wb, ws, 'Export');
			} else {
				// Upload mode: fetch the stored template from R2
				const templateRes = await fetch(`/api/data-products/${p.id}/template-file`);
				if (!templateRes.ok) throw new Error('Failed to download template');
				const templateBuffer = await templateRes.arrayBuffer();
				wb = XLSX.read(templateBuffer, { type: 'array' });
				ws = wb.Sheets[wb.SheetNames[0]];
			}

			// Get the header row to understand column positions
			const allRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
			const templateHeaders = (allRows[0] || []).map(String);

			// 4. Build mapped columns: header → rackbeat field
			// mappings = { [header]: rackbeatField }
			const colMap = {}; // colIndex → rackbeatField
			templateHeaders.forEach((h, i) => {
				if (mappings[h]) colMap[i] = mappings[h];
			});

			// 5. Build output rows + summary data
			const outputRows = [];
			const colFillCounts = {}; // colIndex → count of filled cells
			templateHeaders.forEach((_, i) => { colFillCounts[i] = 0; });

			const rowResults = []; // { sku, found, filledCols, totalMapped }

			for (const sku of skuList) {
				const rb = rbData[sku]; // null if not found
				const rowData = new Array(templateHeaders.length).fill('');

				let filledCount = 0;
				const totalMapped = Object.keys(colMap).length;

				templateHeaders.forEach((_, colIdx) => {
					const field = colMap[colIdx];
					if (!field) return; // unmapped
					if (rb && rb[field] !== undefined && rb[field] !== null && rb[field] !== '') {
						rowData[colIdx] = rb[field];
						colFillCounts[colIdx]++;
						filledCount++;
					}
				});

				outputRows.push(rowData);
				rowResults.push({ sku, found: !!rb, filledCount, totalMapped });
			}

			// 6. Write rows into workbook (after header row)
			// Clear existing data rows first
			const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
			// Keep only row 0 (header), delete the rest
			for (let r = range.s.r + 1; r <= range.e.r; r++) {
				for (let c = range.s.c; c <= range.e.c; c++) {
					const addr = XLSX.utils.encode_cell({ r, c });
					delete ws[addr];
				}
			}

			// Add output rows starting at row index 1
			outputRows.forEach((rowData, rowIdx) => {
				rowData.forEach((val, colIdx) => {
					const addr = XLSX.utils.encode_cell({ r: rowIdx + 1, c: colIdx });
					if (val !== '') {
						ws[addr] = { v: val, t: typeof val === 'number' ? 'n' : 's' };
					}
				});
			});

			// Update sheet range
			const newRange = {
				s: { r: 0, c: 0 },
				e: { r: outputRows.length, c: Math.max(templateHeaders.length - 1, 0) }
			};
			ws['!ref'] = XLSX.utils.encode_range(newRange);

			// 7. Generate file and trigger download
			const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
			const blob = new Blob(
				[Uint8Array.from(atob(wbOut), c => c.charCodeAt(0))],
				{ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
			);
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-export.xlsx`;
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 5000);

			// 8. Build summary
			const skippedColumns = templateHeaders
				.map((h, i) => ({ header: h, index: i }))
				.filter(({ index }) => !colMap[index]);

			const mappedColumns = templateHeaders
				.map((h, i) => ({ header: h, index: i, field: colMap[i] }))
				.filter(({ field }) => !!field)
				.map(({ header, index }) => ({
					header,
					filled: colFillCounts[index],
					total: skuList.length
				}));

			exportResult = {
				totalSkus: skuList.length,
				foundCount: rowResults.filter(r => r.found).length,
				skippedColumns,
				mappedColumns,
				rows: rowResults,
				fetchErrors: rbErrors && Object.keys(rbErrors).length > 0 ? rbErrors : null
			};

		} catch (err) {
			console.error('Export error:', err);
			alert(`Export failed: ${err.message}`);
		} finally {
			exporting = false;
		}
	}

	// Row status
	function rowStatus(row) {
		if (!row.found) return 'missing';
		if (row.totalMapped === 0) return 'empty';
		if (row.filledCount === row.totalMapped) return 'complete';
		if (row.filledCount === 0) return 'empty';
		return 'partial';
	}
</script>

<svelte:head>
	<title>{name || 'Project'} — Data</title>
</svelte:head>

<div class="page">
	<!-- Toolbar -->
	<div class="toolbar">
		<div class="toolbar-left">
			<a href="/data" class="back-link">
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="15 18 9 12 15 6"/>
				</svg>
				Data
			</a>
			<span class="divider"></span>
			<input
				class="name-input"
				type="text"
				placeholder="Product name"
				bind:value={name}
				onblur={blurName}
			/>
		</div>
		<div class="toolbar-right">
			<span class="meta-text">Created {formatDate(p.created_at)}</span>
			<button class="btn-export" onclick={runExport} disabled={exporting || !hasTemplate || skuList.length === 0}>
				{#if exporting}
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 0.7s linear infinite">
						<path d="M21 12a9 9 0 11-6.219-8.56"/>
					</svg>
					{exportProgress.done < exportProgress.total ? `${exportProgress.done}/${exportProgress.total}` : 'Building…'}
				{:else}
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
						<polyline points="7 10 12 15 17 10"/>
						<line x1="12" y1="15" x2="12" y2="3"/>
					</svg>
					Export Excel
				{/if}
			</button>
		</div>
	</div>

	<div class="layout">
		<!-- Left column: template + mapping -->
		<div class="left-col">

			<!-- Template section -->
			<div class="section">
				<div class="section-header">
					<h2 class="section-title">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
							<polyline points="14 2 14 8 20 8"/>
						</svg>
						Template
					</h2>
					<div class="mode-tabs">
						<button
							class="mode-tab"
							class:mode-tab-active={templateMode === 'upload'}
							onclick={() => { templateMode = 'upload'; }}
							type="button"
						>
							<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
								<polyline points="17 8 12 3 7 8"/>
								<line x1="12" y1="3" x2="12" y2="15"/>
							</svg>
							Upload file
						</button>
						<button
							class="mode-tab"
							class:mode-tab-active={templateMode === 'custom'}
							onclick={() => { templateMode = 'custom'; }}
							type="button"
						>
							<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
							</svg>
							Define manually
						</button>
					</div>
				</div>

				{#if templateMode === 'upload'}
					<!-- ── Upload mode ── -->
					<input bind:this={templateInput} type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange={handleTemplateUpload} />
					<p class="section-hint">Upload an Excel file to use as the output structure. The first row should contain your column headers.</p>
					<button class="btn-upload" onclick={() => templateInput.click()} disabled={templateUploading}>
						{#if templateUploading}
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 0.7s linear infinite"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
							Uploading…
						{:else if hasTemplateFile}
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
							</svg>
							Replace template
						{:else}
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
							</svg>
							Upload template
						{/if}
					</button>
					{#if hasTemplateFile}
						<p class="template-ok" style="margin-top: 12px">
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
								<polyline points="20 6 9 17 4 12"/>
							</svg>
							Template loaded · {headers.length} columns detected
						</p>
					{/if}
				{:else}
					<!-- ── Custom / manual mode ── -->
					<p class="section-hint">Add column headers manually. They will become the columns of your exported Excel file.</p>

					<div class="custom-add-row">
						<input
							class="custom-header-input"
							type="text"
							placeholder="Column header name…"
							bind:value={newHeaderInput}
							onkeydown={(e) => e.key === 'Enter' && addCustomHeader()}
						/>
						<button
							class="btn-add-header"
							onclick={addCustomHeader}
							disabled={!newHeaderInput.trim() || headers.includes(newHeaderInput.trim())}
							type="button"
						>
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
								<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
							</svg>
							Add
						</button>
					</div>

					{#if headers.length > 0}
						<div class="custom-header-list">
							{#each headers as header, i}
								<div class="custom-header-item">
									<span class="custom-header-index">{i + 1}</span>
									<span class="custom-header-name">{header}</span>
									<button
										class="custom-header-remove"
										onclick={() => removeCustomHeader(i)}
										type="button"
										title="Remove column"
									>
										<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
											<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
										</svg>
									</button>
								</div>
							{/each}
						</div>
						<div class="custom-header-footer">
							<span class="custom-header-count">{headers.length} column{headers.length !== 1 ? 's' : ''} defined</span>
							<button
								class="btn-save"
								class:btn-save-dirty={customHeadersDirty}
								onclick={saveCustomHeaders}
								disabled={savingCustomHeaders || !customHeadersDirty}
								type="button"
							>
								{#if savingCustomHeaders}
									<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 0.7s linear infinite"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
									Saving…
								{:else if customHeadersDirty}
									<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v14a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
									Save columns
								{:else}
									<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
									Saved
								{/if}
							</button>
						</div>
					{:else}
						<div class="empty-section" style="padding: 20px 16px">
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
								<line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
							</svg>
							<p>Type a header name above and press <strong>Add</strong> to define your columns.</p>
						</div>
					{/if}
				{/if}
			</div>

			<!-- Column mapping section -->
			{#if headers.length > 0}
				<div class="section">
					<div class="section-header">
						<h2 class="section-title">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
								<line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
							</svg>
							Column Mapping
						</h2>
						<button
							class="btn-save"
							class:btn-save-dirty={mappingsDirty}
							onclick={saveMappings}
							disabled={savingMappings || !mappingsDirty}
						>
							{#if savingMappings}
								<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 0.7s linear infinite"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
								Saving…
							{:else if mappingsDirty}
								<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v14a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
								Save mapping
							{:else}
								<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
								Saved
							{/if}
						</button>
					</div>
					<p class="section-hint">Map each Excel column to a Rackbeat field. Unmapped columns will be left empty in the export.</p>

					<!-- Load Rackbeat fields -->
					<div class="fields-loader">
						{#if fieldsLoaded}
							<span class="fields-loaded-badge">
								<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
								{customFields.length} custom fields loaded · sample from {sampleSku}
							</span>
						{/if}
						<div class="fields-loader-row">
							<input
								class="sku-field-input"
								type="text"
								placeholder="SKU to load fields from…"
								bind:value={fieldsSkuInput}
								onkeydown={(e) => e.key === 'Enter' && loadRackbeatFields(fieldsSkuInput.trim())}
							/>
							<button class="btn-load-fields" onclick={() => loadRackbeatFields(fieldsSkuInput.trim())} disabled={fieldsLoading}>
								{#if fieldsLoading}
									<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 0.7s linear infinite"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
									Loading…
								{:else}
									<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
									{fieldsLoaded ? 'Reload fields' : 'Load Rackbeat fields'}
								{/if}
							</button>
						</div>
						{#if !fieldsLoaded}
							<p class="fields-loader-hint">Load fields to see all Rackbeat properties including custom fields. Leave SKU blank to use first SKU from the list.</p>
						{/if}
					</div>

					<!-- Backdrop closes any open dropdown -->
					{#if openDropdown}
						<div class="dd-backdrop" onclick={closeDd} role="presentation"></div>
					{/if}

					<div class="mapping-list">
						{#each headers as header}
							{@const sample = sampleValue(mappings[header])}
							{@const isOpen = openDropdown === header}
							<div class="mapping-row" class:mapping-row-cost={mappings[header]?.endsWith(':cost')}>
								<span class="col-header" title={header}>{header}</span>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
									<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
								</svg>

								<!-- Custom searchable dropdown -->
								<div class="dd-wrap">
									<button
										class="dd-trigger"
										class:dd-mapped={!!mappings[header]}
										onclick={() => isOpen ? closeDd() : openDd(header)}
										type="button"
									>
										<span class="dd-trigger-label">{mappings[header] ? getLabelForKey(mappings[header]) : '— Skip —'}</span>
										<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="flex-shrink:0;transform:{isOpen ? 'rotate(180deg)' : 'none'};transition:transform 0.15s">
											<polyline points="6 9 12 15 18 9"/>
										</svg>
									</button>

									{#if isOpen}
										<div class="dd-panel">
											<div class="dd-search-wrap">
												<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#A1A1AA;pointer-events:none">
													<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
												</svg>
												<input
													bind:this={searchInputEl}
													class="dd-search"
													type="text"
													placeholder="Search fields…"
													bind:value={dropdownSearch}
													onkeydown={(e) => e.key === 'Escape' && closeDd()}
												/>
											</div>
											<div class="dd-list">
												<button class="dd-item" class:dd-item-active={!mappings[header]} onclick={() => selectField(header, '')} type="button">
													— Skip —
												</button>
												{#each groupedFiltered() as grp}
													<div class="dd-group-label">{grp.label}</div>
													{#each grp.items as f}
														<button class="dd-item" class:dd-item-active={mappings[header] === f.key} onclick={() => selectField(header, f.key)} type="button">
															{f.label}
														</button>
													{/each}
												{/each}
												{#if groupedFiltered().length === 0}
													<p class="dd-empty">No fields match "{dropdownSearch}"</p>
												{/if}
											</div>
										</div>
									{/if}
								</div>

								{#if mappings[header]}
									<span class="sample-value" class:sample-empty={!sample} title={sample ? `Sample (${sampleSku}): ${sample}` : `No value for ${sampleSku}`}>
										{sample ?? '—'}
									</span>
								{/if}
							</div>
						{/each}
					</div>

					{#if hasCostMapping}
						<div class="cost-warning">
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
								<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
								<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
							</svg>
							<span>Be aware this includes <strong>COST DATA</strong> that should never be shared with clients.</span>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Right column: SKUs + export results -->
		<div class="right-col">

			<!-- SKU input -->
			<div class="section">
				<div class="section-header">
					<h2 class="section-title">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
							<line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
						</svg>
						SKUs
						{#if skuList.length > 0}
							<span class="count-badge">{skuList.length}</span>
						{/if}
					</h2>
					<button class="btn-save" onclick={saveSkus}>Save SKUs</button>
				</div>
				<p class="section-hint">Enter SKUs separated by commas, semicolons or new lines.</p>
				<textarea
					class="sku-textarea"
					placeholder="e.g. SKU-001&#10;SKU-002, SKU-003&#10;SKU-004"
					bind:value={skuText}
					onblur={saveSkus}
					rows="12"
				></textarea>
			</div>

			<!-- Export button + progress -->
			<button class="btn-export-lg" onclick={runExport} disabled={exporting || !hasTemplate || skuList.length === 0}>
				{#if exporting}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 0.7s linear infinite"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
					{#if exportProgress.done < exportProgress.total}
						Fetching {exportProgress.done}/{exportProgress.total} products…
					{:else}
						Generating Excel…
					{/if}
				{:else}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
						<polyline points="7 10 12 15 17 10"/>
						<line x1="12" y1="15" x2="12" y2="3"/>
					</svg>
					Export to Excel
				{/if}
			</button>

			{#if exporting && exportProgress.total > 0}
				<div class="progress-wrap">
					<div class="progress-bar">
						<div class="progress-fill" style="width: {Math.round((exportProgress.done / exportProgress.total) * 100)}%"></div>
					</div>
					<span class="progress-label">{Math.round((exportProgress.done / exportProgress.total) * 100)}%</span>
				</div>
			{/if}

			{#if !hasTemplate || skuList.length === 0}
				<p class="export-prereq">
					{#if !hasTemplate}
						{templateMode === 'custom' ? 'Add column headers' : 'Upload a template'}{:else}Add SKUs{/if} to enable export.
				</p>
			{/if}

			<!-- Export result / summary -->
			{#if exportResult}
				<div class="section result-section">
					<div class="section-header">
						<h2 class="section-title">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
							</svg>
							Export Summary
						</h2>
					</div>

					<!-- Top stats -->
					<div class="summary-stats">
						<div class="stat">
							<span class="stat-val">{exportResult.totalSkus}</span>
							<span class="stat-label">Products</span>
						</div>
						<div class="stat">
							<span class="stat-val">{exportResult.foundCount}</span>
							<span class="stat-label">Found in Rackbeat</span>
						</div>
						<div class="stat missing">
							<span class="stat-val">{exportResult.totalSkus - exportResult.foundCount}</span>
							<span class="stat-label">Not found</span>
						</div>
					</div>

					<!-- Fetch errors -->
					{#if exportResult.fetchErrors}
						<div class="summary-block">
							<p class="summary-block-title">⚠️ Rackbeat fetch errors ({Object.keys(exportResult.fetchErrors).length} SKUs)</p>
							<div class="fetch-error-list">
								{#each Object.entries(exportResult.fetchErrors) as [sku, msg]}
									<div class="fetch-error-row">
										<span class="fetch-error-sku">{sku}</span>
										<span class="fetch-error-msg">{msg}</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Skipped columns -->
					{#if exportResult.skippedColumns.length > 0}
						<div class="summary-block">
							<p class="summary-block-title">⚠️ Skipped columns (not mapped)</p>
							<div class="skipped-tags">
								{#each exportResult.skippedColumns as col}
									<span class="skipped-tag">{col.header}</span>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Column fill rates -->
					{#if exportResult.mappedColumns.length > 0}
						<div class="summary-block">
							<p class="summary-block-title">Column fill rates</p>
							<div class="col-rates">
								{#each exportResult.mappedColumns as col}
									{@const pct = col.total > 0 ? Math.round((col.filled / col.total) * 100) : 0}
									<div class="col-rate-row">
										<span class="col-rate-name" title={col.header}>{col.header}</span>
										<div class="col-rate-bar">
											<div class="col-rate-fill" style="width: {pct}%; background: {pct === 100 ? '#16a34a' : pct > 0 ? '#d97706' : '#ef4444'}"></div>
										</div>
										<span class="col-rate-count" class:green={pct === 100} class:amber={pct > 0 && pct < 100} class:red={pct === 0}>
											{col.filled}/{col.total}
										</span>
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Per-row status -->
					<div class="summary-block">
						<p class="summary-block-title">Row status</p>
						<div class="row-status-list">
							{#each exportResult.rows as row}
								{@const status = rowStatus(row)}
								<div class="row-status-item {status}">
									<span class="row-status-dot"></span>
									<span class="row-status-sku">{row.sku}</span>
									{#if status === 'missing'}
										<span class="row-status-note">Not found in Rackbeat</span>
									{:else if status === 'complete'}
										<span class="row-status-note">{row.filledCount}/{row.totalMapped} fields</span>
									{:else if status === 'partial'}
										<span class="row-status-note">{row.filledCount}/{row.totalMapped} fields</span>
									{:else}
										<span class="row-status-note">No data</span>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	@keyframes spin { to { transform: rotate(360deg); } }

	.page { min-height: 100vh; display: flex; flex-direction: column; background: #F8F8F6; }

	/* ── Toolbar ──────────────────────────────────────────────────────────────── */
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
	.toolbar-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
	.toolbar-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }

	.back-link {
		display: flex; align-items: center; gap: 4px;
		font-size: 13px; color: #71717A; text-decoration: none;
		font-weight: 500; flex-shrink: 0; transition: color 0.15s;
	}
	.back-link:hover { color: #18181B; }

	.divider { width: 1px; height: 18px; background: var(--border); flex-shrink: 0; }

	.name-input {
		font-size: 14px; font-weight: 700; color: #18181B;
		border: none; background: transparent; outline: none;
		font-family: inherit; min-width: 180px; max-width: 340px; width: 100%;
		letter-spacing: -0.2px; padding: 4px 6px; border-radius: 6px; transition: background 0.15s;
	}
	.name-input:hover { background: #F4F4F5; }
	.name-input:focus { background: #F4F4F5; }

	.meta-text { font-size: 12px; color: #A1A1AA; }

	.btn-export {
		display: inline-flex; align-items: center; gap: 6px;
		padding: 7px 16px; background: #F57832; color: white;
		border: none; border-radius: 100px; font-size: 13px;
		font-weight: 600; font-family: inherit; cursor: pointer;
		transition: background 0.15s; letter-spacing: -0.1px;
	}
	.btn-export:hover:not(:disabled) { background: #e06820; }
	.btn-export:disabled { opacity: 0.5; cursor: not-allowed; }

	/* ── Layout ──────────────────────────────────────────────────────────────── */
	.layout {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 24px;
		padding: 28px 28px 60px;
		max-width: 1200px;
		margin: 0 auto;
		width: 100%;
		align-items: start;
	}

	.left-col, .right-col { display: flex; flex-direction: column; gap: 20px; }

	/* ── Sections ────────────────────────────────────────────────────────────── */
	.section {
		background: white;
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 20px;
		box-shadow: var(--shadow);
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 14px;
		gap: 12px;
	}

	.section-title {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 13px;
		font-weight: 700;
		color: #18181B;
		letter-spacing: -0.1px;
	}

	.section-hint { font-size: 12px; color: #71717A; margin-bottom: 14px; line-height: 1.5; }

	.btn-upload, .btn-save {
		display: inline-flex; align-items: center; gap: 5px;
		padding: 5px 12px; background: #F4F4F5; border: 1px solid var(--border);
		border-radius: 100px; font-size: 12px; font-weight: 600;
		color: #71717A; cursor: pointer; font-family: inherit;
		transition: background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s;
		white-space: nowrap; flex-shrink: 0;
	}
	.btn-upload:hover:not(:disabled) { background: #E4E4E7; color: #18181B; }
	.btn-save:hover:not(:disabled):not(.btn-save-dirty) { background: #E4E4E7; color: #18181B; }
	.btn-upload:disabled, .btn-save:disabled:not(.btn-save-dirty) { opacity: 0.5; cursor: not-allowed; }

	/* Dirty state — unsaved changes, needs attention */
	.btn-save-dirty {
		background: #F57832;
		border-color: #F57832;
		color: white;
		box-shadow: 0 2px 8px rgba(245,120,50,0.35);
		cursor: pointer;
		opacity: 1 !important;
	}
	.btn-save-dirty:hover { background: #e06820 !important; border-color: #e06820 !important; box-shadow: 0 4px 12px rgba(245,120,50,0.45); }

	/* Empty template */
	.empty-section {
		display: flex; flex-direction: column; align-items: center;
		gap: 10px; padding: 28px 16px; text-align: center;
		color: #A1A1AA;
	}
	.empty-section p { font-size: 13px; line-height: 1.6; max-width: 340px; }

	.template-ok {
		display: flex; align-items: center; gap: 6px;
		font-size: 13px; font-weight: 600; color: #16a34a;
		background: #F0FDF4; border-radius: 8px; padding: 8px 12px;
	}

	/* ── Column mapping ──────────────────────────────────────────────────────── */
	.mapping-list { display: flex; flex-direction: column; gap: 6px; }

	.mapping-row {
		display: flex; align-items: center; gap: 10px;
	}
	.mapping-row-cost .dd-trigger { border-color: #fca5a5 !important; background: #fff5f5 !important; }

	.cost-warning {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		margin-top: 14px;
		padding: 12px 16px;
		background: #fff7ed;
		border: 1.5px solid #fb923c;
		border-radius: 10px;
		font-size: 13px;
		color: #9a3412;
		line-height: 1.45;
	}
	.cost-warning svg { margin-top: 1px; color: #ea580c; }
	.cost-warning strong { font-weight: 800; letter-spacing: 0.02em; }

	.col-header {
		flex: 0 0 180px;
		font-size: 12px;
		font-weight: 600;
		color: #18181B;
		background: #F4F4F5;
		border-radius: 6px;
		padding: 6px 10px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	/* ── Custom searchable dropdown ──────────────────────────────────────────── */
	.dd-backdrop {
		position: fixed; inset: 0; z-index: 49;
	}

	.dd-wrap {
		flex: 1; position: relative; min-width: 0;
	}

	.dd-trigger {
		width: 100%; display: flex; align-items: center; justify-content: space-between;
		gap: 6px; padding: 6px 10px;
		border: 1px solid var(--border); border-radius: 8px;
		background: white; font-size: 12px; font-family: inherit;
		color: #52525B; cursor: pointer; text-align: left;
		transition: border-color 0.15s, background 0.15s, color 0.15s;
	}
	.dd-trigger:hover { border-color: #A1A1AA; }
	.dd-trigger-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.dd-trigger.dd-mapped { border-color: #86efac; background: #F0FDF4; color: #16a34a; font-weight: 600; }

	.dd-panel {
		position: absolute; top: calc(100% + 4px); left: 0; right: 0;
		z-index: 50; background: white;
		border: 1px solid var(--border); border-radius: 10px;
		box-shadow: 0 8px 24px rgba(0,0,0,0.12);
		overflow: hidden;
		min-width: 240px;
	}

	.dd-search-wrap {
		position: relative; padding: 8px;
		border-bottom: 1px solid var(--border);
	}
	.dd-search {
		width: 100%; padding: 6px 10px 6px 30px;
		border: 1px solid var(--border); border-radius: 6px;
		font-size: 12px; font-family: inherit; color: #18181B;
		outline: none; background: #F8F8F6; box-sizing: border-box;
		transition: border-color 0.15s;
	}
	.dd-search:focus { border-color: #A1A1AA; background: white; }

	.dd-list {
		max-height: 260px; overflow-y: auto; padding: 4px;
	}

	.dd-group-label {
		font-size: 10px; font-weight: 700; color: #A1A1AA;
		text-transform: uppercase; letter-spacing: 0.5px;
		padding: 8px 10px 3px; pointer-events: none;
	}

	.dd-item {
		display: block; width: 100%; text-align: left;
		padding: 6px 10px; border-radius: 6px; border: none;
		background: none; font-size: 12px; font-family: inherit;
		color: #18181B; cursor: pointer;
		transition: background 0.1s;
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
	}
	.dd-item:hover { background: #F4F4F5; }
	.dd-item.dd-item-active { background: #F0FDF4; color: #16a34a; font-weight: 600; }

	.dd-empty { font-size: 12px; color: #A1A1AA; padding: 10px 12px; }

	/* ── SKU textarea ────────────────────────────────────────────────────────── */
	.sku-textarea {
		width: 100%;
		font-size: 13px;
		font-family: 'Courier New', monospace;
		color: #18181B;
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 12px 14px;
		outline: none;
		resize: vertical;
		line-height: 1.6;
		transition: border-color 0.15s;
		box-sizing: border-box;
	}
	.sku-textarea:focus { border-color: #A1A1AA; }
	.sku-textarea::placeholder { color: #C4C4C4; }

	.count-badge {
		font-size: 11px; font-weight: 700; padding: 1px 7px;
		background: #F4F4F5; color: #71717A; border-radius: 100px;
		text-transform: none; letter-spacing: 0;
	}

	/* ── Export large button ─────────────────────────────────────────────────── */
	.btn-export-lg {
		width: 100%;
		display: flex; align-items: center; justify-content: center;
		gap: 8px; padding: 12px 20px;
		background: #F57832; color: white;
		border: none; border-radius: 12px;
		font-size: 14px; font-weight: 700;
		font-family: inherit; cursor: pointer;
		transition: background 0.15s; letter-spacing: -0.1px;
	}
	.btn-export-lg:hover:not(:disabled) { background: #e06820; }
	.btn-export-lg:disabled { opacity: 0.5; cursor: not-allowed; }

	.export-prereq { font-size: 12px; color: #A1A1AA; text-align: center; margin-top: -8px; }

	.progress-wrap {
		display: flex; align-items: center; gap: 8px; margin-top: -8px;
	}
	.progress-bar {
		flex: 1; height: 6px; background: #F4F4F5; border-radius: 100px; overflow: hidden;
	}
	.progress-fill {
		height: 100%; background: #F57832; border-radius: 100px;
		transition: width 0.2s ease;
	}
	.progress-label {
		font-size: 11px; font-weight: 700; color: #F57832; min-width: 32px; text-align: right;
	}

	/* ── Result section ──────────────────────────────────────────────────────── */
	.result-section { border-color: #E4E4E7; }

	.summary-stats {
		display: flex; gap: 0;
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
		margin-bottom: 18px;
	}
	.stat {
		flex: 1; text-align: center; padding: 12px 8px;
		border-right: 1px solid var(--border);
	}
	.stat:last-child { border-right: none; }
	.stat-val { display: block; font-size: 22px; font-weight: 800; color: #18181B; letter-spacing: -0.5px; }
	.stat-label { font-size: 11px; color: #A1A1AA; font-weight: 500; }
	.stat.missing .stat-val { color: #ef4444; }

	.summary-block { margin-bottom: 18px; }
	.summary-block:last-child { margin-bottom: 0; }
	.summary-block-title { font-size: 11px; font-weight: 700; color: #A1A1AA; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }

	.skipped-tags { display: flex; flex-wrap: wrap; gap: 4px; }
	.skipped-tag {
		font-size: 11px; font-weight: 600; padding: 3px 8px;
		background: #FEF2F2; color: #ef4444; border-radius: 100px;
	}

	/* Column fill rates */
	.col-rates { display: flex; flex-direction: column; gap: 6px; }
	.col-rate-row { display: flex; align-items: center; gap: 8px; }
	.col-rate-name { font-size: 12px; font-weight: 600; color: #52525B; flex: 0 0 130px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.col-rate-bar { flex: 1; height: 6px; background: #F4F4F5; border-radius: 100px; overflow: hidden; }
	.col-rate-fill { height: 100%; border-radius: 100px; transition: width 0.4s; }
	.col-rate-count { font-size: 11px; font-weight: 700; flex-shrink: 0; min-width: 36px; text-align: right; }
	.col-rate-count.green { color: #16a34a; }
	.col-rate-count.amber { color: #d97706; }
	.col-rate-count.red { color: #ef4444; }

	/* Row status list */
	.row-status-list { display: flex; flex-direction: column; gap: 3px; max-height: 280px; overflow-y: auto; }
	.row-status-item {
		display: flex; align-items: center; gap: 8px;
		padding: 6px 8px; border-radius: 7px; font-size: 12px;
	}
	.row-status-item.complete { background: #F0FDF4; }
	.row-status-item.partial { background: #FFFBEB; }
	.row-status-item.empty, .row-status-item.missing { background: #FEF2F2; }

	.row-status-dot {
		width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
	}
	.complete .row-status-dot { background: #16a34a; }
	.partial .row-status-dot { background: #d97706; }
	.empty .row-status-dot, .missing .row-status-dot { background: #ef4444; }

	.row-status-sku { font-weight: 700; color: #18181B; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.row-status-note { font-size: 11px; color: #71717A; flex-shrink: 0; }

	/* ── Sample value preview ───────────────────────────────────────────────── */
	.sample-value {
		font-size: 11px;
		font-weight: 600;
		color: #16a34a;
		background: #F0FDF4;
		border: 1px solid #86efac;
		border-radius: 6px;
		padding: 3px 8px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 140px;
		flex-shrink: 0;
		cursor: default;
	}
	.sample-value.sample-empty {
		color: #A1A1AA;
		background: #F4F4F5;
		border-color: var(--border);
	}

	/* ── Fields loader ───────────────────────────────────────────────────────── */
	.fields-loader {
		background: #F8F8F6;
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 12px 14px;
		margin-bottom: 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.fields-loaded-badge {
		display: inline-flex; align-items: center; gap: 5px;
		font-size: 11px; font-weight: 700; color: #16a34a;
		background: #F0FDF4; border-radius: 100px; padding: 3px 9px;
		align-self: flex-start;
	}

	.fields-loader-row { display: flex; gap: 6px; align-items: center; }

	.sku-field-input {
		flex: 1; min-width: 0;
		font-size: 12px; font-family: inherit; color: #18181B;
		border: 1px solid var(--border); border-radius: 8px;
		background: white; padding: 6px 10px; outline: none;
		transition: border-color 0.15s;
	}
	.sku-field-input:focus { border-color: #A1A1AA; }
	.sku-field-input::placeholder { color: #C4C4C4; }

	.btn-load-fields {
		display: inline-flex; align-items: center; gap: 5px;
		padding: 6px 12px; background: #F57832; color: white;
		border: none; border-radius: 8px; font-size: 12px;
		font-weight: 600; font-family: inherit; cursor: pointer;
		transition: background 0.15s; white-space: nowrap; flex-shrink: 0;
	}
	.btn-load-fields:hover:not(:disabled) { background: #E06820; }
	.btn-load-fields:disabled { opacity: 0.6; cursor: not-allowed; }

	.fields-loader-hint { font-size: 11px; color: #A1A1AA; line-height: 1.5; }

	/* ── Fetch errors ────────────────────────────────────────────────────────── */
	.fetch-error-list { display: flex; flex-direction: column; gap: 4px; }
	.fetch-error-row {
		display: flex; gap: 8px; align-items: baseline;
		font-size: 12px; padding: 4px 8px;
		background: #FEF2F2; border-radius: 6px;
	}
	.fetch-error-sku { font-weight: 700; color: #ef4444; flex-shrink: 0; }
	.fetch-error-msg { color: #71717A; font-size: 11px; }

	/* ── Mode tabs ───────────────────────────────────────────────────────────── */
	.mode-tabs {
		display: flex;
		background: #F4F4F5;
		border-radius: 8px;
		padding: 3px;
		gap: 2px;
		flex-shrink: 0;
	}
	.mode-tab {
		display: inline-flex; align-items: center; gap: 5px;
		padding: 4px 10px; border: none; border-radius: 6px;
		font-size: 12px; font-weight: 600; font-family: inherit;
		color: #71717A; background: none; cursor: pointer;
		transition: background 0.15s, color 0.15s; white-space: nowrap;
	}
	.mode-tab:hover { color: #18181B; }
	.mode-tab.mode-tab-active { background: white; color: #18181B; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

	/* ── Custom header builder ───────────────────────────────────────────────── */
	.custom-add-row {
		display: flex; gap: 6px; align-items: center;
		margin-bottom: 12px;
	}
	.custom-header-input {
		flex: 1; min-width: 0;
		font-size: 13px; font-family: inherit; color: #18181B;
		border: 1px solid var(--border); border-radius: 8px;
		background: white; padding: 7px 12px; outline: none;
		transition: border-color 0.15s;
	}
	.custom-header-input:focus { border-color: #A1A1AA; }
	.custom-header-input::placeholder { color: #C4C4C4; }

	.btn-add-header {
		display: inline-flex; align-items: center; gap: 5px;
		padding: 7px 14px; background: #18181B; color: white;
		border: none; border-radius: 8px; font-size: 13px;
		font-weight: 600; font-family: inherit; cursor: pointer;
		transition: background 0.15s; flex-shrink: 0;
	}
	.btn-add-header:hover:not(:disabled) { background: #3F3F46; }
	.btn-add-header:disabled { opacity: 0.4; cursor: not-allowed; }

	.custom-header-list {
		display: flex; flex-direction: column; gap: 4px;
		margin-bottom: 12px;
	}
	.custom-header-item {
		display: flex; align-items: center; gap: 8px;
		padding: 7px 10px;
		background: #F8F8F6;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.custom-header-index {
		font-size: 11px; font-weight: 700; color: #A1A1AA;
		min-width: 18px; text-align: right; flex-shrink: 0;
	}
	.custom-header-name {
		flex: 1; font-size: 13px; font-weight: 600; color: #18181B;
		min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
	}
	.custom-header-remove {
		display: flex; align-items: center; justify-content: center;
		width: 24px; height: 24px; border: none; border-radius: 6px;
		background: none; color: #A1A1AA; cursor: pointer; flex-shrink: 0;
		transition: background 0.15s, color 0.15s; padding: 0;
	}
	.custom-header-remove:hover { background: #FEF2F2; color: #ef4444; }

	.custom-header-footer {
		display: flex; align-items: center; justify-content: space-between;
		gap: 10px;
	}
	.custom-header-count {
		font-size: 12px; color: #A1A1AA; font-weight: 500;
	}
</style>
