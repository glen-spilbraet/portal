/**
 * Render a localised Order Confirmation PDF (browser-side, jsPDF).
 * One legal entity for every market (same address + VAT); the market shows via
 * the logo + language. Standard Helvetica (WinAnsi) covers æøåäö.
 */
import { jsPDF } from 'jspdf';

// Same seller block for all markets. Fill SELLER_VAT once provided ('' hides the line).
const SELLER = ['Spilbræt ApS', 'Trekronergade 149B, 1. sal', '2500 Valby'];
const SELLER_VAT = '';

const LABELS = {
	da: { title: 'Ordrebekræftelse', order: 'Ordre', delivery: 'Forventet leveringsdato', seller: 'Sælger', sku: 'SKU', product: 'PRODUKTER', qty: 'ANTAL', price: 'PRIS', total: 'SAMLET', grand: 'Total', none: '—', locale: 'da-DK' },
	sv: { title: 'Orderbekräftelse', order: 'Order', delivery: 'Förväntat leveransdatum', seller: 'Säljare', sku: 'SKU', product: 'PRODUKTER', qty: 'ANTAL', price: 'PRIS', total: 'SUMMA', grand: 'Totalt', none: '—', locale: 'sv-SE' },
	no: { title: 'Ordrebekreftelse', order: 'Ordre', delivery: 'Forventet leveringsdato', seller: 'Selger', sku: 'SKU', product: 'PRODUKTER', qty: 'ANTALL', price: 'PRIS', total: 'SUM', grand: 'Totalt', none: '—', locale: 'nb-NO' },
	en: { title: 'Order Confirmation', order: 'Order', delivery: 'Expected delivery date', seller: 'Seller', sku: 'SKU', product: 'PRODUCTS', qty: 'QTY', price: 'PRICE', total: 'TOTAL', grand: 'Total', none: '—', locale: 'en-GB' },
};
const LOGO = { da: '/logo-da.svg', sv: '/logo-se.svg', no: '/logo-no.svg', en: '/logo-da.svg' };

const logoCache = {};
async function loadLogo(lang) {
	const url = LOGO[lang] || LOGO.en;
	if (logoCache[url]) return logoCache[url];
	const svg = await (await fetch(url)).text();
	const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
	const img = new Image();
	await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = blobUrl; });
	const w = img.width || 300, h = img.height || 90, scale = 4;
	const canvas = document.createElement('canvas');
	canvas.width = w * scale; canvas.height = h * scale;
	canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
	URL.revokeObjectURL(blobUrl);
	const out = { dataUrl: canvas.toDataURL('image/png'), ratio: w / h };
	logoCache[url] = out;
	return out;
}

const money = (n, locale) => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

/** @returns {Promise<import('jspdf').jsPDF>} */
export async function renderOrderPdf(order) {
	const L = LABELS[order.lang] || LABELS.en;
	const doc = new jsPDF({ unit: 'mm', format: 'a4' });
	const pageW = 210, pageH = 297, M = 18, bottom = 24; // bottom = reserved space (footer + breathing room)
	const colSku = M, colProd = M + 26, colQty = M + 118, colPrice = M + 152, colTotal = pageW - M;
	const prodW = colQty - colProd - 6;
	let y = 16;

	// ── Header: title LEFT, logo RIGHT, orange rule under both ────────────────────
	const headTop = 15;
	let logoBottom = headTop;
	try {
		const logo = await loadLogo(order.lang);
		const lw = 42, lh = lw / (logo.ratio || 3.3);
		doc.addImage(logo.dataUrl, 'PNG', pageW - M - lw, headTop, lw, lh);
		logoBottom = headTop + lh;
	} catch { logoBottom = headTop + 12; }
	doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(24, 24, 27);
	const titleBaseline = Math.max(headTop + 10, logoBottom - 1);
	doc.text(L.title, M, titleBaseline);
	const ruleY = Math.max(logoBottom, titleBaseline) + 3;
	doc.setDrawColor(245, 120, 50); doc.setLineWidth(0.8); doc.line(M, ruleY, pageW - M, ruleY);
	y = ruleY + 11;

	// ── Buyer (left) + Seller (right) ────────────────────────────────────────────
	const topY = y;
	doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(24, 24, 27);
	doc.text(order.buyer?.name || '—', M, y); y += 5.5;
	doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(63, 58, 51);
	if (order.buyer?.address) { doc.text(String(order.buyer.address), M, y); y += 5; }
	const cityLine = [order.buyer?.zip, order.buyer?.city].filter(Boolean).join(' ');
	if (cityLine) { doc.text(cityLine, M, y); y += 5; }

	let ry = topY; const rx = pageW - M;
	doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(24, 24, 27);
	doc.text(SELLER[0], rx, ry, { align: 'right' }); ry += 5;
	doc.setFont('helvetica', 'normal'); doc.setTextColor(63, 58, 51);
	for (const line of SELLER.slice(1)) { doc.text(line, rx, ry, { align: 'right' }); ry += 5; }
	if (SELLER_VAT) { doc.text(`VAT ${SELLER_VAT}`, rx, ry, { align: 'right' }); ry += 5; }

	y = Math.max(y, ry) + 8;

	// ── Order meta ────────────────────────────────────────────────────────────────
	const meta = (label, value) => {
		doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(63, 58, 51);
		doc.text(`${label}: `, M, y);
		const w = doc.getTextWidth(`${label}: `);
		doc.setFont('helvetica', 'normal'); doc.text(String(value ?? L.none), M + w, y);
		y += 5.5;
	};
	meta(L.order, order.dealName);
	meta(L.delivery, order.deliveryDate || L.none);
	if (order.seller?.name) meta(L.seller, order.seller.name);
	y += 8;

	// ── Table (with page breaks) ──────────────────────────────────────────────────
	const PADY = 2.6;          // vertical padding inside each row
	const LINE_H = 4.8;        // per wrapped line
	const TOTAL_H = 16;        // space the grand total needs (kept with the last row)
	function drawTableHead(yy) {
		doc.setFillColor(251, 239, 203); doc.rect(M - 2, yy - 5, pageW - 2 * M + 4, 9, 'F');
		doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(123, 56, 3);
		doc.text(L.sku, colSku, yy); doc.text(L.product, colProd, yy);
		doc.text(L.qty, colQty, yy, { align: 'right' }); doc.text(L.price, colPrice, yy, { align: 'right' }); doc.text(L.total, colTotal, yy, { align: 'right' });
		return yy + 4; // band bottom — rows follow directly for even spacing
	}
	const rowFont = () => { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(40, 40, 40); };

	y = drawTableHead(y);
	rowFont();
	order.lines.forEach((l, i) => {
		const nameLines = doc.splitTextToSize(l.name || '', prodW);
		const rowH = PADY + nameLines.length * LINE_H + PADY;
		// Keep the grand total with the last row so it never lands alone on a page.
		const need = rowH + (i === order.lines.length - 1 ? TOTAL_H : 0);
		if (y + need > pageH - bottom) { doc.addPage(); y = 16; y = drawTableHead(y); rowFont(); }
		const tY = y + PADY + 3.3;
		doc.text(l.sku || '', colSku, tY);
		doc.text(nameLines, colProd, tY);
		doc.text(String(l.qty), colQty, tY, { align: 'right' });
		doc.text(money(l.unitPrice, L.locale), colPrice, tY, { align: 'right' });
		doc.text(`${money(l.lineTotal, L.locale)} ${order.currency}`, colTotal, tY, { align: 'right' });
		y += rowH;
		doc.setDrawColor(240, 235, 215); doc.setLineWidth(0.1); doc.line(M - 2, y, pageW - M + 2, y);
	});

	// Grand total — label placed just left of the amount so they never overlap.
	y += 8;
	doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(24, 24, 27);
	const amt = `${money(order.total, L.locale)} ${order.currency}`;
	doc.text(amt, colTotal, y, { align: 'right' });
	doc.text(L.grand, colTotal - doc.getTextWidth(amt) - 8, y, { align: 'right' });

	// ── Page numbers (bottom-right) ───────────────────────────────────────────────
	const pages = doc.getNumberOfPages();
	for (let i = 1; i <= pages; i++) {
		doc.setPage(i);
		doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(150, 150, 150);
		doc.text(`${i}/${pages}`, pageW - M, pageH - 10, { align: 'right' });
	}

	return doc;
}
