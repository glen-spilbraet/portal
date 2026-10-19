<script>
	/**
	 * 3D box cropper. The user frames the box with an adjustable rectangle
	 * (auto-detected when possible). On confirm we build a SQUARE image with the
	 * box centred and padding around it — but we draw the WHOLE source image, not
	 * just the frame, so shadows / reflections outside the frame are kept (they
	 * bleed into the padding instead of being clipped at the frame edge).
	 * Padding is transparent when the source has a transparent background, else
	 * it's filled with the photo's own background colour.
	 */
	let { file, onconfirm, oncancel, title = 'Frame the 3D box', subject = 'box' } = $props();

	const url = URL.createObjectURL(file);
	let imgEl = $state(null);
	let stageEl = $state(null);
	let previewCanvas = $state(null);
	let natW = $state(0), natH = $state(0);
	let dispScale = $state(1);      // displayed px per natural px
	let ready = $state(false);
	let busy = $state(false);

	// Selection rectangle in NATURAL image coords.
	let x0 = $state(0), y0 = $state(0), x1 = $state(0), y1 = $state(0);
	let pad = $state(0.14);         // padding as a fraction of the box's longest side
	let bgTransparent = $state(false);
	let bgColor = $state('rgb(255,255,255)');
	let detected = $state(false);

	const MAX_OUT = 1600;

	function measure() { if (imgEl && natW) dispScale = imgEl.clientWidth / natW; }

	function onImgLoad() {
		natW = imgEl.naturalWidth; natH = imgEl.naturalHeight;
		detect();
		ready = true;
		queueMicrotask(measure);
	}

	function defaultRect() {
		x0 = natW * 0.15; y0 = natH * 0.15; x1 = natW * 0.85; y1 = natH * 0.85; detected = false;
	}

	// Best-effort auto-detect of the box bounding box + background.
	function detect() {
		try {
			const s = Math.min(1, 600 / Math.max(natW, natH));
			const w = Math.max(1, Math.round(natW * s)), h = Math.max(1, Math.round(natH * s));
			const c = document.createElement('canvas'); c.width = w; c.height = h;
			const ctx = c.getContext('2d', { willReadFrequently: true });
			ctx.drawImage(imgEl, 0, 0, w, h);
			const data = ctx.getImageData(0, 0, w, h).data;

			// Background = average of the four corners.
			let ar = 0, ag = 0, ab = 0, aa = 0;
			for (const [px, py] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) {
				const i = (py * w + px) * 4; ar += data[i]; ag += data[i + 1]; ab += data[i + 2]; aa += data[i + 3];
			}
			ar /= 4; ag /= 4; ab /= 4; aa /= 4;
			bgTransparent = aa < 24;
			bgColor = `rgb(${Math.round(ar)},${Math.round(ag)},${Math.round(ab)})`;

			// Foreground bbox: solid (box) pixels, ignoring faint shadow.
			let minx = w, miny = h, maxx = -1, maxy = -1;
			const AL = 140, COL = 48 * 48;
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					const i = (y * w + x) * 4, al = data[i + 3];
					let fg;
					if (bgTransparent) fg = al > AL;
					else {
						const dr = data[i] - ar, dg = data[i + 1] - ag, db = data[i + 2] - ab;
						fg = al > AL && (dr * dr + dg * dg + db * db) > COL;
					}
					if (fg) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
				}
			}
			if (maxx - minx > w * 0.05 && maxy - miny > h * 0.05) {
				x0 = minx / s; y0 = miny / s; x1 = (maxx + 1) / s; y1 = (maxy + 1) / s; detected = true;
			} else defaultRect();
		} catch { defaultRect(); }
	}

	// ── Drag / resize ──────────────────────────────────────────────────────────
	let drag = null;
	function down(mode, e) {
		e.preventDefault(); e.stopPropagation();
		drag = { mode, px: e.clientX, py: e.clientY, x0, y0, x1, y1 };
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	}
	function move(e) {
		if (!drag) return;
		const dx = (e.clientX - drag.px) / dispScale, dy = (e.clientY - drag.py) / dispScale;
		let a = drag.x0, b = drag.y0, c = drag.x1, d = drag.y1;
		const m = drag.mode, MIN = 12;
		if (m === 'move') {
			const w = c - a, h = d - b;
			a = Math.max(0, Math.min(a + dx, natW - w)); b = Math.max(0, Math.min(b + dy, natH - h));
			c = a + w; d = b + h;
		} else {
			if (m.includes('w')) a = Math.min(c - MIN, Math.max(0, a + dx));
			if (m.includes('e')) c = Math.max(a + MIN, Math.min(natW, c + dx));
			if (m.includes('n')) b = Math.min(d - MIN, Math.max(0, b + dy));
			if (m.includes('s')) d = Math.max(b + MIN, Math.min(natH, d + dy));
		}
		x0 = a; y0 = b; x1 = c; y1 = d;
	}
	function up() {
		drag = null;
		window.removeEventListener('pointermove', move);
		window.removeEventListener('pointerup', up);
	}

	// ── Compose the square output ────────────────────────────────────────────────
	function renderTo(canvas, maxOut) {
		const sw = x1 - x0, sh = y1 - y0;
		if (sw <= 0 || sh <= 0) return;
		const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
		const sideSrc = Math.max(sw, sh) * (1 + 2 * pad);
		const scale = Math.min(1, maxOut / sideSrc);
		const out = Math.max(1, Math.round(sideSrc * scale));
		canvas.width = out; canvas.height = out;
		const ctx = canvas.getContext('2d');
		ctx.clearRect(0, 0, out, out);
		if (!bgTransparent) { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, out, out); }
		ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
		// Draw the FULL image (not just the frame) so shadows/reflections survive.
		ctx.drawImage(imgEl, out / 2 - cx * scale, out / 2 - cy * scale, natW * scale, natH * scale);
	}

	$effect(() => {
		// eslint-disable-next-line no-unused-expressions
		x0; y0; x1; y1; pad; bgTransparent; bgColor;
		if (ready && previewCanvas) renderTo(previewCanvas, 260);
	});
	$effect(() => {
		const onResize = () => measure();
		window.addEventListener('resize', onResize);
		return () => { window.removeEventListener('resize', onResize); URL.revokeObjectURL(url); };
	});

	function confirm() {
		if (busy) return;
		busy = true;
		const c = document.createElement('canvas');
		renderTo(c, MAX_OUT);
		c.toBlob((b) => { busy = false; if (b) onconfirm(b); else oncancel(); }, 'image/png');
	}

	// Display-space rect for the overlay.
	const dX = $derived(x0 * dispScale), dY = $derived(y0 * dispScale);
	const dW = $derived((x1 - x0) * dispScale), dH = $derived((y1 - y0) * dispScale);
	const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
</script>

<div class="overlay" role="presentation" onpointerdown={(e) => e.target === e.currentTarget && oncancel()}>
	<div class="modal" role="dialog" aria-modal="true" aria-label="Crop 3D box">
		<div class="head">
			<h3>{title}</h3>
			<p>Drag the handles so the {subject} edges sit inside the frame. The result is a square with padding — shadows &amp; reflections outside the frame are kept, not cut.</p>
		</div>
		<div class="body">
			<div class="stage-wrap">
				<div class="stage" bind:this={stageEl}>
					<img src={url} alt="" bind:this={imgEl} onload={onImgLoad} draggable="false" />
					{#if ready}
						<div class="sel" style="left:{dX}px; top:{dY}px; width:{dW}px; height:{dH}px;"
							onpointerdown={(e) => down('move', e)} role="presentation">
							{#each HANDLES as h}
								<span class="h {h}" onpointerdown={(e) => down(h, e)} role="presentation"></span>
							{/each}
						</div>
					{/if}
				</div>
				<div class="hint">{detected ? 'Auto-detected — adjust if needed.' : `Adjust the frame to the ${subject}.`}</div>
			</div>
			<div class="side">
				<div class="prev-box" class:checker={bgTransparent}><canvas bind:this={previewCanvas} class="prev"></canvas></div>
				<label class="pad">Padding <span>{Math.round(pad * 100)}%</span>
					<input type="range" min="0" max="40" value={Math.round(pad * 100)} oninput={(e) => (pad = (+e.currentTarget.value) / 100)} />
				</label>
				<div class="bgline">Background: {#if bgTransparent}<span class="t">transparent</span>{:else}<span class="sw" style="background:{bgColor}"></span>kept{/if}</div>
				<div class="btns">
					<button class="ghost" onclick={oncancel}>Cancel</button>
					<button class="primary" onclick={confirm} disabled={busy || !ready}>{busy ? 'Processing…' : 'Use photo'}</button>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.overlay { position: fixed; inset: 0; background: rgba(24,24,27,0.55); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 20px; }
	.modal { background: #fff; border-radius: 16px; width: 100%; max-width: 820px; max-height: 92vh; overflow: auto; box-shadow: 0 24px 70px rgba(0,0,0,0.3); }
	.head { padding: 18px 20px 6px; }
	.head h3 { margin: 0 0 4px; font-size: 16px; font-weight: 800; color: #18181B; }
	.head p { margin: 0; font-size: 12.5px; color: #71717A; line-height: 1.5; }
	.body { display: flex; gap: 18px; padding: 14px 20px 20px; flex-wrap: wrap; }
	.stage-wrap { flex: 1; min-width: 300px; }
	.stage { position: relative; display: inline-block; max-width: 100%; line-height: 0; user-select: none; touch-action: none;
		background-image: linear-gradient(45deg,#f0f0f0 25%,transparent 25%,transparent 75%,#f0f0f0 75%),linear-gradient(45deg,#f0f0f0 25%,#fff 25%,#fff 75%,#f0f0f0 75%);
		background-size: 18px 18px; background-position: 0 0, 9px 9px; border: 1px solid var(--border, #E4E4E7); border-radius: 10px; overflow: hidden; }
	.stage img { display: block; max-width: 100%; max-height: 62vh; width: auto; height: auto; -webkit-user-drag: none; }
	.sel { position: absolute; border: 2px solid #F57832; box-shadow: 0 0 0 100vmax rgba(24,24,27,0.35); box-sizing: border-box; cursor: move; }
	.h { position: absolute; width: 12px; height: 12px; background: #fff; border: 2px solid #F57832; border-radius: 3px; box-sizing: border-box; }
	.h.nw { left: -7px; top: -7px; cursor: nwse-resize; } .h.ne { right: -7px; top: -7px; cursor: nesw-resize; }
	.h.sw { left: -7px; bottom: -7px; cursor: nesw-resize; } .h.se { right: -7px; bottom: -7px; cursor: nwse-resize; }
	.h.n { left: 50%; top: -7px; transform: translateX(-50%); cursor: ns-resize; } .h.s { left: 50%; bottom: -7px; transform: translateX(-50%); cursor: ns-resize; }
	.h.w { top: 50%; left: -7px; transform: translateY(-50%); cursor: ew-resize; } .h.e { top: 50%; right: -7px; transform: translateY(-50%); cursor: ew-resize; }
	.hint { margin-top: 8px; font-size: 12px; color: #8a7550; font-weight: 600; }
	.side { width: 220px; display: flex; flex-direction: column; gap: 14px; }
	.prev-box { width: 100%; aspect-ratio: 1; border: 1px solid var(--border, #E4E4E7); border-radius: 10px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #FAFAFA; }
	.prev-box.checker { background-image: linear-gradient(45deg,#eee 25%,transparent 25%,transparent 75%,#eee 75%),linear-gradient(45deg,#eee 25%,#fff 25%,#fff 75%,#eee 75%); background-size: 16px 16px; background-position: 0 0, 8px 8px; }
	.prev { max-width: 100%; max-height: 100%; }
	.pad { font-size: 12px; font-weight: 700; color: #52525B; display: flex; flex-direction: column; gap: 6px; }
	.pad span { color: #F57832; }
	.pad input { width: 100%; accent-color: #F57832; }
	.bgline { font-size: 12px; color: #71717A; display: flex; align-items: center; gap: 6px; }
	.bgline .sw { width: 14px; height: 14px; border-radius: 4px; border: 1px solid var(--border, #E4E4E7); display: inline-block; }
	.bgline .t { font-weight: 700; color: #52525B; }
	.btns { margin-top: auto; display: flex; gap: 8px; }
	.btns button { flex: 1; padding: 9px 12px; border-radius: 9px; font-size: 13px; font-weight: 700; font-family: inherit; cursor: pointer; border: 1px solid var(--border, #E4E4E7); }
	.btns .ghost { background: #fff; color: #52525B; }
	.btns .primary { background: #F57832; border-color: #F57832; color: #fff; }
	.btns .primary:disabled { opacity: 0.6; cursor: default; }
	@media (max-width: 640px) { .side { width: 100%; } }
</style>
