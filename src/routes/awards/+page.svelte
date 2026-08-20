<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	const today = new Date().toISOString().slice(0, 10);
	const dFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
	function fdate(s) { if (!s) return 'Undated'; const d = new Date(s + 'T00:00:00Z'); return isNaN(d) ? s : dFmt.format(d); }

	// ── Group: year → (media + date), newest first ─────────────────────────────
	const years = $derived.by(() => {
		const byYear = {};
		for (const i of data.instances) {
			const date = i.instance_date || '';
			const yr = date.slice(0, 4) || 'Undated';
			const key = i.media_id + '|' + date;
			const gm = (byYear[yr] ??= {});
			const g = (gm[key] ??= { key, date, media_id: i.media_id, media_name: i.media_name, country: i.media_country, items: [], nominees: 0, winners: 0, statements: 0 });
			g.items.push(i);
			if (i.award_category) g.nominees++;
			if (i.is_winner) g.winners++;
			g.statements += i.statements?.length || 0;
		}
		return Object.entries(byYear)
			.sort((a, b) => b[0].localeCompare(a[0]))
			.map(([year, gm]) => ({ year, groups: Object.values(gm).sort((a, b) => (b.date || '').localeCompare(a.date || '')) }));
	});

	let expanded = $state({});
	const toggle = (k) => (expanded[k] = !expanded[k]);

	// ── Instance editor ────────────────────────────────────────────────────────
	let open = $state(false);
	let saving = $state(false);
	let form = $state(blank());
	function blank() { return { id: null, media_id: data.media[0]?.id ?? '', sku: '', product_name: '', award_category: '', is_winner: false, disclosure_date: '', instance_date: today, statements: [], proof_url: '', proof_key: '', proof_name: '', notes: '' }; }
	const selMedia = $derived(data.media.find((m) => m.id === form.media_id) ?? null);

	function openNew() { form = blank(); open = true; }
	function openEdit(i) {
		form = {
			id: i.id, media_id: i.media_id, sku: i.sku ?? '', product_name: i.product_name ?? '',
			award_category: i.award_category ?? '', is_winner: !!i.is_winner, disclosure_date: i.disclosure_date ?? '',
			instance_date: i.instance_date ?? today, proof_url: i.proof_url ?? '', proof_key: i.proof_key ?? '', proof_name: i.proof_key ? 'Uploaded file' : '',
			notes: i.notes ?? '', statements: (i.statements ?? []).map((s) => ({ statement: s.statement ?? '', score: s.score ?? '' }))
		};
		open = true;
	}
	function close() { open = false; }
	function addStatement() { form.statements = [...form.statements, { statement: '', score: '' }]; }
	function removeStatement(i) { form.statements = form.statements.filter((_, x) => x !== i); }

	// SKU autocomplete
	let skuResults = $state([]);
	let skuTimer;
	function onSku() {
		clearTimeout(skuTimer);
		const q = form.sku.trim();
		if (q.length < 2) { skuResults = []; return; }
		skuTimer = setTimeout(async () => {
			skuResults = await (await fetch(`/api/awards/products?q=${encodeURIComponent(q)}`)).json().catch(() => []);
		}, 200);
	}
	function pickSku(r) { form.sku = r.sku; form.product_name = r.name; skuResults = []; }

	async function uploadProof(e) {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		const fd = new FormData(); fd.append('file', file);
		const res = await fetch('/api/awards/proof', { method: 'POST', body: fd });
		if (res.ok) { const b = await res.json(); form.proof_key = b.key; form.proof_name = b.name; }
		else alert('Upload failed');
	}

	async function save() {
		if (!form.media_id || saving) return;
		saving = true;
		try {
			const url = form.id ? `/api/awards/instances/${form.id}` : '/api/awards/instances';
			const res = await fetch(url, { method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
			if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'Failed');
			open = false;
			await invalidateAll();
		} catch (e) { alert(e.message); } finally { saving = false; }
	}

	async function del(i) {
		if (!confirm('Delete this instance and its statements?')) return;
		await fetch(`/api/awards/instances/${i.id}`, { method: 'DELETE' });
		await invalidateAll();
	}
	const proofHref = (i) => (i.proof_url ? i.proof_url : i.proof_key ? `/api/img/${i.proof_key}` : null);
</script>

<svelte:head><title>Awards &amp; Press · Product Portal</title></svelte:head>

<AppNav active="awards" user={data.user} />

<main class="wrap">
	<div class="head">
		<div><h1>Awards &amp; Press</h1><p class="sub">Nominations, wins and press reviews · newest first, per media</p></div>
		<div class="head-actions">
			<a class="btn" href="/awards/media">Manage media</a>
			<button class="btn primary" onclick={openNew} disabled={!data.media.length}>+ New instance</button>
		</div>
	</div>

	{#if !data.media.length}
		<div class="empty">Add a media outlet first — <a href="/awards/media">Manage media</a> — then log press instances here.</div>
	{:else if !data.instances.length}
		<div class="empty">No instances yet. Click <strong>New instance</strong> to log a nomination or review.</div>
	{:else}
		{#each years as y (y.year)}
			<div class="year">{y.year}</div>
			{#each y.groups as g (g.key)}
				<div class="grp">
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div class="grp-row" onclick={() => toggle(g.key)}>
						<span class="chev">{expanded[g.key] ? '▾' : '▸'}</span>
						<span class="grp-date">{fdate(g.date)}</span>
						<span class="grp-media">{g.media_name}{#if g.country}<span class="cc"> ({g.country})</span>{/if}</span>
						<span class="counts">
							{#if g.nominees}<span class="pill nom">{g.nominees} nominee{g.nominees === 1 ? '' : 's'}</span>{/if}
							{#if g.winners}<span class="pill win">{g.winners} winner{g.winners === 1 ? '' : 's'}</span>{/if}
							{#if g.statements}<span class="pill st">{g.statements} statement{g.statements === 1 ? '' : 's'}</span>{/if}
						</span>
					</div>
					{#if expanded[g.key]}
						<div class="items">
							{#each g.items as i (i.id)}
								<div class="item">
									<div class="item-main">
										<span class="prod">{i.product_name || i.sku || '(no product)'}{#if i.sku && i.product_name}<span class="sku"> · {i.sku}</span>{/if}</span>
										{#if i.award_category}<span class="cat">{i.award_category}</span>{/if}
										{#if i.is_winner}<span class="badge won">🏆 Winner</span>{/if}
										{#if i.disclosure_date}<span class="disc">discloses {i.disclosure_date}</span>{/if}
									</div>
									{#each i.statements as s}
										<div class="stmt">{#if s.score != null && s.score !== ''}<span class="score">{s.score}{i.review_scale ? `/${i.review_scale}` : ''}★</span>{/if}<span class="qt">{s.statement}</span></div>
									{/each}
									<div class="item-foot">
										{#if proofHref(i)}<a class="proof" href={proofHref(i)} target="_blank" rel="noopener">Proof ↗</a>{/if}
										<button class="link" onclick={() => openEdit(i)}>Edit</button>
										<button class="link danger" onclick={() => del(i)}>Delete</button>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		{/each}
	{/if}
</main>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="backdrop" onclick={close}></div>
	<div class="modal">
		<div class="modal-head"><h2>{form.id ? 'Edit instance' : 'New instance'}</h2><button class="x" onclick={close}>✕</button></div>
		<div class="modal-body">
			<div class="row2">
				<label class="fld"><span>Media *</span>
					<select bind:value={form.media_id}>
						{#each data.media as m}<option value={m.id}>{m.name}{m.country ? ` (${m.country})` : ''}</option>{/each}
					</select>
				</label>
				<label class="fld"><span>Date</span><input type="date" bind:value={form.instance_date} /></label>
			</div>

			<div class="row2">
				<label class="fld sku-fld"><span>SKU</span>
					<input bind:value={form.sku} oninput={onSku} placeholder="Type SKU or name…" autocomplete="off" />
					{#if skuResults.length}
						<div class="sku-drop">
							{#each skuResults as r}<button class="sku-opt" onclick={() => pickSku(r)}><b>{r.sku}</b> {r.name}</button>{/each}
						</div>
					{/if}
				</label>
				<label class="fld"><span>Product name</span><input bind:value={form.product_name} placeholder="Auto-filled from SKU" /></label>
			</div>

			<label class="fld"><span>Award category</span><input bind:value={form.award_category} placeholder="e.g. Best Family Game 2026 (leave blank for a pure review)" /></label>

			<div class="row2">
				<label class="chk"><input type="checkbox" bind:checked={form.is_winner} /> Award winner</label>
				<label class="fld"><span>Disclosure date (when a win may be announced)</span><input type="date" bind:value={form.disclosure_date} /></label>
			</div>

			<div class="sub-head"><span>Review statements{selMedia?.review_scale ? ` (scale 0–${selMedia.review_scale})` : ''}</span><button class="link" onclick={addStatement}>+ Add statement</button></div>
			{#each form.statements as s, i (i)}
				<div class="stmt-row">
					<textarea bind:value={s.statement} rows="2" placeholder="Quote / statement"></textarea>
					<input class="score-in" type="number" step="0.5" min="0" max={selMedia?.review_scale ?? undefined} bind:value={s.score} placeholder="Score" />
					<button class="x sm" onclick={() => removeStatement(i)}>✕</button>
				</div>
			{/each}

			<div class="sub-head"><span>Proof</span></div>
			<label class="fld"><span>Link</span><input bind:value={form.proof_url} placeholder="https://…" /></label>
			<div class="proof-file">
				<label class="btn sm">Upload file<input type="file" hidden onchange={uploadProof} /></label>
				{#if form.proof_key}<span class="proof-name">{form.proof_name} <button class="x sm" onclick={() => { form.proof_key = ''; form.proof_name = ''; }}>✕</button></span>{/if}
			</div>

			<label class="fld"><span>Notes</span><textarea bind:value={form.notes} rows="2"></textarea></label>
		</div>
		<div class="modal-foot">
			<button class="btn" onclick={close}>Cancel</button>
			<button class="btn primary" onclick={save} disabled={saving || !form.media_id}>{saving ? 'Saving…' : 'Save'}</button>
		</div>
	</div>
{/if}

<style>
	.wrap { max-width: 1040px; margin: 0 auto; padding: 22px 28px 64px; }
	.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 18px; flex-wrap: wrap; }
	.head h1 { font-size: 20px; font-weight: 800; color: #18181B; margin: 0 0 3px; letter-spacing: -0.3px; }
	.sub { font-size: 13px; color: #98876e; margin: 0; }
	.head-actions { display: flex; gap: 8px; }
	.btn { font-family: inherit; font-size: 13px; font-weight: 700; padding: 9px 15px; border-radius: 9px; border: 1px solid var(--border); background: #fff; color: #524431; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; }
	.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
	.btn.sm { font-size: 12px; padding: 6px 11px; }
	.btn:disabled { opacity: 0.6; cursor: default; }
	.empty { padding: 40px; text-align: center; color: #98876e; background: #fff; border: 1px solid var(--border); border-radius: 14px; }

	.year { font-size: 22px; font-weight: 800; color: #18181B; margin: 22px 0 10px; letter-spacing: -0.4px; }
	.grp { background: #fff; border: 1px solid var(--border); border-radius: 12px; margin-bottom: 8px; overflow: hidden; }
	.grp-row { display: flex; align-items: center; gap: 12px; padding: 13px 16px; cursor: pointer; }
	.grp-row:hover { background: #FBF7EF; }
	.chev { color: #C0AC7C; width: 14px; }
	.grp-date { font-weight: 700; color: #18181B; white-space: nowrap; }
	.grp-media { color: #524431; font-weight: 600; flex: 1; }
	.cc { color: #98876e; font-weight: 500; }
	.counts { display: flex; gap: 6px; flex-wrap: wrap; }
	.pill { font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 100px; white-space: nowrap; }
	.pill.nom { background: #FFF1D6; color: #9A6100; }
	.pill.win { background: #E7F6EC; color: #16794C; }
	.pill.st { background: #EEF4FF; color: #1D4ED8; }

	.items { border-top: 1px solid var(--border); padding: 6px 16px 12px; }
	.item { padding: 10px 0; border-bottom: 1px solid #F3ECDD; }
	.item:last-child { border-bottom: none; }
	.item-main { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
	.prod { font-weight: 700; color: #18181B; } .sku { color: #98876e; font-weight: 500; font-size: 12px; }
	.cat { font-size: 12px; background: #F1ECE1; color: #6b5e4e; padding: 2px 8px; border-radius: 6px; }
	.badge.won { font-size: 12px; font-weight: 700; color: #16794C; }
	.disc { font-size: 12px; color: #98876e; }
	.stmt { margin: 5px 0 0; font-size: 13px; color: #3f3a33; display: flex; gap: 8px; }
	.stmt .score { font-weight: 800; color: #B15A12; white-space: nowrap; }
	.stmt .qt { font-style: italic; }
	.item-foot { display: flex; gap: 4px; margin-top: 7px; align-items: center; }
	.proof { font-size: 12px; font-weight: 700; color: #B15A12; text-decoration: none; margin-right: auto; }
	.link { background: none; border: none; font-family: inherit; font-size: 12px; font-weight: 700; color: #B15A12; cursor: pointer; padding: 0 0 0 12px; }
	.link:hover { text-decoration: underline; } .link.danger { color: #C4381B; }

	.backdrop { position: fixed; inset: 0; background: rgba(40,25,0,0.35); z-index: 40; }
	.modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 50; width: min(680px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow-y: auto; background: #fff; border-radius: 16px; box-shadow: 0 20px 60px rgba(50,30,0,0.28); }
	.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
	.modal-head h2 { font-size: 15px; font-weight: 800; margin: 0; color: #18181B; }
	.x { background: none; border: none; font-size: 15px; color: #8A7550; cursor: pointer; } .x.sm { font-size: 12px; }
	.modal-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
	.modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--border); }
	.fld { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: #6b5e4e; position: relative; }
	.fld input, .fld select, .fld textarea { font-family: inherit; font-size: 13px; font-weight: 500; color: #18181B; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
	.fld input:focus, .fld select:focus, .fld textarea:focus { outline: none; border-color: var(--accent); }
	.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.chk { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #524431; align-self: end; padding-bottom: 8px; }
	.sub-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #A88B52; margin-top: 4px; }
	.stmt-row { display: grid; grid-template-columns: 1fr 90px auto; gap: 6px; align-items: start; }
	.stmt-row textarea { font-family: inherit; font-size: 13px; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
	.score-in { font-family: inherit; font-size: 13px; border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
	.sku-drop { position: absolute; top: 100%; left: 0; right: 0; z-index: 5; background: #fff; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(80,50,0,0.14); margin-top: 2px; max-height: 220px; overflow-y: auto; }
	.sku-opt { display: block; width: 100%; text-align: left; background: none; border: none; font-family: inherit; font-size: 13px; padding: 7px 10px; cursor: pointer; color: #3f3a33; }
	.sku-opt:hover { background: #FFF5D2; }
	.proof-file { display: flex; align-items: center; gap: 10px; }
	.proof-name { font-size: 12px; color: #6b5e4e; display: inline-flex; align-items: center; gap: 6px; }
</style>
