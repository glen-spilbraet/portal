<script>
	/**
	 * Edit the webshop landing-page content for one publisher or series:
	 * subheader + text per language, and one 4:3 image (often a logo).
	 * Talks to /api/admin/brand-pages.
	 */
	import { untrack } from 'svelte';
	import AspectCropper from './AspectCropper.svelte';

	let { kind, ref, initial = null, onsaved = () => {} } = $props();

	const LANGS = [
		{ code: 'da', label: 'Danish' }, { code: 'sv', label: 'Swedish' }, { code: 'no', label: 'Norwegian' },
		{ code: 'en', label: 'English' }, { code: 'pl', label: 'Polish' }
	];
	const blank = () => Object.fromEntries(LANGS.map((l) => [l.code, { subheader: '', body: '' }]));

	let loaded = $state(false);
	let imageKey = $state(/** @type {string | null} */ (null));
	let show = $state(false);
	let toggling = $state(false);
	let updatedAt = $state(/** @type {string | null} */ (null));
	let updatedBy = $state(/** @type {string | null} */ (null));
	/** @type {Record<string, {subheader: string, body: string}>} */
	let texts = $state(blank());
	let saved = $state(''); // JSON of last-saved texts → dirty check
	let lang = $state('da');
	let saving = $state(false);
	let uploading = $state(false);
	let msg = $state('');
	/** @type {File | null} */
	let cropFile = $state(null);
	/** @type {HTMLInputElement | null} */
	let fileEl = $state(null);

	const dirty = $derived(loaded && JSON.stringify(texts) !== saved);
	const filled = (/** @type {string} */ c) => !!(texts[c]?.subheader?.trim() || texts[c]?.body?.trim());

	/** @param {any} d */
	function apply(d) {
		imageKey = d.image_key ?? null;
		show = !!d.show_in_shop;
		updatedAt = d.updated_at ?? null;
		updatedBy = d.updated_by ?? null;
		const t = blank();
		for (const l of LANGS) if (d.texts?.[l.code]) t[l.code] = { subheader: d.texts[l.code].subheader ?? '', body: d.texts[l.code].body ?? '' };
		texts = t;
		saved = JSON.stringify(t);
		loaded = true;
	}

	async function load() {
		if (initial) { apply(initial); return; }
		const res = await fetch(`/api/admin/brand-pages?kind=${kind}&ref=${encodeURIComponent(ref)}`);
		if (res.ok) apply(await res.json()); else msg = `Could not load (${res.status})`;
	}
	// Reload only when the publisher/series changes (not when `initial` is refreshed).
	$effect(() => { void ref; untrack(() => { loaded = false; load(); }); });

	async function save() {
		saving = true; msg = '';
		try {
			const res = await fetch('/api/admin/brand-pages', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ kind, ref, texts })
			});
			if (!res.ok) throw new Error(await res.text());
			apply(await res.json());
			onsaved();
			msg = 'Saved';
			setTimeout(() => { if (msg === 'Saved') msg = ''; }, 2000);
		} catch (e) { msg = 'Save failed: ' + (e instanceof Error ? e.message : String(e)); }
		finally { saving = false; }
	}

	async function toggleShow() {
		const next = !show;
		show = next; toggling = true; msg = '';
		try {
			const res = await fetch('/api/admin/brand-pages', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ kind, ref, op: 'show', show: next })
			});
			if (!res.ok) throw new Error(await res.text());
			const d = await res.json();
			show = !!d.show_in_shop; updatedAt = d.updated_at; updatedBy = d.updated_by;
			onsaved();
		} catch (e) { show = !next; msg = 'Could not change: ' + (e instanceof Error ? e.message : String(e)); }
		finally { toggling = false; }
	}

	function pick() { fileEl?.click(); }
	function onFile(e) {
		const f = e.currentTarget.files?.[0];
		e.currentTarget.value = '';
		if (f) cropFile = f;
	}
	async function upload(/** @type {Blob} */ blob) {
		cropFile = null; uploading = true; msg = '';
		try {
			const fd = new FormData();
			fd.set('kind', kind); fd.set('ref', ref);
			fd.set('file', new File([blob], blob.type === 'image/png' ? 'image.png' : 'image.jpg', { type: blob.type }));
			const res = await fetch('/api/admin/brand-pages', { method: 'PUT', body: fd });
			if (!res.ok) throw new Error(await res.text());
			const d = await res.json();
			imageKey = d.image_key; updatedAt = d.updated_at; updatedBy = d.updated_by;
			onsaved();
		} catch (e) { msg = 'Upload failed: ' + (e instanceof Error ? e.message : String(e)); }
		finally { uploading = false; }
	}
	async function removeImage() {
		if (!confirm('Remove the image?')) return;
		uploading = true;
		try {
			const res = await fetch('/api/admin/brand-pages', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ kind, ref, op: 'clear_image' })
			});
			if (!res.ok) throw new Error(await res.text());
			imageKey = null;
			onsaved();
		} catch (e) { msg = 'Remove failed: ' + (e instanceof Error ? e.message : String(e)); }
		finally { uploading = false; }
	}

	function onKey(e) {
		if ((e.metaKey || e.ctrlKey) && e.key === 's' && dirty) { e.preventDefault(); save(); }
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="editor" onkeydown={onKey}>
	{#if !loaded}
		<p class="muted">Loading…</p>
	{:else}
		<div class="show-row">
			<button type="button" class="switch" class:on={show} role="switch" aria-checked={show} onclick={toggleShow} disabled={toggling}>
				<span class="knob"></span>
			</button>
			<span class="show-label">Show in shop</span>
			<span class="show-hint">{show ? 'The shop shows this landing page.' : 'Hidden — the shop has no landing page for it.'}</span>
		</div>
		<div class="grid">
			<div class="img-col">
				<div class="img-box" class:empty={!imageKey}>
					{#if imageKey}
						<img src="/api/img/{imageKey}" alt="" />
					{:else}
						<span>No image<br /><small>4:3 — often a logo</small></span>
					{/if}
				</div>
				<div class="img-actions">
					<button type="button" class="btn-ghost sm" onclick={pick} disabled={uploading}>{uploading ? 'Uploading…' : imageKey ? 'Replace' : 'Upload image'}</button>
					{#if imageKey}<button type="button" class="btn-del sm" onclick={removeImage} disabled={uploading}>Remove</button>{/if}
				</div>
				<input bind:this={fileEl} type="file" accept="image/png,image/jpeg,image/webp" hidden onchange={onFile} />
			</div>

			<div class="text-col">
				<div class="tabs" role="tablist">
					{#each LANGS as l (l.code)}
						<button type="button" role="tab" class="tab" class:on={lang === l.code} aria-selected={lang === l.code} title={l.label} onclick={() => (lang = l.code)}>
							{l.code.toUpperCase()}<span class="dot" class:filled={filled(l.code)}></span>
						</button>
					{/each}
				</div>
				<label class="fld">Subheader
					<input bind:value={texts[lang].subheader} placeholder="e.g. Comfort and development from 0 to 18 months" maxlength="200" />
				</label>
				<label class="fld">Text
					<textarea bind:value={texts[lang].body} rows="7" placeholder="What the brand / series is about — shown on the shop's landing page."></textarea>
				</label>
				<div class="foot">
					<span class="meta">
						{#if msg}<span class:err={msg !== 'Saved'}>{msg}</span>
						{:else if updatedAt}Last saved {updatedAt.slice(0, 16)}{updatedBy ? ` by ${updatedBy}` : ''}{/if}
					</span>
					<button type="button" class="btn-primary" onclick={save} disabled={!dirty || saving}>{saving ? 'Saving…' : dirty ? 'Save texts' : 'Saved'}</button>
				</div>
			</div>
		</div>
	{/if}
</div>

{#if cropFile}
	<AspectCropper file={cropFile} aspect={4 / 3} title="Crop image (4:3)" onconfirm={upload} oncancel={() => (cropFile = null)} />
{/if}

<style>
	.show-row { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
	.switch { position: relative; width: 40px; height: 22px; border-radius: 100px; border: none; background: #D4D4D8; cursor: pointer; padding: 0; transition: background .15s; flex: none; }
	.switch.on { background: #16a34a; }
	.switch:disabled { opacity: .6; cursor: default; }
	.knob { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: left .15s; }
	.switch.on .knob { left: 21px; }
	.show-label { font-size: 14px; font-weight: 800; color: #18181B; }
	.show-hint { font-size: 12px; color: #A1A1AA; }
	.muted { color: #A1A1AA; font-size: 13px; margin: 0; }
	.grid { display: grid; grid-template-columns: 220px 1fr; gap: 20px; }
	@media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
	.img-box { aspect-ratio: 4 / 3; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; display: grid; place-items: center;
		background-color: #fff; background-image: linear-gradient(45deg, #f4f4f5 25%, transparent 25%), linear-gradient(-45deg, #f4f4f5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f4f4f5 75%), linear-gradient(-45deg, transparent 75%, #f4f4f5 75%); background-size: 14px 14px; background-position: 0 0, 0 7px, 7px -7px, -7px 0; }
	.img-box.empty { background: #FFFBF0; border-style: dashed; text-align: center; color: #A89060; font-size: 13px; font-weight: 600; }
	.img-box small { font-weight: 500; color: #A1A1AA; }
	.img-box img { width: 100%; height: 100%; object-fit: contain; display: block; }
	.img-actions { display: flex; gap: 6px; margin-top: 8px; }

	.tabs { display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap; }
	.tab { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border: 1px solid var(--border); background: #fff; border-radius: 8px; font: inherit; font-size: 12px; font-weight: 700; color: #71717A; cursor: pointer; }
	.tab.on { border-color: #F57832; color: #7B3803; background: #FFF3E2; }
	.dot { width: 7px; height: 7px; border-radius: 50%; background: #E4E4E7; }
	.dot.filled { background: #16a34a; }
	.fld { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: #52525B; margin-bottom: 10px; }
	.fld input, .fld textarea { padding: 9px 12px; border: 1px solid var(--border); border-radius: 9px; font-size: 14px; font-family: inherit; font-weight: 400; color: #18181B; outline: none; background: #FFFBF0; resize: vertical; }
	.fld input:focus, .fld textarea:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); background: #fff; }
	.foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
	.meta { font-size: 12px; color: #A1A1AA; }
	.meta .err { color: #dc2626; }

	.btn-primary { padding: 9px 16px; background: #F57832; color: #fff; border: none; border-radius: 9px; font-size: 14px; font-weight: 700; font-family: inherit; cursor: pointer; }
	.btn-primary:disabled { opacity: 0.55; cursor: default; }
	.btn-ghost { padding: 8px 14px; background: #fff; border: 1px solid var(--border); border-radius: 9px; font-size: 13px; font-weight: 600; font-family: inherit; cursor: pointer; color: #52525B; }
	.btn-del { border: 1px solid #fecaca; color: #dc2626; background: none; border-radius: 7px; padding: 6px 12px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
	.sm { padding: 5px 11px; font-size: 12px; border-radius: 7px; }
</style>
