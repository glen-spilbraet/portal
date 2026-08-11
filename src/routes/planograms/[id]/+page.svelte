<script>
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';

	const projectId = page.params.id;

	// ── Constants ──────────────────────────────────────────────────────────────
	const MAX_DISPLAY = 600;
	const PAD = 40;
	const MIN_GAP_CM = 0.5;
	const MAX_UNITS = 8;
	const UNIT_GAP_PX = 4;
	const SNAP_PX = 20;

	const DEFAULTS = {
		width: 120, height: 200, shelves: 4,
		thickness: 1, frameThickness: 2, unitCount: 1,
		material: 'light-wood', backing: 'light-grey', canvasBg: 'white',
	};

	const MATERIALS_BASE = {
		'light-wood':          { label: 'Light Wood',          fill: '#c9a96e', edge: '#b8945a', stroke: '#9a7540' },
		'dark-wood':           { label: 'Dark Wood',           fill: '#6b3a1f', edge: '#522d16', stroke: '#3a1e0e' },
		'metal':               { label: 'Metal',               fill: '#9baab6', edge: '#8496a4', stroke: '#637585' },
		'black':               { label: 'Black',               fill: '#2c2c2c', edge: '#1c1c1c', stroke: '#0a0a0a' },
		'white':               { label: 'White',               fill: '#f0efec', edge: '#d8d5d0', stroke: '#bbb8b2' },
		'brand-green':         { label: 'Brand Green',         fill: '#148246', edge: '#0f6438', stroke: '#0a4a2a' },
		'brand-green-pastel':  { label: 'Brand Green Pastel',  fill: '#E1EAD6', edge: '#ccd4c0', stroke: '#b0bba0' },
		'brand-orange':        { label: 'Brand Orange',        fill: '#F57832', edge: '#e06820', stroke: '#c05510' },
		'brand-orange-pastel': { label: 'Brand Orange Pastel', fill: '#FFF5D2', edge: '#f0e5b5', stroke: '#d8cc90' },
	};

	const PALETTE_BASE = {
		'light-grey':          { label: 'Light Grey',          color: '#e2e2e2' },
		'beige':               { label: 'Beige',               color: '#ede0cc' },
		'mid-grey':            { label: 'Mid Grey',            color: '#9a9a9a' },
		'dark-grey':           { label: 'Dark Grey',           color: '#4a4848' },
		'white':               { label: 'White',               color: '#ffffff' },
		'brand-green':         { label: 'Brand Green',         color: '#148246' },
		'brand-green-pastel':  { label: 'Brand Green Pastel',  color: '#E1EAD6' },
		'brand-orange':        { label: 'Brand Orange',        color: '#F57832' },
		'brand-orange-pastel': { label: 'Brand Orange Pastel', color: '#FFF5D2' },
	};

	// ── Reactive state ─────────────────────────────────────────────────────────
	let MATERIALS = $state({ ...MATERIALS_BASE });
	let PALETTE = $state({ ...PALETTE_BASE });

	let projectName = $state('Untitled project');
	let saveStatus = $state('');

	// Settings
	let width = $state(DEFAULTS.width);
	let height = $state(DEFAULTS.height);
	let shelves = $state(DEFAULTS.shelves);
	let thickness = $state(DEFAULTS.thickness);
	let frameThickness = $state(DEFAULTS.frameThickness);
	let unitCount = $state(DEFAULTS.unitCount);
	let selectedMaterial = $state(DEFAULTS.material);
	let selectedBacking = $state(DEFAULTS.backing);
	let selectedCanvasBg = $state(DEFAULTS.canvasBg);
	let showDimensions = $state(true);

	// Shelf computed values
	let scale = $state(1), boardPx = $state(2), boardCm = $state(1), framePx = $state(2), frameCm = $state(2), interiorHCm = $state(196);
	let shelfPositions = $state([]);

	// Products
	let productLibrary = $state([]);
	let placedProducts = $state([]);
	let placedIdCounter = 0;

	// Drag state
	let draggingBoard = $state(null); // { idx, startClientY, startPosCm }
	let draggingPlaced = $state(null); // { id, startClientX, startClientY, svgX, svgY }
	let draggingFromTray = $state(null);

	// Pan/zoom
	let canvasZoom = $state(1);
	let canvasPanX = $state(0);
	let canvasPanY = $state(0);
	let isPanning = $state(false);
	let panStart = { clientX: 0, clientY: 0, panX: 0, panY: 0 };

	// UI state
	let settingsCollapsed = $state(false);
	let productsCollapsed = $state(false);
	let errorMsg = $state('');
	let exportMenuOpen = $state(false);

	// Modals
	let showPhotoModal = $state(false);
	let showPlaceholderModal = $state(false);
	let showImportModal = $state(false);
	let showSwapModal = $state(false);
	let showShareModal = $state(false);
	let showSwatchModal = $state(false);
	let showClearConfirm = $state(false);


	// Photo modal state
	let photoModalStep = $state('upload'); // upload | sku | confirm | error
	let photoModalFile = $state(null);
	let photoModalObjectUrl = $state('');
	let photoModalSku = $state('');
	let photoModalMsg = $state('');
	let photoModalProduct = $state(null);
	let photoModalW = $state('');
	let photoModalH = $state('');
	let photoModalError = $state('');
	let photoModalBusy = $state(false);

	// Placeholder modal
	let phSku = $state('');
	let phProduct = $state(null);
	let phW = $state('');
	let phH = $state('');
	let phError = $state('');
	let phBusy = $state(false);

	// Import modal
	let importItems = $state([]);
	let importSelected = $state(new Set());
	let importLoading = $state(false);
	let importBusy = $state(false);
	let importSearch = $state('');
	let importMaxW = $state('');
	let importMaxH = $state('');

	const importFiltered = $derived.by(() => {
		const text = importSearch.trim().toLowerCase();
		const maxW = parseFloat(importMaxW);
		const maxH = parseFloat(importMaxH);
		const hasFilter = text.length > 0 || (maxW > 0 && !isNaN(maxW)) || (maxH > 0 && !isNaN(maxH));
		let list = importItems;
		if (text) list = list.filter(i =>
			i.sku.toLowerCase().includes(text) ||
			(i.name ?? '').toLowerCase().includes(text)
		);
		if (!isNaN(maxW) && maxW > 0) list = list.filter(i => i.widthCm <= maxW);
		if (!isNaN(maxH) && maxH > 0) list = list.filter(i => i.heightCm <= maxH);
		return hasFilter ? list : list.slice(0, 10);
	});

	// Swap modal
	let swapTargetId = $state(null);

	// Share modal
	let shareLoading = $state(false);
	let shareToken = $state('');
	let shareCopied = $state(false);

	// Swatch modal
	let swatchType = $state('');
	let swatchCustomHex = $state('#ffffff');

	// Ghost for tray drag
	let ghostEl = null;

	// SVG ref
	let svgEl;
	let viewportEl;

	// ── Save ───────────────────────────────────────────────────────────────────
	let _saveTimer = null;

	function saveState() {
		clearTimeout(_saveTimer);
		saveStatus = 'Saving…';
		_saveTimer = setTimeout(async () => {
			const settingsPayload = {
				width, height, shelves, thickness, frameThickness,
				unitCount, shelfPositions: [...shelfPositions],
				selectedMaterial, selectedBacking, selectedCanvasBg, showDimensions,
				customColors: Object.entries(MATERIALS)
					.filter(([k]) => k.startsWith('custom-'))
					.map(([k, v]) => ({ key: k, hex: v.fill, label: v.label })),
			};
			const placements = placedProducts.map(({ photoUrl: _u, ...rest }) => rest);
			try {
				await fetch(`/api/planograms/${projectId}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ settings: settingsPayload, placements }),
				});
				saveStatus = 'Saved';
				setTimeout(() => { saveStatus = ''; }, 1500);
			} catch { saveStatus = ''; }
		}, 800);
	}

	// ── Shelf math ─────────────────────────────────────────────────────────────
	function evenlySpacedPositions(nS, intH, thC) {
		const compH = intH / nS;
		const positions = [];
		for (let i = 1; i < nS; i++) positions.push(compH * i - thC / 2);
		return positions;
	}

	function isValidPositionSet(arr, intH, thC) {
		return arr.every((p, i) => {
			const minY = i > 0 ? arr[i - 1] + thC + MIN_GAP_CM : MIN_GAP_CM;
			return p >= minY && p <= intH - thC - MIN_GAP_CM;
		});
	}

	function computeShelf(savedPositions = null) {
		errorMsg = '';
		const wC = parseFloat(width), hC = parseFloat(height);
		const thC = parseFloat(thickness), ftC = parseFloat(frameThickness);
		const nS = parseInt(shelves);
		if ([wC, hC, thC, ftC].some(v => !v || v <= 0) || isNaN(nS) || nS < 1) {
			errorMsg = 'Please enter valid positive values.';
			return;
		}
		const s = Math.min(MAX_DISPLAY / wC, MAX_DISPLAY / hC);
		const fP = Math.max(2, ftC * s);
		const bP = Math.max(2, thC * s);
		const intH = hC - 2 * ftC;
		if (intH <= 0) { errorMsg = 'Frame thickness is too large for height.'; return; }

		scale = s; framePx = fP; boardPx = bP; boardCm = thC; frameCm = ftC; interiorHCm = intH;

		const prevPositions = shelfPositions;
		let positions = null;
		let restoring = false;

		if (savedPositions && savedPositions.length === nS - 1 && isValidPositionSet(savedPositions, intH, thC)) {
			// Restoring an explicit set of positions (e.g. loading a saved project) —
			// trust the placements that were saved alongside these positions as-is.
			positions = savedPositions;
			restoring = true;
		} else if (prevPositions.length === nS - 1 && isValidPositionSet(prevPositions, intH, thC)) {
			// Shelf count unchanged — leave the boards where they are.
			positions = prevPositions;
		} else if (nS - 1 > prevPositions.length && isValidPositionSet(prevPositions, intH, thC)) {
			// Adding shelves: keep existing boards in place and add the new ones to the bottom.
			const addCount = (nS - 1) - prevPositions.length;
			const bottomStart = prevPositions.length ? prevPositions[prevPositions.length - 1] + thC : 0;
			const bottomH = intH - bottomStart;
			const compH = bottomH / (addCount + 1);
			const added = [];
			for (let i = 1; i <= addCount; i++) added.push(bottomStart + compH * i - thC / 2);
			const candidate = [...prevPositions, ...added];
			positions = isValidPositionSet(candidate, intH, thC) ? candidate : evenlySpacedPositions(nS, intH, thC);
		} else if (nS - 1 < prevPositions.length) {
			// Removing shelves: drop from the bottom, keep the remaining boards untouched.
			const candidate = prevPositions.slice(0, nS - 1);
			positions = isValidPositionSet(candidate, intH, thC) ? candidate : evenlySpacedPositions(nS, intH, thC);
		} else {
			positions = evenlySpacedPositions(nS, intH, thC);
		}

		shelfPositions = positions;

		// Disconnect (but keep) any placement whose shelf moved or no longer exists,
		// rather than deleting placed products outright. Not applicable when restoring
		// a saved project — those placements are trusted as-is.
		if (!restoring) {
			placedProducts = placedProducts.map(p => {
				if (p.snapShelf === null || p.snapShelf === undefined) return p;
				const stillAligned = positions[p.snapShelf] !== undefined && positions[p.snapShelf] === prevPositions[p.snapShelf];
				return stillAligned ? p : { ...p, snapShelf: null };
			});
		}

		requestAnimationFrame(zoomToFit);
	}

	// ── Compartments ──────────────────────────────────────────────────────────
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

	// ── SVG helpers ────────────────────────────────────────────────────────────
	function f(n) { return Math.round(n * 10) / 10; }
	function svgRect(x, y, w, h, fill, stroke, sw) {
		return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`;
	}
	function svgLine(x1, y1, x2, y2, stroke, sw) {
		return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${sw}" />`;
	}
	function bgIsDark(hex) {
		const c = (hex || '#ffffff').replace('#', '');
		if (c.length < 6) return false;
		return (0.299 * parseInt(c.slice(0, 2), 16) + 0.587 * parseInt(c.slice(2, 4), 16) + 0.114 * parseInt(c.slice(4, 6), 16)) < 128;
	}

	// ── Draw one unit ──────────────────────────────────────────────────────────
	function drawUnit(x0, y0, W, H, mat, backColor, isLast, annColor, annText, insideColor, showDims) {
		let html = '';
		html += svgRect(x0 + framePx, y0 + framePx, W - framePx * 2, H - framePx * 2, backColor, 'none', 0);
		html += svgRect(x0, y0, framePx, H, mat.edge, 'none', 0);
		html += svgRect(x0 + W - framePx, y0, framePx, H, mat.edge, 'none', 0);
		html += svgRect(x0, y0, W, framePx, mat.fill, 'none', 0);
		html += svgRect(x0, y0 + H - framePx, W, framePx, mat.fill, 'none', 0);

		const hitH = Math.max(boardPx, 18);
		shelfPositions.forEach((posCm, i) => {
			const sy = y0 + framePx + posCm * scale;
			html += svgRect(x0 + framePx, sy, W - framePx * 2, boardPx, mat.fill, 'none', 0);
			html += `<rect class="shelf-hit" data-i="${i}"
				x="${f(x0 + framePx)}" y="${f(sy - (hitH - boardPx) / 2)}"
				width="${f(W - framePx * 2)}" height="${f(hitH)}" fill="transparent" style="cursor:ns-resize" />`;
		});

		html += svgRect(x0, y0, W, H, 'none', mat.stroke, 1.5);

		if (showDims) {
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
				const midY = gY + gH / 2;
				html += `<text x="${f(x0 + framePx + (W - framePx * 2) / 2)}" y="${f(midY)}"
					text-anchor="middle" dominant-baseline="middle"
					font-family="system-ui,sans-serif" font-size="12"
					fill="${insideColor}" pointer-events="none">${gapH.toFixed(1)} cm</text>`;
			});
		}
		return html;
	}

	// ── Build SVG ──────────────────────────────────────────────────────────────
	let svgMarkup = $state('');
	let svgWidth = $state(400);
	let svgHeight = $state(400);

	function renderSvg() {
		const mat = MATERIALS[selectedMaterial] ?? MATERIALS_BASE['light-wood'];
		const backColor = (PALETTE[selectedBacking] ?? PALETTE_BASE['light-grey']).color;
		const canvasColor = (PALETTE[selectedCanvasBg] ?? PALETTE_BASE['white']).color;

		if (viewportEl) viewportEl.style.background = canvasColor;

		const W = (parseFloat(width) || 120) * scale;
		const H = (parseFloat(height) || 200) * scale;
		const y0 = PAD;
		const totalW = unitCount * W + (unitCount - 1) * UNIT_GAP_PX;
		const sW = PAD + totalW + PAD + 64;
		const sH = H + PAD * 2;
		svgWidth = sW; svgHeight = sH;

		const annColor = bgIsDark(canvasColor) ? 'rgba(255,255,255,0.35)' : '#aaa';
		const annText = bgIsDark(canvasColor) ? 'rgba(255,255,255,0.6)' : '#777';
		const insideColor = bgIsDark(backColor) ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.28)';

		const showDims = showDimensions || draggingBoard !== null;

		let html = '';
		for (let u = 0; u < unitCount; u++) {
			html += drawUnit(PAD + u * (W + UNIT_GAP_PX), y0, W, H, mat, backColor,
				u === unitCount - 1, annColor, annText, insideColor, showDims);
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
			const px = f(p.svgX), py = f(p.svgY);
			const ds = 16;

			html += `<g class="product-group" style="--pg-opacity:0">`;
			if (p.isPlaceholder) {
				html += `<g filter="url(#prod-shadow)" style="pointer-events:none">
					<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="#e8e4f0" stroke="#c0b4d8" stroke-width="1" rx="3" />`;
				const fs = Math.max(8, Math.min(14, parseFloat(pw) / 5));
				html += `<text x="${f(p.svgX + p.widthCm * scale / 2)}" y="${f(p.svgY + p.heightCm * scale / 2 - fs * 0.6)}"
					text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif"
					font-size="${fs}" font-weight="700" fill="#5a4a7a">${p.sku}</text>`;
				const nfs = Math.max(6, Math.min(10, fs * 0.75));
				const maxC = Math.floor(parseFloat(pw) / (nfs * 0.55));
				const dn = p.name && p.name.length > maxC ? p.name.slice(0, maxC - 1) + '…' : (p.name || '');
				html += `<text x="${f(p.svgX + p.widthCm * scale / 2)}" y="${f(p.svgY + p.heightCm * scale / 2 + fs * 0.8)}"
					text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif"
					font-size="${nfs}" fill="#5a4a7a">${dn}</text>`;
				html += `</g>`;
			} else {
				html += `<g filter="url(#prod-shadow)" style="pointer-events:none">
					<image href="${p.photoUrl}" x="${px}" y="${py}" width="${pw}" height="${ph}"
						preserveAspectRatio="xMidYMid meet" clip-path="url(#clip-p${p.id})" />
				</g>`;
			}

			html += `<rect class="placed-hit" data-placed-id="${p.id}"
				x="${f(p.svgX - 4)}" y="${f(p.svgY - 4)}"
				width="${f(p.widthCm * scale + 8)}" height="${f(p.heightCm * scale + 8)}"
				fill="transparent" style="cursor:move" />`;

			const delX = p.svgX + p.widthCm * scale - ds;
			const swX = delX - ds - 2;
			const bY = p.svgY;
			html += `<g class="product-controls">
				<g class="product-swap" data-placed-id="${p.id}" style="cursor:pointer">
					<rect x="${f(swX)}" y="${f(bY)}" width="${ds}" height="${ds}" rx="3" fill="rgba(0,0,0,0.55)"/>
					<path transform="translate(${f(swX)},${f(bY)})"
						d="M2.5 5.5 H10.5 M9 4 L11.5 5.5 L9 7 M13.5 10.5 H5.5 M7 9 L4.5 10.5 L7 12"
						stroke="white" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
				</g>
				<g class="product-del" data-placed-id="${p.id}" style="cursor:pointer">
					<rect x="${f(delX)}" y="${f(bY)}" width="${ds}" height="${ds}" rx="3" fill="rgba(0,0,0,0.55)"/>
					<text x="${f(delX + ds / 2)}" y="${f(bY + ds / 2)}"
						text-anchor="middle" dominant-baseline="middle"
						font-family="system-ui,sans-serif" font-size="9" fill="white">×</text>
				</g>
			</g>`;

			html += `</g>`;
		});

		svgMarkup = html;
	}

	// ── Pan/zoom ───────────────────────────────────────────────────────────────
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
		if (!svgEl || !viewportEl) return;
		const vpW = viewportEl.clientWidth, vpH = viewportEl.clientHeight;
		const pad = 60;
		canvasZoom = Math.min((vpW - pad * 2) / svgWidth, (vpH - pad * 2) / svgHeight);
		canvasZoom = Math.max(0.05, Math.min(10, canvasZoom));
		canvasPanX = (vpW - svgWidth * canvasZoom) / 2;
		canvasPanY = (vpH - svgHeight * canvasZoom) / 2;
		applyTransform();
	}

	// ── Snap product ──────────────────────────────────────────────────────────
	function trySnapProduct(p) {
		const bottomY = p.svgY + p.heightCm * scale;
		for (let i = 0; i < shelfPositions.length; i++) {
			const shelfTopY = PAD + framePx + shelfPositions[i] * scale;
			if (Math.abs(bottomY - shelfTopY) < SNAP_PX) {
				p.svgY = shelfTopY - p.heightCm * scale;
				p.snapShelf = i;
				return;
			}
		}
		const floorY = PAD + (parseFloat(height) || 200) * scale - framePx;
		if (Math.abs(bottomY - floorY) < SNAP_PX) {
			p.svgY = floorY - p.heightCm * scale;
			p.snapShelf = null;
			return;
		}
		p.snapShelf = null;
	}

	function updateSnappedProducts() {
		placedProducts.forEach(p => {
			if (p.snapShelf === null || p.snapShelf === undefined) return;
			const shelfTopY = PAD + framePx + shelfPositions[p.snapShelf] * scale;
			p.svgY = shelfTopY - p.heightCm * scale;
		});
	}

	// ── Event wiring (attached after mount) ───────────────────────────────────
	function onViewportMouseDown(e) {
		if (draggingBoard !== null || draggingPlaced !== null || draggingFromTray !== null) return;
		if (e.target.closest('.panel, #toolbar')) return;
		isPanning = true;
		panStart = { clientX: e.clientX, clientY: e.clientY, panX: canvasPanX, panY: canvasPanY };
		e.currentTarget.classList.add('panning');
		e.preventDefault();
	}

	function onViewportWheel(e) {
		e.preventDefault();
		const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
		const rect = viewportEl.getBoundingClientRect();
		const mx = e.clientX - rect.left, my = e.clientY - rect.top;
		canvasPanX = mx - (mx - canvasPanX) * factor;
		canvasPanY = my - (my - canvasPanY) * factor;
		canvasZoom = Math.max(0.05, Math.min(10, canvasZoom * factor));
		applyTransform();
	}

	function onSvgClick(e) {
		const hitEl = e.target.closest('.placed-hit');
		const delEl = e.target.closest('.product-del');
		const swapEl = e.target.closest('.product-swap');
		const shelfEl = e.target.closest('.shelf-hit');
		if (delEl) {
			e.stopPropagation();
			const id = parseInt(delEl.dataset.placedId);
			placedProducts = placedProducts.filter(p => p.id !== id);
			renderSvg();
			saveState();
		} else if (swapEl) {
			e.stopPropagation();
			swapTargetId = parseInt(swapEl.dataset.placedId);
			showSwapModal = true;
		}
	}

	function onSvgMouseDown(e) {
		const hitEl = e.target.closest('.placed-hit');
		const shelfEl = e.target.closest('.shelf-hit');
		if (shelfEl) {
			const idx = parseInt(shelfEl.dataset.i);
			draggingBoard = { idx, startClientY: e.clientY, startPosCm: shelfPositions[idx] };
			e.preventDefault(); e.stopPropagation();
		} else if (hitEl) {
			const id = parseInt(hitEl.dataset.placedId);
			const p = placedProducts.find(p => p.id === id);
			if (!p) return;
			p.snapShelf = null;
			draggingPlaced = { id, startClientX: e.clientX, startClientY: e.clientY, svgX: p.svgX, svgY: p.svgY };
			e.preventDefault(); e.stopPropagation();
		}
	}

	function onWindowMouseMove(e) {
		if (isPanning) {
			canvasPanX = panStart.panX + (e.clientX - panStart.clientX);
			canvasPanY = panStart.panY + (e.clientY - panStart.clientY);
			applyTransform();
		}
		if (draggingBoard !== null) {
			const { idx, startClientY, startPosCm } = draggingBoard;
			const dyCm = (e.clientY - startClientY) / canvasZoom / scale;
			let pos = startPosCm + dyCm;
			const minY = idx > 0 ? shelfPositions[idx - 1] + boardCm + MIN_GAP_CM : MIN_GAP_CM;
			const maxY = idx < shelfPositions.length - 1
				? shelfPositions[idx + 1] - boardCm - MIN_GAP_CM
				: interiorHCm - boardCm - MIN_GAP_CM;
			shelfPositions[idx] = Math.max(minY, Math.min(maxY, pos));
			updateSnappedProducts();
			renderSvg();
		}
		if (draggingPlaced !== null) {
			const { id, startClientX, startClientY, svgX, svgY } = draggingPlaced;
			const p = placedProducts.find(p => p.id === id);
			if (p) {
				p.svgX = svgX + (e.clientX - startClientX) / canvasZoom;
				p.svgY = svgY + (e.clientY - startClientY) / canvasZoom;
				renderSvg();
			}
		}
		if (draggingFromTray && ghostEl) {
			ghostEl.style.left = (e.clientX - 30) + 'px';
			ghostEl.style.top = (e.clientY - 30) + 'px';
		}
	}

	function onWindowMouseUp(e) {
		if (isPanning) {
			isPanning = false;
			if (viewportEl) viewportEl.classList.remove('panning');
		}
		if (draggingBoard !== null) {
			draggingBoard = null;
			renderSvg(); saveState();
		}
		if (draggingPlaced !== null) {
			const p = placedProducts.find(p => p.id === draggingPlaced.id);
			if (p) trySnapProduct(p);
			draggingPlaced = null;
			renderSvg(); saveState();
		}
		if (draggingFromTray !== null) {
			dropTrayItem(e);
		}
	}

	function startTrayDrag(e, item) {
		draggingFromTray = item;
		const size = Math.min(80, Math.max(40, item.widthCm * 2));
		ghostEl = document.createElement('div');
		ghostEl.style.cssText = `position:fixed;z-index:9999;width:${size}px;height:${size}px;
			border-radius:6px;pointer-events:none;opacity:0.85;`;
		if (item.isPlaceholder) {
			ghostEl.style.background = '#e8e4f0';
			ghostEl.style.display = 'flex';
			ghostEl.style.alignItems = 'center';
			ghostEl.style.justifyContent = 'center';
			ghostEl.style.fontSize = '10px';
			ghostEl.style.fontWeight = '700';
			ghostEl.style.color = '#5a4a7a';
			ghostEl.style.fontFamily = 'system-ui,sans-serif';
			ghostEl.textContent = item.sku;
		} else {
			ghostEl.style.backgroundImage = `url(${item.photoUrl})`;
			ghostEl.style.backgroundSize = 'contain';
			ghostEl.style.backgroundRepeat = 'no-repeat';
			ghostEl.style.backgroundPosition = 'center';
		}
		document.body.appendChild(ghostEl);
		ghostEl.style.left = (e.clientX - 30) + 'px';
		ghostEl.style.top = (e.clientY - 30) + 'px';
		e.preventDefault();
	}

	function dropTrayItem(e) {
		if (!svgEl) { cleanupGhost(); return; }
		const rect = svgEl.getBoundingClientRect();
		if (e.clientX >= rect.left && e.clientX <= rect.right &&
			e.clientY >= rect.top && e.clientY <= rect.bottom) {
			const svgX = (e.clientX - rect.left) / canvasZoom;
			const svgY = (e.clientY - rect.top) / canvasZoom;
			const item = draggingFromTray;
			const pw = item.widthCm * scale, ph = item.heightCm * scale;
			const newP = {
				...item,
				id: ++placedIdCounter,
				libId: item.id,
				svgX: svgX - pw / 2,
				svgY: svgY - ph / 2,
				snapShelf: null,
			};
			placedProducts = [...placedProducts, newP];
			trySnapProduct(newP);
			renderSvg(); saveState();
		}
		cleanupGhost();
	}

	function cleanupGhost() {
		if (ghostEl) { ghostEl.remove(); ghostEl = null; }
		draggingFromTray = null;
	}

	// ── Product API ────────────────────────────────────────────────────────────
	async function apiAddItem(sku, name, widthCm, heightCm, isPlaceholder) {
		const res = await fetch(`/api/planograms/${projectId}/items`, {
			method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sku, name, widthCm, heightCm, isPlaceholder }),
		});
		const data = await res.json();
		if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
		return data.id;
	}

	async function apiDeleteItem(itemId) {
		await fetch(`/api/planograms/${projectId}/items/${itemId}`, { method: 'DELETE' }).catch(() => {});
	}

	async function apiUploadPhoto(itemId, file) {
		const res = await fetch(`/api/planograms/${projectId}/items/${itemId}/photo`, {
			method: 'POST',
			headers: { 'Content-Type': file.type || 'image/jpeg' },
			body: file,
		});
		if (!res.ok) throw new Error(`Photo upload failed (HTTP ${res.status})`);
	}

	function photoUrl(itemId) {
		return `/api/planograms/${projectId}/items/${itemId}/photo`;
	}

	// ── Remove from library ───────────────────────────────────────────────────
	function removeFromLibrary(id) {
		productLibrary = productLibrary.filter(p => p.id !== id);
		placedProducts = placedProducts.filter(p => p.libId !== id);
		apiDeleteItem(id);
		renderSvg(); saveState();
	}

	// ── Upload photo for placeholder ──────────────────────────────────────────
	function uploadPhotoForPlaceholder(libId) {
		const input = document.createElement('input');
		input.type = 'file'; input.accept = 'image/*';
		input.onchange = async () => {
			const file = input.files[0];
			if (!file) return;
			const item = productLibrary.find(p => p.id === libId);
			if (!item) return;
			await apiUploadPhoto(libId, file);
			const url = photoUrl(libId);
			item.isPlaceholder = false; item.photoUrl = url;
			placedProducts.forEach(p => { if (p.libId === libId) { p.isPlaceholder = false; p.photoUrl = url; } });
			productLibrary = [...productLibrary];
			renderSvg(); saveState();
		};
		input.click();
	}

	// ── Rackbeat lookup ────────────────────────────────────────────────────────
	function toCm(value, unit) {
		switch ((unit || 'cm').toLowerCase()) {
			case 'mm': return Math.round((value / 10) * 10) / 10;
			case 'm': return value * 100;
			case 'in': return Math.round(value * 2.54 * 10) / 10;
			default: return value;
		}
	}

	/** Returns { name, width, height, sizeUnit } — matches portal's /api/rackbeat/[sku] response */
	async function fetchProduct(sku) {
		const res = await fetch(`/api/rackbeat/${encodeURIComponent(sku)}`);
		const data = await res.json();
		if (!res.ok) throw new Error(data.message ?? data.error ?? `Product not found (${res.status})`);
		if (!data.name) throw new Error('Product not found in Rackbeat.');
		return data; // { name, width, height, sizeUnit, ... }
	}

	// ── Photo modal ────────────────────────────────────────────────────────────
	function openPhotoModal() {
		photoModalStep = 'upload'; photoModalFile = null; photoModalSku = '';
		photoModalProduct = null; photoModalW = ''; photoModalH = ''; photoModalError = '';
		if (photoModalObjectUrl) { URL.revokeObjectURL(photoModalObjectUrl); photoModalObjectUrl = ''; }
		showPhotoModal = true;
	}

	function handlePhotoFile(file) {
		photoModalFile = file;
		photoModalObjectUrl = URL.createObjectURL(file);
		const base = file.name.replace(/\.[^.]+$/, '').toUpperCase();
		const match = base.match(/\b([A-Z]{2,8}[-]?\d{2,8})\b/) ?? base.match(/([A-Z]{2,8}\d{2,8})/);
		photoModalSku = match ? match[1] : '';
		photoModalMsg = match ? 'Found this code in the filename — please confirm:' : 'No product code found — please enter it below.';
		photoModalStep = 'sku';
	}

	async function doPhotoLookup() {
		const sku = photoModalSku.trim().toUpperCase();
		if (!sku) return;
		photoModalBusy = true; photoModalError = '';
		try {
			// Check the global item library first
			const libRes = await fetch(`/api/item-library/${encodeURIComponent(sku)}`);
			if (libRes.ok) {
				const lib = await libRes.json();
				photoModalProduct = { name: lib.name || sku, width: lib.widthCm, height: lib.heightCm, sizeUnit: 'cm' };
				photoModalW = String(lib.widthCm);
				photoModalH = String(lib.heightCm);
			} else {
				const data = await fetchProduct(sku);
				photoModalProduct = data;
				const unit = data.sizeUnit || 'cm';
				const wC = toCm(data.width || 0, unit);
				const hC = toCm(data.height || 0, unit);
				photoModalW = wC > 0 ? String(wC) : '';
				photoModalH = hC > 0 ? String(hC) : '';
			}
			photoModalStep = 'confirm';
		} catch (err) {
			photoModalError = err.message || 'Failed to look up product.';
			photoModalStep = 'error';
		}
		photoModalBusy = false;
	}

	async function placeProduct() {
		if (!photoModalProduct) return;
		const sku = photoModalSku.trim().toUpperCase();
		const wC = parseFloat(photoModalW), hC = parseFloat(photoModalH);
		if (!wC || !hC || wC <= 0 || hC <= 0) return;
		photoModalBusy = true;
		try {
			const itemId = await apiAddItem(sku, photoModalProduct.name, wC, hC, false);
			await apiUploadPhoto(itemId, photoModalFile);
			const url = photoUrl(itemId);
			productLibrary = [...productLibrary, { id: itemId, sku, name: photoModalProduct.name, photoUrl: url, widthCm: wC, heightCm: hC, isPlaceholder: false }];
			if (photoModalObjectUrl) { URL.revokeObjectURL(photoModalObjectUrl); photoModalObjectUrl = ''; }
			photoModalFile = null;
			showPhotoModal = false;
			saveState();
		} catch (err) {
			photoModalError = err.message;
		}
		photoModalBusy = false;
	}

	// ── Placeholder modal ──────────────────────────────────────────────────────
	function openPlaceholderModal() {
		phSku = ''; phProduct = null; phW = ''; phH = ''; phError = '';
		showPlaceholderModal = true;
	}

	async function doPlaceholderLookup() {
		const sku = phSku.trim().toUpperCase();
		if (!sku) return;
		phBusy = true; phError = '';
		try {
			// Check the global item library first
			const libRes = await fetch(`/api/item-library/${encodeURIComponent(sku)}`);
			if (libRes.ok) {
				const lib = await libRes.json();
				phProduct = { name: lib.name || sku, width: lib.widthCm, height: lib.heightCm, sizeUnit: 'cm' };
				phW = String(lib.widthCm);
				phH = String(lib.heightCm);
			} else {
				const data = await fetchProduct(sku);
				phProduct = data;
				const unit = data.sizeUnit || 'cm';
				const wC = toCm(data.width || 0, unit);
				const hC = toCm(data.height || 0, unit);
				phW = wC > 0 ? String(wC) : '';
				phH = hC > 0 ? String(hC) : '';
			}
		} catch (err) {
			phError = err.message;
		}
		phBusy = false;
	}

	async function confirmPlaceholder() {
		if (!phProduct) return;
		const sku = phSku.trim().toUpperCase();
		const wC = parseFloat(phW), hC = parseFloat(phH);
		if (!wC || !hC || wC <= 0 || hC <= 0) return;
		phBusy = true;
		try {
			const itemId = await apiAddItem(sku, phProduct.name, wC, hC, true);
			productLibrary = [...productLibrary, { id: itemId, sku, name: phProduct.name, widthCm: wC, heightCm: hC, isPlaceholder: true }];
			showPlaceholderModal = false; saveState();
		} catch (err) { phError = err.message; }
		phBusy = false;
	}

	// ── Import modal ───────────────────────────────────────────────────────────
	async function openImportModal() {
		importItems = []; importSelected = new Set(); importLoading = true;
		importSearch = ''; importMaxW = ''; importMaxH = '';
		showImportModal = true;
		try {
			const res = await fetch(`/api/planograms/${projectId}/import-candidates`);
			const data = await res.json();
			importItems = data.items || [];
		} catch { importItems = []; }
		importLoading = false;
	}

	function toggleImportItem(id, checked) {
		const next = new Set(importSelected);
		if (checked) next.add(id); else next.delete(id);
		importSelected = next;
	}

	async function confirmImport() {
		importBusy = true;
		const toImport = importItems.filter(i => importSelected.has(i.id));
		for (const item of toImport) {
			try {
				const isPlaceholder = !item.hasPhoto;
				const newId = await apiAddItem(item.sku, item.name, item.widthCm, item.heightCm, isPlaceholder);
				if (item.hasPhoto) {
					try {
						const photoRes = await fetch(`/api/item-library/${encodeURIComponent(item.sku)}/photo`);
						if (photoRes.ok) {
							const blob = await photoRes.blob();
							await fetch(`/api/planograms/${projectId}/items/${newId}/photo`, {
								method: 'POST', headers: { 'Content-Type': blob.type || 'image/jpeg' }, body: blob,
							});
						}
					} catch { /* photo copy failed — item added as placeholder */ }
				}
				const entry = { id: newId, sku: item.sku, name: item.name, widthCm: item.widthCm, heightCm: item.heightCm, isPlaceholder };
				if (!isPlaceholder) entry.photoUrl = photoUrl(newId);
				productLibrary = [...productLibrary, entry];
			} catch { /* skip */ }
		}
		saveState();
		importBusy = false;
		showImportModal = false;
	}

	// ── Swap modal ─────────────────────────────────────────────────────────────
	function confirmSwap(newItem) {
		const idx = placedProducts.findIndex(p => p.id === swapTargetId);
		if (idx === -1) { showSwapModal = false; return; }
		const old = placedProducts[idx];
		let newSvgY = (old.svgY + old.heightCm * scale) - newItem.heightCm * scale;
		let newSnapShelf = old.snapShelf;
		if (newSnapShelf !== null && newSnapShelf !== undefined && shelfPositions[newSnapShelf] !== undefined) {
			newSvgY = PAD + framePx + shelfPositions[newSnapShelf] * scale - newItem.heightCm * scale;
		}
		placedProducts[idx] = {
			id: old.id, libId: newItem.id, sku: newItem.sku, name: newItem.name,
			widthCm: newItem.widthCm, heightCm: newItem.heightCm,
			isPlaceholder: newItem.isPlaceholder, photoUrl: newItem.photoUrl,
			svgX: old.svgX, svgY: newSvgY, snapShelf: newSnapShelf,
		};
		showSwapModal = false;
		renderSvg(); saveState();
	}

	// ── Share modal ────────────────────────────────────────────────────────────
	async function openShareModal() {
		shareToken = ''; shareCopied = false; shareLoading = true;
		showShareModal = true;
		try {
			const res = await fetch(`/api/planograms/${projectId}/share`, { method: 'POST' });
			const data = await res.json();
			shareToken = data.token ?? '';
		} catch { shareToken = ''; }
		shareLoading = false;
	}

	async function copyShareLink() {
		const url = `${location.origin}/planograms/share/${shareToken}`;
		await navigator.clipboard.writeText(url).catch(() => {});
		shareCopied = true;
		setTimeout(() => { shareCopied = false; }, 2000);
	}

	async function revokeShareLink() {
		if (!confirm('Revoke this share link? Anyone who has it will lose access.')) return;
		await fetch(`/api/planograms/${projectId}/share`, { method: 'DELETE' }).catch(() => {});
		showShareModal = false;
	}

	// ── Swatch modal ──────────────────────────────────────────────────────────
	function openSwatchModal(type) { swatchType = type; swatchCustomHex = '#ffffff'; showSwatchModal = true; }
	function getSwatchEntries(type) {
		if (type === 'material') return Object.entries(MATERIALS);
		return Object.entries(PALETTE);
	}
	function getSwatchValue(type) {
		if (type === 'material') return selectedMaterial;
		if (type === 'backing') return selectedBacking;
		return selectedCanvasBg;
	}
	function setSwatchValue(type, key) {
		if (type === 'material') selectedMaterial = key;
		else if (type === 'backing') selectedBacking = key;
		else selectedCanvasBg = key;
		renderSvg(); saveState();
		showSwatchModal = false;
	}
	function swatchTitle(type) {
		if (type === 'material') return 'Shelf material';
		if (type === 'backing') return 'Shelf backing';
		return 'Canvas background';
	}
	function swatchDotColor(type, key) {
		if (type === 'material') return MATERIALS[key]?.fill ?? '#ccc';
		return PALETTE[key]?.color ?? '#ccc';
	}
	function swatchLabel(type, key) {
		if (type === 'material') return MATERIALS[key]?.label ?? key;
		return PALETTE[key]?.label ?? key;
	}
	function currentSwatchColor(type) {
		const key = getSwatchValue(type);
		return swatchDotColor(type, key);
	}
	function currentSwatchLabel(type) {
		const key = getSwatchValue(type);
		return swatchLabel(type, key);
	}
	function _dimHex(hex, factor) {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		const d = v => Math.round(v * factor).toString(16).padStart(2, '0');
		return `#${d(r)}${d(g)}${d(b)}`;
	}
	function addCustomSwatch() {
		const hex = swatchCustomHex;
		if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
		const label = hex.toUpperCase();
		const key = 'custom-' + hex.slice(1).toLowerCase();
		if (!MATERIALS[key]) MATERIALS[key] = { label, fill: hex, edge: _dimHex(hex, 0.82), stroke: _dimHex(hex, 0.65) };
		if (!PALETTE[key]) PALETTE[key] = { label, color: hex };
		setSwatchValue(swatchType, key);
	}

	// ── Rename project ─────────────────────────────────────────────────────────
	async function doRenameProject() {
		const name = prompt('Rename project:', projectName);
		if (!name || !name.trim() || name.trim() === projectName) return;
		await fetch(`/api/planograms/${projectId}`, {
			method: 'PATCH', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: name.trim() }),
		});
		projectName = name.trim();
		document.title = `${name.trim()} — Planogram`;
	}

	// ── Clear and reset ────────────────────────────────────────────────────────
	function clearAndReset() {
		showClearConfirm = false;
		width = DEFAULTS.width; height = DEFAULTS.height; shelves = DEFAULTS.shelves;
		thickness = DEFAULTS.thickness; frameThickness = DEFAULTS.frameThickness;
		unitCount = DEFAULTS.unitCount;
		selectedMaterial = DEFAULTS.material; selectedBacking = DEFAULTS.backing;
		selectedCanvasBg = DEFAULTS.canvasBg; showDimensions = true;
		const ids = productLibrary.map(p => p.id);
		productLibrary = []; placedProducts = [];
		ids.forEach(id => apiDeleteItem(id));
		renderSvg(); computeShelf(); saveState();
	}

	// ── Export ─────────────────────────────────────────────────────────────────
	function exportFilename(ext) {
		const safe = (projectName || 'Shelf').replace(/[\\/:*?"<>|]/g, '').trim() || 'Shelf';
		const now = new Date();
		const dd = String(now.getDate()).padStart(2, '0');
		const mm = String(now.getMonth() + 1).padStart(2, '0');
		const yyyy = now.getFullYear();
		return `${safe} ${dd}-${mm}-${yyyy}.${ext}`;
	}

	async function urlToBase64(url) {
		const blob = await (await fetch(url, { credentials: 'include' })).blob();
		return new Promise(res => { const r = new FileReader(); r.onloadend = () => res(r.result); r.readAsDataURL(blob); });
	}

	async function exportSVG() {
		exportMenuOpen = false;
		const clone = svgEl.cloneNode(true);
		clone.querySelectorAll('.shelf-hit, .placed-hit, .product-controls').forEach(el => el.remove());
		await Promise.all([...clone.querySelectorAll('image')].map(async img => {
			const href = img.getAttribute('href');
			if (href) img.setAttribute('href', await urlToBase64(href));
		}));
		clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		const svg = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
		const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
		const a = document.createElement('a'); a.href = url; a.download = exportFilename('svg'); a.click();
		URL.revokeObjectURL(url);
	}

	async function exportJPG() {
		exportMenuOpen = false;
		const clone = svgEl.cloneNode(true);
		clone.querySelectorAll('.shelf-hit, .placed-hit, .product-controls').forEach(el => el.remove());
		await Promise.all([...clone.querySelectorAll('image')].map(async img => {
			const href = img.getAttribute('href');
			if (href) img.setAttribute('href', await urlToBase64(href));
		}));
		clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		const sW = parseFloat(clone.getAttribute('width')), sH = parseFloat(clone.getAttribute('height'));
		const EP = 48, PX = 2;
		const canvas = document.createElement('canvas');
		canvas.width = (sW + EP * 2) * PX; canvas.height = (sH + EP * 2) * PX;
		const ctx = canvas.getContext('2d'); ctx.scale(PX, PX);
		ctx.fillStyle = (PALETTE[selectedCanvasBg] ?? PALETTE_BASE['white']).color;
		ctx.fillRect(0, 0, sW + EP * 2, sH + EP * 2);
		const svgStr = new XMLSerializer().serializeToString(clone);
		const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
		const svgUrl = URL.createObjectURL(svgBlob);
		await new Promise((res, rej) => { const img = new Image(); img.onload = () => { ctx.drawImage(img, EP, EP, sW, sH); res(); }; img.onerror = rej; img.src = svgUrl; });
		URL.revokeObjectURL(svgUrl);
		const a = document.createElement('a'); a.href = canvas.toDataURL('image/jpeg', 0.95); a.download = exportFilename('jpg'); a.click();
	}

	// ── Boot ───────────────────────────────────────────────────────────────────
	onMount(async () => {
		window.addEventListener('mousemove', onWindowMouseMove);
		window.addEventListener('mouseup', onWindowMouseUp);
		if (viewportEl) viewportEl.addEventListener('wheel', onViewportWheel, { passive: false });

		// Close export menu on outside click
		document.addEventListener('click', e => {
			if (exportMenuOpen && !e.target.closest('#export-wrap')) exportMenuOpen = false;
		});

		// Load project
		try {
			const res = await fetch(`/api/planograms/${projectId}`);
			if (!res.ok) throw new Error();
			const project = await res.json();
			projectName = project.name || 'Untitled project';
			document.title = `${projectName} — Planogram`;

			const s = project.settings || {};
			if (s.width) width = s.width;
			if (s.height) height = s.height;
			if (s.shelves) shelves = s.shelves;
			if (s.thickness) thickness = s.thickness;
			if (s.frameThickness) frameThickness = s.frameThickness;
			if (s.unitCount) unitCount = s.unitCount;
			if (s.selectedMaterial) selectedMaterial = s.selectedMaterial;
			if (s.selectedBacking) selectedBacking = s.selectedBacking;
			if (s.selectedCanvasBg) selectedCanvasBg = s.selectedCanvasBg;
			if (s.showDimensions !== undefined) showDimensions = s.showDimensions;

			// Restore custom colours
			(s.customColors || []).forEach(({ key, hex, label }) => {
				if (!MATERIALS[key]) MATERIALS[key] = { label, fill: hex, edge: _dimHex(hex, 0.82), stroke: _dimHex(hex, 0.65) };
				if (!PALETTE[key]) PALETTE[key] = { label, color: hex };
			});

			// Library items
			(project.libraryItems || []).forEach(item => {
				const entry = { id: item.id, sku: item.sku, name: item.name, widthCm: item.widthCm, heightCm: item.heightCm, isPlaceholder: item.isPlaceholder };
				if (!item.isPlaceholder) entry.photoUrl = photoUrl(item.id);
				productLibrary = [...productLibrary, entry];
				if (item.id >= placedIdCounter) placedIdCounter = item.id;
			});

			// Placements
			(project.placements || []).forEach(p => {
				const lib = productLibrary.find(l => l.id === p.libId);
				if (!lib) return;
				placedProducts = [...placedProducts, { ...p, photoUrl: lib.photoUrl }];
				if (p.id >= placedIdCounter) placedIdCounter = p.id;
			});

			computeShelf(s.shelfPositions ?? null);
			renderSvg();
		} catch {
			alert('Project not found. Redirecting…');
			location.href = '/planograms';
		}
	});

	onDestroy(() => {
		window.removeEventListener('mousemove', onWindowMouseMove);
		window.removeEventListener('mouseup', onWindowMouseUp);
		if (viewportEl) viewportEl.removeEventListener('wheel', onViewportWheel);
		if (photoModalObjectUrl) URL.revokeObjectURL(photoModalObjectUrl);
		clearTimeout(_saveTimer);
	});

	// Re-render when relevant state changes
	$effect(() => {
		if (svgEl) {
			svgEl.setAttribute('width', svgWidth);
			svgEl.setAttribute('height', svgHeight);
			svgEl.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
			svgEl.innerHTML = svgMarkup;

			// Wire svg events
			svgEl.querySelectorAll('.shelf-hit, .placed-hit, .product-del, .product-swap').forEach(el => {
				el.addEventListener('mousedown', onSvgMouseDown);
			});
			svgEl.querySelectorAll('.product-del').forEach(el => {
				el.addEventListener('click', onSvgClick);
			});
			svgEl.querySelectorAll('.product-swap').forEach(el => {
				el.addEventListener('click', onSvgClick);
			});
		}
	});
</script>

<svelte:head>
	<title>{projectName} — Planogram</title>
</svelte:head>

<!-- Canvas viewport -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div id="viewport" bind:this={viewportEl}
	class:panning={isPanning}
	onmousedown={onViewportMouseDown}>

	<div id="canvas-content">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<svg bind:this={svgEl} id="shelf-svg"
			width={svgWidth} height={svgHeight}
			viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
		</svg>
	</div>
</div>

<!-- Left panels -->
<div id="left-panels" class="panel-container">
	<!-- Shelf Settings panel -->
	<div class="panel" class:collapsed={settingsCollapsed}>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="panel-header" onclick={() => settingsCollapsed = !settingsCollapsed}>
			<span>Shelf Settings</span>
			<svg class="panel-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none">
				<path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		</div>
		<div class="panel-body">
			<div class="field-row">
				<div class="field">
					<label>Width (cm)</label>
					<input type="number" bind:value={width} min="10" max="400" step="1" />
				</div>
				<div class="field">
					<label>Height (cm)</label>
					<input type="number" bind:value={height} min="10" max="400" step="1" />
				</div>
			</div>
			<div class="field-row">
				<div class="field">
					<label>Shelves</label>
					<input type="number" bind:value={shelves} min="1" max="12" step="1" />
				</div>
				<div class="field">
					<label>Board (cm)</label>
					<input type="number" bind:value={thickness} min="0.5" max="10" step="0.5" />
				</div>
			</div>
			<div class="field">
				<label>Frame thickness (cm)</label>
				<input type="number" bind:value={frameThickness} min="0.5" max="20" step="0.5" />
			</div>
			<button class="draw-btn" onclick={() => { computeShelf(); renderSvg(); saveState(); }}>Draw shelf</button>

			<hr class="divider" />
			<span class="section-label">Units</span>
			<div class="counter-field">
				<label>Shelf units side by side</label>
				<div class="counter">
					<button class="counter-btn" onclick={() => { unitCount = Math.max(1, unitCount - 1); renderSvg(); saveState(); }} disabled={unitCount <= 1}>−</button>
					<div class="counter-divider"></div>
					<span class="counter-value">{unitCount}</span>
					<div class="counter-divider"></div>
					<button class="counter-btn" onclick={() => { unitCount = Math.min(MAX_UNITS, unitCount + 1); renderSvg(); saveState(); }} disabled={unitCount >= MAX_UNITS}>+</button>
				</div>
			</div>

			<hr class="divider" />
			<span class="section-label">Colours</span>
			<div class="field">
				<label>Shelf material</label>
				<button class="swatch-picker-btn" onclick={() => openSwatchModal('material')}>
					<div class="swatch-picker-dot" style="background:{currentSwatchColor('material')}"></div>
					<span class="swatch-picker-name">{currentSwatchLabel('material')}</span>
				</button>
			</div>
			<div class="field">
				<label>Shelf backing</label>
				<button class="swatch-picker-btn" onclick={() => openSwatchModal('backing')}>
					<div class="swatch-picker-dot" style="background:{currentSwatchColor('backing')}"></div>
					<span class="swatch-picker-name">{currentSwatchLabel('backing')}</span>
				</button>
			</div>
			<div class="field">
				<label>Canvas background</label>
				<button class="swatch-picker-btn" onclick={() => openSwatchModal('canvas-bg')}>
					<div class="swatch-picker-dot" style="background:{currentSwatchColor('canvas-bg')}"></div>
					<span class="swatch-picker-name">{currentSwatchLabel('canvas-bg')}</span>
				</button>
			</div>

			<hr class="divider" />
			<button class="clear-btn" onclick={() => showClearConfirm = true}>Clear and start over</button>
		</div>
	</div>

	<!-- Products panel -->
	<div class="panel" class:collapsed={productsCollapsed}>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="panel-header" onclick={() => productsCollapsed = !productsCollapsed}>
			<span>Products</span>
			<div style="display:flex;align-items:center;gap:4px;margin-left:auto">
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<button class="add-product-btn" title="Add from photo"
					onclick={(e) => { e.stopPropagation(); openPhotoModal(); }}>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
						<rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
						<circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.5"/>
						<path d="M5.5 3l1-1.5h3l1 1.5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
					</svg>
				</button>
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<button class="add-product-btn" title="Add placeholder"
					onclick={(e) => { e.stopPropagation(); openPlaceholderModal(); }}>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
						<rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/>
						<path d="M5 8h6M8 5v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</button>
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<button class="add-product-btn" title="Import from other projects"
					onclick={(e) => { e.stopPropagation(); openImportModal(); }}>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
						<path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
						<path d="M2 11v1.5A1.5 1.5 0 003.5 14h9a1.5 1.5 0 001.5-1.5V11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
					</svg>
				</button>
			</div>
			<svg class="panel-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none">
				<path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		</div>
		<div class="panel-body">
			<div class="product-tray">
				{#if productLibrary.length === 0}
					<span class="tray-hint">Add a product from a photo — then drag it onto the shelf</span>
				{:else}
					{#each productLibrary as item (item.id)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="product-card" title="{item.sku} — {item.name || ''}\n{item.widthCm} × {item.heightCm} cm"
							onmousedown={(e) => startTrayDrag(e, item)}>
							{#if item.isPlaceholder}
								<div class="product-card-placeholder">
									<div class="product-card-placeholder-sku">{item.sku}</div>
									<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
									<div class="product-card-upload-overlay" title="Upload photo"
										onclick={(e) => { e.stopPropagation(); uploadPhotoForPlaceholder(item.id); }}>
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
											<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
											<polyline points="21 15 16 10 5 21"/>
										</svg>
									</div>
								</div>
							{:else}
								<img class="product-card-photo" src={item.photoUrl} alt={item.sku} draggable="false" />
							{/if}
							<div class="product-card-sku">{item.name || item.sku}</div>
							<div class="product-card-dims">{item.widthCm} × {item.heightCm} cm</div>
							<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
							<button class="product-card-remove" title="Remove from library"
								onclick={(e) => { e.stopPropagation(); removeFromLibrary(item.id); }}>×</button>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</div>
</div>

<!-- Back button -->
<a href="/planograms" id="back-btn" title="Back to projects">
	<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
		<path d="M9 2L4 7l5 5"/>
	</svg>
	Projects
</a>

<!-- Bottom-right toolbar -->
<div id="toolbar">
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<span class="project-name-pill" title="Click to rename" onclick={doRenameProject}>{projectName}</span>
	{#if saveStatus}<span class="save-indicator">{saveStatus}</span>{/if}
	<div class="tb-sep"></div>
	<button class="zoom-btn" class:active={showDimensions} title="Toggle dimensions"
		onclick={() => { showDimensions = !showDimensions; renderSvg(); saveState(); }}>
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
	<button class="zoom-btn" title="Share link" onclick={openShareModal}>
		<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
			<circle cx="11" cy="2.5" r="1.5" stroke="currentColor" stroke-width="1.4"/>
			<circle cx="11" cy="11.5" r="1.5" stroke="currentColor" stroke-width="1.4"/>
			<circle cx="3" cy="7" r="1.5" stroke="currentColor" stroke-width="1.4"/>
			<line x1="4.3" y1="6.2" x2="9.8" y2="3.3" stroke="currentColor" stroke-width="1.3"/>
			<line x1="4.3" y1="7.8" x2="9.8" y2="10.7" stroke="currentColor" stroke-width="1.3"/>
		</svg>
	</button>
</div>

{#if errorMsg}
	<span class="error-banner">{errorMsg}</span>
{/if}

<!-- ── Modals ──────────────────────────────────────────────────────────────── -->

<!-- Add from photo modal -->
{#if showPhotoModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) showPhotoModal = false; }}>
		<div class="product-dialog">
			<button class="modal-close" onclick={() => showPhotoModal = false}>✕</button>
			{#if photoModalStep === 'upload'}
				<h2>Add product from photo</h2>
				<p class="modal-sub">Upload a photo of the product. We'll scan it for a product code.</p>
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div class="dropzone" onclick={() => document.getElementById('photo-input').click()}
					ondragover={(e) => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
					ondragleave={(e) => e.currentTarget.classList.remove('drag-over')}
					ondrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drag-over'); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handlePhotoFile(f); }}>
					<input id="photo-input" type="file" accept="image/*" style="display:none"
						onchange={(e) => { if (e.target.files[0]) handlePhotoFile(e.target.files[0]); e.target.value = ''; }} />
					<div class="dz-icon">📷</div>
					<div class="dz-text">Click to choose a photo<br/>or drag one here</div>
				</div>
			{:else if photoModalStep === 'sku'}
				<h2>Confirm product code</h2>
				<div class="modal-two-col">
					<img class="modal-two-col-photo" src={photoModalObjectUrl} alt="preview" />
					<div class="modal-two-col-body">
						<p class="modal-sub">{photoModalMsg}</p>
						<div class="field">
							<label>Product code</label>
							<input type="text" bind:value={photoModalSku} placeholder="e.g. LPFI404"
								style="text-transform:uppercase"
								onkeydown={(e) => { if (e.key === 'Enter' && photoModalSku.trim()) doPhotoLookup(); }} />
						</div>
						{#if photoModalSku.trim()}
							<button class="draw-btn" onclick={doPhotoLookup} disabled={photoModalBusy} style="width:auto;align-self:flex-start">
								{photoModalBusy ? 'Looking up…' : 'Find product →'}
							</button>
						{/if}
					</div>
				</div>
			{:else if photoModalStep === 'confirm'}
				<h2>Is this the right product?</h2>
				<div class="modal-two-col">
					<img class="modal-two-col-photo" src={photoModalObjectUrl} alt="preview" />
					<div class="modal-two-col-body">
						<div class="found-product-name">{photoModalSku} — {photoModalProduct?.name}</div>
						<div class="field-row" style="gap:8px">
							<div class="field">
								<label>Width (cm)</label>
								<input type="number" bind:value={photoModalW} min="0.1" step="0.1" placeholder="e.g. 24" />
							</div>
							<div class="field">
								<label>Height (cm)</label>
								<input type="number" bind:value={photoModalH} min="0.1" step="0.1" placeholder="e.g. 18" />
							</div>
						</div>
						<div style="display:flex;gap:10px;margin-top:8px">
							<button class="btn-cancel" onclick={() => photoModalStep = 'sku'}>Not right</button>
							<button class="draw-btn" onclick={placeProduct} disabled={photoModalBusy} style="width:auto">
								{photoModalBusy ? 'Saving…' : 'Place on shelf →'}
							</button>
						</div>
					</div>
				</div>
			{:else if photoModalStep === 'error'}
				<h2>Something went wrong</h2>
				<p class="error-text">{photoModalError}</p>
				<button class="btn-cancel" onclick={() => photoModalStep = 'sku'}>Try a different code</button>
			{/if}
		</div>
	</div>
{/if}

<!-- Placeholder modal -->
{#if showPlaceholderModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) showPlaceholderModal = false; }}>
		<div class="product-dialog">
			<button class="modal-close" onclick={() => showPlaceholderModal = false}>✕</button>
			<h2>Add placeholder</h2>
			<p class="modal-sub">Enter a product code to pull dimensions from Rackbeat.</p>
			<div class="field">
				<label>Product code</label>
				<input type="text" bind:value={phSku} placeholder="e.g. LPFI404" style="text-transform:uppercase"
					onkeydown={(e) => { if (e.key === 'Enter' && phSku.trim()) doPlaceholderLookup(); }} />
			</div>
			{#if phSku.trim()}
				<button class="draw-btn" onclick={doPlaceholderLookup} disabled={phBusy}>
					{phBusy ? 'Looking up…' : 'Find product →'}
				</button>
			{/if}
			{#if phProduct}
				<div class="found-product-name">{phSku.toUpperCase()} — {phProduct.name}</div>
				<div class="field-row" style="gap:8px">
					<div class="field">
						<label>Width (cm)</label>
						<input type="number" bind:value={phW} min="0.1" step="0.1" />
					</div>
					<div class="field">
						<label>Height (cm)</label>
						<input type="number" bind:value={phH} min="0.1" step="0.1" />
					</div>
				</div>
				<div style="display:flex;gap:8px;margin-top:4px">
					<button class="btn-cancel" onclick={() => showPlaceholderModal = false}>Cancel</button>
					<button class="draw-btn" onclick={confirmPlaceholder} disabled={phBusy} style="width:auto">
						{phBusy ? 'Saving…' : 'Add to library →'}
					</button>
				</div>
			{/if}
			{#if phError}<p class="error-text" style="margin-top:8px">{phError}</p>{/if}
		</div>
	</div>
{/if}

<!-- Import modal -->
{#if showImportModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) showImportModal = false; }}>
		<div class="product-dialog" style="max-width:680px;width:90vw;padding:28px 28px 20px">
			<button class="modal-close" onclick={() => showImportModal = false}>✕</button>
			<h2>Import from library</h2>
			<p class="modal-sub">Select products from the global item library to add to this project.</p>

			{#if importLoading}
				<div style="text-align:center;padding:32px;color:#aaa">Loading…</div>
			{:else if importItems.length === 0}
				<div style="text-align:center;padding:32px;color:#aaa">The item library is empty. Add products to a planogram first.</div>
			{:else}
				<div style="overflow-x:auto;margin-top:14px">
					<table style="width:100%;border-collapse:collapse;font-size:0.82rem">
						<thead>
							<!-- Search row — aligns with table columns -->
							<tr class="import-search-row">
								<td colspan="4" style="padding:0 8px 8px 4px;">
									<div class="import-search-wrap">
										<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;opacity:0.35">
											<circle cx="6.5" cy="6.5" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/>
										</svg>
										<input type="search" placeholder="Search SKU or name…" bind:value={importSearch} class="import-search-input" />
									</div>
								</td>
								<td style="padding:0 10px 8px;">
									<input type="number" min="0" step="0.1" placeholder="Max W" bind:value={importMaxW} class="import-num-input" />
								</td>
								<td style="padding:0 10px 8px;">
									<input type="number" min="0" step="0.1" placeholder="Max H" bind:value={importMaxH} class="import-num-input" />
								</td>
							</tr>
							<!-- Column headers -->
							<tr style="border-bottom:1.5px solid #e8e6e1;text-align:left">
								<th style="padding:6px 10px 8px 4px;font-weight:600;color:#888;width:32px">
									<input type="checkbox"
										checked={importFiltered.length > 0 && importFiltered.every(i => importSelected.has(i.id))}
										onchange={(e) => {
											const next = new Set(importSelected);
											if (e.target.checked) importFiltered.forEach(i => next.add(i.id));
											else importFiltered.forEach(i => next.delete(i.id));
											importSelected = next;
										}} />
								</th>
								<th style="padding:6px 10px 8px;color:#888;width:60px">Preview</th>
								<th style="padding:6px 10px 8px;color:#888">SKU</th>
								<th style="padding:6px 10px 8px;color:#888">Name</th>
								<th style="padding:6px 10px 8px;color:#888;text-align:right">W (cm)</th>
								<th style="padding:6px 10px 8px;color:#888;text-align:right">H (cm)</th>
							</tr>
						</thead>
						<tbody>
							{#if importFiltered.length === 0}
								<tr><td colspan="6" style="text-align:center;padding:24px;color:#aaa;font-size:0.8rem">No products match your filters.</td></tr>
							{:else}
								{#each importFiltered as item (item.id)}
									<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
									<tr style="border-bottom:1px solid #f0ede8;cursor:pointer" class:import-selected={importSelected.has(item.id)}
										onclick={() => toggleImportItem(item.id, !importSelected.has(item.id))}>
										<td style="padding:6px 4px">
											<input type="checkbox" checked={importSelected.has(item.id)}
												onclick={(e) => e.stopPropagation()}
												onchange={(e) => toggleImportItem(item.id, e.target.checked)} />
										</td>
										<td style="padding:6px 10px">
											{#if item.hasPhoto}
												<img src="/api/item-library/{encodeURIComponent(item.sku)}/photo" alt={item.sku}
													style="width:40px;height:40px;object-fit:contain;border-radius:5px;background:#f5f4f0;display:block" />
											{:else}
												<div style="width:40px;height:40px;background:#f0ede8;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:700;color:#a0896a;text-align:center;word-break:break-all;padding:3px">{item.sku}</div>
											{/if}
										</td>
										<td style="padding:6px 10px;font-weight:600">{item.sku}</td>
										<td style="padding:6px 10px;color:#555">{item.name || ''}</td>
										<td style="padding:6px 10px;color:#888;text-align:right">{item.widthCm}</td>
										<td style="padding:6px 10px;color:#888;text-align:right">{item.heightCm}</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</table>
				</div>
			{/if}

			<div style="display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:1px solid #e8e6e1">
				<span style="font-size:0.8rem;color:#888">{importSelected.size} selected</span>
				<div style="display:flex;gap:8px">
					<button class="btn-cancel" onclick={() => showImportModal = false}>Cancel</button>
					<button class="draw-btn" onclick={confirmImport} disabled={importSelected.size === 0 || importBusy} style="width:auto">
						{importBusy ? 'Importing…' : 'Import selected →'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Swap modal -->
{#if showSwapModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) showSwapModal = false; }}>
		<div class="product-dialog" style="max-width:420px">
			<button class="modal-close" onclick={() => showSwapModal = false}>✕</button>
			<h2>Swap product</h2>
			<p class="modal-sub">Choose a product to replace this one.</p>
			<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:16px;max-height:340px;overflow-y:auto">
				{#each productLibrary.filter(i => i.id !== placedProducts.find(p => p.id === swapTargetId)?.libId) as item (item.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div class="swap-card" onclick={() => confirmSwap(item)}>
						{#if item.isPlaceholder}
							<div style="width:60px;height:60px;border-radius:6px;background:#e8e4f0;display:flex;align-items:center;justify-content:center;font-size:0.55rem;font-weight:700;color:#5a4a7a;text-align:center;word-break:break-all;padding:4px;line-height:1.2">{item.sku}</div>
						{:else}
							<img src={item.photoUrl} alt={item.sku} style="width:60px;height:60px;object-fit:contain;border-radius:6px;background:#f0ede8;display:block" />
						{/if}
						<div style="font-size:0.68rem;font-weight:600;color:#333;text-align:center;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{item.name || item.sku}</div>
						<div style="font-size:0.6rem;color:#aaa;text-align:center">{item.widthCm} × {item.heightCm} cm</div>
					</div>
				{:else}
					<p style="color:#aaa;font-size:0.875rem;text-align:center;width:100%;padding:24px 0">No other products in your library.</p>
				{/each}
			</div>
		</div>
	</div>
{/if}

<!-- Share modal -->
{#if showShareModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) showShareModal = false; }}>
		<div class="product-dialog" style="max-width:420px">
			<button class="modal-close" onclick={() => showShareModal = false}>✕</button>
			<h2>Share link</h2>
			<p class="modal-sub">Anyone with this link can view the shelf without logging in.</p>
			{#if shareLoading}
				<div style="text-align:center;padding:20px;color:#aaa">Generating link…</div>
			{:else if shareToken}
				<div style="display:flex;gap:8px;align-items:center">
					<input type="text" readonly value="{location.origin}/planograms/share/{shareToken}"
						style="flex:1;font-size:0.78rem;font-family:monospace;color:#333;background:#f5f4f0;border:1.5px solid #e0ddd8;border-radius:8px;padding:8px 10px;cursor:text"
						onclick={(e) => e.target.select()} />
					<button class="draw-btn" onclick={copyShareLink} style="width:auto;white-space:nowrap;padding:9px 14px">
						{shareCopied ? 'Copied!' : 'Copy'}
					</button>
				</div>
				<div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px">
					<button onclick={() => window.open(`${location.origin}/planograms/share/${shareToken}`, '_blank')}
						style="background:none;border:none;font-size:0.8rem;color:#555;cursor:pointer;text-decoration:underline;text-underline-offset:3px;padding:0">
						Open in new tab ↗
					</button>
					<button onclick={revokeShareLink}
						style="background:none;border:none;font-size:0.8rem;color:#c0392b;cursor:pointer;text-decoration:underline;text-underline-offset:3px;padding:0">
						Revoke link
					</button>
				</div>
			{:else}
				<p class="error-text">Could not generate link.</p>
			{/if}
		</div>
	</div>
{/if}

<!-- Swatch modal -->
{#if showSwatchModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) showSwatchModal = false; }}>
		<div class="product-dialog" style="max-width:300px;padding:24px 20px">
			<button class="modal-close" onclick={() => showSwatchModal = false}>✕</button>
			<h2 style="margin-bottom:12px">{swatchTitle(swatchType)}</h2>
			<div class="swatch-modal-list">
				{#each getSwatchEntries(swatchType) as [key, item]}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div class="swatch-list-item" class:selected={key === getSwatchValue(swatchType)}
						onclick={() => setSwatchValue(swatchType, key)}>
						<div class="swatch-list-dot" style="background:{item.fill ?? item.color}"></div>
						<span class="swatch-list-name">{item.label}</span>
					</div>
				{/each}
			</div>
			<div class="swatch-custom-section">
				<span class="swatch-custom-label">Custom colour</span>
				<div class="swatch-custom-row">
					<div class="swatch-custom-preview" style="background:{swatchCustomHex}">
						<input type="color" bind:value={swatchCustomHex} />
					</div>
					<input type="text" class="swatch-custom-hex" bind:value={swatchCustomHex} placeholder="#rrggbb" maxlength="7" />
					<button class="swatch-custom-add" onclick={addCustomSwatch}>Add</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Clear confirm -->
{#if showClearConfirm}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => { if (e.target === e.currentTarget) showClearConfirm = false; }}>
		<div class="dialog-box">
			<h2>Clear and start over?</h2>
			<p>This will remove all settings, shelf positions, and placed products. This cannot be undone.</p>
			<div class="dialog-buttons">
				<button class="btn-cancel" onclick={() => showClearConfirm = false}>Cancel</button>
				<button class="btn-danger" onclick={clearAndReset}>Yes, start over</button>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
	:global(body) { width: 100vw; height: 100vh; overflow: hidden; user-select: none; }

	#viewport {
		position: fixed; inset: 0;
		overflow: hidden;
		cursor: grab;
		background: #e8e6e1;
	}
	#viewport.panning { cursor: grabbing; }
	#canvas-content {
		position: absolute; top: 0; left: 0;
		transform-origin: 0 0;
	}
	:global(svg) { display: block; }

	/* Left panels */
	#left-panels {
		position: fixed;
		top: 16px; left: 16px;
		width: 260px;
		display: flex; flex-direction: column;
		z-index: 10;
		max-height: calc(100vh - 32px);
		overflow-y: auto;
		scrollbar-width: none;
		background: #fff;
		border: 1px solid #e0ddd8;
		border-radius: 16px;
		box-shadow: 0 4px 20px rgba(0,0,0,0.10);
	}
	#left-panels::-webkit-scrollbar { display: none; }

	.panel { background: transparent; border: none; border-radius: 0; overflow: hidden; flex-shrink: 0; }
	.panel + .panel { border-top: 1px solid #e8e6e1; }
	.panel-header {
		padding: 13px 16px;
		display: flex; align-items: center; justify-content: space-between;
		cursor: pointer; font-size: 0.85rem; font-weight: 600; gap: 8px;
	}
	.panel-header:hover { background: #fafaf9; }
	.panel-chevron { transition: transform 0.2s; flex-shrink: 0; color: #aaa; }
	.panel.collapsed .panel-body { display: none; }
	.panel.collapsed .panel-chevron { transform: rotate(-90deg); }
	.panel-body {
		padding: 14px 16px;
		display: flex; flex-direction: column; gap: 14px;
		overflow-y: auto;
		max-height: calc(100vh - 160px);
	}

	.row { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; }
	.divider { border: none; border-top: 1px solid #ede9e3; }
	.field { display: flex; flex-direction: column; gap: 5px; }
	.field-row { display: flex; gap: 8px; }
	.field-row .field { flex: 1; min-width: 0; }
	.section-label { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: #999; width: 100%; }
	label { font-size: 0.78rem; font-weight: 500; color: #555; }
	input[type="number"], input[type="text"] {
		width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 8px;
		font-size: 0.95rem; background: #fafaf9; outline: none; transition: border-color 0.15s;
	}
	input[type="number"]:focus, input[type="text"]:focus { border-color: #555; background: #fff; }

	.draw-btn {
		padding: 9px 22px; background: #1a1a1a; color: #fff; border: none;
		border-radius: 8px; font-size: 0.9rem; font-weight: 500; cursor: pointer;
		transition: background 0.15s; width: 100%;
	}
	.draw-btn:hover:not(:disabled) { background: #333; }
	.draw-btn:disabled { opacity: 0.6; cursor: default; }

	.counter-field { display: flex; flex-direction: column; gap: 5px; }
	.counter { display: flex; align-items: center; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: #fafaf9; width: fit-content; }
	.counter-btn { width: 34px; height: 36px; border: none; background: none; cursor: pointer; font-size: 1.15rem; color: #555; display: flex; align-items: center; justify-content: center; transition: background 0.12s; }
	.counter-btn:hover:not(:disabled) { background: #f0ede8; }
	.counter-btn:disabled { opacity: 0.3; cursor: default; }
	.counter-divider { width: 1px; height: 20px; background: #ddd; }
	.counter-value { min-width: 36px; text-align: center; font-size: 0.95rem; font-weight: 600; padding: 0 4px; }

	.swatch-picker-btn {
		display: flex; align-items: center; gap: 7px; width: 100%; padding: 7px 10px;
		border: 1.5px solid #e0ddd8; border-radius: 9px; background: #fafaf9; cursor: pointer;
		transition: border-color 0.15s;
	}
	.swatch-picker-btn:hover { border-color: #aaa; }
	.swatch-picker-dot { width: 18px; height: 18px; border-radius: 5px; flex-shrink: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12); }
	.swatch-picker-name { font-size: 0.75rem; font-weight: 500; color: #444; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

	.clear-btn { background: none; border: 1px solid #e8e6e1; border-radius: 8px; padding: 7px 12px; font-size: 0.8rem; color: #999; cursor: pointer; transition: border-color 0.15s, color 0.15s; }
	.clear-btn:hover { border-color: #c0392b; color: #c0392b; }

	/* Product tray */
	.add-product-btn {
		padding: 5px 8px; background: none; border: 1.5px solid #ddd; border-radius: 8px;
		font-size: 0.78rem; font-weight: 500; color: #555; cursor: pointer;
		display: flex; align-items: center; gap: 5px; transition: border-color 0.15s, color 0.15s; flex-shrink: 0;
	}
	.add-product-btn:hover { border-color: #1a1a1a; color: #1a1a1a; }

	.product-tray { display: flex; flex-wrap: wrap; gap: 10px; min-height: 36px; align-items: flex-start; }
	.tray-hint { font-size: 0.75rem; color: #ccc; font-style: italic; }

	.product-card {
		display: flex; flex-direction: column; align-items: center; gap: 5px;
		padding: 8px 10px; border: 1.5px solid #e0ddd8; border-radius: 10px;
		cursor: grab; background: #fafaf9; position: relative;
		transition: border-color 0.15s, box-shadow 0.15s; width: 88px;
	}
	.product-card:hover { border-color: #aaa; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }

	.product-card-photo { width: 60px; height: 60px; object-fit: contain; border-radius: 6px; background: #f0ede8; pointer-events: none; display: block; }

	.product-card-placeholder {
		width: 60px; height: 60px; border-radius: 6px; background: #e8e4f0;
		display: flex; flex-direction: column; align-items: center; justify-content: center;
		gap: 2px; padding: 4px; position: relative; overflow: hidden;
	}
	.product-card-placeholder-sku { font-size: 0.62rem; font-weight: 700; color: #5a4a7a; text-align: center; word-break: break-all; line-height: 1.2; pointer-events: none; }
	.product-card-upload-overlay {
		position: absolute; inset: 0; background: rgba(90,74,122,0.7);
		display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.15s; cursor: pointer;
	}
	.product-card-placeholder:hover .product-card-upload-overlay { opacity: 1; }

	.product-card-sku { font-size: 0.68rem; font-weight: 600; color: #333; text-align: center; max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.product-card-dims { font-size: 0.62rem; color: #aaa; text-align: center; }
	.product-card-remove {
		position: absolute; top: -7px; right: -7px; width: 18px; height: 18px; border-radius: 50%;
		background: #bbb; border: none; cursor: pointer; font-size: 10px; color: #fff;
		display: flex; align-items: center; justify-content: center; transition: background 0.15s;
	}
	.product-card-remove:hover { background: #c0392b; }

	/* Back button */
	#back-btn {
		position: fixed; top: 16px; right: 16px; z-index: 10;
		display: flex; align-items: center; gap: 6px;
		padding: 7px 14px; background: rgba(255,255,255,0.92); border: 1px solid #ddd;
		border-radius: 10px; color: #555; font-size: 0.82rem; font-weight: 600;
		text-decoration: none; box-shadow: 0 2px 8px rgba(0,0,0,0.10);
		backdrop-filter: blur(4px); transition: background 0.15s;
	}
	#back-btn:hover { background: #fff; color: #1a1a1a; }

	/* Bottom toolbar */
	#toolbar {
		position: fixed; bottom: 20px; right: 20px;
		display: flex; align-items: center; gap: 6px; z-index: 10;
	}

	.project-name-pill {
		padding: 6px 12px; background: rgba(255,255,255,0.92); border: 1px solid #ddd;
		border-radius: 8px; font-size: 0.8rem; font-weight: 600; color: #333;
		cursor: pointer; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
		box-shadow: 0 2px 8px rgba(0,0,0,0.10); backdrop-filter: blur(4px);
	}
	.project-name-pill:hover { background: #fff; }

	.save-indicator { font-size: 0.75rem; color: #aaa; white-space: nowrap; }

	.tb-sep { width: 1px; height: 20px; background: rgba(0,0,0,0.12); }

	.zoom-btn {
		width: 36px; height: 36px; background: rgba(255,255,255,0.92);
		border: 1px solid #ddd; border-radius: 8px; font-size: 1.1rem; font-weight: 500;
		cursor: pointer; color: #333; display: flex; align-items: center; justify-content: center;
		box-shadow: 0 2px 8px rgba(0,0,0,0.12); transition: background 0.15s, border-color 0.15s;
		backdrop-filter: blur(4px);
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

	.error-banner {
		position: fixed; bottom: 64px; left: 50%; transform: translateX(-50%);
		color: #c0392b; font-size: 0.85rem; background: rgba(255,255,255,0.9);
		padding: 6px 14px; border-radius: 8px; pointer-events: none; z-index: 10; white-space: nowrap;
	}

	/* Overlay */
	.overlay {
		position: fixed; inset: 0; background: rgba(0,0,0,0.4);
		display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px;
	}

	.product-dialog {
		background: #fff; border-radius: 16px; padding: 28px; width: 100%; max-width: 480px;
		display: flex; flex-direction: column; gap: 16px; max-height: 90vh; overflow-y: auto;
		box-shadow: 0 8px 40px rgba(0,0,0,0.18); position: relative;
	}
	.product-dialog h2 { font-size: 1.15rem; font-weight: 700; color: #1a1a1a; }
	.modal-sub { font-size: 0.82rem; color: #888; }
	.modal-close {
		position: absolute; top: 16px; right: 16px; width: 28px; height: 28px;
		border: none; background: none; cursor: pointer; font-size: 14px; color: #aaa;
		display: flex; align-items: center; justify-content: center; border-radius: 6px;
		transition: background 0.12s;
	}
	.modal-close:hover { background: #f0ede8; color: #555; }

	.modal-two-col { display: flex; gap: 16px; align-items: flex-start; }
	.modal-two-col-photo { width: 100px; height: 100px; object-fit: contain; border-radius: 8px; background: #f5f4f0; flex-shrink: 0; }
	.modal-two-col-body { flex: 1; display: flex; flex-direction: column; gap: 12px; min-width: 0; }

	.found-product-name { font-size: 0.9rem; font-weight: 700; color: #1a1a1a; }

	.dropzone {
		border: 2px dashed #e0ddd8; border-radius: 12px; padding: 40px 20px;
		text-align: center; cursor: pointer; transition: border-color 0.15s, background 0.15s;
		display: flex; flex-direction: column; align-items: center; gap: 10px;
	}
	.dropzone:hover, :global(.dropzone.drag-over) { border-color: #aaa; background: #fafaf9; }
	.dz-icon { font-size: 2rem; }
	.dz-text { font-size: 0.85rem; color: #888; line-height: 1.5; }

	/* Swatch modal */
	.swatch-modal-list { display: flex; flex-direction: column; gap: 2px; }
	.swatch-list-item { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-radius: 9px; cursor: pointer; transition: background 0.12s; }
	.swatch-list-item:hover { background: #f5f4f0; }
	.swatch-list-item.selected { background: #ede9e3; }
	.swatch-list-dot { width: 26px; height: 26px; border-radius: 7px; flex-shrink: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.14); border: 2px solid transparent; transition: border-color 0.12s; }
	.swatch-list-item.selected .swatch-list-dot { border-color: #1a1a1a; }
	.swatch-list-name { font-size: 0.85rem; color: #333; flex: 1; }
	.swatch-list-item.selected .swatch-list-name { font-weight: 600; color: #1a1a1a; }
	.swatch-custom-section { margin-top: 12px; padding-top: 12px; border-top: 1px solid #e8e6e1; display: flex; flex-direction: column; gap: 8px; }
	.swatch-custom-label { font-size: 0.75rem; font-weight: 600; color: #888; }
	.swatch-custom-row { display: flex; align-items: center; gap: 8px; }
	.swatch-custom-preview { width: 30px; height: 30px; border-radius: 7px; flex-shrink: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.14); cursor: pointer; overflow: hidden; position: relative; }
	.swatch-custom-preview input[type="color"] { position: absolute; inset: -4px; width: calc(100% + 8px); height: calc(100% + 8px); opacity: 0; cursor: pointer; border: none; padding: 0; }
	.swatch-custom-hex { flex: 1; padding: 7px 10px; border-radius: 8px; border: 1.5px solid #e0ddd8; font-size: 0.85rem; font-family: monospace; outline: none; }
	.swatch-custom-hex:focus { border-color: #1a1a1a; }
	.swatch-custom-add { padding: 7px 12px; border-radius: 8px; background: #1a1a1a; color: #fff; border: none; font-size: 0.82rem; font-weight: 600; cursor: pointer; }
	.swatch-custom-add:hover { background: #333; }

	/* Swap card */
	.swap-card {
		display: flex; flex-direction: column; align-items: center; gap: 5px;
		padding: 8px 10px; border: 1.5px solid #e0ddd8; border-radius: 10px;
		cursor: pointer; background: #fafaf9; width: 88px;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	.swap-card:hover { border-color: #aaa; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }

	/* Dialogs */
	.dialog-box {
		background: #fff; border-radius: 16px; padding: 28px; width: 100%; max-width: 400px;
		display: flex; flex-direction: column; gap: 16px; box-shadow: 0 8px 40px rgba(0,0,0,0.18);
	}
	.dialog-box h2 { font-size: 1.1rem; font-weight: 700; }
	.dialog-box p { font-size: 0.9rem; color: #555; line-height: 1.5; }
	.dialog-buttons { display: flex; justify-content: flex-end; gap: 8px; }

	.btn-cancel {
		padding: 9px 16px; background: #f5f4f0; border: 1px solid #e0ddd8; border-radius: 8px;
		font-size: 0.85rem; font-weight: 600; color: #555; cursor: pointer;
	}
	.btn-cancel:hover { background: #ede9e3; }
	.btn-danger {
		padding: 9px 16px; background: #c0392b; color: #fff; border: none; border-radius: 8px;
		font-size: 0.85rem; font-weight: 600; cursor: pointer;
	}
	.btn-danger:hover:not(:disabled) { background: #a93226; }
	.btn-danger:disabled { opacity: 0.6; cursor: default; }
	.error-text { font-size: 0.85rem; color: #c0392b; }

	/* Import table row highlight */
	:global(.import-selected) { background: #f0f7f4 !important; }

	/* Shared token for all three import search fields */
	.import-search-wrap,
	.import-num-input {
		border: 1px solid #e0ddd7;
		border-radius: 6px;
		background: white;
		font-size: 0.82rem;
		color: #18181B;
		font-family: inherit;
		box-sizing: border-box;
	}
	.import-search-wrap:focus-within,
	.import-num-input:focus {
		border-color: #F57832;
		box-shadow: 0 0 0 2px rgba(245,120,50,0.1);
		outline: none;
	}

	.import-search-wrap {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 9px;
	}

	.import-search-input {
		border: none;
		outline: none;
		font-size: 0.82rem;
		width: 100%;
		background: transparent;
		color: #18181B;
	}

	.import-num-input {
		width: 100%;
		padding: 5px 9px;
		text-align: center;
		outline: none;
		/* Remove browser default number-input styling */
		-webkit-appearance: textfield;
		-moz-appearance: textfield;
		appearance: textfield;
	}
	.import-num-input::-webkit-outer-spin-button,
	.import-num-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

	/* :global for product-group hover */
	:global(.product-group .product-controls) { opacity: 0; pointer-events: none; transition: opacity 0.12s; }
	:global(.product-group:hover .product-controls) { opacity: 1; pointer-events: all; }
</style>
