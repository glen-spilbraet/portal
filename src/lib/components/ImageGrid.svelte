<script>
	let {
		images = [],
		editable = false,
		onimageadd,
		onimagedelete,
		onimagecrop,
		onimagesreorder
	} = $props();

	/**
	 * Returns an array of row sizes that exactly covers n photos with no blanks.
	 * Each row is 2 or 3 wide (or 1 for a single photo).
	 * Examples: 5→[2,3]  7→[2,2,3]  8→[2,3,3]  9→[3,3,3]
	 */
	function getRowLayout(n) {
		if (n <= 3) return [n];
		const rem = n % 3;
		const threes = Math.floor(n / 3);
		if (rem === 0) return Array(threes).fill(3);
		if (rem === 1) return [2, 2, ...Array(threes - 1).fill(3)];
		/* rem === 2 */ return [2, ...Array(threes).fill(3)];
	}

	/** Groups the flat images array into rows, preserving global indices. */
	function groupIntoRows(imgs) {
		const layout = getRowLayout(imgs.length);
		const rows = [];
		let offset = 0;
		for (const cols of layout) {
			rows.push({
				cols,
				items: imgs.slice(offset, offset + cols).map((img, i) => ({ img, globalIdx: offset + i }))
			});
			offset += cols;
		}
		return rows;
	}

	let rows = $derived.by(() => groupIntoRows(images));

	// ── Crop drag ─────────────────────────────────────────────────────────────
	let dragState = $state(null);

	function startDrag(e, img) {
		if (!editable || reorderState) return;
		e.preventDefault();
		dragState = { imageId: img.id, startX: e.clientX, startY: e.clientY, startCX: img.crop_x ?? 50, startCY: img.crop_y ?? 50 };
	}

	function onMouseMove(e) {
		if (reorderState) return;
		if (!dragState) return;
		const img = images.find((i) => i.id === dragState.imageId);
		if (!img) return;
		img.crop_x = Math.max(0, Math.min(100, dragState.startCX + (e.clientX - dragState.startX) * -0.3));
		img.crop_y = Math.max(0, Math.min(100, dragState.startCY + (e.clientY - dragState.startY) * -0.3));
	}

	function onMouseUp() {
		if (reorderState) { finishReorder(); return; }
		if (!dragState) return;
		const img = images.find((i) => i.id === dragState.imageId);
		if (img) onimagecrop?.(img.id, img.crop_x, img.crop_y);
		dragState = null;
	}

	// ── Reorder drag ──────────────────────────────────────────────────────────
	let reorderState = $state(null);
	let reorderHoverIdx = $state(null);

	function startReorder(e, img, globalIdx) {
		e.preventDefault();
		e.stopPropagation();
		reorderState = { imageId: img.id, fromIdx: globalIdx };
		reorderHoverIdx = globalIdx;
	}

	function onCellEnter(globalIdx) {
		if (!reorderState) return;
		reorderHoverIdx = globalIdx;
	}

	function finishReorder() {
		if (!reorderState) return;
		const { imageId, fromIdx } = reorderState;
		const toIdx = reorderHoverIdx ?? fromIdx;
		reorderState = null;
		reorderHoverIdx = null;
		if (fromIdx !== toIdx) {
			onimagesreorder?.(imageId, images[toIdx]?.id);
		}
	}

	// ── Upload ────────────────────────────────────────────────────────────────
	let fileInput;
	function triggerUpload() { fileInput?.click(); }

	function handleFileChange(e) {
		const files = [...(e.target.files ?? [])];
		if (!files.length) return;
		files.forEach((file, i) => onimageadd?.(file, images.length + i));
		e.target.value = '';
	}
</script>

<svelte:window onmousemove={onMouseMove} onmouseup={onMouseUp} />

<div class="grid-wrap">
	{#if images.length > 0}
		<div class="rows">
			{#each rows as row}
				<div class="row" style="--cols: {row.cols}">
					{#each row.items as { img, globalIdx } (img.id)}
						<div
							class="cell"
							class:dragging={dragState?.imageId === img.id}
							class:reorder-source={reorderState?.imageId === img.id}
							class:reorder-target={reorderState && reorderHoverIdx === globalIdx && reorderState.imageId !== img.id}
							onmousedown={(e) => startDrag(e, img)}
							onmouseenter={() => onCellEnter(globalIdx)}
							role="img"
							tabindex="-1"
							aria-label="Photo"
						>
							<img
								src="/api/img/{img.r2_key}"
								alt=""
								style="object-position: {img.crop_x ?? 50}% {img.crop_y ?? 50}%"
								draggable="false"
							/>
							{#if editable}
								<div class="cell-overlay">
									<span class="drag-hint">Drag to reposition</span>
									<div class="cell-actions">
										{#if images.length > 1}
											<button
												class="icon-pill reorder-btn"
												onmousedown={(e) => startReorder(e, img, globalIdx)}
												title="Drag to swap"
											>
												<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
													<circle cx="3" cy="2.5" r="1.1"/><circle cx="9" cy="2.5" r="1.1"/>
													<circle cx="3" cy="6" r="1.1"/><circle cx="9" cy="6" r="1.1"/>
													<circle cx="3" cy="9.5" r="1.1"/><circle cx="9" cy="9.5" r="1.1"/>
												</svg>
											</button>
										{/if}
										<button
											class="icon-pill delete-btn"
											onclick={(e) => { e.stopPropagation(); onimagedelete?.(img.id); }}
											title="Remove"
										>
											<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
												<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
											</svg>
										</button>
									</div>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/each}
		</div>

	{:else if editable}
		<div class="add-empty-placeholder">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="3" width="18" height="18" rx="2"/>
				<circle cx="8.5" cy="8.5" r="1.5"/>
				<polyline points="21 15 16 10 5 21"/>
			</svg>
			<span>Use the panel to add photos</span>
		</div>
	{:else}
		<div class="empty-preview"></div>
	{/if}
</div>

{#if editable}
	<input bind:this={fileInput} type="file" accept="image/*" multiple onchange={handleFileChange} style="display:none" />
{/if}

<style>
	.grid-wrap {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 260px;
		box-sizing: border-box;
	}

	/* Outer flex column — one child per row */
	.rows {
		display: flex;
		flex-direction: column;
		gap: 14px;
		width: 100%;
		height: 100%;
		min-height: 220px;
	}

	/* Each row is an equal-height flex slice containing --cols cells */
	.row {
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		gap: 14px;
		flex: 1;
		min-height: 0;
	}

	.cell {
		position: relative;
		overflow: hidden;
		cursor: default;
		transition: opacity 0.15s;
		border-radius: 20px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.10);
		min-height: 160px;
	}

	.cell img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		user-select: none;
		pointer-events: none;
	}

	.cell.reorder-source { opacity: 0.35; }
	.cell.reorder-target::after {
		content: '';
		position: absolute;
		inset: 0;
		border: 2px solid white;
		border-radius: 20px;
		pointer-events: none;
	}

	/* ── Cell overlay ────────────────────────────────────────────────────── */
	.cell-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 10px;
		opacity: 0;
		transition: opacity 0.18s;
		background: linear-gradient(to bottom, rgba(0,0,0,0.28) 0%, transparent 60%);
	}

	.cell:hover .cell-overlay,
	.cell.reorder-source .cell-overlay,
	.cell.reorder-target .cell-overlay { opacity: 1; }

	.drag-hint {
		font-size: 10.5px;
		font-weight: 600;
		background: rgba(0,0,0,0.5);
		color: rgba(255,255,255,0.9);
		padding: 3px 8px;
		border-radius: 100px;
		pointer-events: none;
		letter-spacing: 0.1px;
	}

	.cell-actions {
		display: flex;
		gap: 5px;
		align-items: center;
	}

	.icon-pill {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: 8px;
		border: none;
		background: rgba(0,0,0,0.52);
		color: white;
		backdrop-filter: blur(4px);
		transition: background 0.15s, transform 0.1s;
	}
	.icon-pill:hover { background: rgba(0,0,0,0.72); transform: scale(1.08); }

	.reorder-btn { cursor: grab; }
	.reorder-btn:active { cursor: grabbing; }
	.delete-btn:hover { background: rgba(220,38,38,0.85); }

	/* ── Empty placeholder (editable, no photos yet) ────────────────────── */
	.add-empty-placeholder {
		width: 100%;
		height: 100%;
		min-height: 220px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		color: #D4CFC5;
		font-size: 12px;
		font-weight: 500;
		pointer-events: none;
	}

	.empty-preview { width: 100%; min-height: 220px; background: #F9F7F3; }

	:global(.editing) .cell { cursor: grab; }
	:global(.editing) .cell.dragging { cursor: grabbing; }
</style>
