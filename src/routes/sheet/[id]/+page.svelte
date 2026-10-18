<script>
	import { invalidateAll } from '$app/navigation';
	import MarkdownEditor from '$lib/components/MarkdownEditor.svelte';

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
	let saveStatus = $state('saved');
	let saveTimer = null;
	function flashSaved() { saveStatus = 'saving'; clearTimeout(saveTimer); saveTimer = setTimeout(() => (saveStatus = 'saved'), 900); }

	// ── Per-language text (re-loaded on language switch) ───────────────────────
	let t = $state(normT(data.translations));
	let uspCount = $state(data.sheet.usp_count ?? 3);

	// Product name is NOT translatable — one shared value, written to every language.
	let name = $state(data.baseTranslations?.product_name ?? data.translations?.product_name ?? '');
	async function saveName() {
		flashSaved();
		for (const l of data.languages) {
			await fetch(`/api/sheets/${sheetId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'translation', language: l.code, key: 'product_name', value: name }) });
		}
		t = { ...t, product_name: name };
	}

	async function switchLanguage(code) {
		if (code === language) return;
		const res = await fetch(`/api/sheets/${sheetId}?lang=${code}`);
		t = normT(res.ok ? await res.json() : {});
		language = code;
	}

	async function putTranslation(key, value) {
		t = { ...t, [key]: value };
		flashSaved();
		await fetch(`/api/sheets/${sheetId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'translation', language, key, value: value ?? '' }) });
	}
	async function putSheet(field, value) {
		flashSaved();
		await fetch(`/api/sheets/${sheetId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'sheet', field, value }) });
	}

	// ── Bullets (usp_1..usp_count) ─────────────────────────────────────────────
	function usp(i) { return t[`usp_${i + 1}`] ?? ''; }
	async function addBullet() { if (uspCount >= 6) return; uspCount += 1; await putSheet('usp_count', uspCount); }
	async function removeBullet(idx) {
		const vals = Array.from({ length: uspCount }, (_, i) => usp(i));
		vals.splice(idx, 1);
		for (let i = 0; i < vals.length; i++) await putTranslation(`usp_${i + 1}`, vals[i]);
		await putTranslation(`usp_${vals.length + 1}`, '');
		uspCount = vals.length;
		await putSheet('usp_count', uspCount);
	}

	// ── Copy / paste all universal text (for translation) ──────────────────────
	// Unique {#…} markers so they never collide with Markdown '#' headers.
	let copyMsg = $state('');
	let pasteMsg = $state('');
	function buildExport() {
		const out = ['{#Description}', (t.product_description ?? '').trim(), ''];
		for (let i = 0; i < uspCount; i++) out.push(`{#Bullet ${i + 1}}`, (usp(i) ?? '').trim(), '');
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
		let maxBullet = 0;
		for (const [secName, content] of parseExport(text)) {
			const low = secName.toLowerCase();
			if (low === 'description') await putTranslation('product_description', content);
			else if (low === 'long description') await putTranslation('long_description', content);
			else { const m = low.match(/^bullet\s+(\d+)$/); if (m) { const n = +m[1]; if (n >= 1 && n <= 6) { maxBullet = Math.max(maxBullet, n); await putTranslation(`usp_${n}`, content); } } }
		}
		if (maxBullet > uspCount) { uspCount = Math.min(6, maxBullet); await putSheet('usp_count', uspCount); }
		pasteMsg = 'Pasted!'; setTimeout(() => (pasteMsg = ''), 2000);
	}

	// ── Basic product info (data_fields, shared across languages) ──────────────
	let dataFields = $state(JSON.parse(data.sheet.data_fields || '[]'));
	const STOCK_KEY = 'stock_date';
	const infoFields = $derived(dataFields.filter((f) => f.key !== STOCK_KEY));
	const stockIdx = $derived(dataFields.findIndex((f) => f.key === STOCK_KEY));
	function fieldLabel(f) { return data.globalLabels?.[f.key]?.[language] ?? data.globalLabels?.[f.key]?.en ?? f.label ?? f.key; }
	async function saveDataFields() { flashSaved(); await putSheet('data_fields', JSON.stringify(dataFields)); }

	let refreshing = $state(false);
	let refreshMsg = $state('');
	async function refreshFromRackbeat() {
		if (refreshing) return;
		refreshing = true; refreshMsg = '';
		try {
			const res = await fetch(`/api/sheets/${sheetId}/refresh`, { method: 'POST' });
			if (res.ok) { const b = await res.json(); if (Array.isArray(b.data_fields)) dataFields = b.data_fields; refreshMsg = 'Updated'; }
			else refreshMsg = 'Failed';
		} catch { refreshMsg = 'Failed'; }
		refreshing = false;
		setTimeout(() => (refreshMsg = ''), 2500);
	}

	// ── Videos ─────────────────────────────────────────────────────────────────
	const YT_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
	let videoUrl = $state('');
	let videoOrient = $state('auto'); // 'auto' | '16:9' | '9:16'
	let videoErr = $state('');
	async function addVideo() {
		const url = videoUrl.trim();
		if (!YT_RE.test(url)) { videoErr = 'Not a valid YouTube URL'; return; }
		videoErr = '';
		const orientation = videoOrient === 'auto' ? undefined : videoOrient;
		await fetch(`/api/sheets/${sheetId}/videos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, orientation }) });
		videoUrl = ''; videoOrient = 'auto';
		flashSaved(); await invalidateAll();
	}
	async function removeVideo(id) {
		await fetch(`/api/sheets/${sheetId}/videos?videoId=${id}`, { method: 'DELETE' });
		flashSaved(); await invalidateAll();
	}
	const ytId = (u) => (u.match(YT_RE)?.[1] ?? null);

	// ── Images ───────────────────────────────────────────────────────────────
	let uploading = $state('');
	async function upload(file, type) {
		if (!file) return;
		uploading = type;
		const fd = new FormData();
		fd.append('file', file); fd.append('sheetId', sheetId); fd.append('type', type);
		if (type === 'content' || type === 'grid') fd.append('order', String(Date.now()));
		await fetch('/api/images', { method: 'POST', body: fd });
		uploading = '';
		flashSaved(); await invalidateAll();
	}
	async function deleteImg(id) {
		await fetch(`/api/images/${id}`, { method: 'DELETE' });
		flashSaved(); await invalidateAll();
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
	const imgUrl = (key) => `/api/img/${key}`;

	// hidden file inputs
	let boxInput, flatInput, contentInput, gridInput;

	// ── Settings ───────────────────────────────────────────────────────────────
	let hidden = $state(JSON.parse(data.sheet.hidden_elements || '{}'));
	let ctaId = $state(data.sheet.cta_version_id ?? null);
	const TOGGLES = [
		{ key: 'cta', label: 'CTA' }, { key: 'stock_date', label: 'Stock date' }, { key: 'list_price', label: 'List price' },
		{ key: 'description', label: 'Short description' }, { key: 'bullets', label: 'Bullets' }, { key: 'badges', label: 'ATA icons' }, { key: 'data', label: 'Data table' },
	];
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
		uspCount = data.sheet.usp_count ?? 3;
		dataFields = JSON.parse(data.sheet.data_fields || '[]');
		hidden = JSON.parse(data.sheet.hidden_elements || '{}');
		ctaId = data.sheet.cta_version_id ?? null;
		language = data.language;
		videoUrl = ''; videoOrient = 'auto'; videoErr = '';
	});
</script>

<svelte:head><title>Edit {data.sheet.sku} — Sheet</title></svelte:head>

<div class="editor">
	<header class="bar">
		<div class="left">
			<a href="/sheets" class="back">← Sheets</a>
			<span class="sku">{data.sheet.sku}</span>
		</div>
		<div class="lang-tabs">
			{#each langs as l}
				<button class="lang-tab" class:active={language === l.code} onclick={() => switchLanguage(l.code)}>
					{l.label}{#if l.code === data.primaryLanguage}<span class="pri">Primary</span>{/if}
				</button>
			{/each}
		</div>
		<div class="right">
			<span class="save" class:on={saveStatus === 'saving'}><span class="dot"></span>{saveStatus === 'saving' ? 'Saving…' : 'Saved'}</span>
			<a class="btn ghost" href="/sheet/{sheetId}/award?lang={language}">Award View</a>
			<a class="btn primary" href="/sheet/{sheetId}/preview?lang={language}" target="_blank">Preview</a>
		</div>
	</header>

	<main class="layout">
		<!-- Basic product info: floating left panel, table-ish -->
		<aside class="side">
			<div class="side-card">
				<div class="side-head"><h2>Product info</h2>
					<button class="mini" onclick={refreshFromRackbeat} disabled={refreshing} title="Refresh data fields from Rackbeat">{refreshMsg || (refreshing ? '…' : 'Refresh')}</button>
				</div>
				<label class="name-fld"><span>Product name <em>(all languages)</em></span>
					<input bind:value={name} onblur={saveName} placeholder="Product name" />
				</label>
				<div class="info-table">
					{#each dataFields as f, i}
						{#if f.key !== STOCK_KEY}
							<div class="info-row"><span class="k">{fieldLabel(f)}</span>
								<input class="v" bind:value={dataFields[i].value} readonly={f.key === 'sku'} onblur={saveDataFields} />
							</div>
						{/if}
					{/each}
				</div>
			</div>
		</aside>

		<div class="main-col">
		<!-- Universal (per language) -->
		<section class="card">
			<div class="card-head">
				<div><h2>Universal info</h2><span class="hint">Per language ({language.toUpperCase()}) · shared across sheet, catalogue &amp; webshop</span></div>
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
					{#each Array(uspCount) as _, i}
						<div class="bullet-row">
							<input value={usp(i)} oninput={(e) => (t[`usp_${i + 1}`] = e.currentTarget.value)} onblur={(e) => putTranslation(`usp_${i + 1}`, e.currentTarget.value)} placeholder="Bullet {i + 1}" />
							<button class="x" title="Remove" onclick={() => removeBullet(i)}>✕</button>
						</div>
					{/each}
					{#if uspCount < 6}<button class="add" onclick={addBullet}>+ Add bullet</button>{/if}
				</div>
			</div>
			<div class="fld"><span>Long description <em>(webshop)</em></span>
				<MarkdownEditor bind:value={t.long_description} onchange={(v) => putTranslation('long_description', v)} />
			</div>
		</section>

		<!-- Videos -->
		<section class="card">
			<div class="card-head"><h2>Videos</h2><span class="hint">YouTube — normal (16:9) or Shorts (9:16), auto-detected</span></div>
			{#if data.videos.length}
				<div class="vid-list">
					{#each data.videos as v (v.id)}
						<div class="vid">
							{#if ytId(v.url)}<img class="vthumb" class:portrait={v.orientation === '9:16'} src="https://img.youtube.com/vi/{ytId(v.url)}/mqdefault.jpg" alt="" />{/if}
							<div class="vmeta"><span class="vorient {v.orientation === '9:16' ? 'p' : 'l'}">{v.orientation}</span><a class="vurl" href={v.url} target="_blank" rel="noopener">{v.url}</a></div>
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

		<!-- Images -->
		<section class="card">
			<div class="card-head"><h2>Images</h2></div>

			<div class="img-group">
				<h3>Box photo</h3>
				<div class="box-row">
					<div class="box-slot">
						<span class="slot-label">3D <em>(sheet main)</em></span>
						{#if data.sheet.box_image_key}<img src={imgUrl(data.sheet.box_image_key)} alt="" />{:else}<div class="ph">No 3D photo</div>{/if}
						<button class="mini" onclick={() => boxInput.click()} disabled={uploading === 'box'}>{uploading === 'box' ? 'Uploading…' : 'Replace'}</button>
						<input type="file" accept="image/*" bind:this={boxInput} onchange={(e) => upload(e.currentTarget.files?.[0], 'box')} hidden />
					</div>
					<div class="box-slot">
						<span class="slot-label">Flat <em>(webshop)</em></span>
						{#if data.sheet.box_flat_image_key}<img src={imgUrl(data.sheet.box_flat_image_key)} alt="" />{:else}<div class="ph">No flat photo</div>{/if}
						<div class="slot-actions">
							<button class="mini" onclick={() => flatInput.click()} disabled={uploading === 'box_flat'}>{uploading === 'box_flat' ? 'Uploading…' : 'Replace'}</button>
							{#if data.sheet.box_flat_image_key}<button class="mini danger" onclick={clearBoxFlat}>Remove</button>{/if}
						</div>
						<input type="file" accept="image/*" bind:this={flatInput} onchange={(e) => upload(e.currentTarget.files?.[0], 'box_flat')} hidden />
					</div>
				</div>
			</div>

			<div class="img-group">
				<div class="group-head"><h3>Content <em>(webshop)</em></h3><button class="mini" onclick={() => contentInput.click()} disabled={uploading === 'content'}>{uploading === 'content' ? 'Uploading…' : '+ Add'}</button></div>
				<input type="file" accept="image/*" bind:this={contentInput} onchange={(e) => upload(e.currentTarget.files?.[0], 'content')} hidden />
				{#if data.contentImages.length}
					<div class="thumbs">{#each data.contentImages as img (img.id)}<div class="thumb"><img src={imgUrl(img.r2_key)} alt="" /><button class="x" onclick={() => deleteImg(img.id)}>✕</button></div>{/each}</div>
				{:else}<p class="empty">No content images.</p>{/if}
			</div>

			<div class="img-group">
				<div class="group-head"><h3>People Playing <em>(sheet grid)</em></h3><button class="mini" onclick={() => gridInput.click()} disabled={uploading === 'grid'}>{uploading === 'grid' ? 'Uploading…' : '+ Add'}</button></div>
				<input type="file" accept="image/*" bind:this={gridInput} onchange={(e) => upload(e.currentTarget.files?.[0], 'grid')} hidden />
				{#if data.images.length}
					<div class="thumbs">{#each data.images as img (img.id)}
						<div class="thumb">
							<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
							<img src={imgUrl(img.r2_key)} alt="" title="Click to set focal point" style="object-position:{img.crop_x ?? 50}% {img.crop_y ?? 50}%" onclick={(e) => setFocal(e, img)} />
							<button class="x" onclick={() => deleteImg(img.id)}>✕</button>
						</div>
					{/each}</div>
					<p class="hint">Click a photo to set its focal point (how it crops in the grid).</p>
				{:else}<p class="empty">No people-playing photos.</p>{/if}
			</div>
		</section>

		<!-- Settings -->
		<section class="card">
			<div class="card-head"><h2>Sheet settings</h2></div>
			{#if stockIdx >= 0}
				<label class="fld narrow"><span>Expected stock date <em>(free text, e.g. Q4, Nov '27)</em></span>
					<input bind:value={dataFields[stockIdx].value} onblur={saveDataFields} placeholder="Q4 / Nov '27 / In stock" />
				</label>
			{/if}
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
		</section>
		</div>
	</main>
</div>

<style>
	.editor { min-height: 100vh; }
	.bar { position: sticky; top: 0; z-index: 50; background: #fff; border-bottom: 1px solid var(--border); height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 20px; }
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
	.btn { display: inline-flex; align-items: center; padding: 6px 14px; border-radius: 100px; font-size: 12.5px; font-weight: 600; text-decoration: none; cursor: pointer; border: 1px solid transparent; font-family: inherit; }
	.btn.primary { background: #F57832; color: #fff; }
	.btn.ghost { background: #fff; color: #52525B; border-color: var(--border); }
	.btn.sm { padding: 7px 14px; }

	.form { max-width: 820px; margin: 0 auto; padding: 24px 20px 80px; display: flex; flex-direction: column; gap: 18px; }
	.card { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; }
	.card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
	.card-head h2 { font-size: 15px; font-weight: 800; color: #18181B; margin: 0; }
	.hint { font-size: 11.5px; color: #A1A1AA; }
	.err { font-size: 12px; color: #dc2626; margin: 6px 0 0; }
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
	.mini { font-size: 12px; font-weight: 700; color: #B15A12; background: #FDEEE4; border: 1px solid #F6CDAB; border-radius: 8px; padding: 5px 11px; cursor: pointer; font-family: inherit; }
	.mini:hover { background: #FBDDC7; }
	.mini.danger { color: #dc2626; background: #fff; border-color: #fecaca; }
	.mini:disabled { opacity: 0.6; cursor: default; }

	.bullets { display: flex; flex-direction: column; gap: 6px; }
	.bullet-row { display: flex; gap: 6px; }
	.bullet-row input { flex: 1; }
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
	.vid-add { display: flex; gap: 8px; }
	.vid-add input { flex: 1; } .vid-add select { width: auto; }

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
	.layout { max-width: 1120px; margin: 0 auto; padding: 24px 20px 80px; display: flex; align-items: flex-start; gap: 20px; }
	.main-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 18px; }
	.side { width: 300px; flex-shrink: 0; position: sticky; top: 68px; }
	@media (max-width: 860px) { .layout { flex-direction: column; } .side { width: 100%; position: static; } }
	.side-card { background: #fff; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
	.side-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 13px 16px; border-bottom: 1px solid var(--border); }
	.side-head h2 { font-size: 14px; font-weight: 800; color: #18181B; margin: 0; }
	.name-fld { display: flex; flex-direction: column; gap: 5px; padding: 12px 14px; border-bottom: 1px solid var(--border); }
	.name-fld span { font-size: 11px; font-weight: 700; color: #8a7550; }
	.name-fld em { font-weight: 500; color: #A1A1AA; font-style: normal; }
	.name-fld input { font-size: 14px; font-weight: 600; color: #18181B; border: 1px solid var(--border); border-radius: 8px; padding: 7px 9px; font-family: inherit; width: 100%; box-sizing: border-box; }
	.name-fld input:focus { outline: none; border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); }
	.info-table { display: flex; flex-direction: column; }
	.info-row { display: grid; grid-template-columns: 82px 1fr; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid #F5EDD8; }
	.info-row:last-child { border-bottom: none; }
	.info-row .k { font-size: 11px; font-weight: 700; color: #8a7550; text-transform: capitalize; }
	.info-row .v { font-size: 13px; font-weight: 500; color: #18181B; border: 1px solid transparent; border-radius: 7px; padding: 5px 7px; background: #FAFAF7; font-family: inherit; width: 100%; box-sizing: border-box; }
	.info-row .v:hover { border-color: var(--border); background: #fff; }
	.info-row .v:focus { outline: none; border-color: #F57832; background: #fff; box-shadow: 0 0 0 3px rgba(245,120,50,0.1); }
	.info-row .v[readonly] { color: #71717A; background: transparent; }
	.cp-btns { display: flex; gap: 6px; flex-shrink: 0; }
</style>
