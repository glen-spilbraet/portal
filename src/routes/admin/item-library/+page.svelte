<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	let items = $state(data.items);
	let search = $state('');
	// Track upload state per SKU: null | 'uploading' | 'done' | 'error'
	let uploadState = $state({});

	const filtered = $derived(
		[...(search.trim()
			? items.filter(i =>
				i.sku.toLowerCase().includes(search.trim().toLowerCase()) ||
				(i.name ?? '').toLowerCase().includes(search.trim().toLowerCase())
			)
			: items
		)].sort((a, b) => a.sku.localeCompare(b.sku))
	);

	async function uploadPhoto(sku, file) {
		uploadState = { ...uploadState, [sku]: 'uploading' };
		try {
			const res = await fetch(`/api/item-library/${encodeURIComponent(sku)}/photo`, {
				method: 'POST',
				headers: { 'Content-Type': file.type || 'image/jpeg' },
				body: file,
			});
			if (!res.ok) throw new Error('Upload failed');
			const { distributed } = await res.json();
			// Update item in local state: mark as having a photo now
			items = items.map(i => i.sku === sku ? { ...i, photo_key: `item-library/${sku}` } : i);
			uploadState = { ...uploadState, [sku]: `done:${distributed}` };
		} catch {
			uploadState = { ...uploadState, [sku]: 'error' };
		}
	}

	function handleFileInput(sku, e) {
		const file = e.target?.files?.[0];
		if (file) uploadPhoto(sku, file);
		e.target.value = ''; // reset so same file can be re-picked
	}
</script>

<AppNav active="item-library" />

<main class="page-wrap">
	<div class="page-header">
		<div>
			<h1 class="page-title">Item Library</h1>
			<p class="page-sub">{items.length} product{items.length === 1 ? '' : 's'} in library</p>
		</div>
		<input
			class="search-input"
			type="search"
			placeholder="Search SKU or name…"
			bind:value={search}
		/>
	</div>

	{#if filtered.length === 0}
		<div class="empty-state">
			{#if search.trim()}
				<p>No products match "<strong>{search}</strong>".</p>
			{:else}
				<p>No products in the library yet. Add items to a planogram to populate the library.</p>
			{/if}
		</div>
	{:else}
		<div class="lib-grid">
			<!-- Header row -->
			<div class="lib-header">
				<span class="col-img"></span>
				<span class="col-sku">SKU</span>
				<span class="col-name">Product Name</span>
				<span class="col-dim">W (cm)</span>
				<span class="col-dim">H (cm)</span>
				<span class="col-action"></span>
			</div>

			{#each filtered as item (item.id)}
				{@const state = uploadState[item.sku]}
				{@const hasPhoto = !!item.photo_key}
				<div class="lib-row" class:row-placeholder={!hasPhoto}>
					<!-- Thumbnail / upload target -->
					<div class="col-img">
						{#if hasPhoto}
							<img
								src="/api/item-library/{item.sku}/photo"
								alt={item.sku}
								class="thumb"
							/>
						{:else}
							<label class="thumb-upload" title="Click to upload photo">
								<input
									type="file"
									accept="image/*"
									style="display:none"
									onchange={(e) => handleFileInput(item.sku, e)}
									disabled={state === 'uploading'}
								/>
								{#if state === 'uploading'}
									<span class="spinner"></span>
								{:else}
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
										<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
									</svg>
								{/if}
							</label>
						{/if}
					</div>

					<div class="col-sku sku-tag">{item.sku}</div>
					<div class="col-name">{item.name ?? '—'}</div>
					<div class="col-dim dim-val">{item.width_cm}</div>
					<div class="col-dim dim-val">{item.height_cm}</div>

					<!-- Status / upload button column -->
					<div class="col-action">
						{#if !hasPhoto}
							{#if state === 'uploading'}
								<span class="status-uploading">Uploading…</span>
							{:else if state && state.startsWith('done:')}
								{@const count = state.split(':')[1]}
								<span class="status-done">
									✓ Sent to {count} planogram{count === '1' ? '' : 's'}
								</span>
							{:else if state === 'error'}
								<span class="status-error">Upload failed</span>
							{:else}
								<label class="btn-upload">
									<input
										type="file"
										accept="image/*"
										style="display:none"
										onchange={(e) => handleFileInput(item.sku, e)}
									/>
									Upload photo
								</label>
							{/if}
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</main>

<style>
	.page-wrap {
		max-width: 960px;
		margin: 0 auto;
		padding: 32px 20px 60px;
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 28px;
		flex-wrap: wrap;
	}

	.page-title {
		font-size: 1.5rem;
		font-weight: 800;
		color: #18181B;
		margin: 0 0 4px;
		letter-spacing: -0.4px;
	}

	.page-sub {
		font-size: 13px;
		color: #A1A1AA;
		margin: 0;
	}

	.search-input {
		padding: 8px 12px;
		border: 1px solid #E4E4E7;
		border-radius: 8px;
		font-size: 13px;
		width: 220px;
		outline: none;
		color: #18181B;
		background: white;
	}
	.search-input:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); }

	.empty-state {
		text-align: center;
		padding: 60px 20px;
		color: #71717A;
		font-size: 14px;
	}

	/* Grid layout */
	.lib-grid {
		border: 1px solid #E4E4E7;
		border-radius: 10px;
		overflow: hidden;
		background: white;
	}

	.lib-header,
	.lib-row {
		display: grid;
		grid-template-columns: 56px 110px 1fr 72px 72px 160px;
		align-items: center;
	}

	.lib-header {
		background: #FAFAFA;
		border-bottom: 1px solid #E4E4E7;
		padding: 0 12px;
		font-size: 11px;
		font-weight: 700;
		color: #71717A;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		height: 36px;
	}

	.lib-row {
		border-bottom: 1px solid #F4F4F5;
		padding: 8px 12px;
	}
	.lib-row:last-child { border-bottom: none; }
	.lib-row:hover { background: #FAFAF8; }
	.lib-row.row-placeholder { background: #FFFDF7; }
	.lib-row.row-placeholder:hover { background: #FFF8E8; }

	.col-img { display: flex; align-items: center; }
	.col-sku { padding-right: 12px; }
	.col-name { padding-right: 12px; font-size: 13px; color: #18181B; }
	.col-dim { text-align: right; padding-right: 4px; }
	.col-action { display: flex; align-items: center; justify-content: flex-end; }

	.thumb {
		width: 40px;
		height: 40px;
		object-fit: contain;
		border-radius: 6px;
		border: 1px solid #ECEAE6;
		background: #FAFAF8;
		padding: 2px;
		box-sizing: border-box;
	}

	/* Clickable placeholder that opens file picker */
	.thumb-upload {
		width: 40px;
		height: 40px;
		border-radius: 6px;
		border: 1.5px dashed #D4C9A8;
		background: #FFF8E8;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: #C19A3A;
		transition: border-color 0.15s, background 0.15s;
	}
	.thumb-upload:hover {
		border-color: #F57832;
		background: #FFF3D6;
		color: #F57832;
	}

	/* Upload button in action column */
	.btn-upload {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 10px;
		font-size: 11.5px;
		font-weight: 600;
		color: #F57832;
		border: 1px solid #F57832;
		border-radius: 6px;
		cursor: pointer;
		background: white;
		transition: background 0.12s;
		white-space: nowrap;
	}
	.btn-upload:hover { background: #FFF5EE; }

	/* Status labels */
	.status-uploading {
		font-size: 11.5px;
		color: #A1A1AA;
	}

	.status-done {
		font-size: 11.5px;
		font-weight: 600;
		color: #16A34A;
	}

	.status-error {
		font-size: 11.5px;
		font-weight: 600;
		color: #DC2626;
	}

	/* Spinner */
	.spinner {
		display: inline-block;
		width: 14px;
		height: 14px;
		border: 2px solid #E4E4E7;
		border-top-color: #F57832;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	.sku-tag {
		font-size: 11px;
		font-weight: 700;
		color: #F57832;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.dim-val {
		font-size: 13px;
		font-weight: 500;
		color: #52525B;
		font-variant-numeric: tabular-nums;
	}
</style>
