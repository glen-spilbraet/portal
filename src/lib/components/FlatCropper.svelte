<script>
	/**
	 * Flat front cropper. Unlike the box cropper this is an EXACT crop: the frame
	 * is the output — no square, no padding, no background. Auto-detects the
	 * artwork bounds (best effort) with manual adjustment, and shows magnified
	 * views of the two opposite corners (top-left, bottom-right) so the crop edge
	 * can be checked against the artwork.
	 */
	let { file, onconfirm, oncancel } = $props();

	const url = URL.createObjectURL(file);
	let imgEl = $state(null);
	let natW = $state(0), natH = $state(0);
	let dispScale = $state(1);
	let ready = $state(false);
	let busy = $state(false);

	let x0 = $state(0), y0 = $state(0), x1 = $state(0), y1 = $state(0);
	let detected = $state(false);

	let tlCanvas = $state(null), brCanvas = $state(null);
	const MAG = 150;   // magnifier canvas size (px)
	const PATCH = 24;  // half-size of the source region shown (px) → zoom ≈ MAG/(2*PATCH)
	const MAX_OUT = 2200;

	function measure() { if (imgEl && natW) dispScale = imgEl.clientWidth / natW; }

	function onImgLoad() {
		natW = imgEl.naturalWidth; natH = imgEl.naturalHeight;
		detect();
		ready = true;
		queueMicrotask(measure);
	}

	function defaultRect() { x0 = natW * 0.08; y0 = natH * 0.08; x1 = natW * 0.92; y1 = natH * 0.92; detected = false; }

	// Auto-detect artwork bbox against a (usually white) background.
	function detect() {
		try {
			const s = Math.min(1, 700 / Math.max(natW, natH));
			const w = Math.max(1, Math.round(natW * s)), h = Math.max(1, Math.round(natH * s));
			const c = document.createElement('canvas'); c.width = w; c.height = h;
			const ctx = c.getContext('2d', { willReadFrequently: true });
			ctx.drawImage(imgEl, 0, 0, w, h);
			const data = ctx.getImageData(0, 0, w, h).data;

			let ar = 0, ag = 0, ab = 0, aa = 0;
			for (const [px, py] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) {
				const i = (py * w + px) * 4; ar += data[i]; ag += data[i + 1]; ab += data[i + 2]; aa += data[i + 3];
			}
			ar /= 4; ag /= 4; ab /= 4; aa /= 4;
			const transparent = aa < 24;

			let minx = w, miny = h, maxx = -1, maxy = -1;
			const AL = 32, COL = 30 * 30; // lower colour threshold: crop tight to any non-background
			for (let y = 0; y < h; y++) {
				for (let x = 0; x < w; x++) {
					const i = (y * w + x) * 4, al = data[i + 3];
					let fg;
					if (transparent) fg = al > AL;
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
	function up() { drag = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }

	// Nudge the active edge(s) by arrow keys when a handle is focused.
	function nudge(mode, e) {
		const step = e.shiftKey ? 10 : 1;
		let moved = false;
		if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
			const d = e.key === 'ArrowLeft' ? -step : step;
			if (mode.includes('w')) { x0 = Math.min(x1 - 12, Math.max(0, x0 + d)); moved = true; }
			if (mode.includes('e')) { x1 = Math.max(x0 + 12, Math.min(natW, x1 + d)); moved = true; }
		}
		if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			const d = e.key === 'ArrowUp' ? -step : step;
			if (mode.includes('n')) { y0 = Math.min(y1 - 12, Math.max(0, y0 + d)); moved = true; }
			if (mode.includes('s')) { y1 = Math.max(y0 + 12, Math.min(natH, y1 + d)); moved = true; }
		}
		if (moved) e.preventDefault();
	}

	// ── Corner magnifiers ────────────────────────────────────────────────────────
	function drawMag(canvas, cornerX, cornerY, corner /* 'tl' | 'br' */) {
		if (!canvas || !imgEl) return;
		canvas.width = MAG; canvas.height = MAG;
		const ctx = canvas.getContext('2d');
		ctx.imageSmoothingEnabled = false;
		ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, MAG, MAG);
		const zoom = MAG / (2 * PATCH);
		// Source top-left so that (cornerX,cornerY) lands at the canvas centre.
		const srcX = cornerX - PATCH, srcY = cornerY - PATCH;
		ctx.drawImage(imgEl, srcX, srcY, 2 * PATCH, 2 * PATCH, 0, 0, MAG, MAG);
		// Shade the cropped-away (outside) region, then draw the crop edges.
		const cxp = MAG / 2, cyp = MAG / 2;
		ctx.fillStyle = 'rgba(245,120,50,0.18)';
		if (corner === 'tl') { ctx.fillRect(0, 0, MAG, cyp); ctx.fillRect(0, cyp, cxp, MAG - cyp); }
		else { ctx.fillRect(0, cyp, MAG, MAG - cyp); ctx.fillRect(cxp, 0, MAG - cxp, cyp); }
		ctx.strokeStyle = '#F57832'; ctx.lineWidth = 1.5;
		ctx.beginPath(); ctx.moveTo(cxp, 0); ctx.lineTo(cxp, MAG); ctx.moveTo(0, cyp); ctx.lineTo(MAG, cyp); ctx.stroke();
		void zoom;
	}

	$effect(() => {
		// eslint-disable-next-line no-unused-expressions
		x0; y0; x1; y1;
		if (!ready) return;
		drawMag(tlCanvas, x0, y0, 'tl');
		drawMag(brCanvas, x1, y1, 'br');
	});
	$effect(() => {
		const onResize = () => measure();
		window.addEventListener('resize', onResize);
		return () => { window.removeEventListener('resize', onResize); URL.revokeObjectURL(url); };
	});

	function confirm() {
		if (busy) return;
		busy = true;
		const sw = x1 - x0, sh = y1 - y0;
		if (sw <= 0 || sh <= 0) { busy = false; return; }
		const scale = Math.min(1, MAX_OUT / Math.max(sw, sh));
		const ow = Math.max(1, Math.round(sw * scale)), oh = Math.max(1, Math.round(sh * scale));
		const c = document.createElement('canvas'); c.width = ow; c.height = oh;
		const ctx = c.getContext('2d');
		ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(imgEl, x0, y0, sw, sh, 0, 0, ow, oh);
		c.toBlob((b) => { busy = false; if (b) onconfirm(b); else oncancel(); }, 'image/png');
	}

	const dX = $derived(x0 * dispScale), dY = $derived(y0 * dispScale);
	const dW = $derived((x1 - x0) * dispScale), dH = $derived((y1 - y0) * dispScale);
	const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
	const dims = $derived(`${Math.round(x1 - x0)} × ${Math.round(y1 - y0)} px`);
</script>

<div class="overlay" role="presentation" onpointerdown={(e) => e.target === e.currentTarget && oncancel()}>
	<div class="modal" role="dialog" aria-modal="true" aria-label="Crop flat front">
		<div class="head">
			<h3>Crop the flat front</h3>
			<p>Drag the handles to the artwork edges — this is an exact crop (no padding). Use the corner close-ups to check the edges. Arrow keys nudge a focused handle (Shift = 10px).</p>
		</div>
		<div class="body">
			<div class="stage-wrap">
				<div class="stage">
					<img src={url} alt="" bind:this={imgEl} onload={onImgLoad} draggable="false" />
					{#if ready}
						<div class="sel" style="left:{dX}px; top:{dY}px; width:{dW}px; height:{dH}px;"
							onpointerdown={(e) => down('move', e)} role="presentation">
							{#each HANDLES as h}
								<span class="h {h}" tabindex="0" role="button" aria-label="Resize {h}"
									onpointerdown={(e) => down(h, e)} onkeydown={(e) => nudge(h, e)}></span>
							{/each}
						</div>
					{/if}
				</div>
				<div class="hint">{detected ? 'Auto-detected — adjust if needed.' : 'Adjust the frame to the artwork.'} · {dims}</div>
			</div>
			<div class="side">
				<div class="mag-group">
					<div class="mag"><span class="lbl">Top-left</span><canvas bind:this={tlCanvas}></canvas></div>
					<div class="mag"><span class="lbl">Bottom-right</span><canvas bind:this={brCanvas}></canvas></div>
				</div>
				<div class="btns">
					<button class="ghost" onclick={oncancel}>Cancel</button>
					<button class="primary" onclick={confirm} disabled={busy || !ready}>{busy ? 'Processing…' : 'Use crop'}</button>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.overlay { position: fixed; inset: 0; background: rgba(24,24,27,0.55); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 20px; }
	.modal { background: #fff; border-radius: 16px; width: 100%; max-width: 860px; max-height: 92vh; overflow: auto; box-shadow: 0 24px 70px rgba(0,0,0,0.3); }
	.head { padding: 18px 20px 6px; }
	.head h3 { margin: 0 0 4px; font-size: 16px; font-weight: 800; color: #18181B; }
	.head p { margin: 0; font-size: 12.5px; color: #71717A; line-height: 1.5; }
	.body { display: flex; gap: 18px; padding: 14px 20px 20px; flex-wrap: wrap; }
	.stage-wrap { flex: 1; min-width: 300px; }
	.stage { position: relative; display: inline-block; max-width: 100%; line-height: 0; user-select: none; touch-action: none;
		background-image: linear-gradient(45deg,#f0f0f0 25%,transparent 25%,transparent 75%,#f0f0f0 75%),linear-gradient(45deg,#f0f0f0 25%,#fff 25%,#fff 75%,#f0f0f0 75%);
		background-size: 18px 18px; background-position: 0 0, 9px 9px; border: 1px solid var(--border, #E4E4E7); border-radius: 10px; overflow: hidden; }
	.stage img { display: block; max-width: 100%; max-height: 62vh; width: auto; height: auto; -webkit-user-drag: none; }
	.sel { position: absolute; border: 2px solid #F57832; box-shadow: 0 0 0 100vmax rgba(24,24,27,0.4); box-sizing: border-box; cursor: move; }
	.h { position: absolute; width: 12px; height: 12px; background: #fff; border: 2px solid #F57832; border-radius: 3px; box-sizing: border-box; }
	.h:focus { outline: 2px solid #18181B; outline-offset: 1px; }
	.h.nw { left: -7px; top: -7px; cursor: nwse-resize; } .h.ne { right: -7px; top: -7px; cursor: nesw-resize; }
	.h.sw { left: -7px; bottom: -7px; cursor: nesw-resize; } .h.se { right: -7px; bottom: -7px; cursor: nwse-resize; }
	.h.n { left: 50%; top: -7px; transform: translateX(-50%); cursor: ns-resize; } .h.s { left: 50%; bottom: -7px; transform: translateX(-50%); cursor: ns-resize; }
	.h.w { top: 50%; left: -7px; transform: translateY(-50%); cursor: ew-resize; } .h.e { top: 50%; right: -7px; transform: translateY(-50%); cursor: ew-resize; }
	.hint { margin-top: 8px; font-size: 12px; color: #8a7550; font-weight: 600; }
	.side { width: 200px; display: flex; flex-direction: column; gap: 14px; }
	.mag-group { display: flex; flex-direction: column; gap: 12px; }
	.mag { display: flex; flex-direction: column; gap: 5px; }
	.mag .lbl { font-size: 11px; font-weight: 700; color: #8a7550; text-transform: uppercase; letter-spacing: 0.3px; }
	.mag canvas { width: 100%; max-width: 150px; aspect-ratio: 1; border: 1px solid var(--border, #E4E4E7); border-radius: 8px; image-rendering: pixelated; }
	.btns { margin-top: auto; display: flex; gap: 8px; }
	.btns button { flex: 1; padding: 9px 12px; border-radius: 9px; font-size: 13px; font-weight: 700; font-family: inherit; cursor: pointer; border: 1px solid var(--border, #E4E4E7); }
	.btns .ghost { background: #fff; color: #52525B; }
	.btns .primary { background: #F57832; border-color: #F57832; color: #fff; }
	.btns .primary:disabled { opacity: 0.6; cursor: default; }
	@media (max-width: 640px) { .side { width: 100%; } .mag-group { flex-direction: row; } }
</style>
