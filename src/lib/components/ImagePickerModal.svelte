<script>
	/**
	 * ImagePickerModal — browse catalogue image library or upload a new photo.
	 *
	 * Props:
	 *   open        — controls visibility
	 *   onselect    — called with the R2 key when user picks from library
	 *   onupload    — called when user clicks "Upload new photo" (triggers parent file input)
	 *   onclose     — called to close the modal
	 */
	let {
		open        = false,
		libraryUrl  = '/api/catalogues/image-library',
		onselect,
		onupload,
		onclose,
	} = $props();

	let query   = $state('');
	let images  = $state(/** @type {Array<{key:string,image_type:string,label:string}>} */ ([]));
	let loading = $state(false);
	let loaded  = $state(false);

	// Reload library when the URL changes (e.g. switching between logo and image picker)
	$effect(() => {
		if (open && !loaded) fetchLibrary();
	});
	$effect(() => {
		// Reset when libraryUrl changes so new URL is fetched fresh
		libraryUrl; loaded = false; images = []; query = '';
	});

	async function fetchLibrary() {
		loading = true;
		try {
			const res = await fetch(libraryUrl);
			if (res.ok) {
				const data = await res.json();
				images = data.images ?? [];
				loaded = true;
			}
		} finally {
			loading = false;
		}
	}

	const filtered = $derived(
		query.trim()
			? images.filter(img =>
				img.label?.toLowerCase().includes(query.toLowerCase()) ||
				img.image_type?.toLowerCase().includes(query.toLowerCase())
			)
			: images
	);

	function typeLabel(t) {
		if (t === 'cover')      return 'Cover';
		if (t === 'image_full') return 'Full page';
		if (t === 'image_half') return 'Half page';
		if (t === 'logo')       return 'Logo';
		return t;
	}

	function handleKeyDown(e) {
		if (e.key === 'Escape') onclose?.();
	}

	function pickImage(key) {
		onselect?.(key);
		onclose?.();
	}

	function handleUpload() {
		onupload?.(); // parent captures target and closes the modal itself
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if open}
	<!-- Backdrop -->
	<div class="backdrop" onclick={onclose} role="presentation"></div>

	<!-- Modal -->
	<div class="modal" role="dialog" aria-modal="true" aria-label="Choose a photo">
		<div class="modal-header">
			<h2 class="modal-title">Choose a photo</h2>
			<button class="close-btn" onclick={onclose} aria-label="Close">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
					<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
				</svg>
			</button>
		</div>

		<div class="modal-toolbar">
			<button class="upload-new-btn" onclick={handleUpload}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
					<polyline points="17 8 12 3 7 8"/>
					<line x1="12" y1="3" x2="12" y2="15"/>
				</svg>
				Upload new photo
			</button>

			{#if images.length > 0}
				<div class="search-wrap">
					<svg class="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
					</svg>
					<input
						class="search-input"
						type="search"
						placeholder="Filter by catalogue name…"
						bind:value={query}
					/>
				</div>
			{/if}
		</div>

		<div class="modal-body">
			{#if loading}
				<div class="empty-state">
					<svg class="spinner" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
						<path d="M21 12a9 9 0 11-6.219-8.56"/>
					</svg>
					<span>Loading library…</span>
				</div>
			{:else if images.length === 0}
				<div class="empty-state">
					<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
						<rect x="3" y="3" width="18" height="18" rx="2"/>
						<circle cx="8.5" cy="8.5" r="1.5"/>
						<polyline points="21 15 16 10 5 21"/>
					</svg>
					<p>No photos in the library yet.<br/>Upload one to get started.</p>
				</div>
			{:else if filtered.length === 0}
				<div class="empty-state">
					<p>No photos match "<strong>{query}</strong>"</p>
				</div>
			{:else}
				<div class="image-grid">
					{#each filtered as img}
						<button class="img-tile" onclick={() => pickImage(img.key)} title="{typeLabel(img.image_type)} · {img.label}">
							<div class="img-wrap">
								<img
									src="/api/img/{img.key}?size=400"
									alt="{typeLabel(img.image_type)} from {img.label}"
									loading="lazy"
								/>
							</div>
							<div class="img-meta">
								<span class="img-type">{typeLabel(img.image_type)}</span>
								<span class="img-label" title={img.label}>{img.label}</span>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed; inset: 0;
		background: rgba(0, 0, 0, 0.45);
		z-index: 500;
		backdrop-filter: blur(2px);
	}

	.modal {
		position: fixed;
		top: 50%; left: 50%;
		transform: translate(-50%, -50%);
		z-index: 501;
		background: white;
		border-radius: 16px;
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.22);
		width: min(880px, 96vw);
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 24px 0;
		flex-shrink: 0;
	}

	.modal-title {
		font-size: 16px;
		font-weight: 800;
		color: #111827;
		margin: 0;
	}

	.close-btn {
		background: none; border: none; cursor: pointer;
		color: #9ca3af; padding: 4px; border-radius: 6px;
		display: flex; align-items: center; justify-content: center;
		transition: color 0.15s, background 0.15s;
	}
	.close-btn:hover { color: #374151; background: #f3f4f6; }

	.modal-toolbar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 24px;
		border-bottom: 1px solid #f3f4f6;
		flex-shrink: 0;
	}

	.upload-new-btn {
		display: inline-flex; align-items: center; gap: 7px;
		background: #027E3A; color: white;
		border: none; border-radius: 8px;
		padding: 8px 16px;
		font-size: 13px; font-weight: 700;
		font-family: 'Nunito', sans-serif;
		cursor: pointer; white-space: nowrap;
		transition: background 0.15s;
		flex-shrink: 0;
	}
	.upload-new-btn:hover { background: #025c2a; }

	.search-wrap {
		flex: 1; position: relative; max-width: 300px;
	}
	.search-icon {
		position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
		color: #9ca3af; pointer-events: none;
	}
	.search-input {
		width: 100%; padding: 7px 10px 7px 30px;
		border: 1px solid #e5e7eb; border-radius: 8px;
		font-size: 13px; font-family: 'Nunito', sans-serif;
		color: #111827; background: #f9fafb;
		outline: none;
		transition: border-color 0.15s;
		box-sizing: border-box;
	}
	.search-input:focus { border-color: #027E3A; background: white; }

	.modal-body {
		flex: 1; overflow-y: auto; padding: 20px 24px 24px;
	}

	.empty-state {
		display: flex; flex-direction: column; align-items: center; justify-content: center;
		gap: 12px; padding: 48px 0; color: #9ca3af; text-align: center;
		font-size: 14px; line-height: 1.5;
	}
	.spinner { animation: spin 0.7s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }

	.image-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 12px;
	}

	.img-tile {
		background: none; border: 2px solid transparent; border-radius: 10px;
		padding: 0; cursor: pointer; text-align: left;
		transition: border-color 0.15s, transform 0.12s, box-shadow 0.15s;
		overflow: hidden;
	}
	.img-tile:hover {
		border-color: #027E3A;
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(2, 126, 58, 0.18);
	}

	.img-wrap {
		aspect-ratio: 4 / 3;
		background: #f3f4f6;
		overflow: hidden;
	}
	.img-wrap img {
		width: 100%; height: 100%;
		object-fit: cover;
		display: block;
		transition: transform 0.2s;
	}
	.img-tile:hover .img-wrap img { transform: scale(1.04); }

	.img-meta {
		padding: 7px 9px 8px;
		display: flex; flex-direction: column; gap: 1px;
	}
	.img-type {
		font-size: 10px; font-weight: 700; text-transform: uppercase;
		letter-spacing: 0.4px; color: #9ca3af;
	}
	.img-label {
		font-size: 12px; font-weight: 600; color: #374151;
		white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
	}
</style>
