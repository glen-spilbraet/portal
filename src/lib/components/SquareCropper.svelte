<script>
	/**
	 * Square photo cropper: drag the frame to position it, slider (or wheel) to
	 * size it. Output: a square JPEG (max OUT px; never upscaled) handed to
	 * onconfirm(blob). Smaller sizes are made on demand by /api/img?size=.
	 */
	let { file, onconfirm, oncancel, out = 1600 } = $props();

	const url = URL.createObjectURL(file);
	let imgEl = $state(/** @type {HTMLImageElement | null} */ (null));
	let natW = $state(0), natH = $state(0);
	let scale = $state(1); // display px per natural px
	let size = $state(0), x = $state(0), y = $state(0); // frame in natural px
	let busy = $state(false);

	const minSide = $derived(Math.min(natW, natH));
	function measure() { if (imgEl && natW) scale = imgEl.clientWidth / natW; }
	function onLoad() {
		if (!imgEl) return;
		natW = imgEl.naturalWidth; natH = imgEl.naturalHeight;
		size = Math.min(natW, natH); x = (natW - size) / 2; y = (natH - size) / 2;
		queueMicrotask(measure);
	}
	const clamp = () => { x = Math.max(0, Math.min(natW - size, x)); y = Math.max(0, Math.min(natH - size, y)); };
	function setSize(s) {
		const cx = x + size / 2, cy = y + size / 2;
		size = Math.max(minSide * 0.2, Math.min(minSide, s));
		x = cx - size / 2; y = cy - size / 2; clamp();
	}

	let drag = null;
	function down(e) { drag = { sx: e.clientX, sy: e.clientY, x, y }; e.currentTarget.setPointerCapture(e.pointerId); }
	function move(e) { if (!drag) return; x = drag.x + (e.clientX - drag.sx) / scale; y = drag.y + (e.clientY - drag.sy) / scale; clamp(); }
	function up() { drag = null; }
	function wheel(e) { e.preventDefault(); setSize(size * (e.deltaY > 0 ? 1.05 : 0.95)); }

	async function confirm() {
		busy = true;
		try {
			const n = Math.round(Math.min(out, size));
			const c = document.createElement('canvas'); c.width = n; c.height = n;
			const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(/** @type {HTMLImageElement} */ (imgEl), x, y, size, size, 0, 0, n, n);
			const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.88));
			onconfirm?.(blob);
		} finally { busy = false; }
	}
</script>

<svelte:window onresize={measure} />

<div class="ov" role="presentation">
	<div class="dlg" role="dialog" aria-modal="true" aria-label="Crop photo">
		<h3>Crop photo</h3>
		<p class="sub">Drag the square to choose what's shown; resize with the slider or scroll.</p>
		<div class="wrap"><div class="stage">
			<img bind:this={imgEl} src={url} alt="" onload={onLoad} draggable="false" />
			{#if natW}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="frame" style="left:{x * scale}px;top:{y * scale}px;width:{size * scale}px;height:{size * scale}px"
					onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onwheel={wheel}></div>
			{/if}
		</div></div>
		{#if natW}
			<label class="sl">Size
				<input type="range" min={minSide * 0.2} max={minSide} step="1" value={size} oninput={(e) => setSize(Number(e.currentTarget.value))} />
			</label>
		{/if}
		<div class="foot">
			<button type="button" class="ghost" onclick={() => oncancel?.()}>Cancel</button>
			<button type="button" class="primary" onclick={confirm} disabled={!natW || busy}>{busy ? 'Cropping…' : 'Use photo'}</button>
		</div>
	</div>
</div>

<style>
	.ov { position: fixed; inset: 0; background: rgba(0,0,0,.55); display: grid; place-items: center; z-index: 100; padding: 16px; }
	.dlg { background: #fff; border-radius: 16px; padding: 20px; width: min(720px, 100%); max-height: 92vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
	h3 { margin: 0 0 2px; font-size: 18px; font-weight: 800; }
	.sub { margin: 0 0 12px; font-size: 13px; color: #8a7f6a; }
	.wrap { display: flex; justify-content: center; }
	.stage { position: relative; display: inline-block; line-height: 0; user-select: none; touch-action: none; }
	.stage img { max-width: 100%; max-height: 62vh; width: auto; height: auto; display: block; }
	.frame { position: absolute; box-shadow: 0 0 0 9999px rgba(0,0,0,.5); outline: 2px solid #fff; cursor: move; }
	.stage { overflow: hidden; border-radius: 10px; }
	.sl { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 13px; font-weight: 700; color: #524431; }
	.sl input { flex: 1; accent-color: #F57832; }
	.foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
	button { font-family: inherit; font-size: 14px; font-weight: 700; border-radius: 9px; padding: 9px 16px; cursor: pointer; }
	.ghost { background: #fff; border: 1px solid var(--border, #E4E4E7); }
	.primary { background: #F57832; color: #fff; border: none; }
	.primary:disabled { opacity: .55; cursor: default; }
</style>
