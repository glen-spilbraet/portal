// SoMe story compositor (browser only). Draws 1080×1920 Instagram/Facebook
// stories from a Sales Sheet onto a canvas:
//   • bullet stories (1–3): people-playing photo + tilted white text box
//   • product story (4):    orange + figure pattern, floating 3D box with award
//                           badges, name, short description, green wave and
//                           one age/time/players pill.
// Everything is plain canvas 2D (no ctx.filter — Safari lacks it) so the result
// is identical on desktop and mobile.

export const W = 1080;
export const H = 1920;

const ORANGE = '#F57832';
const GREEN = '#148246';
const DARK_GREEN = '#00411E';
const FONT = '"Trebuchet MS", Trebuchet, "Nunito", sans-serif';

const STAT_LABELS = {
	da: { age: 'Alder', time: 'Spilletid', players: 'Antal spillere' },
	sv: { age: 'Ålder', time: 'Speltid', players: 'Antal spelare' },
	no: { age: 'Alder', time: 'Spilletid', players: 'Antall spillere' },
	en: { age: 'Age', time: 'Play time', players: 'Players' },
};

// ── Loading ───────────────────────────────────────────────────────────────
const imgCache = new Map();
export function loadImage(src) {
	if (!imgCache.has(src)) {
		imgCache.set(src, new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.decoding = 'async';
			img.onload = () => resolve(img);
			img.onerror = () => { imgCache.delete(src); reject(new Error(`Could not load ${src}`)); };
			img.src = src;
		}));
	}
	return imgCache.get(src);
}

let patternTile = null;
/** The brand figure pattern, rasterised once from the vector tile at `size` px wide. */
async function getPatternTile(size = 720) {
	if (patternTile) return patternTile;
	const svg = await loadImage('/pattern-tile-white.svg');
	const ratio = 598.51 / 609.45;
	const c = document.createElement('canvas');
	c.width = size;
	c.height = Math.round(size * ratio);
	c.getContext('2d').drawImage(svg, 0, 0, c.width, c.height);
	patternTile = c;
	return c;
}

export async function ensureFonts() {
	try {
		await Promise.all([document.fonts.load(`bold 84px ${FONT}`), document.fonts.load(`44px ${FONT}`)]);
	} catch { /* system font — fine */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────
/** @returns {[HTMLCanvasElement, CanvasRenderingContext2D]} */
function newCanvas() {
	const c = document.createElement('canvas');
	c.width = W;
	c.height = H;
	const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	return [c, ctx];
}

function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

/** Greedy word wrap. Very long single words are kept whole (they get shrunk by the caller). */
function wrap(ctx, text, maxWidth) {
	const words = text.split(/\s+/).filter(Boolean);
	const lines = [];
	let line = '';
	for (const w of words) {
		const test = line ? `${line} ${w}` : w;
		if (line && ctx.measureText(test).width > maxWidth) {
			lines.push(line);
			line = w;
		} else line = test;
	}
	if (line) lines.push(line);
	return lines;
}

/** Find the largest font size (step 2px) where `text` fits in maxLines × maxWidth. */
function fitText(ctx, text, { weight = '', max, min, maxWidth, maxLines }) {
	for (let size = max; size >= min; size -= 2) {
		ctx.font = `${weight} ${size}px ${FONT}`.trim();
		const lines = wrap(ctx, text, maxWidth);
		const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
		if (lines.length <= maxLines && widest <= maxWidth) return { size, lines };
	}
	// Still too long at min size: truncate the last line with an ellipsis.
	ctx.font = `${weight} ${min}px ${FONT}`.trim();
	const lines = wrap(ctx, text, maxWidth).slice(0, maxLines);
	let last = lines[maxLines - 1] ?? '';
	while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.replace(/\s*\S+$/, '');
	lines[maxLines - 1] = `${last}…`;
	return { size: min, lines };
}

/** object-fit: cover with a focal point (crop_x / crop_y in %). */
function drawCover(ctx, img, x, y, w, h, fx = 50, fy = 50) {
	const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
	const sw = w / s;
	const sh = h / s;
	const sx = Math.min(Math.max((img.naturalWidth - sw) * (fx / 100), 0), img.naturalWidth - sw);
	const sy = Math.min(Math.max((img.naturalHeight - sh) * (fy / 100), 0), img.naturalHeight - sh);
	ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// ── Story 1–3: bullet on a photo ──────────────────────────────────────────
/**
 * @param {object} o
 * @param {HTMLImageElement|null} o.photo
 * @param {number} o.cropX
 * @param {number} o.cropY
 * @param {string} o.text      the bullet
 * @param {string} o.position   'top' | 'bottom'
 * @param {number} o.tilt      degrees
 */
export async function renderBulletStory({ photo, cropX = 50, cropY = 50, text, position = 'bottom', tilt = -2.5 }) {
	await ensureFonts();
	const [c, ctx] = newCanvas();

	if (photo) {
		drawCover(ctx, photo, 0, 0, W, H, cropX, cropY);
		// Warm grade: soft orange light + a touch more contrast via overlay.
		ctx.save();
		ctx.globalCompositeOperation = 'soft-light';
		ctx.fillStyle = 'rgba(255, 170, 90, 0.22)';
		ctx.fillRect(0, 0, W, H);
		ctx.restore();
		// Vignette.
		const g = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.45, W / 2, H * 0.45, Math.hypot(W, H) * 0.58);
		g.addColorStop(0, 'rgba(0,0,0,0)');
		g.addColorStop(1, 'rgba(0,0,0,0.38)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, W, H);
	} else {
		ctx.fillStyle = ORANGE;
		ctx.fillRect(0, 0, W, H);
	}

	// White text box.
	const boxX = 100;
	const boxW = W - 200;
	const padX = 76;
	const padY = 72;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';
	const { size, lines } = fitText(ctx, text, { weight: 'bold', max: 84, min: 56, maxWidth: boxW - padX * 2, maxLines: 4 });
	const lineH = Math.round(size * 1.1);
	const boxH = padY * 2 + lineH * lines.length;
	const boxY = position === 'top' ? 300 : H - 420 - boxH;

	ctx.save();
	ctx.translate(boxX + boxW / 2, boxY + boxH / 2);
	ctx.rotate((tilt * Math.PI) / 180);
	// Big soft shadow (two passes: wide ambient + tighter contact).
	for (const [blur, dy, a] of [[120, 40, 0.35], [36, 12, 0.18]]) {
		ctx.save();
		ctx.shadowColor = `rgba(0,0,0,${a})`;
		ctx.shadowBlur = blur;
		ctx.shadowOffsetY = dy;
		ctx.fillStyle = '#fff';
		roundRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 44);
		ctx.fill();
		ctx.restore();
	}
	ctx.fillStyle = DARK_GREEN;
	ctx.font = `bold ${size}px ${FONT}`;
	// Optical vertical centring: the cap-height sits ~0.36em above the middle of a line.
	lines.forEach((l, i) => {
		const y = -boxH / 2 + padY + lineH * i + lineH / 2 + size * 0.34;
		ctx.fillText(l, 0, y);
	});
	ctx.restore();
	return c;
}

// ── Story 4: product ──────────────────────────────────────────────────────
const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/** Same corner logic as Award View / shop: newest first, primary then secondary corner. */
export function assignSlots(badges) {
	const occupied = {};
	const placed = [];
	for (const b of badges) {
		const primary = CORNERS.includes(b.placement) ? b.placement : 'bottom-right';
		const secondary = CORNERS.includes(b.placement_2) ? b.placement_2 : null;
		const corner = !occupied[primary] ? primary : (secondary && !occupied[secondary] ? secondary : null);
		if (!corner) continue;
		occupied[corner] = true;
		placed.push({ b, corner });
	}
	return placed;
}

const ICONS = {
	age: (ctx) => { ctx.beginPath(); ctx.arc(24, 14, 6, 0, Math.PI * 2); ctx.stroke(); ctx.stroke(new Path2D('M12 40c0-8 5.4-14 12-14s12 6 12 14')); },
	time: (ctx) => { ctx.beginPath(); ctx.arc(24, 24, 16, 0, Math.PI * 2); ctx.stroke(); ctx.stroke(new Path2D('M24 15v9l6 5')); },
	players: (ctx) => {
		ctx.beginPath(); ctx.arc(17, 15, 5, 0, Math.PI * 2); ctx.stroke();
		ctx.beginPath(); ctx.arc(31, 15, 5, 0, Math.PI * 2); ctx.stroke();
		ctx.stroke(new Path2D('M7 38c0-7 4.5-12 10-12s10 5 10 12'));
		ctx.stroke(new Path2D('M21 38c0-7 4.5-12 10-12s10 5 10 12'));
	},
};

/** "7" → "7+", "20" → "20'", "2-4" → "2–4". */
export function formatAttr(kind, v) {
	if (!v) return null;
	let s = `${v}`.trim();
	if (kind === 'age' && /^\d+$/.test(s)) s += '+';
	if (kind === 'time' && /^\d+(\s*[-–]\s*\d+)?$/.test(s)) s += "'";
	if (kind === 'players' || kind === 'time') s = s.replace(/\s*-\s*/g, '–');
	return s;
}

/**
 * @param {object} o
 * @param {HTMLImageElement|null} o.box
 * @param {{img: HTMLImageElement, b: any, corner: string}[]} o.badges  pre-placed
 * @param {string} o.name
 * @param {string} o.description
 * @param {{age?: string|null, time?: string|null, players?: string|null}} o.attrs  formatted
 * @param {string} o.lang
 */
export async function renderProductStory({ box, badges = [], name, description, attrs, lang }) {
	await ensureFonts();
	const [c, ctx] = newCanvas();

	// Orange + white figure pattern at 20%.
	ctx.fillStyle = ORANGE;
	ctx.fillRect(0, 0, W, H);
	const tile = await getPatternTile(720);
	ctx.save();
	ctx.globalAlpha = 0.2;
	ctx.fillStyle = /** @type {CanvasPattern} */ (ctx.createPattern(tile, 'repeat'));
	ctx.translate((W - tile.width) / 2, 0); // centre the tile like background-position: center top
	ctx.fillRect(-(W - tile.width) / 2, 0, W, H);
	ctx.restore();

	// Green wave (no pattern on it) with a soft upward shadow.
	const waveTop = H - 385;
	const wave = new Path2D(`M0 ${waveTop + 105} C 180 ${waveTop + 30}, 360 ${waveTop + 30}, 540 ${waveTop + 100} S 900 ${waveTop + 180}, ${W} ${waveTop + 85} L${W} ${H} L0 ${H} Z`);
	ctx.save();
	ctx.shadowColor = 'rgba(0,0,0,0.28)';
	ctx.shadowBlur = 70;
	ctx.shadowOffsetY = -24;
	ctx.fillStyle = GREEN;
	ctx.fill(wave);
	ctx.restore();

	// Floating box + badges in a square composite (badge sizes/pads are % of it).
	const comp = { x: 90, y: 150, s: 900 };
	if (box) {
		const pad = comp.s * 0.04;
		const r = Math.min((comp.s - pad * 2) / box.naturalWidth, (comp.s - pad * 2) / box.naturalHeight);
		const w = box.naturalWidth * r;
		const h = box.naturalHeight * r;
		ctx.save();
		ctx.shadowColor = 'rgba(0,0,0,0.35)';
		ctx.shadowBlur = 50;
		ctx.shadowOffsetY = 50;
		ctx.drawImage(box, comp.x + (comp.s - w) / 2, comp.y + (comp.s - h) / 2, w, h);
		ctx.restore();
	}
	for (const { img, b, corner } of badges) {
		const bw = ((Number(b.size_pct) || 15) / 100) * comp.s;
		const bh = bw * (img.naturalHeight / img.naturalWidth);
		const [vy, vx] = corner.split('-');
		const p = b.pad ?? {};
		const offX = (((vx === 'left' ? Number(p.left) : Number(p.right)) || 0) / 100) * comp.s;
		const offY = (((vy === 'top' ? Number(p.top) : Number(p.bottom)) || 0) / 100) * comp.s;
		const x = vx === 'left' ? comp.x + offX : comp.x + comp.s - offX - bw;
		const y = vy === 'top' ? comp.y + offY : comp.y + comp.s - offY - bh;
		ctx.drawImage(img, x, y, bw, bh);
	}

	// Name + short description (white, centred).
	ctx.fillStyle = '#fff';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'alphabetic';
	const textW = W - 180;
	const nameFit = fitText(ctx, name, { weight: 'bold', max: 92, min: 60, maxWidth: textW, maxLines: 1 });
	ctx.font = `bold ${nameFit.size}px ${FONT}`;
	const nameBaseline = 1110 + nameFit.size * 0.85;
	ctx.fillText(nameFit.lines[0], W / 2, nameBaseline);

	const descTop = nameBaseline + 44;
	const descBottom = waveTop + 10;
	if (description) {
		// Max lines depend on the size chosen; try 44px/5 lines down to 34px/6 lines.
		let fit = null;
		for (const [max, min, lh] of [[44, 40, 1.3], [38, 34, 1.28]]) {
			const lines = Math.floor((descBottom - descTop) / (min * lh));
			const f = fitText(ctx, description, { max, min, maxWidth: textW, maxLines: lines });
			fit = { ...f, lh };
			if (!f.lines[f.lines.length - 1].endsWith('…')) break;
		}
		ctx.font = `${fit.size}px ${FONT}`;
		const lineH = fit.size * fit.lh;
		fit.lines.forEach((l, i) => ctx.fillText(l, W / 2, descTop + lineH * i + fit.size));
	}

	// One white pill with age | time | players.
	const L = STAT_LABELS[lang] ?? STAT_LABELS.en;
	const stats = ['age', 'time', 'players'].filter((k) => attrs[k]).map((k) => ({ k, label: L[k], value: attrs[k] }));
	if (stats.length) {
		const pill = { x: 60, w: W - 120, h: 170, y: H - 130 - 170 };
		ctx.save();
		ctx.shadowColor = 'rgba(0,0,0,0.18)';
		ctx.shadowBlur = 70;
		ctx.shadowOffsetY = 24;
		ctx.fillStyle = '#fff';
		roundRect(ctx, pill.x, pill.y, pill.w, pill.h, 48);
		ctx.fill();
		ctx.restore();

		const icon = 66;
		const gap = 16;
		ctx.textAlign = 'left';
		// Measure each cell's content and give cells width in proportion (like flex: auto).
		const cells = stats.map((s) => {
			ctx.font = `30px ${FONT}`;
			const lw = ctx.measureText(s.label).width;
			ctx.font = `bold 58px ${FONT}`;
			const vw = ctx.measureText(s.value).width;
			return { ...s, content: icon + gap + Math.max(lw, vw) };
		});
		const total = cells.reduce((a, c) => a + c.content, 0);
		const free = Math.max(0, pill.w - total);
		let x = pill.x;
		cells.forEach((cell, i) => {
			const cw = cell.content + free / cells.length;
			if (i > 0) {
				ctx.strokeStyle = '#e9e6e1';
				ctx.lineWidth = 3;
				ctx.beginPath();
				ctx.moveTo(x, pill.y + 34);
				ctx.lineTo(x, pill.y + pill.h - 34);
				ctx.stroke();
			}
			const cx = x + (cw - cell.content) / 2;
			const midY = pill.y + pill.h / 2;
			ctx.save();
			ctx.translate(cx, midY - icon / 2);
			ctx.scale(icon / 48, icon / 48);
			ctx.strokeStyle = ORANGE;
			ctx.lineWidth = 3.6;
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ICONS[cell.k](ctx);
			ctx.restore();
			ctx.fillStyle = '#6b6b6b';
			ctx.font = `30px ${FONT}`;
			ctx.fillText(cell.label, cx + icon + gap, midY - 14);
			ctx.fillStyle = '#1a1a1a';
			ctx.font = `bold 58px ${FONT}`;
			ctx.fillText(cell.value, cx + icon + gap, midY + 44);
			x += cw;
		});
	}
	return c;
}

/** Canvas → JPEG blob. */
export function toBlob(canvas, type = 'image/jpeg', quality = 0.93) {
	return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), type, quality));
}
