<script>
	import RelationsCard from '$lib/components/RelationsCard.svelte';
	import ProductLanguagePicker from '$lib/components/ProductLanguagePicker.svelte';
	import { MARKETS, MARKET_LABEL, MARKET_LANG, langInfo, langShort } from '$lib/languages.js';
	import { invalidateAll } from '$app/navigation';
	import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';
	import BoxCropper from '$lib/components/BoxCropper.svelte';
	import FlatCropper from '$lib/components/FlatCropper.svelte';
	import MarketAvailability from '$lib/components/MarketAvailability.svelte';

	let { data } = $props();

	const sheetId = $derived(data.sheet.id);

	// MarkdownEditor's `value` is `$bindable('')` (has a fallback), so binding
	// `undefined` to it throws Svelte's `props_invalid_value`. Translation objects
	// omit keys that have no value yet, so guarantee every bound key is a string.
	const normT = (src) => {
		const o = { ...src };
		if (typeof o.long_description !== 'string') o.long_description = '';
		return o;
	};
	let language = $state(data.language);
	// Save indicator: 'saving' while requests are out, 'saved' only when the
	// server said so, 'error' (with the reason) when a save was refused or failed.
	let saveStatus = $state('saved');
	let saveError = $state('');
	let saveTimer = null;
	let savesOut = 0, saveFailed = false;
	function flashSaved() {
		if (saveStatus === 'error') return; // never paper over a failed save
		saveStatus = 'saving'; clearTimeout(saveTimer);
		saveTimer = setTimeout(() => { if (saveStatus === 'saving' && !savesOut) saveStatus = 'saved'; }, 900);
	}
	/** PUT to the sheet API and reflect the real outcome in the indicator. @returns {Promise<boolean>} */
	async function save(body) {
		if (!savesOut) saveFailed = false;
		savesOut++; saveStatus = 'saving';
		let ok = false;
		try {
			const res = await fetch(`/api/sheets/${sheetId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
			if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Error ${res.status}`);
			ok = true;
		} catch (e) {
			saveFailed = true;
			saveError = e instanceof TypeError ? 'No connection' : (e instanceof Error ? e.message : 'Save failed');
		}
		savesOut--;
		if (!savesOut) saveStatus = saveFailed ? 'error' : 'saved';
		return ok;
	}

	// ── Per-language text (re-loaded on language switch) ───────────────────────
	let t = $state(normT(data.translations));

	// Product name comes from Rackbeat (hourly sync, same in every language) — read-only here.
	let name = $state(data.baseTranslations?.product_name ?? data.translations?.product_name ?? '');

	async function switchLanguage(code) {
		if (code === language) return;
		// Only switch once the texts are loaded — showing empty fields for a
		// language that failed to load would invite overwriting its texts.
		let res;
		try { res = await fetch(`/api/sheets/${sheetId}?lang=${code}`); } catch { res = null; }
		if (!res?.ok) { saveStatus = 'error'; saveError = `could not load the ${langInfo(code).english} texts`; return; }
		if (saveStatus === 'error' && !savesOut) saveStatus = 'saved';
		t = normT(await res.json());
		language = code;
	}

	async function putTranslation(key, value) {
		t = { ...t, [key]: value };
		await save({ type: 'translation', language, key, value: value ?? '' });
	}
	async function putSheet(field, value) {
		await save({ type: 'sheet', field, value });
	}

	// ── Bullets (usp_1..usp_count) ─────────────────────────────────────────────
	function usp(i) { return t[`usp_${i + 1}`] ?? ''; }

	// Always three bullet fields — fill in none, some or all; empty ones are left off the sheet.
	const BULLETS = [0, 1, 2];

	// ── Copy / paste all universal text (for translation) ──────────────────────
	// Unique {#…} markers so they never collide with Markdown '#' headers.
	let copyMsg = $state('');
	let pasteMsg = $state('');
	function buildExport() {
		const out = ['{#Description}', (t.product_description ?? '').trim(), ''];
		for (const i of BULLETS) out.push(`{#Bullet ${i + 1}}`, (usp(i) ?? '').trim(), '');
		out.push('{#Long description}', (t.long_description ?? '').trim());
		return out.join('\n');
	}
	function parseExport(text) {
		const sections = [];
		let name = null; const buf = [];
		const flush = () => { if (name !== null) sections.push([name, buf.join('\n').trim()]); buf.length = 0; };
		for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
			const m = raw.match(/^\{#\s*(.+?)\s*\}\s*$/);
			if (m) { flush(); name = m[1]; } else if (name !== null) buf.push(raw);
		}
		flush();
		return sections;
	}
	async function copyUniversal() {
		try { await navigator.clipboard.writeText(buildExport()); copyMsg = 'Copied!'; }
		catch { copyMsg = 'Failed'; }
		setTimeout(() => (copyMsg = ''), 2000);
	}
	async function pasteUniversal() {
		let text;
		try { text = await navigator.clipboard.readText(); } catch { pasteMsg = 'Failed'; setTimeout(() => (pasteMsg = ''), 2000); return; }
		if (!text?.trim()) { pasteMsg = 'Clipboard empty'; setTimeout(() => (pasteMsg = ''), 2000); return; }
		for (const [secName, content] of parseExport(text)) {
			const low = secName.toLowerCase();
			if (low === 'description') await putTranslation('product_description', content);
			else if (low === 'long description') await putTranslation('long_description', content);
			else { const m = low.match(/^bullet\s+(\d+)$/); if (m) { const n = +m[1]; if (n >= 1 && n <= BULLETS.length) await putTranslation(`usp_${n}`, content); } }
		}
		pasteMsg = 'Pasted!'; setTimeout(() => (pasteMsg = ''), 2000);
	}

	// ── Basic product info (data_fields, shared across languages) ──────────────
	let dataFields = $state(JSON.parse(data.sheet.data_fields || '[]'));
	const STOCK_KEY = 'stock_date';
	const infoFields = $derived(dataFields.filter((f) => f.key !== STOCK_KEY));
	const stockIdx = $derived(dataFields.findIndex((f) => f.key === STOCK_KEY));
	function fieldLabel(f) { return data.globalLabels?.[f.key]?.[language] ?? data.globalLabels?.[f.key]?.en ?? f.label ?? f.key; }
	async function saveDataFields() { flashSaved(); await putSheet('data_fields', JSON.stringify(dataFields)); }

	// ── Game attributes (editable → written back to Rackbeat) ──────────────────
	// Identity/dimension fields are read-only here: correct them in Rackbeat and
	// re-sync. Age / Time / Players stay editable and push back to Rackbeat.
	// Rackbeat stock (read-only, synced hourly onto the sheet by the worker).
	const rbHas = $derived(data.sheet.rb_available != null || data.sheet.rb_stock != null);
	const rbN = (v) => (v == null ? '—' : Number(v).toLocaleString('da-DK'));
	const rbAsOf = $derived.by(() => {
		const t = data.stockMeta?.as_of;
		if (!t) return '';
		const d = new Date(t);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	});

	const RO_KEYS = ['sku', 'ean', 'weight', 'height', 'width', 'depth'];
	const GAME_KEYS = ['age', 'time', 'players', 'pieces'];
	const digits = (s) => (String(s ?? '').match(/\d+/g) ?? []);

	let ageVal   = $state('');
	let timeFrom = $state(''); let timeTo = $state('');
	let playFrom = $state(''); let playTo = $state('');
	let piecesVal = $state('');
	let rbMsg = $state(''); let rbErr = $state('');

	function initGameAttrs() {
		const get = (k) => dataFields.find((f) => f.key === k)?.value ?? '';
		ageVal = digits(get('age'))[0] ?? '';
		const tn = digits(get('time'));   timeFrom = tn[0] ?? ''; timeTo = tn[1] ?? '';
		const pn = digits(get('players')); playFrom = pn[0] ?? ''; playTo = pn[1] ?? '';
		piecesVal = digits(get('pieces'))[0] ?? '';
	}
	initGameAttrs();

	const onlyDigits = (v) => String(v ?? '').replace(/[^0-9]/g, '');
	function rangeOk(from, to) {
		const a = (from ?? '').trim(), b = (to ?? '').trim();
		if (!a || !b) return true;
		return Number(b) >= Number(a);
	}
	// "60-90" | "75" (single when only one / both equal) | "" (empty)
	function combineRange(from, to) {
		const a = (from ?? '').trim(), b = (to ?? '').trim();
		if (!a) return b;
		if (!b || a === b) return a;
		return `${a}-${b}`;
	}
	function setDataField(key, value) {
		const i = dataFields.findIndex((f) => f.key === key);
		if (i >= 0) dataFields[i] = { ...dataFields[i], value };
		else dataFields = [...dataFields, { key, label: key, value }];
	}
	async function pushRackbeat(values) {
		rbMsg = 'Syncing…';
		try {
			const res = await fetch(`/api/sheets/${sheetId}/rackbeat-fields`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values })
			});
			const body = await res.json().catch(() => ({}));
			rbMsg = !res.ok ? `Saved in Portal — Rackbeat sync failed${body?.message ? `: ${body.message}` : ''}`
				: body?.skipped ? `Saved in Portal only — ${body.skipped}`
				: 'Synced to Rackbeat';
		} catch { rbMsg = 'Saved in Portal — Rackbeat sync failed'; }
		setTimeout(() => (rbMsg = ''), rbMsg === 'Synced to Rackbeat' ? 2800 : 6000);
	}
	async function saveAge() {
		rbErr = '';
		const v = onlyDigits(ageVal); ageVal = v;
		setDataField('age', v);
		await saveDataFields();
		await pushRackbeat({ 'age-minimum': v });
	}
	async function saveTime() {
		if (!rangeOk(timeFrom, timeTo)) { rbErr = 'Time: "to" can’t be lower than "from".'; return; }
		rbErr = '';
		const rb = combineRange(timeFrom, timeTo);
		setDataField('time', rb ? `${rb}'` : '');
		await saveDataFields();
		await pushRackbeat({ 'duration': rb });
	}
	async function savePlayers() {
		if (!rangeOk(playFrom, playTo)) { rbErr = 'Players: "to" can’t be lower than "from".'; return; }
		rbErr = '';
		setDataField('players', combineRange(playFrom, playTo));
		await saveDataFields();
		await pushRackbeat({ 'player-count-minimum': (playFrom ?? '').trim(), 'player-count-maximum': (playTo ?? '').trim() });
	}
	async function savePieces() {
		rbErr = '';
		const v = onlyDigits(piecesVal); piecesVal = v;
		setDataField('pieces', v);
		await saveDataFields();
		await pushRackbeat({ pieces: v });
	}
	function gLabel(key, fallback) {
		const f = dataFields.find((x) => x.key === key);
		if (f) return fieldLabel(f);
		return data.globalLabels?.[key]?.[language] ?? data.globalLabels?.[key]?.en ?? fallback;
	}

	// ── Category tagging (SALES_DB taxonomy; multi-select per group) ────────────
	let selectedCats = $state(new Set(data.categorySelected ?? []));
	let catOpen = $state({});
	let catMsg = $state('');
	function catLabel(labels) {
		return labels?.[language] ?? labels?.en ?? labels?.da ?? Object.values(labels ?? {})[0] ?? '(unnamed)';
	}
	function groupSelNames(g) { return g.categories.filter((c) => selectedCats.has(c.id)).map((c) => catLabel(c.labels)); }
	async function saveCats() {
		catMsg = 'Saving…';
		try {
			const res = await fetch(`/api/sheets/${sheetId}/categories`, {
				method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ categoryIds: [...selectedCats] })
			});
			catMsg = res.ok ? 'Saved' : 'Save failed';
		} catch { catMsg = 'Save failed'; }
		setTimeout(() => (catMsg = ''), 2000);
	}
	async function toggleCat(id) {
		if (selectedCats.has(id)) selectedCats.delete(id); else selectedCats.add(id);
		selectedCats = new Set(selectedCats);
		await saveCats();
	}

	// ── Webshop published markets (per-market, gated by publisher licence) ──────
	// Two states: the product FOLLOWS its publisher's licence (the default — it is
	// published wherever the publisher is licensed, now and after later licence
	// changes), or it has a CUSTOM selection of markets.
	const WS_MARKETS = data.webshopMarkets ?? MARKETS;
	const wsAllowed = $derived(new Set(data.webshopAllowed ?? []));
	let wsFollows = $state(data.webshopPublished == null);
	let wsOverride = $state(data.webshopPublished != null && !!data.webshopOverride);
	let wsPublished = $state(new Set(data.webshopPublished ?? data.webshopAllowed ?? []));
	let wsChanged = $state({ by: data.webshopUpdatedBy ?? null, at: data.webshopUpdatedAt ?? null });
	let wsMsg = $state('');
	let wsSaving = false;
	function wsReset() {
		wsFollows = data.webshopPublished == null;
		wsOverride = data.webshopPublished != null && !!data.webshopOverride;
		wsPublished = new Set(data.webshopPublished ?? data.webshopAllowed ?? []);
		wsChanged = { by: data.webshopUpdatedBy ?? null, at: data.webshopUpdatedAt ?? null };
		wsMsg = '';
	}
	const wsEnabled = (m) => wsOverride || wsAllowed.has(m);
	const wsChecked = (m) => (wsFollows ? wsAllowed.has(m) : wsPublished.has(m) && (wsOverride || wsAllowed.has(m)));
	// A published market whose language has no texts yet (live for the language being edited).
	const wsHasTexts = (lang) => (lang === language
		? !!(t.product_description?.trim() || Object.entries(t).some(([k, v]) => k.startsWith('usp_') && String(v ?? '').trim()))
		: (data.textLangs ?? []).includes(lang));
	const wsMissingTexts = $derived(WS_MARKETS.filter((m) => wsChecked(m) && !wsHasTexts(MARKET_LANG[m])));

	/** Save a new state; on failure the box goes back to what is actually stored. */
	async function saveWebshop(next) {
		if (wsSaving) return; // one change at a time, so two quick clicks can't cross
		const prev = { follows: wsFollows, override: wsOverride, published: new Set(wsPublished) };
		wsFollows = next.follows; wsOverride = next.override; wsPublished = next.published;
		wsSaving = true; wsMsg = 'Saving…';
		try {
			const res = await fetch(`/api/sheets/${sheetId}/webshop`, {
				method: 'PUT', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ publishedMarkets: next.follows ? null : [...next.published], overrideLicense: next.override })
			});
			if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Error ${res.status}`);
			wsChanged = { by: data.user?.email ?? null, at: new Date().toISOString() };
			wsMsg = 'Saved';
			setTimeout(() => { if (wsMsg === 'Saved') wsMsg = ''; }, 2000);
		} catch (e) {
			wsFollows = prev.follows; wsOverride = prev.override; wsPublished = prev.published;
			wsMsg = `Not saved — ${e instanceof Error ? e.message : 'try again'}`;
		} finally { wsSaving = false; }
	}
	function toggleMarket(m) {
		if (!wsEnabled(m)) return;
		// Start from what is ticked on screen, so a market hidden by the licence can't come back unnoticed.
		const next = new Set(WS_MARKETS.filter(wsChecked));
		if (next.has(m)) next.delete(m); else next.add(m);
		saveWebshop({ follows: false, override: wsOverride, published: next });
	}
	function toggleOverride() {
		if (!wsOverride) {
			if (!confirm('Override the publisher licence?\n\nThis lets you publish this product in markets the publisher is not licensed for.')) return;
			saveWebshop({ follows: false, override: true, published: new Set(WS_MARKETS.filter(wsChecked)) });
		} else {
			saveWebshop({ follows: false, override: false, published: new Set([...wsPublished].filter((m) => wsAllowed.has(m))) }); // back to licence rules
		}
	}
	function followLicence() {
		saveWebshop({ follows: true, override: false, published: new Set(data.webshopAllowed ?? []) });
	}

	// ── Webshop dates (preorder / restock) ──────────────────────────────────────
	let preorderDate = $state(data.sheet.preorder_date ?? '');
	let restockDate = $state(data.sheet.restock_date ?? '');
	const ymd = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
	// N calendar days from today, bumped to Monday if it lands on a weekend.
	function fromNow(days) {
		const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + days);
		const w = d.getDay();
		if (w === 6) d.setDate(d.getDate() + 2); else if (w === 0) d.setDate(d.getDate() + 1);
		return ymd(d);
	}
	function setPreorder(v) { preorderDate = v; putSheet('preorder_date', v || null); }
	function setRestock(v) { restockDate = v; putSheet('restock_date', v || null); }

	// ★ Featured in the webshop ("Featured Products"), saved instantly.
	let featured = $state(!!data.sheet.featured_at);
	let featBusy = $state(false);
	async function toggleFeatured() {
		if (featBusy) return;
		featBusy = true;
		const next = !featured; featured = next;
		try {
			const res = await fetch(`/api/sheets/${sheetId}/featured`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ featured: next }) });
			if (!res.ok) throw new Error();
		} catch { featured = !next; alert('Couldn’t update Featured — try again.'); }
		featBusy = false;
	}

	let refreshing = $state(false);
	let refreshMsg = $state('');
	let refreshTip = $state('');
	async function refreshFromRackbeat() {
		if (refreshing) return;
		refreshing = true; refreshMsg = '';
		try {
			const res = await fetch(`/api/sheets/${sheetId}/refresh`, { method: 'POST' });
			if (res.ok) { const b = await res.json(); if (Array.isArray(b.data_fields)) { dataFields = b.data_fields; initGameAttrs(); } if (b.product_name) { name = b.product_name; t = { ...t, product_name: b.product_name }; } refreshMsg = 'Updated'; refreshTip = ''; }
			else {
				const b = await res.json().catch(() => ({}));
				refreshMsg = res.status === 404 ? 'Not in Rackbeat' : res.status === 502 ? 'Rackbeat busy' : 'Failed';
				refreshTip = b?.message ?? '';
			}
		} catch { refreshMsg = 'Failed'; refreshTip = 'No connection — check your network and try again.'; }
		refreshing = false;
		setTimeout(() => { refreshMsg = ''; refreshTip = ''; }, refreshMsg === 'Updated' ? 2500 : 6000);
	}

	// ── Videos & articles (local state; markets null = all markets) ─────────────
	const pm = (m) => (m == null ? null : (typeof m === 'string' ? (() => { try { return JSON.parse(m); } catch { return null; } })() : m));
	const normList = (list) => (list ?? []).map((x) => ({ ...x, markets: pm(x.markets) }));

	const YT_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
	let vids = $state(normList(data.videos));
	let videoUrl = $state('');
	let videoOrient = $state('auto'); // 'auto' | '16:9' | '9:16'
	let videoErr = $state('');
	async function addVideo() {
		const url = videoUrl.trim();
		if (!YT_RE.test(url)) { videoErr = 'Not a valid YouTube URL'; return; }
		videoErr = '';
		const orientation = videoOrient === 'auto' ? undefined : videoOrient;
		const res = await fetch(`/api/sheets/${sheetId}/videos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, orientation }) });
		videoUrl = ''; videoOrient = 'auto';
		if (res.ok) { const b = await res.json(); vids = normList(b.videos); }
		flashSaved();
	}
	async function removeVideo(id) {
		const res = await fetch(`/api/sheets/${sheetId}/videos?videoId=${id}`, { method: 'DELETE' });
		if (res.ok) { const b = await res.json(); vids = normList(b.videos); }
		flashSaved();
	}
	function setVideoMkts(id, markets) {
		vids = vids.map((v) => (v.id === id ? { ...v, markets } : v));
		fetch(`/api/sheets/${sheetId}/videos`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId: id, markets }) });
		flashSaved();
	}
	const ytId = (u) => (u.match(YT_RE)?.[1] ?? null);

	// ── Articles (visual link cards) ─────────────────────────────────────────────
	let arts = $state(normList(data.articles));
	let articleUrl = $state('');
	let articleErr = $state('');
	let articleInfo = $state('');
	let articleAdding = $state(false);
	async function addArticle() {
		const url = articleUrl.trim();
		if (!/^https?:\/\//i.test(url)) { articleErr = 'Enter a full URL (https://…)'; return; }
		articleErr = ''; articleInfo = ''; articleAdding = true;
		try {
			const res = await fetch(`/api/sheets/${sheetId}/articles`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
			if (!res.ok) throw new Error('Could not fetch that page');
			const b = await res.json(); arts = normList(b.articles); articleUrl = ''; flashSaved();
			if (b.message) { articleInfo = b.message; setTimeout(() => (articleInfo = ''), 6000); }
		} catch (e) { articleErr = e.message; }
		articleAdding = false;
	}
	async function removeArticle(id) {
		const res = await fetch(`/api/sheets/${sheetId}/articles?articleId=${id}`, { method: 'DELETE' });
		if (res.ok) { const b = await res.json(); arts = normList(b.articles); }
		flashSaved();
	}
	function setArticleMkts(id, markets) {
		arts = arts.map((a) => (a.id === id ? { ...a, markets } : a));
		fetch(`/api/sheets/${sheetId}/articles`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articleId: id, markets }) });
		flashSaved();
	}

	// ── Images ───────────────────────────────────────────────────────────────
	let uploading = $state('');
	async function upload(file, type) {
		if (!file) return;
		uploading = type;
		file = await shrinkForUpload(file);
		const fd = new FormData();
		fd.append('file', file); fd.append('sheetId', sheetId); fd.append('type', type);
		if (type === 'content' || type === 'grid') fd.append('order', String(Date.now()));
		if (type === 'box') fd.append('processed', '1'); // made via the new box cropper
		const res = await fetch('/api/images', { method: 'POST', body: fd }).catch(() => null);
		if (res?.ok) await variantsForUpload(file, (await res.json().catch(() => ({})))?.key);
		uploading = '';
		flashSaved(); await invalidateAll();
	}
	// People Playing: several photos at once, no cropping (focal point is set
	// afterwards by clicking). Uploaded one by one so order follows the selection.
	let gridProgress = $state(''); // '' | '2/5'
	let gridDrag = $state(false);
	async function uploadMany(fileList) {
		const files = [...(fileList ?? [])].filter((f) => f.type.startsWith('image/'));
		if (!files.length || gridProgress) return;
		const base = Date.now();
		let failed = 0;
		for (let i = 0; i < files.length; i++) {
			gridProgress = `${i + 1}/${files.length}`;
			files[i] = await shrinkForUpload(files[i]);
			const fd = new FormData();
			fd.append('file', files[i]); fd.append('sheetId', sheetId); fd.append('type', 'grid');
			fd.append('order', String(base + i));
			if (i < files.length - 1) fd.append('quiet', '1'); // shops are notified once, after the last
			const res = await fetch('/api/images', { method: 'POST', body: fd }).catch(() => null);
			if (!res?.ok) failed++;
			else await variantsForUpload(files[i], (await res.json().catch(() => ({})))?.key);
		}
		gridProgress = '';
		if (failed) alert(`${failed} of ${files.length} photo${files.length === 1 ? '' : 's'} failed to upload.`);
		flashSaved(); await invalidateAll();
	}
	async function deleteImg(id) {
		if (!confirm('Delete this photo? This cannot be undone.')) return;
		const res = await fetch(`/api/images/${id}`, { method: 'DELETE' }).catch(() => null);
		if (!res?.ok) { saveStatus = 'error'; saveError = 'the photo could not be deleted'; return; }
		flashSaved(); await invalidateAll();
	}
	async function clearBox() {
		if (!confirm(data.sheet.box_flat_image_key ? 'Remove the 3D box photo? The flat front will be used as the default image.' : 'Remove the 3D box photo? The sheet will have no default image.')) return;
		await putSheet('box_image_key', null); await invalidateAll();
	}
	async function clearBoxFlat() { await putSheet('box_flat_image_key', null); await invalidateAll(); }
	// focal point crop for people-playing (click image → %)
	async function setFocal(ev, img) {
		const r = ev.currentTarget.getBoundingClientRect();
		const cropX = Math.round(((ev.clientX - r.left) / r.width) * 100);
		const cropY = Math.round(((ev.clientY - r.top) / r.height) * 100);
		await fetch(`/api/images/${img.id}/crop`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cropX, cropY }) });
		flashSaved(); await invalidateAll();
	}
	// Editor previews: small WebP widths from the image CDN (same R2 bucket as the
	// shop; made once and cached) instead of full-size originals.
	const thumbUrl = (key, w = 300) => `https://img.spilbraet.dk/${key}?w=${w}`;

	// The CDN can't resize originals over 20 MB and serves the full file instead.
	// For those, the browser makes the WebP widths and stores them where the CDN
	// looks (<key>_<w>.webp), after which they're served like any other image:
	//  · right after uploading such a file (from the file itself), and
	//  · when a "300px" thumb arrives wider than 300px (an older upload) — from the
	//    already-loaded image, so it's only slow that once, for the shop too.
	// Browsers that can't encode WebP (Safari makes PNG) skip it; a Chrome visit fixes it.
	const CDN_WIDTHS = [300, 600, 1000, 1600];
	const CDN_MAX_SOURCE = 20 * 1024 * 1024;
	const healed = new Set();
	const variantKeyOf = (key, w) => {
		const slash = key.lastIndexOf('/'), dot = key.lastIndexOf('.');
		return `${dot > slash ? key.slice(0, dot) : key}_${w}.webp`;
	};
	/** @param {CanvasImageSource} src @param {number} srcW @param {number} srcH @param {string} key */
	async function makeVariants(src, srcW, srcH, key) {
		for (const w of CDN_WIDTHS) {
			const scale = Math.min(1, w / srcW);
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(srcW * scale);
			canvas.height = Math.round(srcH * scale);
			canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
			const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.82));
			if (!blob || blob.type !== 'image/webp') return false; // no WebP encoder here
			const fd = new FormData();
			fd.append('file', new File([blob], 'v.webp', { type: 'image/webp' }));
			fd.append('variantKey', variantKeyOf(key, w));
			const res = await fetch('/api/images', { method: 'POST', body: fd });
			if (!res.ok) return false;
		}
		return true;
	}
	async function healThumb(ev, key) {
		const el = ev.currentTarget;
		if (!key || el.naturalWidth <= 300 || healed.has(key)) return;
		healed.add(key);
		try { await makeVariants(el, el.naturalWidth, el.naturalHeight, key); }
		catch (e) { console.warn('thumbnail variants failed', key, e); }
	}
	// Files over the CDN's 20 MB limit are scaled down before upload (at most
	// ~16 megapixels, which every browser's canvas can hold), so the stored
	// original can be resized by the CDN and the shop like any other. PNG stays
	// PNG (transparency); everything else becomes JPEG. If the browser can't do
	// it (e.g. can't decode the file) the file is uploaded as it is.
	const SHRINK_MAX_PIXELS = 16_000_000;
	/** @param {File} file @returns {Promise<File>} */
	async function shrinkForUpload(file) {
		if (file.size <= CDN_MAX_SOURCE) return file;
		try {
			const bmp = await createImageBitmap(file);
			try {
				const png = file.type === 'image/png';
				let scale = Math.min(1, Math.sqrt(SHRINK_MAX_PIXELS / (bmp.width * bmp.height)));
				for (let attempt = 0; attempt < 4; attempt++, scale *= 0.75) {
					const canvas = document.createElement('canvas');
					canvas.width = Math.round(bmp.width * scale);
					canvas.height = Math.round(bmp.height * scale);
					canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
					const blob = await new Promise((r) => canvas.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.9));
					if (blob && blob.size > 0 && blob.size <= CDN_MAX_SOURCE) {
						const name = file.name.replace(/\.[^.]*$/, '') + (png ? '.png' : '.jpg');
						return new File([blob], name, { type: blob.type });
					}
				}
			} finally { bmp.close(); }
		} catch (e) { console.warn('could not scale down before upload', file.name, e); }
		return file;
	}
	/** After uploading `file` as `key`: pre-make the widths the CDN can't. */
	async function variantsForUpload(file, key) {
		if (!key || file.size <= CDN_MAX_SOURCE) return;
		healed.add(key);
		try {
			const bmp = await createImageBitmap(file);
			try { await makeVariants(bmp, bmp.width, bmp.height, key); } finally { bmp.close(); }
		} catch (e) { console.warn('upload variants failed', key, e); }
	}

	// hidden file inputs
	let boxInput, flatInput, contentInput, gridInput;

	// Cropper: frame the subject, square it with padding, keep shadows.
	// Used for the 3D box and for content images (components/board on white).
	let cropOpen = $state(false);
	let cropFile = $state(null);
	let cropType = $state('box'); // 'box' | 'content' | 'box_flat'
	function pickCrop(file, type) { if (!file) return; cropFile = file; cropType = type; cropOpen = true; }
	function cancelCrop() { cropOpen = false; cropFile = null; }
	async function onCropped(blob) {
		const type = cropType;
		cropOpen = false; cropFile = null;
		await upload(new File([blob], `${type}.png`, { type: 'image/png' }), type);
	}

	// Rail: fade its bottom edge while there is more to scroll to.
	let railEl = $state(null);
	let railMore = $state(false);
	function checkRail() { if (railEl) railMore = railEl.scrollHeight - railEl.scrollTop - railEl.clientHeight > 8; }
	$effect(() => {
		if (!railEl) return;
		checkRail();
		const ro = new ResizeObserver(checkRail);
		ro.observe(railEl);
		for (const child of railEl.children) ro.observe(child); // cards opening / closing
		return () => ro.disconnect();
	});

	// Header thumbnail: the 3D box, else the flat front — so it is always clear which product is open.
	const headImage = $derived(data.sheet.box_image_key || data.sheet.box_flat_image_key || null);
	const shortDate = (d) => { const t = new Date(d); return isNaN(+t) ? d : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };

	// ── Settings ───────────────────────────────────────────────────────────────
	let hidden = $state(JSON.parse(data.sheet.hidden_elements || '{}'));
	let ctaId = $state(data.sheet.cta_version_id ?? null);
	// Only these can be switched off per sheet. Everything else on the sheet
	// (icons, stock date, short description, bullets) shows when it is filled in.
	const TOGGLES = [{ key: 'list_price', label: 'List price' }, { key: 'data', label: 'Data table' }, { key: 'cta', label: 'CTA' }];
	async function toggle(key) { hidden = { ...hidden, [key]: !hidden[key] }; await putSheet('hidden_elements', JSON.stringify(hidden)); }
	async function setCta(id) { ctaId = id; await putSheet('cta_version_id', id); }

	const langs = $derived([...data.languages].sort((a, b) => (b.code === data.primaryLanguage ? 1 : 0) - (a.code === data.primaryLanguage ? 1 : 0)));

	// SvelteKit reuses this component across /sheet/[id] navigations, so all the
	// editable $state must be re-initialised when the loaded sheet changes —
	// otherwise the URL updates but the form keeps the previous sheet's values.
	let loadedId = $state(data.sheet.id);
	$effect(() => {
		if (data.sheet.id === loadedId) return;
		loadedId = data.sheet.id;
		t = normT(data.translations);
		name = data.baseTranslations?.product_name ?? data.translations?.product_name ?? '';
		dataFields = JSON.parse(data.sheet.data_fields || '[]');
		initGameAttrs();
		rbMsg = ''; rbErr = '';
		selectedCats = new Set(data.categorySelected ?? []); catOpen = {}; catMsg = '';
		wsReset();
		preorderDate = data.sheet.preorder_date ?? ''; restockDate = data.sheet.restock_date ?? '';
		hidden = JSON.parse(data.sheet.hidden_elements || '{}');
		ctaId = data.sheet.cta_version_id ?? null;
		language = data.language;
		videoUrl = ''; videoOrient = 'auto'; videoErr = '';
		vids = normList(data.videos); arts = normList(data.articles); articleUrl = ''; articleErr = '';
	});
</script>

<svelte:head><title>Edit {data.sheet.sku} — Sheet</title></svelte:head>

<div class="editor">
	<header class="bar">
		<div class="left">
			<a href="/sheets" class="back" title="Back to Sheets">←</a>
			{#if headImage}
				<img class="head-thumb" src={thumbUrl(headImage)} crossorigin="anonymous" onload={(e) => healThumb(e, headImage)} alt="" decoding="async" />
			{:else}
				<div class="head-thumb none" title="No box photo yet">?</div>
			{/if}
			<div class="head-id">
				<span class="head-name" title="Product name — set in Rackbeat">{name || data.sheet.sku}</span>
				<span class="head-meta"><span class="sku">{data.sheet.sku}</span>{#if data.sheet.rb_barred}<span class="barred" title="Barred in Rackbeat">Barred</span>{/if}{#if data.webshopPublisher}<span>{data.webshopPublisher}</span>{/if}</span>
			</div>
			<button class="feat" class:on={featured} onclick={toggleFeatured} disabled={featBusy} aria-pressed={featured}
				title={featured ? 'Shown under Featured Products in the webshop — click to remove' : 'Feature this product in the webshop'}>
				<svg width="15" height="15" viewBox="0 0 24 24" fill={featured ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/></svg>
				{featured ? 'Featured' : 'Feature'}
			</button>
		</div>
		<div class="lang-tabs">
			{#each langs as l}
				<button class="lang-tab" class:active={language === l.code} onclick={() => switchLanguage(l.code)}>
					{l.label}{#if l.code === data.primaryLanguage}<span class="pri">Primary</span>{/if}
				</button>
			{/each}
		</div>
		<div class="right">
			<span class="save" class:on={saveStatus === 'saving'} class:err={saveStatus === 'error'} title={saveStatus === 'error' ? `Your last change was not saved: ${saveError}. Change the field again to retry.` : ''}><span class="dot"></span>{saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? `Not saved — ${saveError}` : 'Saved'}</span>
			<a class="btn ghost" href="/sheet/{sheetId}/award?lang={language}">Award View</a>
			<a class="btn ghost" href="/sheet/{sheetId}/stories?lang={language}">SoMe Stories</a>
			<a class="btn primary" href="/sheet/{sheetId}/preview?lang={language}" target="_blank">Preview</a>
		</div>
	</header>

	<main class="layout">
		<div class="main-col">
		<!-- Images: one gallery — 3D box, flat front, content photos, people playing -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<section class="card gal-card" class:over={gridDrag}
			ondragover={(e) => { e.preventDefault(); gridDrag = true; }}
			ondragleave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) gridDrag = false; }}
			ondrop={(e) => { e.preventDefault(); gridDrag = false; uploadMany(e.dataTransfer?.files); }}>
			<div class="card-head">
				<h2>Images</h2>
				<div class="gal-add">
					<button class="mini" onclick={() => boxInput.click()} disabled={uploading === 'box'}>{uploading === 'box' ? 'Uploading…' : data.sheet.box_image_key ? 'Replace 3D box' : '+ 3D box'}</button>
					<button class="mini" onclick={() => flatInput.click()} disabled={uploading === 'box_flat'}>{uploading === 'box_flat' ? 'Uploading…' : data.sheet.box_flat_image_key ? 'Replace flat front' : '+ Flat front'}</button>
					<button class="mini" onclick={() => contentInput.click()} disabled={uploading === 'content'}>{uploading === 'content' ? 'Uploading…' : '+ Content'}</button>
					<button class="mini" onclick={() => gridInput.click()} disabled={!!gridProgress}>{gridProgress ? `Uploading ${gridProgress}…` : '+ People playing'}</button>
				</div>
			</div>
			<input type="file" accept="image/*" bind:this={boxInput} onchange={(e) => { pickCrop(e.currentTarget.files?.[0], 'box'); e.currentTarget.value = ''; }} hidden />
			<input type="file" accept="image/*" bind:this={flatInput} onchange={(e) => { pickCrop(e.currentTarget.files?.[0], 'box_flat'); e.currentTarget.value = ''; }} hidden />
			<input type="file" accept="image/*" bind:this={contentInput} onchange={(e) => { pickCrop(e.currentTarget.files?.[0], 'content'); e.currentTarget.value = ''; }} hidden />
			<input type="file" accept="image/*" multiple bind:this={gridInput} onchange={(e) => { uploadMany(e.currentTarget.files); e.currentTarget.value = ''; }} hidden />

			<div class="gal">
				<!-- 3D box -->
				{#if data.sheet.box_image_key}
					<figure class="tile fit">
						<img src={thumbUrl(data.sheet.box_image_key)} crossorigin="anonymous" onload={(e) => healThumb(e, data.sheet.box_image_key)} alt="3D box" decoding="async" />
						{#if !data.sheet.box_processed}<span class="tile-flag" title="Uploaded before the box cropper — consider replacing it with a new crop">Legacy</span>{/if}
						<figcaption>3D box</figcaption>
						<button class="tile-x" title="Remove the 3D box photo" aria-label="Remove the 3D box photo" onclick={clearBox}>✕</button>
					</figure>
				{:else}
					<button type="button" class="tile none" onclick={() => boxInput.click()} title="Add the 3D box photo">
						<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>
						<span class="cap">3D box</span>
					</button>
				{/if}

				<!-- Flat front -->
				{#if data.sheet.box_flat_image_key}
					<figure class="tile fit">
						<img src={thumbUrl(data.sheet.box_flat_image_key)} crossorigin="anonymous" onload={(e) => healThumb(e, data.sheet.box_flat_image_key)} alt="Flat front" decoding="async" />
						<figcaption>Flat front</figcaption>
						<button class="tile-x" title="Remove the flat front photo" aria-label="Remove the flat front photo" onclick={clearBoxFlat}>✕</button>
					</figure>
				{:else}
					<button type="button" class="tile none" onclick={() => flatInput.click()} title="Add the flat front photo">
						<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M8.5 8h7M8.5 11.5h7"/></svg>
						<span class="cap">Flat front</span>
					</button>
				{/if}

				<!-- Content photos (webshop) -->
				{#each data.contentImages as img (img.id)}
					<figure class="tile">
						<img src={thumbUrl(img.r2_key)} crossorigin="anonymous" onload={(e) => healThumb(e, img.r2_key)} alt="Content" loading="lazy" decoding="async" />
						<figcaption>Content</figcaption>
						<button class="tile-x" title="Delete this photo" aria-label="Delete this content photo" onclick={() => deleteImg(img.id)}>✕</button>
					</figure>
				{/each}

				<!-- People playing (sheet grid) — click sets the focal point -->
				{#each data.images as img (img.id)}
					<figure class="tile">
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
						<img class="focal" src={thumbUrl(img.r2_key)} crossorigin="anonymous" onload={(e) => healThumb(e, img.r2_key)} alt="People playing" loading="lazy" decoding="async" title="Click to set the focal point (how it crops on the sheet)" style="object-position:{img.crop_x ?? 50}% {img.crop_y ?? 50}%" onclick={(e) => setFocal(e, img)} />
						<figcaption>People</figcaption>
						<button class="tile-x" title="Delete this photo" aria-label="Delete this people-playing photo" onclick={() => deleteImg(img.id)}>✕</button>
					</figure>
				{/each}
			</div>
			{#if gridDrag}<div class="gal-drop">Drop to add people-playing photos</div>{/if}
		</section>


		<!-- Universal (per language) -->
		<section class="card">
			<div class="card-head">
				<h2>Universal info</h2>
				<div class="cp-btns">
					<button class="mini" onclick={copyUniversal} title="Copy all text (for translation)">{copyMsg || 'Copy text'}</button>
					<button class="mini" onclick={pasteUniversal} title="Paste translated text back">{pasteMsg || 'Paste text'}</button>
				</div>
			</div>
			<label class="fld"><span>Short description</span>
				<textarea rows="3" value={t.product_description ?? ''} oninput={(e) => (t.product_description = e.currentTarget.value)} onblur={(e) => putTranslation('product_description', e.currentTarget.value)}></textarea>
			</label>
			<div class="fld"><span>Bullets</span>
				<div class="bullets">
					{#each BULLETS as i}
						<input value={usp(i)} oninput={(e) => (t[`usp_${i + 1}`] = e.currentTarget.value)} onblur={(e) => putTranslation(`usp_${i + 1}`, e.currentTarget.value)} placeholder="Bullet {i + 1}" aria-label="Bullet {i + 1}" />
					{/each}
				</div>
			</div>
			<div class="fld"><span>Long description</span>
				<MarkdownEditor bind:value={t.long_description} onchange={(v) => putTranslation('long_description', v)} />
			</div>
		</section>


		<!-- Videos -->
		<section class="card">
			<div class="card-head"><h2>Videos</h2></div>
			{#if vids.length}
				<div class="vid-list">
					{#each vids as v (v.id)}
						<div class="vid">
							{#if ytId(v.url)}<img class="vthumb" class:portrait={v.orientation === '9:16'} src="https://img.youtube.com/vi/{ytId(v.url)}/mqdefault.jpg" alt="" />{/if}
							<div class="vmeta">
								<span class="vorient {v.orientation === '9:16' ? 'p' : 'l'}">{v.orientation}</span>
								<a class="vurl" href={v.url} target="_blank" rel="noopener">{v.url}</a>
								<MarketAvailability value={v.markets} onchange={(m) => setVideoMkts(v.id, m)} />
							</div>
							<button class="x" onclick={() => removeVideo(v.id)}>✕</button>
						</div>
					{/each}
				</div>
			{:else}<p class="empty">No videos yet.</p>{/if}
			<div class="vid-add">
				<input placeholder="Paste YouTube link…" bind:value={videoUrl} onkeydown={(e) => e.key === 'Enter' && addVideo()} />
				<select bind:value={videoOrient}><option value="auto">Auto</option><option value="16:9">16:9</option><option value="9:16">9:16</option></select>
				<button class="btn primary sm" onclick={addVideo}>Add</button>
			</div>
			{#if videoErr}<p class="err">{videoErr}</p>{/if}
		</section>


		<!-- Articles (visual link cards) -->
		<section class="card">
			<div class="card-head"><h2>Articles</h2></div>
			{#if arts.length}
				<div class="art-list">
					{#each arts as a (a.id)}
						<div class="art">
							<div class="art-card">
								{#if a.image_key}
									<img class="art-img" src={thumbUrl(a.image_key)} crossorigin="anonymous" onload={(e) => healThumb(e, a.image_key)} alt="" loading="lazy" decoding="async" />
								{:else if a.image_url}
									<img class="art-img" src={a.image_url} alt="" />
								{:else}
									<div class="art-img ph">No image</div>
								{/if}
								<div class="art-body">
									<div class="art-site">
										{#if a.favicon_url}<img class="art-fav" src={a.favicon_url} alt="" />{/if}
										<span>{a.site_name || new URL(a.url).hostname}</span>
									</div>
									<a class="art-title" href={a.url} target="_blank" rel="noopener">{a.title || a.url}</a>
									{#if a.description}<p class="art-desc">{a.description}</p>{/if}
								</div>
								<button class="x art-x" title="Remove" onclick={() => removeArticle(a.id)}>✕</button>
							</div>
							<div class="art-avail">
								<span class="avail-label">Available in</span>
								<MarketAvailability value={a.markets} onchange={(m) => setArticleMkts(a.id, m)} />
							</div>
						</div>
					{/each}
				</div>
			{:else}<p class="empty">No articles yet.</p>{/if}
			<div class="vid-add">
				<input placeholder="Paste article URL (https://…)" bind:value={articleUrl} onkeydown={(e) => e.key === 'Enter' && addArticle()} disabled={articleAdding} />
				<button class="btn primary sm" onclick={addArticle} disabled={articleAdding}>{articleAdding ? 'Fetching…' : 'Add'}</button>
			</div>
			{#if articleErr}<p class="err">{articleErr}</p>{/if}
			{#if articleInfo}<p class="info">{articleInfo}</p>{/if}
		</section>

		</div>

		<!-- One rail: everything that is set per product, most-used first -->
		<aside class="rail" class:more={railMore} bind:this={railEl} onscroll={checkRail}>
			<!-- Webshop published markets (gated by publisher licence) -->
			<div class="side-card">
				<div class="side-head"><h2>Webshop</h2>
					<span class="save" class:on={wsMsg === 'Saving…'} class:err={wsMsg.startsWith('Not saved')}>{wsMsg}</span>
					{#if wsChanged.at}
						{@const changed = `Last changed ${new Date(wsChanged.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}${wsChanged.by ? ` by ${wsChanged.by.split('@')[0]}` : ''}`}
						<button type="button" class="info-dot" aria-label={changed} data-tip={changed}>
							<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.4"/></svg>
						</button>
					{/if}
				</div>
				<div class="ws-pub">
					<p class="ws-note">Publisher: <strong>{data.webshopPublisher ?? '—'}</strong>{#if (data.webshopAllowed ?? []).length === 0 && !wsOverride}<span class="ws-warn"> · no market licence set</span>{/if}</p>
					<p class="ws-state" class:custom={!wsFollows}>
						{#if wsFollows}
							<span>Follows the publisher licence</span>
						{:else}
							<span>Custom selection</span>
							<button type="button" class="ws-reset" onclick={followLicence} title="Publish wherever the publisher is licensed, and keep following later licence changes">Follow licence</button>
						{/if}
					</p>
					<div class="ws-chips" role="group" aria-label="Markets">
						{#each WS_MARKETS as m}
							{@const locked = !wsEnabled(m)}
							<button type="button" class="ws-chip" class:on={wsChecked(m)} class:warn={wsMissingTexts.includes(m)} disabled={locked} aria-pressed={wsChecked(m)}
								title={locked ? `${MARKET_LABEL[m]} — not licensed by the publisher` : wsMissingTexts.includes(m) ? `${MARKET_LABEL[m]} — published, but there are no ${langInfo(MARKET_LANG[m]).english} texts yet` : MARKET_LABEL[m]}
								onclick={() => toggleMarket(m)}>{m}</button>
						{/each}
					</div>
					{#if wsMissingTexts.length}<p class="ws-missing">Missing texts: {wsMissingTexts.map((m) => langShort(MARKET_LANG[m])).join(', ')}</p>{/if}
					<label class="ws-override">
						<input type="checkbox" checked={wsOverride} onchange={(e) => { e.currentTarget.checked = wsOverride; toggleOverride(); }} />
						<span>Override publisher licence</span>
					</label>
				</div>
			</div>


			<!-- Game attributes (editable, written back to Rackbeat) + expected stock date -->
			<div class="side-card">
				<div class="side-head"><h2>Game</h2></div>
				<!-- Game attributes: editable, written back to Rackbeat -->
				<div class="game-attrs first">
					<div class="ga-row">
						<span class="k">{gLabel('age', 'Age')}</span>
						<input class="num solo" inputmode="numeric" placeholder="—"
							bind:value={ageVal}
							oninput={(e) => (ageVal = onlyDigits(e.currentTarget.value))}
							onblur={saveAge} />
					</div>
					<div class="ga-row">
						<span class="k">{gLabel('time', 'Time')}</span>
						<div class="fromto">
							<input class="num" inputmode="numeric" placeholder="from"
								bind:value={timeFrom}
								oninput={(e) => (timeFrom = onlyDigits(e.currentTarget.value))}
								onblur={saveTime} />
							<span class="dash">–</span>
							<input class="num" inputmode="numeric" placeholder="to"
								bind:value={timeTo}
								oninput={(e) => (timeTo = onlyDigits(e.currentTarget.value))}
								onblur={saveTime} />
						</div>
					</div>
					<div class="ga-row">
						<span class="k">{gLabel('players', 'Players')}</span>
						<div class="fromto">
							<input class="num" inputmode="numeric" placeholder="from"
								bind:value={playFrom}
								oninput={(e) => (playFrom = onlyDigits(e.currentTarget.value))}
								onblur={savePlayers} />
							<span class="dash">–</span>
							<input class="num" inputmode="numeric" placeholder="to"
								bind:value={playTo}
								oninput={(e) => (playTo = onlyDigits(e.currentTarget.value))}
								onblur={savePlayers} />
						</div>
					</div>
					<div class="ga-row">
						<span class="k">{gLabel('pieces', 'Pieces')}</span>
						<input class="num solo" inputmode="numeric" placeholder="—"
							bind:value={piecesVal}
							oninput={(e) => (piecesVal = onlyDigits(e.currentTarget.value))}
							onblur={savePieces} />
					</div>
					{#if rbErr}<div class="ga-note err">{rbErr}</div>{/if}
					{#if rbMsg}<div class="ga-note">{rbMsg}</div>{/if}
				</div>

			{#if stockIdx >= 0}
				<label class="fld rail-fld"><span>Expected stock date</span>
					<input bind:value={dataFields[stockIdx].value} onblur={saveDataFields} placeholder="Q4 / Nov '27 / In stock" />
				</label>
			{/if}
			</div>

			<!-- Languages the product itself comes in (components / rule book) -->
			<div class="side-card pl-card">
				<div class="side-head"><h2>Product languages</h2></div>
				<ProductLanguagePicker value={data.sheet.product_languages} onchange={(next) => save({ type: 'sheet', field: 'product_languages', value: next })} />
			</div>

			<!-- Webshop dates -->
			<details class="side-card fold">
				<summary class="side-head"><h2>Dates</h2><span class="fold-sum">{[preorderDate && `Preorder ${shortDate(preorderDate)}`, restockDate && `Restock ${shortDate(restockDate)}`].filter(Boolean).join(' · ') || 'Not set'}</span></summary>
				<div class="dates">
					<div class="date-fld">
						<span class="dlabel">Preorder date</span>
						<div class="date-row">
							<input type="date" bind:value={preorderDate} onchange={(e) => setPreorder(e.currentTarget.value)} />
							{#if preorderDate}<button class="dclear" title="Clear" aria-label="Clear preorder date" onclick={() => setPreorder('')}>✕</button>{/if}
						</div>
						<div class="quick">
							<button title="7 days from now (moves to Monday on a weekend)" onclick={() => setPreorder(fromNow(7))}>7 days from now</button>
							<button title="30 days from now (moves to Monday on a weekend)" onclick={() => setPreorder(fromNow(30))}>30 days from now</button>
						</div>
					</div>
					<div class="date-fld">
						<span class="dlabel">Restock date</span>
						<div class="date-row">
							<input type="date" bind:value={restockDate} onchange={(e) => setRestock(e.currentTarget.value)} />
							{#if restockDate}<button class="dclear" title="Clear" aria-label="Clear restock date" onclick={() => setRestock('')}>✕</button>{/if}
						</div>
						<div class="quick">
							<button title="7 days from now (moves to Monday on a weekend)" onclick={() => setRestock(fromNow(7))}>7 days from now</button>
							<button title="30 days from now (moves to Monday on a weekend)" onclick={() => setRestock(fromNow(30))}>30 days from now</button>
						</div>
					</div>
				</div>
			</details>


			<!-- Categories: collapsible multi-select per group -->
			<div class="side-card">
				<div class="side-head"><h2>Categories</h2>
					<span class="save" class:on={catMsg === 'Saving…'}>{catMsg}</span>
				</div>
				{#if (data.categoryGroups ?? []).length === 0}
					<p class="cats-empty">No category groups yet. Create them under <a href="/admin/categories">Admin → Categories</a>.</p>
				{:else}
					{#each data.categoryGroups as g}
						{@const names = groupSelNames(g)}
						<div class="cat-group">
							<button type="button" class="cat-head" onclick={() => (catOpen[g.id] = !catOpen[g.id])}>
								<span class="chev" class:open={catOpen[g.id]}>▸</span>
								<span class="cat-title">{catLabel(g.labels)}</span>
								{#if names.length}<span class="cat-count">{names.length}</span>{/if}
							</button>
							{#if catOpen[g.id]}
								<div class="cat-opts">
									{#each g.categories as c}
										<label class="cat-opt">
											<input type="checkbox" checked={selectedCats.has(c.id)} onchange={() => toggleCat(c.id)} />
											<span>{catLabel(c.labels)}</span>
										</label>
									{/each}
									{#if g.categories.length === 0}<span class="cat-none">No categories in this group.</span>{/if}
								</div>
							{:else if names.length}
								<div class="cat-chips">{#each names as n}<span class="chip">{n}</span>{/each}</div>
							{/if}
						</div>
					{/each}
				{/if}
			</div>

			{#if data.sheet.sku}
				{#key data.sheet.id}
					<RelationsCard sheetId={data.sheet.id} sku={data.sheet.sku} types={data.relationTypes} relations={data.relations} />
				{/key}
			{/if}

			<!-- Rarely touched: read-only product data, stock, sheet settings -->
			<details class="side-card fold">
				<summary class="side-head"><h2>Details</h2><span class="fold-sum">SKU, size, stock, sheet settings</span></summary>
				<div class="info-table">
					{#each dataFields as f, i}
						{#if f.key !== STOCK_KEY && !GAME_KEYS.includes(f.key)}
							<div class="info-row"><span class="k">{fieldLabel(f)}</span>
								{#if RO_KEYS.includes(f.key)}
									<span class="v ro" title="From Rackbeat — correct it there; syncs to the sheet automatically (hourly)">{f.value || '—'}</span>
								{:else}
									<input class="v" bind:value={dataFields[i].value} onblur={saveDataFields} />
								{/if}
							</div>
						{/if}
					{/each}
				</div>

				<!-- Stock: read-only from Rackbeat (synced hourly) -->
				<div class="rb-stock" title="From Rackbeat, synced hourly — read-only">
					{#if rbHas}
						<div class="rbs-main">
							<span class="k">Available</span>
							<span class="rbs-num" class:out={Number(data.sheet.rb_available) <= 0}>{rbN(data.sheet.rb_available)}</span>
						</div>
						<div class="rbs-sub">On hand {rbN(data.sheet.rb_stock)} · In orders {rbN(data.sheet.rb_in_order)} · On PO {rbN(data.sheet.rb_purchased)}</div>
					{:else}
						<div class="rbs-main"><span class="k">Available</span><span class="rbs-none">{data.stockMeta ? 'Not in Rackbeat' : 'Not synced yet'}</span></div>
					{/if}
					{#if rbAsOf}<div class="rbs-asof">Rackbeat · {rbAsOf}{#if data.stockMeta?.status === 'error'} · <span class="rbs-err">last sync failed</span>{/if}</div>{/if}
				</div>
				<div class="fold-body">
					<button class="mini" onclick={refreshFromRackbeat} disabled={refreshing} title={refreshTip || 'Refresh name and data fields from Rackbeat'}>{refreshMsg || (refreshing ? 'Refreshing…' : 'Refresh from Rackbeat')}</button>
			{#if data.ctaVersions?.length}
				<label class="fld narrow"><span>CTA version</span>
					<select value={ctaId ?? ''} onchange={(e) => setCta(e.currentTarget.value || null)}>
						<option value="">None</option>
						{#each data.ctaVersions as v}<option value={v.id}>{v.name}</option>{/each}
					</select>
				</label>
			{/if}
			<div class="fld"><span>Sheet element visibility</span>
				<div class="toggles">
					{#each TOGGLES as tg}
						<button class="tg" class:off={hidden[tg.key]} onclick={() => toggle(tg.key)}>
							<span class="tg-dot"></span>{tg.label}{#if hidden[tg.key]}<em>hidden</em>{/if}
						</button>
					{/each}
				</div>
			</div>
				</div>
			</details>
		</aside>
	</main>
</div>

{#if cropOpen && cropFile}
	{#if cropType === 'box_flat'}
		<FlatCropper file={cropFile} onconfirm={onCropped} oncancel={cancelCrop} />
	{:else}
		<BoxCropper
			file={cropFile}
			onconfirm={onCropped}
			oncancel={cancelCrop}
			title={cropType === 'content' ? 'Frame the content photo' : 'Frame the 3D box'}
			subject={cropType === 'content' ? 'content' : 'box'} />
	{/if}
{/if}

<style>
	.editor { min-height: 100vh; }
	.bar { position: sticky; top: 0; z-index: 50; background: #fff; border-bottom: 1px solid var(--border); height: 60px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 20px; }
	.left, .right { display: flex; align-items: center; gap: 10px; }
	.back { font-size: 13px; font-weight: 600; color: #71717A; text-decoration: none; }
	.back:hover { color: #18181B; }
	.sku { font-size: 12px; font-weight: 700; color: #52525B; background: #F4F4F5; padding: 3px 9px; border-radius: 100px; text-transform: uppercase; }
	.lang-tabs { display: flex; gap: 2px; background: #F4F4F5; border-radius: 9px; padding: 3px; }
	.lang-tab { display: flex; align-items: center; gap: 5px; padding: 4px 12px; border: none; background: none; border-radius: 7px; font-size: 12.5px; font-weight: 600; color: #71717A; font-family: inherit; cursor: pointer; }
	.lang-tab.active { background: #fff; color: #18181B; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
	.pri { font-size: 9px; font-weight: 800; text-transform: uppercase; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); border-radius: 4px; padding: 1px 4px; }
	.save { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #A1A1AA; }
	.save .dot { width: 6px; height: 6px; border-radius: 50%; background: #A3E635; }
	.save.on .dot { background: #FCD34D; }
	.save.err { font-weight: 700; }
	.save.err .dot { background: #DC2626; }
	.btn { display: inline-flex; align-items: center; padding: 6px 14px; border-radius: 100px; font-size: 12.5px; font-weight: 600; text-decoration: none; cursor: pointer; border: 1px solid transparent; font-family: inherit; }
	.btn.primary { background: #F57832; color: #fff; }
	.btn.ghost { background: #fff; color: #52525B; border-color: var(--border); }
	.btn.sm { padding: 7px 14px; }

	.form { max-width: 820px; margin: 0 auto; padding: 24px 20px 80px; display: flex; flex-direction: column; gap: 18px; }
	.card { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; }
	/* Header strip divided from the card's content, like the cards in the rail */
	.card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin: -18px -20px 16px; padding: 12px 20px; min-height: 30px; border-bottom: 1px solid var(--border); }
	.card-head h2 { font-size: 15px; font-weight: 800; color: #18181B; margin: 0; }
	.hint { font-size: 11.5px; color: #A1A1AA; }
	.err { font-size: 12px; color: #dc2626; margin: 6px 0 0; }
	.info { font-size: 12px; color: #16794C; margin: 6px 0 0; font-weight: 600; }
	.empty { font-size: 13px; color: #A1A1AA; margin: 4px 0; }

	.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; }
	@media (max-width: 560px) { .grid2 { grid-template-columns: 1fr; } }
	.fld { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 700; color: #6b5e4e; margin-bottom: 14px; }
	.fld:last-child { margin-bottom: 0; }
	.fld.narrow { max-width: 360px; }
	.fld em { font-weight: 500; color: #A1A1AA; font-style: normal; }
	.fld input, .fld textarea, .fld select, .vid-add input, .vid-add select {
		font-family: inherit; font-size: 13px; font-weight: 500; color: #18181B; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; background: #fff; box-sizing: border-box; width: 100%;
	}
	.fld input:focus, .fld textarea:focus, .fld select:focus { outline: none; border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); }
	.fld input[readonly] { background: #FAFAFA; color: #71717A; }
	.feat { display: inline-flex; align-items: center; gap: 6px; font-family: inherit; font-size: 12px; font-weight: 700; color: #8A7E68; background: #fff; border: 1px solid var(--border); border-radius: 100px; padding: 5px 11px 5px 9px; cursor: pointer; transition: color .12s, background .12s, border-color .12s; }
	.feat:hover { color: #B07A0E; border-color: #F4D58A; }
	.feat.on { color: #8A5A00; background: #FFF4CC; border-color: #F1CF6E; }
	.feat.on svg { color: #E8A317; }
	.mini { font-size: 12px; font-weight: 700; color: #B15A12; background: #FDEEE4; border: 1px solid #F6CDAB; border-radius: 8px; padding: 5px 11px; cursor: pointer; font-family: inherit; }
	.mini:hover { background: #FBDDC7; }
	.mini.danger { color: #dc2626; background: #fff; border-color: #fecaca; }
	.mini:disabled { opacity: 0.6; cursor: default; }

	.bullets { display: flex; flex-direction: column; gap: 6px; }
	.add { align-self: flex-start; font-size: 12px; font-weight: 700; color: #B15A12; background: none; border: none; cursor: pointer; font-family: inherit; padding: 2px 0; }
	.x { flex-shrink: 0; width: 28px; border: 1px solid var(--border); background: #fff; border-radius: 7px; color: #b6795a; cursor: pointer; font-size: 12px; }
	.x:hover { background: #fce4de; color: #c4381b; }

	.vid-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
	.vid { display: flex; align-items: center; gap: 10px; border: 1px solid var(--border); border-radius: 10px; padding: 8px; }
	.vthumb { width: 80px; height: 45px; object-fit: cover; border-radius: 6px; }
	.vthumb.portrait { width: 34px; height: 60px; }
	.vmeta { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
	.vorient { align-self: flex-start; font-size: 10.5px; font-weight: 800; padding: 1px 7px; border-radius: 100px; }
	.vorient.l { background: #EEF4FF; color: #1D4ED8; } .vorient.p { background: #F3EEFE; color: #6D28D9; }
	.vurl { font-size: 11.5px; color: #71717A; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: none; }
	.vid { align-items: flex-start; }
	.vmeta { gap: 6px; }
	.vid-add { display: flex; gap: 8px; }
	.vid-add input { flex: 1; } .vid-add select { width: auto; }

	/* Articles (visual link cards) */
	.art-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
	.art { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
	.art-card { display: flex; gap: 0; position: relative; }
	.art-img { width: 150px; height: 104px; object-fit: cover; flex-shrink: 0; background: #FAFAFA; }
	.art-img.ph { display: flex; align-items: center; justify-content: center; font-size: 11px; color: #A1A1AA; }
	.art-body { padding: 10px 12px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
	.art-site { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: #8a7550; }
	.art-fav { width: 14px; height: 14px; border-radius: 3px; object-fit: contain; }
	.art-title { font-size: 14px; font-weight: 700; color: #18181B; text-decoration: none; line-height: 1.3; }
	.art-title:hover { color: #F57832; }
	.art-desc { font-size: 12px; color: #71717A; margin: 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
	.art-x { position: absolute; top: 6px; right: 6px; background: rgba(255,255,255,0.9); }
	.art-avail { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-top: 1px solid #F1EADB; background: #FCFBF7; }
	.avail-label { font-size: 11px; font-weight: 700; color: #8a7550; }

	.img-group { padding: 12px 0; border-top: 1px solid #F1EADB; }
	.img-group:first-of-type { border-top: none; padding-top: 0; }
	.img-group h3 { font-size: 13px; font-weight: 800; color: #52525B; margin: 0 0 10px; }
	.img-group h3 em { font-weight: 500; color: #A1A1AA; font-style: normal; }
	.group-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
	.group-head h3 { margin: 0; }
	.box-row { display: flex; gap: 16px; flex-wrap: wrap; }
	.box-slot { display: flex; flex-direction: column; gap: 8px; width: 160px; }
	.slot-label { font-size: 11.5px; font-weight: 700; color: #6b5e4e; }
	.slot-label em { font-weight: 500; color: #A1A1AA; font-style: normal; }
	.box-slot img { width: 160px; height: 120px; object-fit: contain; background: #FAFAFA; border: 1px solid var(--border); border-radius: 8px; }
	.box-tag { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 6px; align-self: flex-start; }
	.box-tag.ok { color: #15803D; background: #EAF7EE; border: 1px solid #BBE7C6; }
	.box-tag.old { color: #B45309; background: #FDF4E7; border: 1px solid #F0DBB5; }
	.ph { width: 160px; height: 120px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #A1A1AA; background: #FAFAFA; border: 1px dashed var(--border); border-radius: 8px; }
	.slot-actions { display: flex; gap: 6px; }
	.thumbs { display: flex; flex-wrap: wrap; gap: 10px; }
	.thumb { position: relative; width: 110px; height: 110px; }
	.thumb img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); cursor: crosshair; }
	.thumb .x { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 6px; }
	.thumb .x:hover { background: rgba(0,0,0,0.85); color: #fff; }

	.toggles { display: flex; flex-wrap: wrap; gap: 8px; }
	.tg { display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; color: #15803D; background: #F0FDF4; border: 1px solid #bbf7d0; border-radius: 100px; padding: 5px 12px; cursor: pointer; font-family: inherit; }
	.tg .tg-dot { width: 8px; height: 8px; border-radius: 50%; background: #16a34a; }
	.tg.off { color: #A1A1AA; background: #F4F4F5; border-color: var(--border); }
	.tg.off .tg-dot { background: #D4D4D8; }
	.tg em { font-style: normal; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.3px; }

	/* Layout: floating left info panel + main form column */
	/* Two columns. The page scrolls as one; the rail is pinned and scrolls by
	   itself only when it is taller than the window (no more waiting for the
	   centre column to reach its end). */
	.layout { max-width: 1440px; margin: 0 auto; padding: 20px 20px 80px; display: flex; align-items: flex-start; gap: 20px; }
	.main-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 18px; }
	/* The rail is its own scrolling column from under the header to the very
	   bottom of the window — never a box that stops short. While there is more
	   below, its last few pixels fade out; at the end the fade goes away. */
	.rail { width: 320px; flex-shrink: 0; position: sticky; top: 60px; height: calc(100vh - 60px); margin: -20px -6px -80px 0; padding: 20px 6px 28px 0; box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #D9D2C3 transparent; display: flex; flex-direction: column; gap: 14px; }
	.rail.more { -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 56px), transparent); mask-image: linear-gradient(to bottom, #000 calc(100% - 56px), transparent); }
	.rail .side-card { flex-shrink: 0; }
	.rail .pl-card { margin-top: 0; }

	/* Header identity */
	.head-thumb { width: 40px; height: 40px; flex-shrink: 0; object-fit: contain; background: #FAFAFA; border: 1px solid var(--border); border-radius: 9px; }
	.head-thumb.none { display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 800; color: #D4D4D8; }
	.head-id { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
	.head-name { display: block; font-size: 14.5px; font-weight: 800; color: #18181B; padding: 1px 0; width: 300px; max-width: 28vw; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.head-meta { display: flex; align-items: center; gap: 7px; font-size: 11.5px; color: #A1A1AA; white-space: nowrap; }
	.head-meta .sku { font-size: 10.5px; padding: 1px 7px; }
	.head-meta .barred { font-size: 10px; font-weight: 700; color: #B91C1C; background: #FEE2E2; border-radius: 4px; padding: 1px 6px; }

	/* Images: one gallery of square, labelled tiles */
	.gal-card { position: relative; }
	.gal-card.over { border-color: #F57832; }
	.gal-add { display: flex; flex-wrap: wrap; gap: 6px; }
	.gal { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 10px; }
	.tile { position: relative; margin: 0; padding: 0; aspect-ratio: 1 / 1; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: #FAFAFA; }
	.tile img { display: block; width: 100%; height: 100%; object-fit: cover; }
	.tile.fit img { object-fit: contain; padding: 6px; box-sizing: border-box; }
	.tile img.focal { cursor: crosshair; }
	.tile figcaption, .tile .cap { position: absolute; left: 6px; bottom: 6px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.2px; color: #fff; background: rgba(24, 24, 27, 0.66); border-radius: 5px; padding: 2px 6px; pointer-events: none; }
	.tile-flag { position: absolute; left: 6px; top: 6px; font-size: 10.5px; font-weight: 700; color: #92400E; background: #FDE9C8; border-radius: 5px; padding: 2px 6px; }
	.tile-x { position: absolute; top: 5px; right: 5px; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-size: 11px; line-height: 1; color: #fff; background: rgba(24, 24, 27, 0.7); border: none; border-radius: 6px; cursor: pointer; opacity: 0; transition: opacity .12s; }
	.tile:hover .tile-x, .tile-x:focus-visible { opacity: 1; }
	.tile-x:hover { background: #DC2626; }
	@media (hover: none) { .tile-x { opacity: 1; } }
	.tile.none { display: flex; align-items: center; justify-content: center; font: inherit; color: #C9C2B4; background: #FDFBF6; border: 1.5px dashed #E4DAC2; cursor: pointer; }
	.tile.none:hover { color: #F57832; border-color: #F5C9A8; background: #FFF8F2; }
	.tile.none .cap { color: #8a7550; background: transparent; padding: 0; left: 0; right: 0; bottom: 8px; text-align: center; }
	.gal-drop { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #B15A12; background: rgba(255, 248, 242, 0.92); border-radius: 13px; pointer-events: none; }

	/* Webshop markets as chips */
	.ws-chips { display: flex; flex-wrap: wrap; gap: 6px; }
	.ws-chip { font: inherit; font-size: 12px; font-weight: 800; letter-spacing: 0.2px; min-width: 40px; color: #71717A; background: #F4F4F5; border: 1px solid var(--border); border-radius: 8px; padding: 6px 9px; cursor: pointer; }
	.ws-chip:hover:not(:disabled) { border-color: #F5C9A8; }
	.ws-chip.on { color: #fff; background: #F57832; border-color: #F57832; }
	.ws-chip.on.warn { box-shadow: inset 0 -3px 0 #FCD34D; }
	.ws-chip:disabled { color: #D4D4D8; background: #FAFAFA; border-style: dashed; cursor: not-allowed; }
	.ws-chip.on:disabled { color: #fff; background: #F9B48C; border-color: #F9B48C; border-style: solid; }
	.ws-missing { font-size: 11.5px; font-weight: 600; color: #B45309; margin: 8px 0 0; }

	/* Folded cards */
	.fold > summary { cursor: pointer; list-style: none; border-bottom: none; }
	.fold > summary::-webkit-details-marker { display: none; }
	.fold > summary h2::before { content: '▸'; display: inline-block; margin-right: 7px; font-size: 11px; color: #A1A1AA; transition: transform .12s; }
	.fold[open] > summary h2::before { transform: rotate(90deg); }
	.fold[open] > summary { border-bottom: 1px solid var(--border); }
	.fold-sum { font-size: 11.5px; color: #A1A1AA; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.fold-body { padding: 12px 14px 4px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
	.fold-body .fld { width: 100%; margin-bottom: 8px; }
	.game-attrs.first { border-top: none; }
	.rail-fld { padding: 10px 12px 2px; margin-bottom: 8px; }


	/* Webshop published markets */
	.ws-pub { padding: 10px 14px 12px; }
	.ws-note { font-size: 12px; color: #71717A; margin: 0 0 9px; }
	.ws-state { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11.5px; font-weight: 700; color: #15803D; background: #EAF7EE; border-radius: 7px; padding: 5px 8px; margin: 0 0 8px; }
	.ws-state.custom { color: #9A3412; background: #FFF1E7; }
	.ws-reset { font: inherit; font-weight: 700; color: #9A3412; background: #fff; border: 1px solid #F5C9A8; border-radius: 6px; padding: 2px 7px; cursor: pointer; }
	.ws-reset:hover { background: #FFE4D1; }
	.ws-lock.warn { color: #B45309; border-color: #F5D9A8; text-transform: none; letter-spacing: 0; }
	.side-head .save { margin-left: auto; }
	.info-dot { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; padding: 0; color: #A1A1AA; background: none; border: 0; border-radius: 6px; cursor: help; }
	.info-dot:hover, .info-dot:focus-visible { color: #52525B; background: #F4F4F5; outline: none; }
	.info-dot::after { content: attr(data-tip); position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; white-space: nowrap; font-size: 11.5px; font-weight: 600; color: #fff; background: #27272A; border-radius: 7px; padding: 5px 9px; opacity: 0; pointer-events: none; transition: opacity .12s; }
	.info-dot:hover::after, .info-dot:focus::after { opacity: 1; }
	.save.err { color: #B91C1C; opacity: 1; }
	.ws-note strong { color: #27272A; font-weight: 700; }
	.ws-warn { color: #B45309; font-weight: 600; }
	.ws-markets { display: flex; flex-direction: column; gap: 2px; }
	.ws-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #27272A; padding: 4px 2px; cursor: pointer; }
	.ws-row input { accent-color: #F57832; width: 15px; height: 15px; cursor: pointer; }
	.ws-row .ws-m { font-weight: 600; }
	.ws-row.disabled { color: #A1A1AA; cursor: not-allowed; }
	.ws-row.disabled input { cursor: not-allowed; }
	.ws-lock { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; color: #A1A1AA; border: 1px solid var(--border); border-radius: 5px; padding: 1px 5px; margin-left: auto; }
	.ws-override { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #8a7550; font-weight: 600; margin-top: 10px; padding-top: 10px; border-top: 1px solid #F5EDD8; cursor: pointer; }
	.ws-override input { accent-color: #B45309; width: 15px; height: 15px; cursor: pointer; }

	/* Webshop dates */
	.dates { padding: 12px 14px; display: flex; flex-direction: column; gap: 14px; }
	.date-fld { display: flex; flex-direction: column; gap: 6px; }
	.dlabel { font-size: 11px; font-weight: 700; color: #8a7550; }
	.date-row { display: flex; align-items: center; gap: 6px; }
	.date-row input[type="date"] { flex: 1; min-width: 0; font-size: 13px; font-family: inherit; color: #18181B; border: 1px solid var(--border); border-radius: 8px; padding: 7px 9px; background: #fff; }
	.date-row input[type="date"]:focus { outline: none; border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); }
	.dclear { flex-shrink: 0; width: 30px; height: 30px; border: 1px solid var(--border); background: #fff; border-radius: 7px; color: #A1A1AA; font-size: 11px; cursor: pointer; }
	.dclear:hover { color: #B91C1C; border-color: #FECACA; }
	.quick { display: flex; gap: 6px; }
	.quick button { flex: 1; min-width: 0; font-size: 11px; font-weight: 600; font-family: inherit; color: #52525B; background: #FAFAF7; border: 1px solid var(--border); border-radius: 7px; padding: 5px 4px; cursor: pointer; white-space: nowrap; }
	.quick button:hover { border-color: #F57832; color: #F57832; background: #fff; }
	@media (max-width: 980px) { .layout { flex-direction: column; } .rail { width: 100%; position: static; height: auto; margin: 0; padding: 0; overflow: visible; -webkit-mask-image: none; mask-image: none; } .head-name { width: 180px; } }

	/* Category tagging pane */
	.cats-empty { font-size: 12.5px; color: #71717A; padding: 12px 14px; margin: 0; line-height: 1.5; }
	.cats-empty a { color: #F57832; font-weight: 600; }
	.cat-group { border-bottom: 1px solid var(--border); }
	.cat-group:last-child { border-bottom: none; }
	.cat-head { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: none; cursor: pointer; padding: 10px 14px; font-family: inherit; text-align: left; }
	.cat-head:hover { background: #FAFAF7; }
	.cat-head .chev { color: #A1A1AA; font-size: 11px; transition: transform 0.12s; }
	.cat-head .chev.open { transform: rotate(90deg); }
	.cat-head .cat-title { flex: 1; font-size: 13px; font-weight: 700; color: #18181B; }
	.cat-count { font-size: 11px; font-weight: 700; color: #fff; background: #F57832; border-radius: 999px; min-width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; padding: 0 5px; }
	.cat-opts { display: flex; flex-direction: column; padding: 2px 14px 10px 30px; gap: 2px; }
	.cat-opt { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #27272A; padding: 4px 2px; cursor: pointer; }
	.cat-opt input { accent-color: #F57832; width: 15px; height: 15px; cursor: pointer; }
	.cat-none { font-size: 12px; color: #A1A1AA; padding: 2px; }
	.cat-chips { display: flex; flex-wrap: wrap; gap: 5px; padding: 0 14px 11px 30px; }
	.cat-chips .chip { font-size: 11.5px; font-weight: 600; color: #8a7550; background: #FBF4E2; border: 1px solid #F0E3C0; border-radius: 6px; padding: 2px 7px; }
	.side-card { background: #fff; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
	.pl-card { margin-top: 14px; overflow: visible; }
	.side-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 13px 16px; border-bottom: 1px solid var(--border); }
	.side-head h2 { font-size: 14px; font-weight: 800; color: #18181B; margin: 0; }
	.name-fld { display: flex; flex-direction: column; gap: 5px; padding: 12px 14px; border-bottom: 1px solid var(--border); }
	.name-fld span { font-size: 11px; font-weight: 700; color: #8a7550; }
	.name-fld em { font-weight: 500; color: #A1A1AA; font-style: normal; }
	.name-fld input { font-size: 14px; font-weight: 600; color: #18181B; border: 1px solid var(--border); border-radius: 8px; padding: 7px 9px; font-family: inherit; width: 100%; box-sizing: border-box; }
	.name-fld input:focus { outline: none; border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); }
	.info-table { display: flex; flex-direction: column; }
	.rb-stock { border-top: 1px solid var(--border); padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 3px; }
	.rbs-main { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
	.rbs-main .k { font-size: 11px; font-weight: 700; color: #8a7550; }
	.rbs-num { font-size: 18px; font-weight: 800; color: #18181B; font-variant-numeric: tabular-nums; }
	.rbs-num.out { color: #C0392B; }
	.rbs-none { font-size: 12px; color: #A1A1AA; }
	.rbs-sub { font-size: 11.5px; color: #52525B; font-variant-numeric: tabular-nums; }
	.rbs-asof { font-size: 10.5px; color: #A1A1AA; }
	.rbs-err { color: #C0392B; font-weight: 600; }
	.info-row { display: grid; grid-template-columns: 82px 1fr; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid #F5EDD8; }
	.info-row:last-child { border-bottom: none; }
	.info-row .k { font-size: 11px; font-weight: 700; color: #8a7550; text-transform: capitalize; }
	.info-row .v { font-size: 13px; font-weight: 500; color: #18181B; border: 1px solid transparent; border-radius: 7px; padding: 5px 7px; background: #FAFAF7; font-family: inherit; width: 100%; box-sizing: border-box; }
	.info-row .v:hover { border-color: var(--border); background: #fff; }
	.info-row .v:focus { outline: none; border-color: #F57832; background: #fff; box-shadow: 0 0 0 3px rgba(245,120,50,0.1); }
	.info-row .v[readonly] { color: #71717A; background: transparent; }
	.info-row .v.ro { color: #52525B; background: transparent; border-color: transparent; cursor: default; }
	.info-row .v.ro:hover { background: transparent; border-color: transparent; }

	/* Editable game attributes (→ Rackbeat) */
	.game-attrs { display: flex; flex-direction: column; border-top: 1px solid var(--border); }
	.ga-row { display: grid; grid-template-columns: 82px 1fr; align-items: center; gap: 8px; padding: 7px 12px; border-bottom: 1px solid #F5EDD8; }
	.ga-row .k { font-size: 11px; font-weight: 700; color: #8a7550; text-transform: capitalize; }
	.ga-row .num { font-size: 13px; font-weight: 500; color: #18181B; border: 1px solid var(--border); border-radius: 7px; padding: 5px 7px; background: #FAFAF7; font-family: inherit; width: 100%; box-sizing: border-box; min-width: 0; text-align: center; }
	.ga-row .num:focus { outline: none; border-color: #F57832; background: #fff; box-shadow: 0 0 0 3px rgba(245,120,50,0.1); }
	.ga-row .num.solo { text-align: left; }
	.fromto { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 5px; }
	.fromto .dash { color: #A1A1AA; font-weight: 600; }
	.ga-note { font-size: 11px; font-weight: 600; color: #15803D; padding: 6px 12px; }
	.ga-note.err { color: #B91C1C; }
	.cp-btns { display: flex; gap: 6px; flex-shrink: 0; }
	.drop-zone { border: 1.5px dashed #d4d4d8; border-radius: 10px; padding: 12px; margin-bottom: 10px; text-align: center; font-size: 12px; color: #a1a1aa; transition: background .15s, border-color .15s; }
	.drop-zone.over { border-color: #6D5BD0; background: #f5f3ff; color: #6D5BD0; }
</style>
