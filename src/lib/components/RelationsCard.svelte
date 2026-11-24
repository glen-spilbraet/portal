<script>
	/**
	 * Sheet editor card: "this product is <type> for <products>" and the reverse
	 * ("<products> are <type> for this product"). Saves each change at once via
	 * POST /api/sheets/:id/relations.
	 */
	let { sheetId, sku, types = [], relations = { outgoing: [], incoming: [] } } = $props();

	let rel = $state(relations);
	let msg = $state('');
	let err = $state('');

	/** @param {any} t */
	const en = (t) => t?.labels?.en ?? t?.labels?.da ?? Object.values(t?.labels ?? {})[0] ?? { name: t?.id };
	const typeById = $derived(Object.fromEntries(types.map((/** @type {any} */ t) => [t.id, t])));
	/** "Expansion for" / "Expansions" with fallbacks for unfilled labels. */
	const fwdLabel = (/** @type {string} */ id) => { const l = en(typeById[id]); return l.forward || `${l.name} for`; };
	const invLabel = (/** @type {string} */ id) => { const l = en(typeById[id]); return l.inverse || l.name; };

	/** Options for "add": forward + inverse per type. */
	const modes = $derived(types.flatMap((/** @type {any} */ t) => [
		{ key: `forward:${t.id}`, typeId: t.id, direction: 'forward', label: `This is ${fwdLabel(t.id).toLowerCase()}…` },
		{ key: `inverse:${t.id}`, typeId: t.id, direction: 'inverse', label: `Add ${invLabel(t.id).toLowerCase()}…` }
	]));
	let mode = $state('');
	const current = $derived(modes.find((m) => m.key === mode) ?? modes[0]);

	/** Groups to show: one per type + direction that has links. */
	const groups = $derived.by(() => {
		/** @type {{ key: string, typeId: string, direction: string, label: string, items: any[] }[]} */
		const out = [];
		for (const t of types) {
			const f = rel.outgoing.filter((/** @type {any} */ r) => r.type_id === t.id);
			if (f.length) out.push({ key: `f:${t.id}`, typeId: t.id, direction: 'forward', label: fwdLabel(t.id), items: f });
			const i = rel.incoming.filter((/** @type {any} */ r) => r.type_id === t.id);
			if (i.length) out.push({ key: `i:${t.id}`, typeId: t.id, direction: 'inverse', label: invLabel(t.id), items: i });
		}
		return out;
	});

	// ── Search ───────────────────────────────────────────────────────────────
	let q = $state('');
	/** @type {any[]} */
	let results = $state([]);
	let searching = $state(false);
	let open = $state(false);
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	const nameOf = (/** @type {any} */ s) => s.name_en || s.name_da || s.name_sv || s.name_no || s.name_pl || s.name_fi || '(no name)';
	const linked = $derived(new Set(
		(current?.direction === 'inverse' ? rel.incoming : rel.outgoing)
			.filter((/** @type {any} */ r) => r.type_id === current?.typeId)
			.map((/** @type {any} */ r) => String(r.sku).toLowerCase())
	));
	const shown = $derived(results.filter((s) => String(s.sku ?? '').trim() && String(s.sku).toLowerCase() !== String(sku).toLowerCase()).slice(0, 12));

	function onInput() {
		clearTimeout(timer);
		const term = q.trim();
		if (term.length < 2) { results = []; return; }
		timer = setTimeout(async () => {
			searching = true;
			try {
				const res = await fetch(`/api/sheets?q=${encodeURIComponent(term)}`);
				results = res.ok ? ((await res.json()).sheets ?? []) : [];
			} catch { results = []; }
			searching = false;
			open = true;
		}, 220);
	}

	/** @param {'add' | 'remove'} op @param {string} typeId @param {string} direction @param {string} other */
	async function send(op, typeId, direction, other) {
		err = ''; msg = 'Saving…';
		try {
			const res = await fetch(`/api/sheets/${sheetId}/relations`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ op, typeId, direction, other })
			});
			if (!res.ok) { err = (await res.json().catch(() => null))?.message ?? 'Save failed'; msg = ''; return; }
			rel = (await res.json()).relations;
			msg = 'Saved';
		} catch { err = 'Save failed'; msg = ''; }
		setTimeout(() => { if (msg === 'Saved') msg = ''; }, 2000);
	}

	/** @param {any} s */
	function pick(s) {
		if (!current || linked.has(String(s.sku).toLowerCase())) return;
		send('add', current.typeId, current.direction, String(s.sku).trim());
	}
</script>

{#if types.length}
	<div class="side-card rel">
		<div class="side-head"><h2>Relations</h2><span class="save" class:on={msg === 'Saving…'}>{msg}</span></div>

		{#each groups as g (g.key)}
			<div class="rel-group">
				<span class="rel-label">{g.label}</span>
				<div class="rel-items">
					{#each g.items as r (r.sku)}
						<span class="rel-chip">
							{#if r.sheet_id}<a href={`/sheet/${r.sheet_id}`} title={r.sku}>{r.name ?? r.sku}</a>{:else}<span title="No sales sheet">{r.sku}</span>{/if}
							<button type="button" title="Remove" aria-label={`Remove ${r.name ?? r.sku}`} onclick={() => send('remove', g.typeId, g.direction, r.sku)}>✕</button>
						</span>
					{/each}
				</div>
			</div>
		{/each}

		<div class="rel-add">
			<select bind:value={mode} aria-label="Relation">
				{#each modes as m (m.key)}<option value={m.key}>{m.label}</option>{/each}
			</select>
			<div class="rel-search">
				<input
					type="search" placeholder="Search title or SKU" bind:value={q} oninput={onInput}
					onfocus={() => (open = results.length > 0)} onblur={() => setTimeout(() => (open = false), 150)}
				/>
				{#if open && q.trim().length >= 2}
					<ul class="rel-results">
						{#each shown as s (s.id)}
							{@const done = linked.has(String(s.sku).toLowerCase())}
							<li>
								<button type="button" class:done disabled={done} onmousedown={(e) => e.preventDefault()} onclick={() => pick(s)}>
									<span class="n">{nameOf(s)}</span><span class="s">{s.sku}</span>
									<span class="mark">{done ? '✓' : '+'}</span>
								</button>
							</li>
						{:else}
							<li class="none">{searching ? 'Searching…' : 'No products found'}</li>
						{/each}
					</ul>
				{/if}
			</div>
			{#if err}<p class="rel-err">{err}</p>{/if}
		</div>
	</div>
{/if}

<style>
	.side-card { background: #fff; border: 1px solid var(--border); border-radius: 14px; overflow: visible; }
	.side-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 13px 16px; border-bottom: 1px solid var(--border); }
	.side-head h2 { font-size: 14px; font-weight: 800; color: #18181B; margin: 0; }
	.save { font-size: 11px; font-weight: 600; color: #15803D; }
	.save.on { color: #A1A1AA; }
	.rel-group { padding: 10px 14px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; }
	.rel-label { font-size: 11px; font-weight: 800; color: #8a7550; }
	.rel-items { display: flex; flex-wrap: wrap; gap: 5px; }
	.rel-chip { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; font-size: 12px; font-weight: 600; background: #FBF4E2; border: 1px solid #F0E3C0; border-radius: 6px; padding: 2px 4px 2px 7px; }
	.rel-chip a, .rel-chip > span { color: #18181B; text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.rel-chip a:hover { color: #F57832; }
	.rel-chip button { border: 0; background: none; color: #A1A1AA; cursor: pointer; font-size: 10px; padding: 1px 3px; border-radius: 4px; }
	.rel-chip button:hover { color: #dc2626; background: #FEF2F2; }
	.rel-add { padding: 10px 14px 12px; display: flex; flex-direction: column; gap: 6px; }
	.rel-add select, .rel-add input { width: 100%; box-sizing: border-box; font-size: 13px; font-family: inherit; border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; background: #FAFAF7; }
	.rel-add select:focus, .rel-add input:focus { outline: none; border-color: #F57832; background: #fff; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); }
	.rel-search { position: relative; }
	.rel-results { position: absolute; z-index: 40; left: 0; right: 0; top: calc(100% + 4px); margin: 0; padding: 4px; list-style: none; background: #fff; border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 10px 28px rgba(50,30,0,0.14); max-height: 300px; overflow-y: auto; }
	.rel-results button { display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto auto; column-gap: 8px; width: 100%; text-align: left; border: 0; background: none; padding: 6px 8px; border-radius: 7px; cursor: pointer; font-family: inherit; }
	.rel-results button:hover:not(:disabled) { background: #FFF4EC; }
	.rel-results .n { font-size: 13px; font-weight: 600; color: #18181B; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.rel-results .s { grid-row: 2; font-size: 11px; color: #A1A1AA; }
	.rel-results .mark { grid-row: 1 / 3; grid-column: 2; align-self: center; font-weight: 800; color: #F57832; }
	.rel-results button.done { cursor: default; opacity: 0.55; }
	.rel-results button.done .mark { color: #15803D; }
	.rel-results .none { font-size: 12px; color: #A1A1AA; padding: 8px; }
	.rel-err { margin: 0; font-size: 12px; font-weight: 600; color: #B91C1C; }
</style>
