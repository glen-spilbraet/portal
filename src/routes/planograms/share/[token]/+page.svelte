<script>
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';

	const token = $derived($page.params.token);

	// Constants (same as editor)
	const MAX_DISPLAY = 600;
	const PAD = 40;
	const UNIT_GAP_PX = 4;

	const MATERIALS = {
		'light-wood':          { fill: '#c9a96e', edge: '#b8945a', stroke: '#9a7540' },
		'dark-wood':           { fill: '#6b3a1f', edge: '#522d16', stroke: '#3a1e0e' },
		'metal':               { fill: '#9baab6', edge: '#8496a4', stroke: '#637585' },
		'black':               { fill: '#2c2c2c', edge: '#1c1c1c', stroke: '#0a0a0a' },
		'white':               { fill: '#f0efec', edge: '#d8d5d0', stroke: '#bbb8b2' },
		'brand-green':         { fill: '#148246', edge: '#0f6438', stroke: '#0a4a2a' },
		'brand-green-pastel':  { fill: '#E1EAD6', edge: '#ccd4c0', stroke: '#b0bba0' },
		'brand-orange':        { fill: '#F57832', edge: '#e06820', stroke: '#c05510' },
		'brand-orange-pastel': { fill: '#FFF5D2', edge: '#f0e5b5', stroke: '#d8cc90' },
	};
	const PALETTE = {
		'light-grey': '#e2e2e2', 'beige': '#ede0cc', 'mid-grey': '#9a9a9a',
		'dark-grey': '#4a4848', 'white': '#ffffff', 'brand-green': '#148246',
		'brand-green-pastel': '#E1EAD6', 'brand-orange': '#F57832', 'brand-orange-pastel': '#FFF5D2',
	};

	let projectName = $state('Planogram');
	let loading = $state(true);
	let notFound = $state(false);

	let svgMarkup = $state('');
	let svgWidth = $state(400);
	let svgHeight = $state(400);
	let canvasBgColor = $state('#e8e6e1');
	let showDimensions = $state(true);

	let canvasZoom = $state(1);
	let canvasPanX = $state(0);
	let canvasPanY = $state(0);
	let isPanning = $state(false);
	let panStart = { clientX: 0, clientY: 0, panX: 0, panY: 0 };
	let exportMenuOpen = $state(false);

	let svgEl, viewportEl;

	// Shelf state (loaded from project)
	let scale = 1, boardPx = 2, boardCm = 1, framePx = 2, frameCm = 2, interiorHCm = 196;
	let shelfPositions = [];
	let placedProducts = [];
	let productLibrary = [];
	let settings = {};
	let CUSTOM_MATERIALS = {};
	let CUSTOM_PALETTE = {};

	function f(n) { return Math.round(n * 10) / 10; }
	function svgRect(x, y, w, h, fill, stroke, sw) {
		return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
	}
	function svgLine(x1, y1, x2, y2, stroke, sw) {
		return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${sw}" />`;
	}
	function bgIsDark(hex) {
		const c = (hex || '#fff').replace('#', '');
		if (c.length < 6) return false;
		return (0.299 * parseInt(c.slice(0, 2), 16) + 0.587 * parseInt(c.slice(2, 4), 16) + 0.114 * parseInt(c.slice(4, 6), 16)) < 128;
	}

	function getCompartments() {
		if (!shelfPositions.length) return [{ yCm: 0, hCm: interiorHCm }];
		const gaps = [{ yCm: 0, hCm: shelfPositions[0] }];
		for (let i = 1; i < shelfPositions.length; i++) {
			const top = shelfPositions[i - 1] + boardCm;
			gaps.push({ yCm: top, hCm: shelfPositions[i] - top });
		}
		const lastTop = shelfPositions[shelfPositions.length - 1] + boardCm;
		gaps.push({ yCm: lastTop, hCm: interiorHCm - lastTop });
		return gaps;
	}

	function resolveMaterial(key) {
		return CUSTOM_MATERIALS[key] ?? MATERIALS[key] ?? MATERIALS['light-wood'];
	}
	function resolveColor(key) {
		return CUSTOM_PALETTE[key] ?? PALETTE[key] ?? '#e2e2e2';
	}

	function drawUnit(x0, y0, W, H, mat, backColor, isLast, annColor, annText, insideColor) {
		let html = '';
		html += svgRect(x0 + framePx, y0 + framePx, W - framePx * 2, H - framePx * 2, backColor, 'none', 0);
		html += svgRect(x0, y0, framePx, H, mat.edge, 'none', 0);
		html += svgRect(x0 + W - framePx, y0, framePx, H, mat.edge, 'none', 0);
		html += svgRect(x0, y0, W, framePx, mat.fill, 'none', 0);
		html += svgRect(x0, y0 + H - framePx, W, framePx, mat.fill, 'none', 0);
		shelfPositions.forEach(posCm => {
			const sy = y0 + framePx + posCm * scale;
			html += svgRect(x0 + framePx, sy, W - framePx * 2, boardPx, mat.fill, 'none', 0);
		});
		html += svgRect(x0, y0, W, H, 'none', mat.stroke, 1.5);
		if (showDimensions) {
			if (isLast) {
				const lineX = x0 + W + 10, arrowX = lineX + 8, textX = arrowX + 5;
				getCompartments().forEach(({ yCm, hCm: gapH }) => {
					const gY = y0 + framePx + yCm * scale, gH = gapH * scale, midY = gY + gH / 2;
					const label = gapH.toFixed(1) + ' cm';
					if (gH < 4) return;
					if (gH >= 22) {
						html += svgLine(lineX, gY, arrowX, gY, annColor, 1);
						html += svgLine(lineX, gY + gH, arrowX, gY + gH, annColor, 1);
						html += svgLine(lineX + 4, gY, lineX + 4, gY + gH, annColor, 1);
						html += `<text x="${textX}" y="${f(midY)}" dominant-baseline="middle" font-family="system-ui,sans-serif" font-size="11" fill="${annText}">${label}</text>`;
					} else {
						html += `<text x="${textX}" y="${f(midY)}" dominant-baseline="middle" font-family="system-ui,sans-serif" font-size="9" fill="${annText}">${label}</text>`;
					}
				});
			}
			getCompartments().forEach(({ yCm, hCm: gapH }) => {
				const gY = y0 + framePx + yCm * scale, gH = gapH * scale;
				if (gH < 22) return;
				html += `<text x="${f(x0 + framePx + (W - framePx * 2) / 2)}" y="${f(gY + gH / 2)}"
					text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif"
					font-size="12" fill="${insideColor}" pointer-events="none">${gapH.toFixed(1)} cm</text>`;
			});
		}
		return html;
	}

	function renderSvg() {
		const s = settings;
		const wCm = parseFloat(s.width || 120), hCm = parseFloat(s.height || 200);
		const thC = parseFloat(s.thickness || 1), ftC = parseFloat(s.frameThickness || 2);
		const nU = parseInt(s.unitCount || 1);
		const mat = resolveMaterial(s.selectedMaterial || 'light-wood');
		const backColor = resolveColor(s.selectedBacking || 'light-grey');
		const canvasColor = resolveColor(s.selectedCanvasBg || 'white');
		canvasBgColor = canvasColor;
		if (viewportEl) viewportEl.style.background = canvasColor;

		const W = wCm * scale, H = hCm * scale, y0 = PAD;
		const totalW = nU * W + (nU - 1) * UNIT_GAP_PX;
		const sW = PAD + totalW + PAD + 64, sH = H + PAD * 2;
		svgWidth = sW; svgHeight = sH;

		const annColor = bgIsDark(canvasColor) ? 'rgba(255,255,255,0.35)' : '#aaa';
		const annText = bgIsDark(canvasColor) ? 'rgba(255,255,255,0.6)' : '#777';
		const insideColor = bgIsDark(backColor) ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.28)';

		let html = '';
		for (let u = 0; u < nU; u++) {
			html += drawUnit(PAD + u * (W + UNIT_GAP_PX), y0, W, H, mat, backColor, u === nU - 1, annColor, annText, insideColor);
		}

		let defs = `<defs><filter id="prod-shadow" x="-8%" y="-8%" width="116%" height="116%">
			<feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.14"/>
		</filter>`;
		placedProducts.forEach(p => {
			const pw = f(p.widthCm * scale), ph = f(p.heightCm * scale);
			defs += `<clipPath id="clip-p${p.id}"><rect x="${f(p.svgX)}" y="${f(p.svgY)}" width="${pw}" height="${ph}" rx="3"/></clipPath>`;
		});
		defs += `</defs>`;
		html += defs;

		placedProducts.forEach(p => {
			const pw = f(p.widthCm * scale), ph = f(p.heightCm * scale);
			if (p.isPlaceholder) {
				const fs = Math.max(8, Math.min(14, parseFloat(pw) / 5));
				html += `<g filter="url(#prod-shadow)">
					<rect x="${f(p.svgX)}" y="${f(p.svgY)}" width="${pw}" height="${ph}" fill="#e8e4f0" stroke="#c0b4d8" stroke-width="1" rx="3" />
					<text x="${f(p.svgX + p.widthCm * scale / 2)}" y="${f(p.svgY + p.heightCm * scale / 2)}"
						text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif"
						font-size="${fs}" font-weight="700" fill="#5a4a7a">${p.sku}</text>
				</g>`;
			} else {
				html += `<g filter="url(#prod-shadow)">
					<image href="${p.photoUrl}" x="${f(p.svgX)}" y="${f(p.svgY)}" width="${pw}" height="${ph}"
						preserveAspectRatio="xMidYMid meet" clip-path="url(#clip-p${p.id})" />
				</g>`;
			}
		});

		svgMarkup = html;
	}

	function applyTransform() {
		if (!viewportEl) return;
		const content = viewportEl.querySelector('#canvas-content');
		if (content) content.style.transform = `translate(${canvasPanX}px,${canvasPanY}px) scale(${canvasZoom})`;
	}

	function zoomBy(factor) {
		if (!viewportEl) return;
		const cx = viewportEl.clientWidth / 2, cy = viewportEl.clientHeight / 2;
		canvasPanX = cx - (cx - canvasPanX) * factor;
		canvasPanY = cy - (cy - canvasPanY) * factor;
		canvasZoom = Math.max(0.05, Math.min(10, canvasZoom * factor));
		applyTransform();
	}

	function zoomToFit() {
		if (!viewportEl) return;
		const vpW = viewportEl.clientWidth, vpH = viewportEl.clientHeight;
		const pad = 60;
		canvasZoom = Math.min((vpW - pad * 2) / svgWidth, (vpH - pad * 2) / svgHeight);
		canvasZoom = Math.max(0.05, Math.min(10, canvasZoom));
		canvasPanX = (vpW - svgWidth * canvasZoom) / 2;
		canvasPanY = (vpH - svgHeight * canvasZoom) / 2;
		applyTransform();
	}

	function onViewportMouseDown(e) {
		if (e.target.closest('#top-bar, #toolbar')) return;
		isPanning = true;
		panStart = { clientX: e.clientX, clientY: e.clientY, panX: canvasPanX, panY: canvasPanY };
		e.currentTarget.classList.add('panning');
		e.preventDefault();
	}

	function onViewportWheel(e) {
		e.preventDefault();
		const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
		const rect = viewportEl.getBoundingClientRect();
		canvasPanX = (e.clientX - rect.left) - ((e.clientX - rect.left) - canvasPanX) * factor;
		canvasPanY = (e.clientY - rect.top) - ((e.clientY - rect.top) - canvasPanY) * factor;
		canvasZoom = Math.max(0.05, Math.min(10, canvasZoom * factor));
		applyTransform();
	}

	function onMouseMove(e) {
		if (isPanning) {
			canvasPanX = panStart.panX + (e.clientX - panStart.clientX);
			canvasPanY = panStart.panY + (e.clientY - panStart.clientY);
			applyTransform();
		}
	}

	function onMouseUp() {
		if (isPanning) { isPanning = false; if (viewportEl) viewportEl.classList.remove('panning'); }
	}

	// Export
	function exportFilename(ext) {
		const safe = (projectName || 'Shelf').replace(/[\\/:*?"<>|]/g, '').trim() || 'Shelf';
		const now = new Date();
		return `${safe} ${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}.${ext}`;
	}
	async function urlToBase64(url) {
		const blob = await fetch(url).then(r => r.blob());
		return new Promise(res => { const r = new FileReader(); r.onloadend = () => res(r.result); r.readAsDataURL(blob); });
	}
	async function exportSVG() {
		exportMenuOpen = false;
		const clone = svgEl.cloneNode(true);
		clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		await Promise.all([...clone.querySelectorAll('image')].map(async img => {
			const href = img.getAttribute('href');
			if (href) img.setAttribute('href', await urlToBase64(href));
		}));
		const svg = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
		const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
		const a = document.createElement('a'); a.href = url; a.download = exportFilename('svg'); a.click();
		URL.revokeObjectURL(url);
	}
	async function exportJPG() {
		exportMenuOpen = false;
		const clone = svgEl.cloneNode(true);
		clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		await Promise.all([...clone.querySelectorAll('image')].map(async img => {
			const href = img.getAttribute('href');
			if (href) img.setAttribute('href', await urlToBase64(href));
		}));
		const sW = parseFloat(clone.getAttribute('width')), sH = parseFloat(clone.getAttribute('height'));
		const EP = 48, PX = 2;
		const canvas = document.createElement('canvas');
		canvas.width = (sW + EP * 2) * PX; canvas.height = (sH + EP * 2) * PX;
		const ctx = canvas.getContext('2d'); ctx.scale(PX, PX);
		ctx.fillStyle = canvasBgColor; ctx.fillRect(0, 0, sW + EP * 2, sH + EP * 2);
		const svgStr = new XMLSerializer().serializeToString(clone);
		const svgUrl = URL.createObjectURL(new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' }));
		await new Promise((res, rej) => { const img = new Image(); img.onload = () => { ctx.drawImage(img, EP, EP, sW, sH); res(); }; img.onerror = rej; img.src = svgUrl; });
		URL.revokeObjectURL(svgUrl);
		const a = document.createElement('a'); a.href = canvas.toDataURL('image/jpeg', 0.95); a.download = exportFilename('jpg'); a.click();
	}

	onMount(async () => {
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
		if (viewportEl) viewportEl.addEventListener('wheel', onViewportWheel, { passive: false });
		document.addEventListener('click', e => {
			if (exportMenuOpen && !e.target.closest('#export-wrap')) exportMenuOpen = false;
		});

		try {
			const res = await fetch(`/api/planograms/share/${token}`);
			if (!res.ok) throw new Error();
			const project = await res.json();
			projectName = project.name || 'Planogram';
			document.title = `${projectName} — Planogram`;
			settings = project.settings || {};

			// Restore custom colours
			const s = settings;
			(s.customColors || []).forEach(({ key, hex, label }) => {
				const dimHex = (h, f) => { const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16),d=v=>Math.round(v*f).toString(16).padStart(2,'0'); return `#${d(r)}${d(g)}${d(b)}`; };
				CUSTOM_MATERIALS[key] = { label, fill: hex, edge: dimHex(hex, 0.82), stroke: dimHex(hex, 0.65) };
				CUSTOM_PALETTE[key] = hex;
			});

			// Compute shelf
			const wCm = parseFloat(s.width || 120), hCm = parseFloat(s.height || 200);
			const thC = parseFloat(s.thickness || 1), ftC = parseFloat(s.frameThickness || 2);
			const nS = parseInt(s.shelves || 4);
			scale = Math.min(MAX_DISPLAY / wCm, MAX_DISPLAY / hCm);
			frameCm = ftC; framePx = Math.max(2, ftC * scale);
			boardCm = thC; boardPx = Math.max(2, thC * scale);
			interiorHCm = hCm - 2 * ftC;
			showDimensions = s.showDimensions !== false;

			// Shelf positions
			const compH = interiorHCm / nS;
			shelfPositions = [];
			for (let i = 1; i < nS; i++) shelfPositions.push(compH * i - thC / 2);
			if (s.shelfPositions && s.shelfPositions.length === nS - 1) shelfPositions = s.shelfPositions;

			// Library
			(project.libraryItems || []).forEach(item => {
				const entry = { id: item.id, sku: item.sku, name: item.name, widthCm: item.widthCm, heightCm: item.heightCm, isPlaceholder: item.isPlaceholder };
				if (!item.isPlaceholder) entry.photoUrl = `/api/planograms/share/${token}/photos/${item.id}`;
				productLibrary.push(entry);
			});

			// Placements
			(project.placements || []).forEach(p => {
				const lib = productLibrary.find(l => l.id === p.libId);
				if (!lib) return;
				placedProducts.push({ ...p, photoUrl: lib.photoUrl });
			});

			loading = false;
			renderSvg();
			requestAnimationFrame(zoomToFit);
		} catch {
			loading = false;
			notFound = true;
		}
	});

	onDestroy(() => {
		window.removeEventListener('mousemove', onMouseMove);
		window.removeEventListener('mouseup', onMouseUp);
		if (viewportEl) viewportEl.removeEventListener('wheel', onViewportWheel);
	});

	$effect(() => {
		if (svgEl && !loading && !notFound) {
			svgEl.setAttribute('width', svgWidth);
			svgEl.setAttribute('height', svgHeight);
			svgEl.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
			svgEl.innerHTML = svgMarkup;
		}
	});
</script>

<svelte:head>
	<title>{projectName} — Planogram</title>
</svelte:head>

{#if loading}
	<div class="loading-screen">
		<div class="loading-spinner"></div>
		<p>Loading planogram…</p>
	</div>
{:else if notFound}
	<div class="loading-screen">
		<p style="color:#888">This share link is no longer valid or has been revoked.</p>
	</div>
{:else}
	<!-- Canvas viewport -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div id="viewport" bind:this={viewportEl}
		class:panning={isPanning}
		onmousedown={onViewportMouseDown}
		style="background:{canvasBgColor}">
		<div id="canvas-content">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<svg bind:this={svgEl} id="shelf-svg" width={svgWidth} height={svgHeight} viewBox="0 0 {svgWidth} {svgHeight}">
			</svg>
		</div>
	</div>

	<!-- Top bar -->
	<div id="top-bar">
		<span id="top-bar-logo">PLANOGRAM</span>
		<div id="top-bar-divider"></div>
		<span id="top-bar-name">{projectName}</span>
		<span id="top-bar-badge">View only</span>
	</div>

	<!-- Bottom toolbar -->
	<div id="toolbar">
		<button class="zoom-btn" class:active={showDimensions} title="Toggle dimensions"
			onclick={() => { showDimensions = !showDimensions; renderSvg(); }}>
			<svg width="15" height="15" viewBox="0 0 15 15" fill="none">
				<line x1="1.5" y1="3" x2="1.5" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
				<line x1="13.5" y1="3" x2="13.5" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
				<line x1="1.5" y1="7.5" x2="13.5" y2="7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
				<path d="M4.5 5.5L1.5 7.5L4.5 9.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
				<path d="M10.5 5.5L13.5 7.5L10.5 9.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		</button>
		<div class="tb-sep"></div>
		<button class="zoom-btn" title="Zoom in" onclick={() => zoomBy(1.25)}>+</button>
		<button class="zoom-btn" title="Zoom out" onclick={() => zoomBy(1/1.25)}>−</button>
		<button class="zoom-btn" style="font-size:0.75rem;font-weight:600" title="Fit to screen" onclick={zoomToFit}>Fit</button>
		<div class="tb-sep"></div>
		<div id="export-wrap" style="position:relative">
			{#if exportMenuOpen}
				<div class="export-menu">
					<button class="export-option" onclick={exportSVG}>
						<svg width="13" height="13" viewBox="0 0 14 14" fill="none">
							<path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Export as SVG
					</button>
					<button class="export-option" onclick={exportJPG}>
						<svg width="13" height="13" viewBox="0 0 14 14" fill="none">
							<rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
							<path d="M1 9l3-3 2.5 2.5L9 6l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Export as JPG
					</button>
				</div>
			{/if}
			<button class="zoom-btn" title="Export" onclick={() => exportMenuOpen = !exportMenuOpen}>
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
					<path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			</button>
		</div>
	</div>
{/if}

<style>
	:global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
	:global(body) { font-family: system-ui, sans-serif; width: 100vw; height: 100vh; overflow: hidden; user-select: none; }
	:global(svg) { display: block; }

	.loading-screen {
		position: fixed; inset: 0; display: flex; flex-direction: column;
		align-items: center; justify-content: center; gap: 16px;
		background: #e8e6e1; font-size: 0.9rem; color: #888;
	}
	.loading-spinner {
		width: 32px; height: 32px; border: 3px solid #e0ddd8; border-top-color: #888;
		border-radius: 50%; animation: spin 0.8s linear infinite;
	}
	@keyframes spin { to { transform: rotate(360deg); } }

	#viewport {
		position: fixed; inset: 0; overflow: hidden; cursor: grab;
	}
	#viewport.panning { cursor: grabbing; }
	#canvas-content { position: absolute; top: 0; left: 0; transform-origin: 0 0; }

	#top-bar {
		position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
		display: flex; align-items: center; gap: 10px;
		background: rgba(255,255,255,0.92); border: 1px solid #e0ddd8;
		border-radius: 12px; padding: 8px 16px;
		box-shadow: 0 2px 12px rgba(0,0,0,0.10); backdrop-filter: blur(6px);
		z-index: 20; max-width: calc(100vw - 40px);
	}
	#top-bar-logo { font-size: 0.78rem; font-weight: 700; color: #aaa; letter-spacing: 0.04em; flex-shrink: 0; }
	#top-bar-divider { width: 1px; height: 16px; background: #e0ddd8; flex-shrink: 0; }
	#top-bar-name { font-size: 0.85rem; font-weight: 600; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	#top-bar-badge { font-size: 0.68rem; font-weight: 600; color: #aaa; background: #f0ede8; border-radius: 5px; padding: 2px 7px; white-space: nowrap; flex-shrink: 0; }

	#toolbar {
		position: fixed; bottom: 20px; right: 20px;
		display: flex; align-items: center; gap: 6px; z-index: 10;
	}
	.tb-sep { width: 1px; height: 20px; background: rgba(0,0,0,0.12); }
	.zoom-btn {
		width: 36px; height: 36px; background: rgba(255,255,255,0.92);
		border: 1px solid #ddd; border-radius: 8px; font-size: 1.1rem; font-weight: 500;
		cursor: pointer; color: #333; display: flex; align-items: center; justify-content: center;
		box-shadow: 0 2px 8px rgba(0,0,0,0.12); transition: background 0.15s; backdrop-filter: blur(4px);
	}
	.zoom-btn:hover { background: #fff; border-color: #aaa; }
	.zoom-btn.active { background: rgba(26,26,26,0.82); border-color: #1a1a1a; color: #fff; }
	.zoom-btn.active:hover { background: rgba(26,26,26,0.92); }

	.export-menu {
		position: absolute; bottom: calc(100% + 8px); right: 0;
		background: rgba(255,255,255,0.97); border: 1px solid #e0ddd8; border-radius: 10px;
		box-shadow: 0 4px 20px rgba(0,0,0,0.14); backdrop-filter: blur(6px);
		overflow: hidden; min-width: 160px; display: flex; flex-direction: column;
	}
	.export-option {
		padding: 10px 16px; font-size: 0.85rem; font-weight: 500; color: #333;
		cursor: pointer; background: none; border: none; text-align: left; white-space: nowrap;
		display: flex; align-items: center; gap: 9px; transition: background 0.12s;
	}
	.export-option:hover { background: #f5f4f0; }
	.export-option + .export-option { border-top: 1px solid #f0ede8; }
</style>
