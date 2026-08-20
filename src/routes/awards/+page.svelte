<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	const today = new Date().toISOString().slice(0, 10);
	const dFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
	function fdate(s) { if (!s) return 'Undated'; const d = new Date(s + 'T00:00:00Z'); return isNaN(d) ? s : dFmt.format(d); }
	const proofHref = (i) => (i.proof_url ? i.proof_url : i.proof_key ? `/api/img/${i.proof_key}` : null);

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
			if (i.is_nominated) g.nominees++;
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
	let showProof = $state(false);
	let showNotes = $state(false);
	function initSections() { showProof = !!(form.proof_url || form.proof_key); showNotes = !!((form.notes || '').trim()); }
	function blank() {
		return { id: null, media_id: '', sku: '', is_nominated: false, award_category: '', is_winner: false,
			disclosure_date: '', instance_date: today, statements: [], proof_url: '', proof_key: '', proof_name: '',
			nominee_badge_key: '', nominee_badge_name: '', winner_badge_key: '', winner_badge_name: '', notes: '' };
	}
	function fromInstance(i, { newId = false, clearSku = false } = {}) {
		return {
			id: newId ? null : i.id, media_id: i.media_id, sku: clearSku ? '' : (i.sku ?? ''),
			is_nominated: !!i.is_nominated, award_category: i.award_category ?? '', is_winner: !!i.is_winner,
			disclosure_date: i.disclosure_date ?? '', instance_date: i.instance_date ?? today,
			proof_url: i.proof_url ?? '', proof_key: i.proof_key ?? '', proof_name: i.proof_key ? 'Uploaded file' : '',
			nominee_badge_key: i.nominee_badge_key ?? '', nominee_badge_name: i.nominee_badge_key ? 'badge' : '',
			winner_badge_key: i.winner_badge_key ?? '', winner_badge_name: i.winner_badge_key ? 'badge' : '',
			notes: i.notes ?? '', statements: (i.statements ?? []).map((s) => ({ statement: s.statement ?? '', score: s.score ?? '' }))
		};
	}
	let form = $state(blank());
	const selMedia = $derived(data.media.find((m) => m.id === form.media_id) ?? null);

	function openNew() { form = blank(); skuResults = []; initSections(); open = true; }
	function openEdit(i) { form = fromInstance(i); skuResults = []; initSections(); open = true; }
	function createSimilar(i) { form = fromInstance(i, { newId: true, clearSku: true }); skuResults = []; initSections(); open = true; }
	function close() { open = false; }
	function addStatement() { form.statements = [...form.statements, { statement: '', score: '' }]; }
	function removeStatement(i) { form.statements = form.statements.filter((_, x) => x !== i); }

	// SKU autocomplete (name is derived from the matching sheet — no manual entry)
	let skuResults = $state([]);
	let skuTimer;
	function onSku() {
		clearTimeout(skuTimer);
		const q = form.sku.trim();
		if (q.length < 2) { skuResults = []; return; }
		skuTimer = setTimeout(async () => { skuResults = await (await fetch(`/api/awards/products?q=${encodeURIComponent(q)}`)).json().catch(() => []); }, 200);
	}
	function pickSku(r) { form.sku = r.sku; skuResults = []; }

	async function upload(e, keyField, nameField) {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		const fd = new FormData(); fd.append('file', file);
		const res = await fetch('/api/awards/proof', { method: 'POST', body: fd });
		if (res.ok) { const b = await res.json(); form[keyField] = b.key; form[nameField] = b.name; } else alert('Upload failed');
		e.currentTarget.value = '';
	}

	function payload() {
		const p = { ...form };
		if (!p.is_nominated) { p.is_winner = false; p.award_category = ''; }
		if (!p.is_winner) { p.disclosure_date = ''; p.winner_badge_key = ''; }
		return p;
	}
	async function save(mode = 'close') {
		if (!form.media_id || saving) return;
		saving = true;
		try {
			const url = form.id ? `/api/awards/instances/${form.id}` : '/api/awards/instances';
			const res = await fetch(url, { method: form.id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) });
			if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'Failed');
			await invalidateAll();
			if (mode === 'similar') { form = { ...form, id: null, sku: '' }; skuResults = []; }
			else open = false;
		} catch (e) { alert(e.message); } finally { saving = false; }
	}

	async function del(i) {
		if (!confirm('Delete this instance and its statements?')) return;
		await fetch(`/api/awards/instances/${i.id}`, { method: 'DELETE' });
		await invalidateAll();
	}
	async function editBlockDate(g) {
		const nd = prompt(`New date for ALL ${g.items.length} instances in this block (YYYY-MM-DD):`, g.date || today);
		if (nd == null) return;
		if (!/^\d{4}-\d{2}-\d{2}$/.test(nd)) { alert('Use format YYYY-MM-DD'); return; }
		await fetch('/api/awards/instances/bulk-date', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: g.items.map((x) => x.id), date: nd }) });
		await invalidateAll();
	}
	const reviewsLabel = (s) => (s.score != null && s.score !== '' ? `${s.score}★ ` : '') + (s.statement ?? '');

	const PEN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
	const COPY = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
	const BIN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
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
							<div class="items-bar">
								<button class="link" onclick={() => editBlockDate(g)}>✎ Edit date for all</button>
							</div>
							<div class="tbl-scroll">
								<table class="tbl">
									<thead>
										<tr><th>Product</th><th>SKU</th><th>Category</th><th class="c">Nom.</th><th class="c">Win</th><th>Disclosure</th><th>Reviews</th><th class="c">Proof</th><th class="c">Actions</th></tr>
									</thead>
									<tbody>
										{#each g.items as i (i.id)}
											<tr>
												<td class="prod">{i.sheet_id ? (i.product_name || i.sku) : 'N/A'}</td>
												<td class="sku">{i.sku || '—'}</td>
												<td>{i.award_category || '—'}</td>
												<td class="c">{#if i.is_nominated}{#if i.nominee_badge_key}<img class="bdg" src="/api/img/{i.nominee_badge_key}" alt="nominee" />{:else}✓{/if}{:else}—{/if}</td>
												<td class="c">{#if i.is_winner}{#if i.winner_badge_key}<img class="bdg" src="/api/img/{i.winner_badge_key}" alt="winner" />{:else}🏆{/if}{:else}—{/if}</td>
												<td class="muted">{i.disclosure_date || '—'}</td>
												<td class="reviews">{#if i.statements?.length}{#each i.statements as s}<div class="rv">{reviewsLabel(s)}</div>{/each}{:else}<span class="muted">—</span>{/if}</td>
												<td class="c">{#if proofHref(i)}<a href={proofHref(i)} target="_blank" rel="noopener" title="Open proof">↗</a>{:else}—{/if}</td>
												<td class="c acts">
													<button class="icon" title="Edit" aria-label="Edit" onclick={() => openEdit(i)}>{@html PEN}</button>
													<button class="icon" title="Create similar" aria-label="Create similar" onclick={() => createSimilar(i)}>{@html COPY}</button>
													<button class="icon danger" title="Delete" aria-label="Delete" onclick={() => del(i)}>{@html BIN}</button>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
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
			<!-- General -->
			<section class="sect">
				<div class="sect-head"><span>General</span></div>
				<div class="sect-body">
					<div class="row2">
						<label class="fld"><span>Media *</span>
							<select bind:value={form.media_id} class:invalid={!form.media_id}>
								<option value="" disabled>Select media…</option>
								{#each data.media as m}<option value={m.id}>{m.name}{m.country ? ` (${m.country})` : ''}</option>{/each}
							</select>
						</label>
						<label class="fld"><span>Date</span><input type="date" bind:value={form.instance_date} /></label>
					</div>
					<label class="fld sku-fld"><span>SKU (product is taken from the matching sheet)</span>
						<input bind:value={form.sku} oninput={onSku} placeholder="Type SKU or name…" autocomplete="off" />
						{#if skuResults.length}
							<div class="sku-drop">
								{#each skuResults as r}<button class="sku-opt" onclick={() => pickSku(r)}><b>{r.sku}</b> {r.name}</button>{/each}
							</div>
						{/if}
					</label>
				</div>
			</section>

			<!-- Award / nomination -->
			<section class="sect">
				<div class="sect-head"><span>Award / nomination</span>
					<label class="chk inline"><input type="checkbox" bind:checked={form.is_nominated} /> Nominated</label>
				</div>
				{#if form.is_nominated}
					<div class="sect-body">
						<label class="fld"><span>Award category</span><input bind:value={form.award_category} placeholder="e.g. Best Family Game 2026" /></label>
						<div class="row2">
							<div class="badge-fld">
								<span class="fld-label">Nominee badge (PNG/SVG)</span>
								<div class="badge-up">
									{#if form.nominee_badge_key}<img class="bdg-lg" src="/api/img/{form.nominee_badge_key}" alt="nominee badge" /><button class="x sm" onclick={() => { form.nominee_badge_key = ''; }}>✕</button>{/if}
									<label class="btn sm">Upload<input type="file" hidden accept="image/*,.svg" onchange={(e) => upload(e, 'nominee_badge_key', 'nominee_badge_name')} /></label>
								</div>
							</div>
							<label class="chk"><input type="checkbox" bind:checked={form.is_winner} /> Award winner</label>
						</div>
						{#if form.is_winner}
							<div class="row2">
								<label class="fld"><span>Disclosure date (when a win may be announced)</span><input type="date" bind:value={form.disclosure_date} /></label>
								<div class="badge-fld">
									<span class="fld-label">Winner badge (PNG/SVG)</span>
									<div class="badge-up">
										{#if form.winner_badge_key}<img class="bdg-lg" src="/api/img/{form.winner_badge_key}" alt="winner badge" /><button class="x sm" onclick={() => { form.winner_badge_key = ''; }}>✕</button>{/if}
										<label class="btn sm">Upload<input type="file" hidden accept="image/*,.svg" onchange={(e) => upload(e, 'winner_badge_key', 'winner_badge_name')} /></label>
									</div>
								</div>
							</div>
						{/if}
					</div>
				{:else}
					<div class="sect-body"><p class="hint">Not a nomination — this instance is a press statement only.</p></div>
				{/if}
			</section>

			<!-- Statements -->
			<section class="sect">
				<div class="sect-head"><span>Review statements{selMedia?.review_scale ? ` · 0–${selMedia.review_scale}` : ''}</span><button class="link" onclick={addStatement}>+ Add statement</button></div>
				<div class="sect-body">
					{#if !form.statements.length}<p class="hint">No statements yet. Add press quotes (with an optional score).</p>{/if}
					{#each form.statements as s, i (i)}
						<div class="stmt-row">
							<textarea bind:value={s.statement} rows="2" placeholder="Quote / statement"></textarea>
							<input class="score-in" type="number" step="0.5" min="0" max={selMedia?.review_scale ?? undefined} bind:value={s.score} placeholder="Score" />
							<button class="x sm" onclick={() => removeStatement(i)}>✕</button>
						</div>
					{/each}
				</div>
			</section>

			<!-- Proof (collapsible) -->
			<section class="sect">
				<button type="button" class="sect-head toggle" onclick={() => (showProof = !showProof)}>
					<span>Proof{#if !showProof && (form.proof_url || form.proof_key)}<span class="dot">•</span>{/if}</span><span class="chev">{showProof ? '▾' : '▸'}</span>
				</button>
				{#if showProof}
					<div class="sect-body">
						<label class="fld"><span>Link</span><input bind:value={form.proof_url} placeholder="https://…" /></label>
						<div class="proof-file">
							<label class="btn sm">Upload file<input type="file" hidden onchange={(e) => upload(e, 'proof_key', 'proof_name')} /></label>
							{#if form.proof_key}<span class="proof-name">{form.proof_name} <button class="x sm" onclick={() => { form.proof_key = ''; form.proof_name = ''; }}>✕</button></span>{/if}
						</div>
					</div>
				{/if}
			</section>

			<!-- Notes (collapsible) -->
			<section class="sect">
				<button type="button" class="sect-head toggle" onclick={() => (showNotes = !showNotes)}>
					<span>Notes{#if !showNotes && (form.notes || '').trim()}<span class="dot">•</span>{/if}</span><span class="chev">{showNotes ? '▾' : '▸'}</span>
				</button>
				{#if showNotes}<div class="sect-body"><textarea bind:value={form.notes} rows="2"></textarea></div>{/if}
			</section>
		</div>
		<div class="modal-foot">
			<button class="btn" onclick={close}>Cancel</button>
			<button class="btn" onclick={() => save('similar')} disabled={saving || !form.media_id}>Save &amp; create similar</button>
			<button class="btn primary" onclick={() => save('close')} disabled={saving || !form.media_id}>{saving ? 'Saving…' : 'Save'}</button>
		</div>
	</div>
{/if}

<style>
	.wrap { max-width: 1140px; margin: 0 auto; padding: 22px 28px 64px; }
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

	.items { border-top: 1px solid var(--border); }
	.items-bar { display: flex; justify-content: flex-end; padding: 8px 12px 0; }
	.tbl-scroll { overflow-x: auto; padding: 6px 8px 10px; }
	.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
	.tbl th { text-align: left; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #A88B52; padding: 8px 10px; white-space: nowrap; }
	.tbl th.c { text-align: center; }
	.tbl td { padding: 8px 10px; border-top: 1px solid #F1EADB; vertical-align: top; }
	.tbl td.c { text-align: center; }
	.tbl .prod { font-weight: 700; color: #18181B; }
	.tbl .sku { color: #6b5e4e; font-variant-numeric: tabular-nums; }
	.muted { color: #98876e; }
	.reviews { max-width: 340px; }
	.rv { color: #3f3a33; padding: 1px 0; }
	.bdg { height: 22px; width: auto; vertical-align: middle; }
	.acts { white-space: nowrap; }
	.icon { background: none; border: none; color: #8A7550; cursor: pointer; padding: 3px; border-radius: 6px; vertical-align: middle; }
	.icon:hover { background: #FFF1D6; color: #7B3803; }
	.icon.danger:hover { background: #FEF2F2; color: #C4381B; }

	.backdrop { position: fixed; inset: 0; background: rgba(40,25,0,0.35); z-index: 40; }
	.modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 50; width: min(680px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow-y: auto; background: #fff; border-radius: 16px; box-shadow: 0 20px 60px rgba(50,30,0,0.28); }
	.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
	.modal-head h2 { font-size: 15px; font-weight: 800; margin: 0; color: #18181B; }
	.x { background: none; border: none; font-size: 15px; color: #8A7550; cursor: pointer; } .x.sm { font-size: 12px; }
	.modal-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
	.modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--border); flex-wrap: wrap; }
	.fld { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: #6b5e4e; position: relative; }
	.fld-label { font-size: 12px; font-weight: 700; color: #6b5e4e; }
	.fld input, .fld select, .fld textarea { font-family: inherit; font-size: 13px; font-weight: 500; color: #18181B; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
	.fld input:focus, .fld select:focus, .fld textarea:focus { outline: none; border-color: var(--accent); }
	.fld select.invalid { border-color: #F1B0A0; background: #FEF6F3; }
	.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.chk { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: #524431; align-self: end; padding-bottom: 8px; }
	.sect { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: #fff; }
	.sect-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; padding: 10px 14px; background: #FBF7EF; border-bottom: 1px solid var(--border); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #A88B52; }
	.sect-head.toggle { cursor: pointer; border: none; font-family: inherit; text-align: left; }
	.sect-head.toggle:hover { background: #F5EEDD; }
	.sect-head .chev { color: #C0AC7C; font-size: 11px; }
	.sect-head .dot { color: var(--accent); margin-left: 6px; }
	.sect-body { padding: 13px 14px; display: flex; flex-direction: column; gap: 12px; }
	.chk.inline { align-self: center; padding: 0; text-transform: none; letter-spacing: 0; font-weight: 700; color: #524431; }
	.hint { margin: 0; font-size: 13px; color: #98876e; font-style: italic; }
	.stmt-row { display: grid; grid-template-columns: 1fr 90px auto; gap: 6px; align-items: start; }
	.stmt-row textarea { font-family: inherit; font-size: 13px; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
	.score-in { font-family: inherit; font-size: 13px; border: 1px solid var(--border); border-radius: 8px; padding: 8px; }
	.sku-drop { position: absolute; top: 100%; left: 0; right: 0; z-index: 5; background: #fff; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 8px 24px rgba(80,50,0,0.14); margin-top: 2px; max-height: 220px; overflow-y: auto; }
	.sku-opt { display: block; width: 100%; text-align: left; background: none; border: none; font-family: inherit; font-size: 13px; padding: 7px 10px; cursor: pointer; color: #3f3a33; }
	.sku-opt:hover { background: #FFF5D2; }
	.badge-fld { display: flex; flex-direction: column; gap: 5px; }
	.badge-up { display: flex; align-items: center; gap: 8px; }
	.bdg-lg { height: 40px; width: auto; border: 1px solid var(--border); border-radius: 6px; background: #fff; }
	.proof-file { display: flex; align-items: center; gap: 10px; }
	.proof-name { font-size: 12px; color: #6b5e4e; display: inline-flex; align-items: center; gap: 6px; }
</style>
