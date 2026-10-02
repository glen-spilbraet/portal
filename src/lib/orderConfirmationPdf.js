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
	const pageW = 210, M = 18;
	let y = 16;

	try {
		const logo = await loadLogo(order.lang);
		const lw = 42, lh = lw / (logo.ratio || 3.3);
		doc.addImage(logo.dataUrl, 'PNG', M, y, lw, lh);
		y += lh + 7;
	} catch { y += 4; }

	// Title + orange rule
	doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(24, 24, 27);
	doc.text(L.title, M, y);
	doc.setDrawColor(245, 120, 50); doc.setLineWidth(0.8); doc.line(M, y + 2.5, pageW - M, y + 2.5);
	y += 12;

	// Buyer (left) + Seller (right)
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

	y = Math.max(y, ry) + 7;

	// Order meta
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
	y += 7;

	// Table
	const colSku = M, colProd = M + 26, colQty = M + 118, colPrice = M + 150, colTotal = pageW - M;
	doc.setFillColor(251, 239, 203); doc.rect(M - 2, y - 4.6, pageW - 2 * M + 4, 7, 'F');
	doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(123, 56, 3);
	doc.text(L.sku, colSku, y); doc.text(L.product, colProd, y);
	doc.text(L.qty, colQty, y, { align: 'right' }); doc.text(L.price, colPrice, y, { align: 'right' }); doc.text(L.total, colTotal, y, { align: 'right' });
	y += 6.5;

	doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(40, 40, 40);
	for (const l of order.lines) {
		const nameLines = doc.splitTextToSize(l.name || '', 86);
		const rowH = Math.max(5.6, nameLines.length * 4.4);
		doc.text(l.sku || '', colSku, y);
		doc.text(nameLines, colProd, y);
		doc.text(String(l.qty), colQty, y, { align: 'right' });
		doc.text(money(l.unitPrice, L.locale), colPrice, y, { align: 'right' });
		doc.text(`${money(l.lineTotal, L.locale)} ${order.currency}`, colTotal, y, { align: 'right' });
		y += rowH;
		doc.setDrawColor(240, 235, 215); doc.setLineWidth(0.1); doc.line(M - 2, y - 2.6, pageW - M + 2, y - 2.6);
	}

	y += 4;
	doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(24, 24, 27);
	doc.text(L.grand, colPrice, y, { align: 'right' });
	doc.text(`${money(order.total, L.locale)} ${order.currency}`, colTotal, y, { align: 'right' });

	return doc;
}
