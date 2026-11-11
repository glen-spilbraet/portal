<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import CountrySelect from '$lib/components/CountrySelect.svelte';
	import SquareCropper from '$lib/components/SquareCropper.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const fDate = (s) => { if (!s) return 'No date'; const [y, m, d] = s.split('-').map(Number); return `${d} ${MON[m - 1]} ${y}`; };
	const img = (key, size) => (key ? `/api/img/${key}?size=${size}` : null);

	let search = $state('');
	const shown = $derived.by(() => {
		const q = search.trim().toLowerCase();
		if (!q) return data.items;
		return data.items.filter((i) => [i.header, i.subheader, i.tag, i.country, ...i.skus, ...i.skus.map((s) => data.products[s.toLowerCase()]?.name)]
			.some((v) => String(v ?? '').toLowerCase().includes(q)));
	});

	// ── Editor ─────────────────────────────────────────────────────────────────
	/** @returns {{ image_key: string | null, date: string, tag: string, header: string, subheader: string, country: string, skus: string[] }} */
	const blank = () => ({ image_key: null, date: new Date().toISOString().slice(0, 10), tag: '', header: '', subheader: '', country: '', skus: [] });
	let open = $state(false);
	let editId = $state(/** @type {string | null} */ (null));
	let form = $state(blank());
	/** @type {Record<string, {sku:string,name:string,image:string|null}>} */
	let picked = $state({});
	let saving = $state(false);
	let formError = $state('');

	function openNew() { editId = null; form = blank(); picked = {}; formError = ''; open = true; }
	function openEdit(i) {
		editId = i.id;
		form = { image_key: i.image_key, date: i.date ?? '', tag: i.tag ?? '', header: i.header ?? '', subheader: i.subheader ?? '', country: i.country ?? '', skus: [...i.skus] };
		picked = Object.fromEntries(i.skus.map((s) => [s, data.products[s.toLowerCase()] ?? { sku: s, name: s, image: null }]));
		formError = ''; open = true;
	}

	// Photo: pick → square crop → upload
	let fileInput = $state(/** @type {HTMLInputElement | null} */ (null));
	let cropFile = $state(/** @type {File | null} */ (null));
	let uploading = $state(false);
	async function onCropped(blob) {
		cropFile = null; uploading = true; formError = '';
		try {
			const fd = new FormData();
			fd.append('file', new File([blob], 'initiative.jpg', { type: 'image/jpeg' }));
			const res = await fetch('/api/initiatives/image', { method: 'POST', body: fd });
			if (!res.ok) throw new Error(`Upload failed (${res.status})`);
			form.image_key = (await res.json()).key;
		} catch (e) { formError = e instanceof Error ? e.message : 'Upload failed'; } finally { uploading = false; }
	}

	// Product picker
	let pq = $state('');
	let hits = $state(/** @type {any[]} */ ([]));
	let pTimer;
	function searchProducts() {
		clearTimeout(pTimer);
		const q = pq.trim();
		if (q.length < 2) { hits = []; return; }
		pTimer = setTimeout(async () => {
			const r = await fetch(`/api/initiatives/products?q=${encodeURIComponent(q)}`);
			hits = r.ok ? await r.json() : [];
		}, 220);
	}
	function addProduct(h) {
		if (!form.skus.includes(h.sku)) form.skus = [...form.skus, h.sku];
		picked = { ...picked, [h.sku]: { sku: h.sku, name: h.name, image: h.image ? `/api/img/${h.image}` : null } };
		pq = ''; hits = [];
	}
	const removeProduct = (s) => (form.skus = form.skus.filter((x) => x !== s));
	const pImg = (p) => (p?.image ? (p.image.startsWith('/api/img/') ? p.image : `/api/img/${p.image}`) : null);

	async function save() {
		formError = ''; saving = true;
		try {
			const res = await fetch(editId ? `/api/initiatives/${editId}` : '/api/initiatives', {
				method: editId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...form, date: form.date || null }),
			});
			const b = await res.json().catch(() => ({}));
			if (!res.ok) { formError = b.message ?? `Save failed (${res.status})`; return; }
			open = false;
			await invalidateAll();
		} finally { saving = false; }
	}
	async function remove() {
		if (!editId || !confirm('Delete this initiative? This cannot be undone.')) return;
		saving = true;
		try {
			const res = await fetch(`/api/initiatives/${editId}`, { method: 'DELETE' });
			if (!res.ok) { formError = `Delete failed (${res.status})`; return; }
			open = false;
			await invalidateAll();
		} finally { saving = false; }
	}
</script>

<svelte:head><title>Initiatives — Sales</title></svelte:head>
<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && !cropFile) open = false; }} />

<AppNav active="initiatives" user={data.user} />

<main class="page">
	<div class="head">
		<div>
			<h1>Initiatives</h1>
			<p class="sub">Your own initiatives — shown on shared reports' Initiatives pane next to awards, press and events, sorted by date. A card shows on a report when one of its products is in that report.</p>
		</div>
		<button class="primary" type="button" onclick={openNew}>+ New initiative</button>
	</div>

	{#if data.items.length}
		<div class="bar"><input class="search" placeholder="Search header, tag, country or product…" bind:value={search} /></div>
	{/if}

	{#if !data.items.length}
		<div class="empty"><p><strong>No initiatives yet.</strong></p><p class="muted">Use <em>New initiative</em> to add one — a photo, date, tag, header and the products it's about.</p></div>
	{:else if !shown.length}
		<div class="empty"><p><strong>No matches.</strong></p></div>
	{:else}
		<div class="grid">
			{#each shown as i (i.id)}
				<button type="button" class="card" onclick={() => openEdit(i)} title="Edit">
					<div class="sq" class:pat={!i.image_key}>
						{#if i.image_key}<img src={img(i.image_key, 600)} alt="" loading="lazy" />{/if}
						{#if i.tag}<span class="pill">{i.tag}</span>{/if}
					</div>
					<div class="body">
						<h3>{i.header}</h3>
						{#if i.subheader}<p class="subh">{i.subheader}</p>{/if}
						<p class="meta">{[i.country, fDate(i.date)].filter(Boolean).join(' · ')}</p>
						<div class="prods">
							{#each i.skus.slice(0, 1) as s}
								{@const p = data.products[s.toLowerCase()]}
								{#if pImg(p)}<img src="{pImg(p)}?size=300" alt="" />{:else}<span class="ph"></span>{/if}
								<span class="pn">{p?.name ?? s}</span>
							{/each}
							{#if i.skus.length > 1}<span class="plus">+{i.skus.length - 1}</span>{/if}
						</div>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</main>

{#if open}
	<div class="ov" onclick={() => (open = false)} role="presentation">
		<div class="dlg" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Initiative">
			<h3 class="dt">{editId ? 'Edit initiative' : 'New initiative'}</h3>
			<div class="form">
				<div class="photo">
					<div class="ph-box" class:pat={!form.image_key}>
						{#if form.image_key}<img src={img(form.image_key, 600)} alt="" />{/if}
						{#if form.tag}<span class="pill">{form.tag}</span>{/if}
					</div>
					<div class="ph-actions">
						<button type="button" class="ghost sm" onclick={() => fileInput?.click()} disabled={uploading}>{uploading ? 'Uploading…' : form.image_key ? 'Replace photo' : 'Upload photo'}</button>
						{#if form.image_key}<button type="button" class="ghost sm danger" onclick={() => (form.image_key = null)}>Remove</button>{/if}
					</div>
					<input type="file" accept="image/*" hidden bind:this={fileInput} onchange={(e) => { cropFile = e.currentTarget.files?.[0] ?? null; e.currentTarget.value = ''; }} />
					<p class="hint">Cropped to a square. No photo = orange pattern.</p>
				</div>
				<div class="fields">
					<label class="fld"><span>Header *</span><input bind:value={form.header} placeholder="e.g. Instagram giveaway" /></label>
					<label class="fld"><span>Subheader</span><input bind:value={form.subheader} placeholder="e.g. 12,000 entries in 3 days" /></label>
					<div class="row">
						<label class="fld"><span>Tag (pill)</span><input bind:value={form.tag} maxlength="40" placeholder="e.g. Campaign" /></label>
						<label class="fld"><span>Date</span><input type="date" bind:value={form.date} /></label>
					</div>
					<label class="fld"><span>Country</span><CountrySelect bind:value={form.country} /></label>
					<div class="fld">
						<span>Products *</span>
						{#if form.skus.length}
							<ul class="picked">
								{#each form.skus as s (s)}
									{@const p = picked[s]}
									<li>
										{#if pImg(p)}<img src="{pImg(p)}?size=300" alt="" />{:else}<span class="ph"></span>{/if}
										<span class="pn">{p?.name ?? s}</span><span class="psku">{s}</span>
										<button type="button" class="x" onclick={() => removeProduct(s)} aria-label="Remove {s}">×</button>
									</li>
								{/each}
							</ul>
						{/if}
						<div class="picker">
							<input bind:value={pq} oninput={searchProducts} placeholder="Search product name or SKU…" />
							{#if hits.length}
								<ul class="hits">
									{#each hits as h (h.sku)}
										<li><button type="button" onclick={() => addProduct(h)} disabled={form.skus.includes(h.sku)}>
											{#if h.image}<img src="/api/img/{h.image}?size=300" alt="" />{:else}<span class="ph"></span>{/if}
											<span class="pn">{h.name}</span><span class="psku">{h.sku}</span>
										</button></li>
									{/each}
								</ul>
							{/if}
						</div>
					</div>
				</div>
			</div>
			{#if formError}<p class="err">{formError}</p>{/if}
			<div class="foot">
				{#if editId}<button type="button" class="ghost danger" onclick={remove} disabled={saving}>Delete</button>{/if}
				<span class="grow"></span>
				<button type="button" class="ghost" onclick={() => (open = false)}>Cancel</button>
				<button type="button" class="primary" onclick={save} disabled={saving || uploading || !form.header.trim() || !form.skus.length}>{saving ? 'Saving…' : editId ? 'Save' : 'Create'}</button>
			</div>
		</div>
	</div>
{/if}

{#if cropFile}
	<SquareCropper file={cropFile} onconfirm={onCropped} oncancel={() => (cropFile = null)} />
{/if}

<style>
	.page { max-width: 1200px; margin: 0 auto; padding: 40px 28px 80px; }
	.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; }
	h1 { font-size: 26px; font-weight: 800; color: #18181B; letter-spacing: -0.5px; margin: 0 0 4px; }
	.sub { font-size: 14px; color: #A89060; font-weight: 500; margin: 0; max-width: 720px; }
	.bar { margin-bottom: 14px; }
	.search { width: 100%; max-width: 360px; padding: 9px 14px; border: 1px solid var(--border); border-radius: 9px; font-size: 14px; font-family: inherit; background: #FFFBF0; outline: none; }
	.search:focus { border-color: #F57832; background: #fff; }
	.empty { text-align: center; padding: 48px 20px; background: #fff; border: 1px dashed var(--border); border-radius: 14px; }
	.empty p { margin: 4px 0; }
	.muted { color: #8a7f6a; font-size: 13.5px; }

	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }
	.card { text-align: left; font: inherit; color: inherit; padding: 0; background: #fff; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; cursor: pointer; transition: box-shadow .12s, transform .12s; }
	.card:hover { box-shadow: 0 8px 24px -12px rgba(120,90,40,.35); transform: translateY(-1px); }
	.sq, .ph-box { position: relative; aspect-ratio: 1; background: #FBF7EF; overflow: hidden; }
	.sq img, .ph-box img { width: 100%; height: 100%; object-fit: cover; display: block; }
	.pat { background: #F57832; }
	.pat::before { content: ''; position: absolute; inset: 0; background: url('/pattern.png') center / 300px auto repeat; filter: brightness(0) invert(1); opacity: .28; }
	.pill { position: absolute; top: 10px; left: 10px; z-index: 2; font-size: 11.5px; font-weight: 800; padding: 3px 10px; border-radius: 100px; background: #fff; color: #7B3803; box-shadow: 0 2px 8px rgba(0,0,0,.12); }
	.body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
	h3 { margin: 0; font-size: 15px; font-weight: 800; color: #18181B; }
	.subh { margin: 0; font-size: 13px; color: #524431; }
	.meta { margin: 0; font-size: 12.5px; color: #8a7f6a; font-weight: 600; }
	.prods { margin-top: auto; padding-top: 10px; border-top: 1px solid #F0E6D2; display: flex; align-items: center; gap: 8px; min-width: 0; }
	.prods img, .prods .ph, .picked img, .picked .ph, .hits img, .hits .ph { width: 32px; height: 32px; border-radius: 7px; object-fit: contain; background: #FBF7EF; flex-shrink: 0; }
	.pn { font-size: 13px; font-weight: 700; color: #3F3A31; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
	.plus { flex-shrink: 0; font-size: 12px; font-weight: 800; color: #C4581B; background: #FFF1E6; border-radius: 100px; padding: 3px 9px; }

	.ov { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: grid; place-items: center; z-index: 50; padding: 16px; }
	.dlg { background: #fff; border-radius: 16px; padding: 22px; width: min(860px, 100%); max-height: 92vh; overflow: auto; box-shadow: 0 20px 60px rgba(0,0,0,.25); }
	.dt { margin: 0 0 14px; font-size: 18px; font-weight: 800; }
	.form { display: grid; grid-template-columns: 240px 1fr; gap: 20px; }
	.ph-box { border-radius: 12px; border: 1px solid var(--border); }
	.ph-actions { display: flex; gap: 6px; margin-top: 8px; }
	.hint { font-size: 12px; color: #A1A1AA; margin: 6px 0 0; }
	.fields { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
	.row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.fld { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; font-weight: 700; color: #524431; }
	.fld input { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; font-family: inherit; outline: none; }
	.fld input:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,.12); }
	.picked { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
	.picked li { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border: 1px solid var(--border); border-radius: 9px; }
	.psku { font-size: 11.5px; color: #A1A1AA; font-weight: 700; }
	.x { border: none; background: none; font-size: 18px; color: #A1A1AA; cursor: pointer; padding: 0 4px; }
	.x:hover { color: #dc2626; }
	.picker { position: relative; }
	.picker input { width: 100%; box-sizing: border-box; }
	.hits { list-style: none; margin: 4px 0 0; padding: 4px; border: 1px solid var(--border); border-radius: 10px; background: #fff; max-height: 260px; overflow: auto; box-shadow: 0 8px 24px rgba(0,0,0,.08); }
	.hits button { width: 100%; display: flex; align-items: center; gap: 8px; padding: 6px; border: none; background: none; border-radius: 7px; cursor: pointer; font: inherit; text-align: left; }
	.hits button:hover:not(:disabled) { background: #FBF5E6; }
	.hits button:disabled { opacity: .45; cursor: default; }
	.err { color: #dc2626; font-size: 13px; font-weight: 700; margin: 12px 0 0; }
	.foot { display: flex; align-items: center; gap: 8px; margin-top: 18px; }
	.grow { flex: 1; }
	button.primary, button.ghost { font-family: inherit; font-size: 14px; font-weight: 700; border-radius: 9px; padding: 9px 16px; cursor: pointer; white-space: nowrap; }
	.primary { background: #F57832; color: #fff; border: none; }
	.primary:disabled { opacity: .55; cursor: default; }
	.ghost { background: #fff; border: 1px solid var(--border); color: #18181B; }
	.ghost.sm { font-size: 12.5px; padding: 6px 11px; }
	.ghost.danger { color: #dc2626; border-color: #fecaca; }
	@media (max-width: 720px) { .form { grid-template-columns: 1fr; } .head { flex-direction: column; } }
</style>
