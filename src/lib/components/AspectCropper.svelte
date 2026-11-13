<script>
	/**
	 * Fixed-aspect cropper (default 4:3) for logos / brand images. The frame is
	 * fixed; drag the image to position it and zoom with the slider or scroll.
	 * You can zoom OUT past the image edges (a wide logo fits whole), and the
	 * empty space is filled transparent (PNG) or white (JPEG).
	 * Output: onconfirm(blob) at most `out` px wide, never upscaled above it.
	 */
	let { file, onconfirm, oncancel, aspect = 4 / 3, out = 1600, title = 'Crop image' } = $props();

	const url = URL.createObjectURL(file);
	/** @type {HTMLImageElement | null} */
	let imgEl = $state(null);
	let natW = $state(0), natH = $state(0);
	let busy = $state(false);
	let bg = $state(/** @type {'transparent' | 'white'} */ (file.type === 'image/jpeg' ? 'white' : 'transparent'));

	// Frame size on screen (px).
	const FW = 560;
	/** @type {HTMLDivElement | null} */
	let frameEl = $state(null);
	let fw = $state(FW); // measured frame width (shrinks on phones)
	const fh = $derived(fw / aspect);

	// View: zoom = screen px per natural px; (cx, cy) = image point at the frame centre.
	let zoom = $state(1);
	let cx = $state(0), cy = $state(0);

	const fitZoom = $derived(natW ? Math.min(fw / natW, fh / natH) : 1);   // whole image visible
	const fillZoom = $derived(natW ? Math.max(fw / natW, fh / natH) : 1);  // frame filled
	const minZoom = $derived(fitZoom * 0.5);
	const maxZoom = $derived(fillZoom * 6);

	function measure() { if (frameEl) fw = frameEl.clientWidth || FW; }

	function onLoad() {
		if (!imgEl) return;
		natW = imgEl.naturalWidth; natH = imgEl.naturalHeight;
		measure();
		fit();
	}
	function fit() { zoom = fitZoom; cx = natW / 2; cy = natH / 2; }
	function fill() { zoom = fillZoom; cx = natW / 2; cy = natH / 2; }
	function setZoom(z) { zoom = Math.max(minZoom, Math.min(maxZoom, z)); clamp(); }
	// Keep the image centre point within the image so it can't be dragged away.
	function clamp() { cx = Math.max(0, Math.min(natW, cx)); cy = Math.max(0, Math.min(natH, cy)); }

	let drag = null;
	function down(e) { drag = { sx: e.clientX, sy: e.clientY, cx, cy }; e.currentTarget.setPointerCapture(e.pointerId); }
	function move(e) { if (!drag) return; cx = drag.cx - (e.clientX - drag.sx) / zoom; cy = drag.cy - (e.clientY - drag.sy) / zoom; clamp(); }
	function up() { drag = null; }
	function wheel(e) { e.preventDefault(); setZoom(zoom * (e.deltaY > 0 ? 0.95 : 1.05)); }

	// Slider works on a log scale so small and large zooms are equally easy.
	const logZ = $derived(Math.log(zoom));

	const imgLeft = $derived(fw / 2 - cx * zoom);
	const imgTop = $derived(fh / 2 - cy * zoom);

	async function confirm() {
		if (!imgEl) return;
		busy = true;
		try {
			// Natural px covered by the frame; output never above `out` (and not blown up past 2× the source).
			const srcW = fw / zoom;
			const W = Math.round(Math.max(200, Math.min(out, srcW * 2)));
			const H = Math.round(W / aspect);
			const k = W / fw; // output px per screen px
			const c = document.createElement('canvas'); c.width = W; c.height = H;
			const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
			if (bg === 'white') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(imgEl, imgLeft * k, imgTop * k, natW * zoom * k, natH * zoom * k);
			const type = bg === 'white' ? 'image/jpeg' : 'image/png';
			const blob = await new Promise((res) => c.toBlob(res, type, 0.9));
			onconfirm?.(blob);
		} finally { busy = false; }
	}

	$effect(() => () => URL.revokeObjectURL(url));
</script>

<svelte:window onresize={measure} />

<div class="ov" role="presentation">
	<div class="dlg" role="dialog" aria-modal="true" aria-label={title}>
		<h3>{title}</h3>
		<p class="sub">Drag to position, zoom with the slider or scroll. Zoom out to fit a wide logo — the space around it is filled {bg === 'white' ? 'white' : 'transparent'}.</p>

		<div class="frame-wrap">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="frame" class:checker={bg === 'transparent'} bind:this={frameEl} style="max-width:{FW}px;aspect-ratio:{aspect}"
				onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onwheel={wheel}>
				<img bind:this={imgEl} src={url} alt="" onload={onLoad} draggable="false"
					style="left:{imgLeft}px;top:{imgTop}px;width:{natW * zoom}px;height:{natH * zoom}px" class:hidden={!natW} />
			</div>
		</div>

		{#if natW}
			<div class="controls">
				<label class="sl">Zoom
					<input type="range" min={Math.log(minZoom)} max={Math.log(maxZoom)} step="0.001" value={logZ}
						oninput={(e) => setZoom(Math.exp(Number(e.currentTarget.value)))} />
				</label>
				<button type="button" class="ghost sm" onclick={fit}>Fit</button>
				<button type="button" class="ghost sm" onclick={fill}>Fill</button>
			</div>
			<div class="bg-row">
				<span>Background</span>
				<label><input type="radio" bind:group={bg} value="transparent" /> Transparent (PNG)</label>
				<label><input type="radio" bind:group={bg} value="white" /> White (JPEG)</label>
			</div>
		{/if}

		<div class="foot">
			<button type="button" class="ghost" onclick={() => oncancel?.()}>Cancel</button>
			<button type="button" class="primary" onclick={confirm} disabled={!natW || busy}>{busy ? 'Cropping…' : 'Use image'}</button>
		</div>
	</div>
</div>

<style>
	.ov { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: grid; place-items: center; z-index: 100; padding: 16px; }
	.dlg { background: #fff; border-radius: 16px; padding: 20px; width: min(640px, 100%); max-height: 92vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,.3); box-sizing: border-box; }
	h3 { margin: 0 0 2px; font-size: 18px; font-weight: 800; }
	.sub { margin: 0 0 12px; font-size: 13px; color: #8a7f6a; }
	.frame-wrap { display: flex; justify-content: center; }
	.frame { position: relative; width: 100%; overflow: hidden; border-radius: 6px; outline: 2px solid #F57832; cursor: move; touch-action: none; user-select: none; background: #fff; }
	.frame.checker { background-color: #fff; background-image: linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%); background-size: 16px 16px; background-position: 0 0, 0 8px, 8px -8px, -8px 0; }
	.frame img { position: absolute; max-width: none; pointer-events: none; }
	.frame img.hidden { visibility: hidden; }
	.controls { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
	.sl { flex: 1; display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; color: #524431; }
	.sl input { flex: 1; accent-color: #F57832; }
	.bg-row { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; margin-top: 10px; font-size: 13px; color: #524431; }
	.bg-row span { font-weight: 700; }
	.bg-row label { display: inline-flex; gap: 5px; align-items: center; cursor: pointer; }
	.foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
	button { font-family: inherit; font-size: 14px; font-weight: 700; border-radius: 9px; padding: 9px 16px; cursor: pointer; }
	.ghost { background: #fff; border: 1px solid var(--border, #E4E4E7); }
	.ghost.sm { padding: 6px 11px; font-size: 12px; }
	.primary { background: #F57832; color: #fff; border: none; }
	.primary:disabled { opacity: .55; cursor: default; }
</style>
