<script>
	import ImageGrid from './ImageGrid.svelte';

	let {
		sheetId,
		sheet,
		translations = {},       // current language's saved translations (may be sparse)
		baseTranslations = {},    // primary language's translations (used as fallback)
		primaryLanguage = 'en',
		images = [],
		language = 'en',
		editable = false,
		onchange,
		globalLabels = {},       // { sku: { en: 'SKU', da: 'SKU', ... }, height: { en: 'Height', da: 'Højde', ... }, ... }
		hiddenElements = {}      // { cta: true, stock_date: true, description: true, bullets: true, data: true }
	} = $props();

	// Keys edited in this session — shown as black immediately even before server confirms
	let localOverrides = $state(/** @type {Record<string, boolean>} */ ({}));

	/** Display value: own translation → base translation → empty */
	function effective(key) {
		return translations[key] || baseTranslations[key] || '';
	}

	function isInherited(key) {
		return editable && language !== primaryLanguage && !translations[key] && !localOverrides[key];
	}

	// ── Bound text state ──────────────────────────────────────────────────
	let productName        = $state(effective('product_name'));
	let productDescription = $state(effective('product_description'));
	let uspValues          = $state(Array.from({ length: 6 }, (_, i) => effective(`usp_${i + 1}`)));

	// Sync whenever language or translations change
	$effect(() => {
		// reading these props registers them as dependencies
		const _t  = translations;
		const _bt = baseTranslations;
		const _l  = language;

		productName        = effective('product_name');
		productDescription = effective('product_description');
		for (let i = 0; i < 6; i++) uspValues[i] = effective(`usp_${i + 1}`);
		localOverrides = {};   // reset on every language switch
	});

	// ── Other sheet state ─────────────────────────────────────────────────
	let dataFields  = $state(JSON.parse(sheet.data_fields ?? '[]'));
	let boxImageKey = $state(sheet.box_image_key ?? null);
	let gridImages  = $state([...images]);
	let uspCount    = $state(sheet.usp_count ?? 3);

	const RIGHT_KEYS = ['height', 'width', 'depth'];
	const BADGE_KEYS = ['age', 'time', 'players'];

	// Ensure game badge fields exist for existing sheets
	for (const bk of BADGE_KEYS) {
		if (!dataFields.find(f => f.key === bk)) dataFields.push({ key: bk, label: bk, value: '' });
	}

	let dataColLeft  = $derived(dataFields.map((f, i) => ({...f, _i: i})).filter(f => f.key !== 'stock_date' && f.key !== 'colli' && !RIGHT_KEYS.includes(f.key) && !BADGE_KEYS.includes(f.key) && f.column !== 'right'));
	let dataColRight = $derived(dataFields.map((f, i) => ({...f, _i: i})).filter(f => RIGHT_KEYS.includes(f.key) || f.column === 'right'));

	let ageIdx     = $derived(dataFields.findIndex(f => f.key === 'age'));
	let timeIdx    = $derived(dataFields.findIndex(f => f.key === 'time'));
	let playersIdx = $derived(dataFields.findIndex(f => f.key === 'players'));

	// ── Save helper ───────────────────────────────────────────────────────
	async function saveChange(payload) {
		onchange?.(payload);
		if (!editable) return;
		await fetch(`/api/sheets/${sheetId}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
	}

	function onKeyDown(e) {
		if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
	}

	// ── Text blur handlers ────────────────────────────────────────────────
	function blurProductName() {
		localOverrides.product_name = true;
		saveChange({ type: 'translation', language, key: 'product_name', value: productName ?? '' });
	}

	function blurProductDescription() {
		localOverrides.product_description = true;
		saveChange({ type: 'translation', language, key: 'product_description', value: productDescription ?? '' });
	}

	function blurUsp(num) {
		const key = `usp_${num}`;
		localOverrides[key] = true;
		saveChange({ type: 'translation', language, key, value: uspValues[num - 1] ?? '' });
	}

	// ── USP management ────────────────────────────────────────────────────
	function addUsp() {
		if (uspCount >= 6) return;
		uspCount += 1;
		saveChange({ type: 'sheet', field: 'usp_count', value: uspCount });
	}

	function removeUsp(num) {
		// shift values down
		for (let i = num; i < uspCount; i++) {
			const key = `usp_${i}`;
			uspValues[i - 1] = uspValues[i] ?? '';
			saveChange({ type: 'translation', language, key, value: uspValues[i - 1] });
		}
		uspValues[uspCount - 1] = '';
		uspCount -= 1;
		saveChange({ type: 'sheet', field: 'usp_count', value: uspCount });
	}

	// ── Data fields ───────────────────────────────────────────────────────
	function addDataField(column = 'left') {
		const field = { key: `field_${Date.now()}`, label: 'Label', value: '' };
		if (column === 'right') field.column = 'right';
		dataFields = [...dataFields, field];
		saveChange({ type: 'sheet', field: 'data_fields', value: JSON.stringify(dataFields) });
	}

	function removeDataField(idx) {
		dataFields = dataFields.filter((_, i) => i !== idx);
		saveChange({ type: 'sheet', field: 'data_fields', value: JSON.stringify(dataFields) });
	}

	function blurDataField(idx, field) {
		saveChange({ type: 'sheet', field: 'data_fields', value: JSON.stringify(dataFields) });
	}

	// ── Box photo ─────────────────────────────────────────────────────────
	let boxFileInput;
	let boxImageHasPadding = $state(false);

	async function detectBoxPadding(src) {
		try {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
			const SIZE = 120;
			const c = document.createElement('canvas');
			c.width = SIZE; c.height = SIZE;
			const ctx = c.getContext('2d');
			ctx.drawImage(img, 0, 0, SIZE, SIZE);
			const w = SIZE - 1, h = SIZE - 1, m = SIZE >> 1;
			// Sample corners + edge midpoints (8 points)
			const pts = [[0,0],[w,0],[0,h],[w,h],[m,0],[m,h],[0,m],[w,m]];
			let light = 0;
			for (const [x, y] of pts) {
				const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
				if (a < 30 || (r > 220 && g > 220 && b > 220)) light++;
			}
			boxImageHasPadding = light >= 6; // 6 of 8 points are white/transparent
		} catch {
			boxImageHasPadding = false;
		}
	}

	async function handleBoxUpload(e) {
		const file = e.target.files?.[0];
		if (!file) return;
		const fd = new FormData();
		fd.append('file', file);
		fd.append('sheetId', sheetId);
		fd.append('type', 'box');
		const res = await fetch('/api/images', { method: 'POST', body: fd });
		if (res.ok) {
			const { key } = await res.json();
			boxImageKey = key;
			onchange?.({ type: 'sheet', field: 'box_image_key', value: key });
		}
		e.target.value = '';
	}

	// ── Grid images ───────────────────────────────────────────────────────
	async function handleGridImageAdd(file, slot) {
		const fd = new FormData();
		fd.append('file', file);
		fd.append('sheetId', sheetId);
		fd.append('type', 'grid');
		fd.append('order', String(slot));
		const res = await fetch('/api/images', { method: 'POST', body: fd });
		if (res.ok) {
			const { id, key } = await res.json();
			gridImages = [...gridImages, { id, r2_key: key, display_order: slot, crop_x: 50, crop_y: 50 }];
		}
	}

	async function handleGridImageDelete(imageId) {
		await fetch(`/api/images/${imageId}`, { method: 'DELETE' });
		gridImages = gridImages.filter((i) => i.id !== imageId);
	}

	async function handleGridImageCrop(imageId, cropX, cropY) {
		await fetch(`/api/images/${imageId}/crop`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ cropX, cropY })
		});
	}

	async function handleGridImageReorder(fromId, toId) {
		if (!fromId || !toId) return;
		const fromImg = gridImages.find((i) => i.id === fromId);
		const toImg   = gridImages.find((i) => i.id === toId);
		if (!fromImg || !toImg) return;
		const tmp = fromImg.display_order;
		fromImg.display_order = toImg.display_order;
		toImg.display_order   = tmp;
		gridImages = [...gridImages].sort((a, b) => a.display_order - b.display_order);
		await fetch(`/api/images/swap`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id1: fromId, id2: toId })
		});
	}

	// ── Panel-triggered photo upload ──────────────────────────────────────
	let panelFileInput;
	async function handlePanelPhotoUpload(e) {
		const files = [...(e.target.files ?? [])];
		if (!files.length) return;
		for (let i = 0; i < files.length; i++) {
			await handleGridImageAdd(files[i], gridImages.length + i);
		}
		e.target.value = '';
	}

	// ── Stock date field (shown as tag below box, not in table) ──────────
	let stockDateIdx = $derived(dataFields.findIndex(f => f.key === 'stock_date'));

	// ── Logo: localised by language code ─────────────────────────────────
	let logoSrc = $derived(
		language === 'sv' ? '/logo-se.svg' :
		language === 'no' ? '/logo-no.svg' :
		'/logo-da.svg'   // en, da, and everything else
	);

	// ── Game badge SVGs ───────────────────────────────────────────────────
	const SVG_AGE = `<svg viewBox="0 0 159 182" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip-badge-age)"><path d="M3.04541 134.707V47.2379L79.5001 3.47656L156.008 47.2379V134.707L79.5001 178.468L3.04541 134.707Z" fill="white"/><path d="M79.5 7.00823L152.963 49.0041V132.942L79.5 174.938L6.09073 132.942V49.0041L79.5 7.00823ZM79.5 0L0 45.4732V136.473L79.5 181.946L159 136.473V45.4732L79.5 0Z" fill="#148246"/><path d="M79.5 4.65432L154.94 47.8272V134.119L79.5 177.292L4.06048 134.119V47.8272L79.5 4.65432ZM79.5 0L0 45.4732V136.473L79.5 181.946L159 136.473V45.4732L79.5 0Z" fill="white"/><path d="M74.9361 94.2054C74.9361 94.2054 73.3332 65.1025 88.3998 54.3494C89.682 53.44 91.6588 57.1848 98.3373 57.1848C106.725 57.1848 107.74 53.4934 108.916 54.4029C121.845 64.7815 122.433 94.2054 122.433 94.2054H115.434C115.434 94.2054 113.831 81.0449 110.679 74.1437C110.252 73.2342 109.45 73.5017 109.717 74.5181C111.374 80.5634 112.602 94.2054 112.602 94.2054C112.602 94.2054 108.488 96.3988 99.3524 96.3988C89.0409 96.3988 85.2475 94.2054 85.2475 94.2054C85.2475 94.2054 85.9421 80.4564 87.3312 74.6786C87.6518 73.3947 86.6901 73.3947 86.3695 74.1437C83.431 81.9544 81.8816 94.2054 81.8816 94.2054H74.9361Z" fill="#007E3A"/><path d="M98.6579 55.3139C106.005 55.3139 111.961 49.3498 111.961 41.9929C111.961 34.6359 106.005 28.6719 98.6579 28.6719C91.3106 28.6719 85.3545 34.6359 85.3545 41.9929C85.3545 49.3498 91.3106 55.3139 98.6579 55.3139Z" fill="#007E3A"/><path d="M35.6215 94.7943C35.6215 94.7943 34.4461 73.7696 45.3453 65.9589C46.307 65.3169 47.6961 67.9918 52.558 67.9918C58.5953 67.9918 59.3967 65.3169 60.1981 66.0124C69.5479 73.5021 69.9753 94.7943 69.9753 94.7943H64.8997C64.8997 94.7943 63.7243 85.2716 61.4803 80.2963C61.1598 79.6543 60.5721 79.8148 60.7858 80.5638C61.9612 84.9506 62.8695 94.7943 62.8695 94.7943C62.8695 94.7943 59.8775 96.3992 53.3059 96.3992C45.8261 96.3992 43.1013 94.7943 43.1013 94.7943C43.1013 94.7943 43.5822 84.8436 44.5973 80.6708C44.811 79.7613 44.1164 79.7078 43.9027 80.2963C41.7656 85.9136 40.6436 94.7943 40.6436 94.7943H35.6215Z" fill="#007E3A"/><path d="M52.8249 66.7085C58.1362 66.7085 62.4419 62.3971 62.4419 57.0788C62.4419 51.7606 58.1362 47.4492 52.8249 47.4492C47.5137 47.4492 43.208 51.7606 43.208 57.0788C43.208 62.3971 47.5137 66.7085 52.8249 66.7085Z" fill="#007E3A"/></g><defs><clipPath id="clip-badge-age"><rect width="159" height="182" fill="white"/></clipPath></defs></svg>`;

	const SVG_TIME = `<svg viewBox="0 0 159 182" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip-badge-time)"><path d="M3.04541 134.707V47.2379L79.5001 3.47656L156.008 47.2379V134.707L79.5001 178.468L3.04541 134.707Z" fill="white"/><path d="M79.5 7.00823L152.963 49.0041V132.942L79.5 174.938L6.09073 132.942V49.0041L79.5 7.00823ZM79.5 0L0 45.4732V136.473L79.5 181.946L159 136.473V45.4732L79.5 0Z" fill="#148246"/><path d="M79.5 4.65432L154.94 47.8272V134.119L79.5 177.292L4.06048 134.119V47.8272L79.5 4.65432ZM79.5 0L0 45.4732V136.473L79.5 181.946L159 136.473V45.4732L79.5 0Z" fill="white"/><path d="M80.0869 34.9414C53.2129 34.9414 31.4146 57.678 31.4146 85.7645H37.5053C37.5053 61.2089 56.5789 41.3077 80.0335 41.3077C103.488 41.3077 122.562 61.2089 122.562 85.7645H128.652C128.652 57.678 106.854 34.9414 79.9801 34.9414H80.0869Z" fill="#007E3A"/><path d="M87.1395 85.765H74.0498C74.0498 82.1272 76.9883 79.2383 80.568 79.2383C84.1476 79.2383 87.0861 82.1807 87.0861 85.765H87.1395Z" fill="#007E3A"/><path d="M81.6896 80.4686H79.7662C79.3922 80.4686 79.0182 80.2011 78.9648 79.7731L76.5605 62.7073C76.5605 62.7073 76.5605 62.5468 76.5605 62.4398L79.7662 45.267C79.9265 44.411 81.1553 44.411 81.3156 45.267L84.6281 62.3863C84.6281 62.3863 84.6281 62.5468 84.6281 62.6538L82.4376 79.7196C82.4376 80.0941 82.0636 80.4151 81.6362 80.4151L81.6896 80.4686Z" fill="#007E3A"/><path d="M79.1787 81.11L77.7896 82.5009C77.5224 82.7684 77.095 82.8219 76.8279 82.6614L65.0204 74.2623C65.0204 74.2623 64.9136 74.1553 64.8601 74.1018L56.9529 61.6367C56.5789 60.9948 57.4337 60.1388 58.0214 60.5133L70.5234 68.324C70.5234 68.324 70.6303 68.431 70.6837 68.4845L79.2321 80.147C79.4458 80.4145 79.339 80.8425 79.0718 81.11H79.1787Z" fill="#007E3A"/><path d="M99.4007 50.0704C99.6662 49.6098 99.5086 49.0208 99.0487 48.7549C98.5887 48.489 98.0005 48.6468 97.735 49.1074L93.6211 56.2423C93.3555 56.7029 93.5131 57.2918 93.9731 57.5577C94.433 57.8236 95.0212 57.6658 95.2868 57.2053L99.4007 50.0704Z" fill="#007E3A"/><path d="M113.449 65.2585C113.927 65.0271 114.128 64.4514 113.896 63.9725C113.665 63.4937 113.09 63.293 112.612 63.5244L105.204 67.1089C104.726 67.3403 104.525 67.916 104.756 68.3949C104.987 68.8737 105.562 69.0743 106.041 68.843L113.449 65.2585Z" fill="#007E3A"/><path d="M116.151 82.1251C116.682 82.1251 117.112 81.694 117.112 81.1622C117.112 80.6303 116.682 80.1992 116.151 80.1992H107.923C107.392 80.1992 106.961 80.6303 106.961 81.1622C106.961 81.694 107.392 82.1251 107.923 82.1251H116.151Z" fill="#007E3A"/><path d="M65.7284 57.1798C65.994 57.6404 66.5822 57.7982 67.0421 57.5323C67.5021 57.2663 67.6597 56.6774 67.3942 56.2168L63.2802 49.0819C63.0147 48.6213 62.4265 48.4635 61.9665 48.7295C61.5066 48.9954 61.349 49.5843 61.6145 50.0449L65.7284 57.1798Z" fill="#007E3A"/><path d="M55.0307 68.8308C55.5089 69.0621 56.0839 68.8615 56.315 68.3827C56.5461 67.9038 56.3457 67.328 55.8675 67.0967L48.4592 63.5122C47.981 63.2808 47.406 63.4815 47.1749 63.9603C46.9438 64.4392 47.1442 65.0149 47.6224 65.2463L55.0307 68.8308Z" fill="#007E3A"/><path d="M53.1062 82.1251C53.6373 82.1251 54.0679 81.694 54.0679 81.1622C54.0679 80.6304 53.6373 80.1992 53.1062 80.1992H44.8784C44.3472 80.1992 43.9167 80.6304 43.9167 81.1622C43.9167 81.694 44.3472 82.1251 44.8784 82.1251H53.1062Z" fill="#007E3A"/></g><defs><clipPath id="clip-badge-time"><rect width="159" height="182" fill="white"/></clipPath></defs></svg>`;

	const SVG_PLAYERS = `<svg viewBox="0 0 159 182" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip-badge-players)"><path d="M3.04541 134.707V47.2379L79.5001 3.47656L156.008 47.2379V134.707L79.5001 178.468L3.04541 134.707Z" fill="white"/><path d="M79.5 7.00823L152.963 49.0041V132.942L79.5 174.938L6.09073 132.942V49.0041L79.5 7.00823ZM79.5 0L0 45.4732V136.473L79.5 181.946L159 136.473V45.4732L79.5 0Z" fill="#148246"/><path d="M79.5 4.65432L154.94 47.8272V134.119L79.5 177.292L4.06048 134.119V47.8272L79.5 4.65432ZM79.5 0L0 45.4732V136.473L79.5 181.946L159 136.473V45.4732L79.5 0Z" fill="white"/><path d="M36.3311 77.8364C36.3311 77.8364 37.1859 61.5195 47.1234 51.9434C48.5125 50.6059 48.8331 53.8158 56.0458 54.1903C58.2363 54.2973 60.8542 53.7088 64.2736 51.5154C65.8764 50.499 72.6083 63.071 70.4712 64.6224L45.948 73.8776C45.948 73.8776 46.696 70.9352 46.8028 68.7418C46.8028 67.9393 46.1083 67.6183 45.4137 69.0092C44.2383 71.2027 44.0246 74.6265 44.0246 74.6265L36.3845 77.8364H36.3311Z" fill="#148246"/><path d="M122.723 77.8364C122.723 77.8364 121.868 61.5195 111.931 51.9434C110.542 50.6059 110.221 53.8158 103.008 54.1903C100.818 54.2973 98.2 53.7088 94.7806 51.5154C93.1778 50.499 86.4459 63.071 88.583 64.6224L113.106 73.8776C113.106 73.8776 112.358 70.9352 112.251 68.7418C112.251 67.9393 112.946 67.6183 113.64 69.0092C114.816 71.2027 115.03 74.6265 115.03 74.6265L122.67 77.8364H122.723Z" fill="#148246"/><path d="M56.6334 52.5315C62.9774 52.5315 68.1203 47.3818 68.1203 41.0294C68.1203 34.677 62.9774 29.5273 56.6334 29.5273C50.2893 29.5273 45.1465 34.677 45.1465 41.0294C45.1465 47.3818 50.2893 52.5315 56.6334 52.5315Z" fill="#148246"/><path d="M102.901 52.5315C109.245 52.5315 114.388 47.3818 114.388 41.0294C114.388 34.677 109.245 29.5273 102.901 29.5273C96.5574 29.5273 91.4146 34.677 91.4146 41.0294C91.4146 47.3818 96.5574 52.5315 102.901 52.5315Z" fill="#148246"/><path d="M43.1162 81.526L79.34 67.9375L115.457 81.526L79.2866 99.3408L43.1162 81.526Z" fill="#148246"/></g><defs><clipPath id="clip-badge-players"><rect width="159" height="182" fill="white"/></clipPath></defs></svg>`;

	// ── Exposed to parent via bind:this ───────────────────────────────────
	export function addUspFromPanel() { addUsp(); }
	export function triggerPhotoUpload() { panelFileInput?.click(); }
	export function addDataFieldFromPanel(column) { addDataField(column); }

	export function applyRefreshedFields(newFields) {
		if (!Array.isArray(newFields)) return;
		dataFields = newFields;
	}

	export function getTranslationCopyText() {
		const parts = [];
		if (productDescription?.trim()) {
			parts.push(`## Description\n${productDescription.trim()}`);
		}
		for (let i = 0; i < uspCount; i++) {
			const val = uspValues[i]?.trim();
			if (val) parts.push(`## Bullet ${i + 1}\n${val}`);
		}
		return parts.join('\n\n');
	}

	export async function applyTranslationPaste(text) {
		if (!text?.trim()) return;
		// Parse sections: ## <heading>\n<content>
		const sections = text.split(/\n(?=## )/);
		let newDesc = null;
		const newBullets = {};
		for (const section of sections) {
			const lines = section.trim().split('\n');
			const heading = lines[0]?.replace(/^## /, '').trim().toLowerCase();
			const content = lines.slice(1).join('\n').trim();
			if (!heading || !content) continue;
			if (heading === 'description') {
				newDesc = content;
			} else {
				const m = heading.match(/^bullet\s+(\d+)$/);
				if (m) newBullets[parseInt(m[1], 10)] = content;
			}
		}
		if (newDesc !== null) {
			productDescription = newDesc;
			localOverrides.product_description = true;
			await saveChange({ type: 'translation', language, key: 'product_description', value: newDesc });
		}
		for (const [num, val] of Object.entries(newBullets)) {
			const idx = parseInt(num, 10) - 1;
			if (idx < 0 || idx >= 6) continue;
			// Extend uspCount if needed
			if (idx >= uspCount) {
				uspCount = idx + 1;
				await saveChange({ type: 'sheet', field: 'usp_count', value: uspCount });
			}
			uspValues[idx] = val;
			const key = `usp_${idx + 1}`;
			localOverrides[key] = true;
			await saveChange({ type: 'translation', language, key, value: val });
		}
	}
</script>

<div class="sheet" class:editing={editable}>
	<img class="pattern-overlay" src="/pattern.png" alt="" aria-hidden="true" />

	<!-- Header: logo left, CTA right -->
	<div class="sheet-header">
		<img src={logoSrc} alt="Logo" class="sheet-logo" />
		{#if !hiddenElements.cta && (globalLabels['cta']?.[language] ?? globalLabels['cta']?.['en'])}
			<span class="sheet-cta">{globalLabels['cta']?.[language] ?? globalLabels['cta']?.['en']}</span>
		{/if}
	</div>

	<!-- TOP: box photo + product info -->
	<div class="top">
		<!-- Box photo + stock date tag -->
		<div class="box-col">
			<div class="box-frame">
			<div class="box-area" class:no-padding={boxImageHasPadding}>
				{#if boxImageKey}
					<img
						src="/api/img/{boxImageKey}"
						alt="Product box"
						class="box-img"
						onload={(e) => detectBoxPadding(e.currentTarget.src)}
					/>
					{#if editable}
						<button class="replace-box" onclick={() => boxFileInput.click()}>Replace photo</button>
					{/if}
				{:else if editable}
					<button class="upload-box" onclick={() => boxFileInput.click()}>
						<span class="upload-icon">
							<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
								<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
								<circle cx="12" cy="13" r="4"/>
							</svg>
						</span>
						<span>Upload box photo</span>
					</button>
				{:else}
					<div class="box-placeholder">📦</div>
				{/if}
			</div>

			<!-- ATA badges: absolutely positioned on left edge of box frame -->
			{#if !hiddenElements.badges}
			<div class="badges-side">
				<div class="badge-hex-wrap">
					{@html SVG_AGE}
					<span
						class="badge-val"
						contenteditable="plaintext-only"
						bind:textContent={dataFields[ageIdx].value}
						onblur={() => blurDataField(ageIdx, 'value')}
						onkeydown={onKeyDown}
						data-placeholder="–"
					></span>
				</div>
				<div class="badge-hex-wrap">
					{@html SVG_TIME}
					<span
						class="badge-val"
						contenteditable="plaintext-only"
						bind:textContent={dataFields[timeIdx].value}
						onblur={() => blurDataField(timeIdx, 'value')}
						onkeydown={onKeyDown}
						data-placeholder="–"
					></span>
				</div>
				<div class="badge-hex-wrap">
					{@html SVG_PLAYERS}
					<span
						class="badge-val"
						contenteditable="plaintext-only"
						bind:textContent={dataFields[playersIdx].value}
						onblur={() => blurDataField(playersIdx, 'value')}
						onkeydown={onKeyDown}
						data-placeholder="–"
					></span>
				</div>
			</div>
			{/if}
			</div><!-- end box-frame -->

			<!-- Est. stock date tag -->
			{#if stockDateIdx >= 0 && !hiddenElements.stock_date}
				<div class="stock-tag-wrap">
					<div class="stock-tag" class:editing-tag={editable}>
						<span class="stock-tag-label">{globalLabels['stock_date']?.[language] ?? globalLabels['stock_date']?.['en'] ?? 'Est. Stock Date'}</span>
						<span
							class="stock-tag-value"
							contenteditable="plaintext-only"
							bind:textContent={dataFields[stockDateIdx].value}
							onblur={() => blurDataField(stockDateIdx, 'value')}
							onkeydown={onKeyDown}
							data-placeholder="—"
						></span>
					</div>
				</div>
			{/if}
		</div>

		<!-- Product info -->
		<div class="info">
			<!-- Product name -->
			<h1
				class="product-name"
				class:inherited={editable && language !== primaryLanguage && !translations['product_name'] && !localOverrides['product_name']}
				contenteditable="plaintext-only"
				bind:textContent={productName}
				onblur={blurProductName}
				onkeydown={onKeyDown}
				data-placeholder="Product Name"
			></h1>

			<!-- Short description -->
			{#if !hiddenElements.description}
			<p
				class="product-description"
				class:inherited={editable && language !== primaryLanguage && !translations['product_description'] && !localOverrides['product_description']}
				contenteditable="plaintext-only"
				bind:textContent={productDescription}
				onblur={blurProductDescription}
				data-placeholder="Add a short description…"
			></p>
			{/if}

			<!-- USPs -->
			{#if !hiddenElements.bullets}
			<div class="usps-section">
				<ul class="usps">
					{#each Array.from({ length: uspCount }, (_, i) => i) as i (i)}
						<li class="usp-item">
							<svg class="bullet" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M3 8.5L6.5 12L13 4.5" stroke="#F57832" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
							<span
								class="usp-text"
								class:inherited={isInherited(`usp_${i + 1}`)}
								contenteditable="plaintext-only"
								bind:textContent={uspValues[i]}
								onblur={() => blurUsp(i + 1)}
								onkeydown={onKeyDown}
								data-placeholder="Add a key feature…"
							></span>
							{#if editable}
								<button class="remove-usp" onclick={() => removeUsp(i + 1)} title="Remove">✕</button>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
			{/if}

		</div>
	</div>

	<!-- BOTTOM: image grid (hidden in preview when no images) -->
	{#if editable || gridImages.length > 0}
		<div class="bottom">
			<ImageGrid
				images={gridImages}
				{editable}
				onimageadd={handleGridImageAdd}
				onimagedelete={handleGridImageDelete}
				onimagecrop={handleGridImageCrop}
				onimagesreorder={handleGridImageReorder}
			/>
		</div>
	{:else}
		<div class="bottom-spacer"></div>
	{/if}

	<!-- DATA BOTTOM: two-column table below image grid -->
	{#if !hiddenElements.data}
	<div class="data-bottom">
		<div class="data-cols">
			<table class="data-table">
				<tbody>
				{#each dataColLeft as field}
					{@const globalLabel = globalLabels[field.key]?.[language] ?? globalLabels[field.key]?.['en']}
					<tr class="data-row" class:editable>
						<td class="data-label">
							{#if globalLabel !== undefined}
								<span>{globalLabel}</span>
							{:else}
								<span contenteditable="plaintext-only" bind:textContent={dataFields[field._i].label} onblur={() => blurDataField(field._i, 'label')} onkeydown={onKeyDown}></span>
							{/if}
						</td>
						<td class="data-value">
							<span contenteditable="plaintext-only" bind:textContent={dataFields[field._i].value} onblur={() => blurDataField(field._i, 'value')} onkeydown={onKeyDown} data-placeholder="—"></span>
						</td>
						{#if editable}
							<td class="data-del"><button onclick={() => removeDataField(field._i)} title="Remove field">✕</button></td>
						{/if}
					</tr>
				{/each}
				</tbody>
			</table>
			<table class="data-table">
				<tbody>
				{#each dataColRight as field}
					{@const globalLabel = globalLabels[field.key]?.[language] ?? globalLabels[field.key]?.['en']}
					<tr class="data-row" class:editable>
						<td class="data-label">
							{#if globalLabel !== undefined}
								<span>{globalLabel}</span>
							{:else}
								<span contenteditable="plaintext-only" bind:textContent={dataFields[field._i].label} onblur={() => blurDataField(field._i, 'label')} onkeydown={onKeyDown}></span>
							{/if}
						</td>
						<td class="data-value">
							<span contenteditable="plaintext-only" bind:textContent={dataFields[field._i].value} onblur={() => blurDataField(field._i, 'value')} onkeydown={onKeyDown} data-placeholder="—"></span>
						</td>
						{#if editable}
							<td class="data-del"><button onclick={() => removeDataField(field._i)} title="Remove field">✕</button></td>
						{/if}
					</tr>
				{/each}
				</tbody>
			</table>
		</div>
	</div>
	{/if}
</div>

{#if editable}
	<input bind:this={boxFileInput} type="file" accept="image/*" onchange={handleBoxUpload} style="display:none" />
	<input bind:this={panelFileInput} type="file" accept="image/*" multiple onchange={handlePanelPhotoUpload} style="display:none" />
{/if}

<style>
	.sheet {
		background: #FFF5D2;
		position: relative;
		width: 794px;
		height: 1123px;
		overflow: hidden;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.14);
		display: flex;
		flex-direction: column;
		font-family: 'Nunito', sans-serif;
	}

	/* Pattern background overlay */
	.pattern-overlay {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0.15;
		pointer-events: none;
		z-index: 0;
	}

	/* All direct content sits above the overlay */
	.sheet-header, .top, .bottom {
		position: relative;
		z-index: 1;
	}

	.sheet-header {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 38px 48px 4px;
	}

	.sheet-logo {
		max-height: 50px;
		max-width: 60%;
		object-fit: contain;
		display: block;
	}

	.sheet-cta {
		font-size: 23px;
		font-weight: 600;
		color: #FFF5D2;
		background: #F57832;
		white-space: nowrap;
		padding: 9px 48px 9px 22px;
		margin-right: -48px; /* bleed to the right edge of the sheet */
		border-radius: 100px 0 0 100px;
		box-shadow: 0 16px 56px rgba(0, 0, 0, 0.10);
	}

	/* TOP */
	.top {
		display: grid;
		grid-template-columns: 1fr 1fr;
		padding: 40px;
		gap: 40px;
		min-height: 420px;
	}

	/* Box column: box photo with stock-date tag overlapping the bottom edge */
	.box-col {
		display: flex;
		flex-direction: column;
	}

	.box-area {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: white;
		border-radius: 24px;
		box-shadow: 0 16px 56px rgba(0, 0, 0, 0.10);
		padding: 20px;
		position: relative;
		aspect-ratio: 1 / 1;
		overflow: hidden;
		width: 100%;
	}

	/* Stock date tag — overlaps the bottom of the box frame */
	.stock-tag-wrap {
		display: flex;
		justify-content: center;
		margin-top: -15px; /* pull up so tag half-overlaps the box */
		position: relative;
		z-index: 2;
	}

	.stock-tag {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: #F57832;
		border-radius: 100px;
		padding: 6px 16px;
		font-size: 11.5px;
		box-shadow: 0 4px 14px rgba(245, 120, 50, 0.45);
		white-space: nowrap;
	}

	.stock-tag-label {
		font-weight: 700;
		color: rgba(255, 255, 255, 0.85);
		letter-spacing: 0.1px;
	}

	.stock-tag-value {
		outline: none;
		min-width: 16px;
		color: white;
		font-weight: 700;
	}

	.stock-tag-value:empty::before {
		content: attr(data-placeholder);
		color: rgba(255, 255, 255, 0.5);
	}

	.editing-tag .stock-tag-value:focus {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
		padding: 0 3px;
	}

	.box-area.no-padding { padding: 0; }

	.box-img { width: 100%; height: 100%; object-fit: contain; }
	.box-placeholder { font-size: 72px; opacity: 0.15; }

	.upload-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		background: none;
		border: 1.5px dashed #D4CFC5;
		border-radius: 16px;
		width: 100%;
		height: 100%;
		cursor: pointer;
		color: #A1A1AA;
		font-size: 12.5px;
		font-weight: 600;
		transition: border-color 0.15s, color 0.15s;
	}
	.upload-box:hover { border-color: #71717A; color: #52525B; }

	.upload-icon {
		width: 48px;
		height: 48px;
		background: #F4F4F5;
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #71717A;
		transition: background 0.15s;
	}
	.upload-box:hover .upload-icon { background: #E4E4E7; }

	.replace-box {
		position: absolute;
		bottom: 10px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(0,0,0,0.55);
		color: white;
		border: none;
		border-radius: 100px;
		padding: 5px 13px;
		font-size: 11.5px;
		font-weight: 600;
		letter-spacing: 0.1px;
		opacity: 0;
		transition: opacity 0.18s;
		white-space: nowrap;
		backdrop-filter: blur(4px);
	}
	.box-area:hover .replace-box { opacity: 1; }

	/* Product info */
	.info {
		display: flex;
		flex-direction: column;
		gap: 20px;
		justify-content: flex-start;
		padding-top: 8px;
	}

	/* Non-editing: disable interaction on contenteditable elements */
	.sheet:not(.editing) [contenteditable] {
		pointer-events: none;
		cursor: default;
		-webkit-user-modify: read-only;
	}

	/* ── Inheritance: grey for inherited, black for owned ── */
	.inherited {
		color: #b0b7c3 !important;
	}

	/* Product name */
	.product-name {
		font-size: 26px;
		font-weight: 800;
		line-height: 1.2;
		letter-spacing: -0.5px;
		outline: none;
		color: #111827;
		min-height: 1.2em;
		margin-bottom: 0;
	}
	.product-name:empty::before {
		content: attr(data-placeholder);
		color: #d1d5db;
		font-weight: 800;
	}
	.editing .product-name:focus {
		background: #eff6ff;
		border-radius: 3px;
		padding: 2px 4px;
		margin: -2px -4px;
	}

	/* Product description */
	.product-description {
		font-size: 15px;
		font-weight: 500;
		color: #374151;
		line-height: 1.5;
		outline: none;
		min-height: 1em;
		margin-top: 0;
		margin-bottom: 4px;
	}
	.product-description:empty::before {
		content: attr(data-placeholder);
		color: #d1d5db;
	}
	.editing .product-description:focus {
		background: #eff6ff;
		border-radius: 3px;
		padding: 2px 4px;
		margin-left: -4px;
	}

	/* USPs */
	.usps { list-style: none; display: flex; flex-direction: column; gap: 6px; }

	.usp-item {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		line-height: 1.4;
		position: relative;
	}

	.bullet { flex-shrink: 0; display: block; }

	.usp-text {
		flex: 1;
		font-size: 17px;
		outline: none;
		color: #374151;
		min-height: 1.4em;
	}
	.usp-text:empty::before {
		content: attr(data-placeholder);
		color: #d1d5db;
	}
	.editing .usp-text:focus { background: #eff6ff; border-radius: 3px; }

	.remove-usp {
		background: none;
		border: none;
		color: #d1d5db;
		font-size: 11px;
		padding: 2px;
		opacity: 0;
		transition: opacity 0.15s, color 0.15s;
	}
	.usp-item:hover .remove-usp { opacity: 1; }
	.remove-usp:hover { color: var(--danger); }

	.add-usp {
		background: none;
		border: none;
		color: #9ca3af;
		font-size: 12px;
		padding: 4px 0;
		text-align: left;
		transition: color 0.15s;
	}
	.add-usp:hover { color: var(--accent); }

	/* Data bottom */
	.data-bottom {
		background: white;
		border-radius: 24px;
		box-shadow: 0 16px 56px rgba(0, 0, 0, 0.10);
		margin: 40px 40px 40px;
		padding: 18px 24px;
		position: relative;
		z-index: 1;
	}

	.data-cols {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 32px;
	}

	.data-table { width: 100%; border-collapse: collapse; }

	.data-row td { padding: 6px 0; font-size: 13px; vertical-align: middle; }
	.data-row:not(:last-child) td { border-bottom: 1px solid #FFE6A5; }

	.data-label { width: 38%; color: #6b7280; font-weight: 500; padding-right: 12px; }
	.data-label span, .data-value span { outline: none; display: block; }

	.data-value {
		color: #111827;
		font-weight: 600;
		font-family: 'Nunito', sans-serif;
		font-size: 13px;
	}
	.data-value span:empty::before {
		content: attr(data-placeholder);
		color: #d1d5db;
		font-family: inherit;
	}
	.editing .data-label span:focus,
	.editing .data-value span:focus { background: #eff6ff; border-radius: 3px; }

	.data-del { width: 24px; }
	.data-del button {
		background: none;
		border: none;
		color: #d1d5db;
		font-size: 11px;
		opacity: 0;
		transition: opacity 0.15s, color 0.15s;
	}
	.data-row:hover .data-del button { opacity: 1; }
	.data-del button:hover { color: var(--danger); }

	.add-field {
		background: none;
		border: none;
		color: #9ca3af;
		font-size: 12px;
		padding: 6px 0;
		transition: color 0.15s;
	}
	.add-field:hover { color: var(--accent); }

	/* Box frame: wraps box-area so badges can be absolutely positioned outside the overflow:hidden box */
	.box-frame {
		position: relative;
		width: 100%;
	}

	/* ATA badges: vertical column on the left edge of the box frame */
	.badges-side {
		position: absolute;
		left: 0;
		top: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		gap: 8px;
		z-index: 3;
		align-items: center;
	}

	.badge-hex-wrap {
		position: relative;
		width: 57px; /* 65px height × 159/182 ≈ 57px */
		flex-shrink: 0;
	}

	.badge-hex-wrap :global(svg) {
		width: 100%;
		height: auto;
		display: block;
	}

	.badge-val {
		position: absolute;
		left: 50%;
		bottom: 13px;
		transform: translateX(-50%);
		font-size: 14px;
		font-weight: 400;
		color: #007E3A;
		text-align: center;
		outline: none;
		min-width: 16px;
		white-space: nowrap;
		font-family: 'Nunito', sans-serif;
		line-height: 1;
	}

	.badge-val:empty::before {
		content: attr(data-placeholder);
		color: rgba(0,126,58,0.3);
	}

	.editing .badge-val:focus {
		background: rgba(0,126,58,0.08);
		border-radius: 3px;
		padding: 1px 4px;
	}

	/* BOTTOM: image grid */
	.bottom {
		flex: 1;
		min-height: 0;
		position: relative;
		overflow: hidden;
		padding: 0 40px;
	}

	.bottom-spacer {
		flex: 1;
		min-height: 0;
	}
</style>
