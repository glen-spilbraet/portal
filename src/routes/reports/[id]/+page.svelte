<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import ReportView from '$lib/components/ReportView.svelte';

	let { data } = $props();

	let name = $state(data.report.name);
	let metric = $state(data.report.metric);
	let rules = $state(data.report.rules.map((r) => ({ action: r.action, kind: r.kind, value: r.value })));
	let shareToken = $state(data.report.share_token);
	let preview = $state(data.preview);
	let previewing = $state(false);
	let saving = $state(false);
	let saved = $state(false);
	let copied = $state(false);

	const shareUrl = $derived(`${data.origin}/reports/share/${shareToken}`);

	const KINDS = [
		{ v: 'publisher_sku', label: 'Publisher (by SKU prefix)' },
		{ v: 'publisher_mapped', label: 'Publisher (mapped)' },
		{ v: 'sku', label: 'Specific SKU' },
	];

	function addRule() { rules = [...rules, { action: 'include', kind: 'publisher_sku', value: data.publishers[0] ?? '' }]; }
	function removeRule(i) { rules = rules.filter((_, x) => x !== i); }
	function onKindChange(i) {
		const r = rules[i];
		r.value = r.kind === 'sku' ? '' : (data.publishers[0] ?? '');
		rules = [...rules];
	}

	// ── SKU autocomplete (per row) ───────────────────────────────────────────────
	let skuDrop = $state({ idx: -1, results: [] });
	let skuTimer;
	function onSkuInput(i) {
		clearTimeout(skuTimer);
		const q = (rules[i].value ?? '').trim();
		if (q.length < 2) { skuDrop = { idx: -1, results: [] }; return; }
		skuTimer = setTimeout(async () => {
			const res = await fetch(`/api/reports/options?sku=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => ({}));
			skuDrop = { idx: i, results: res.skus ?? [] };
		}, 200);
	}
	function pickSku(i, s) { rules[i].value = s.sku; rules = [...rules]; skuDrop = { idx: -1, results: [] }; }

	// ── Live preview (debounced) ─────────────────────────────────────────────────
	let lastKey = $state('');
	$effect(() => {
		const key = JSON.stringify({ metric, rules });
		if (key === lastKey) return;
		lastKey = key;
		const t = setTimeout(refreshPreview, 300);
		return () => clearTimeout(t);
	});
	async function refreshPreview() {
		previewing = true;
		try {
			const res = await fetch(`/api/reports/${data.report.id}/preview`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ rules: cleanRules(), metric })
			});
			if (res.ok) preview = await res.json();
		} finally { previewing = false; }
	}
	const cleanRules = () => rules.filter((r) => (r.value ?? '').toString().trim());

	async function save() {
		if (saving) return;
		saving = true; saved = false;
		try {
			const res = await fetch(`/api/reports/${data.report.id}`, {
				method: 'PUT', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, metric, rules: cleanRules() })
			});
			if (!res.ok) throw new Error('Save failed');
			saved = true; setTimeout(() => (saved = false), 1600);
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { saving = false; }
	}

	async function copyLink() {
		try { await navigator.clipboard.writeText(shareUrl); copied = true; setTimeout(() => (copied = false), 1500); } catch { /* ignore */ }
	}
	async function rotate() {
		if (!confirm('Generate a new link? The current link will stop working.')) return;
		const res = await fetch(`/api/reports/${data.report.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rotate: true }) });
		const b = await res.json();
		if (res.ok && b.share_token) shareToken = b.share_token;
	}
</script>

<svelte:head><title>{name} — Reports</title></svelte:head>

<div class="page">
	<AppNav active="reports" user={data.user} />
	<main>
		<nav class="crumbs"><a href="/reports">Reports</a><span class="sep">›</span><span class="current">{name}</span></nav>

		<div class="grid">
			<!-- Builder -->
			<section class="panel">
				<div class="panel-head">
					<h2>Setup</h2>
					<button class="btn primary" onclick={save} disabled={saving}>{saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save'}</button>
				</div>

				<label class="fld"><span>Report name</span><input bind:value={name} /></label>
				<label class="fld"><span>Show</span>
					<select bind:value={metric}>
						<option value="both">Units + revenue</option>
						<option value="units">Units only</option>
						<option value="revenue">Revenue only</option>
					</select>
				</label>

				<div class="rules-head"><span>Product rules</span><button class="add" onclick={addRule}>+ Add rule</button></div>
				<p class="hint">Include rules define the product set (no includes = all products). Exclude rules remove from it.</p>

				{#if !rules.length}
					<p class="empty-rule">No rules — the report covers <strong>all products</strong>.</p>
				{/if}
				<div class="rules">
					{#each rules as r, i (i)}
						<div class="rule" class:exclude={r.action === 'exclude'}>
							<select class="r-action" bind:value={r.action}>
								<option value="include">Include</option>
								<option value="exclude">Exclude</option>
							</select>
							<select class="r-kind" bind:value={r.kind} onchange={() => onKindChange(i)}>
								{#each KINDS as k}<option value={k.v}>{k.label}</option>{/each}
							</select>
							<div class="r-value">
								{#if r.kind === 'sku'}
									<input placeholder="Type SKU…" autocomplete="off" bind:value={r.value} oninput={() => onSkuInput(i)} />
									{#if skuDrop.idx === i && skuDrop.results.length}
										<div class="drop">{#each skuDrop.results as s}<button class="opt" onclick={() => pickSku(i, s)}><b>{s.sku}</b> {s.name}</button>{/each}</div>
									{/if}
								{:else}
									<select bind:value={r.value}>
										<option value="" disabled>Select publisher…</option>
										{#each data.publishers as pub}<option value={pub}>{pub}</option>{/each}
									</select>
								{/if}
							</div>
							<button class="r-del" title="Remove rule" onclick={() => removeRule(i)}>✕</button>
						</div>
					{/each}
				</div>

				<div class="share">
					<span class="share-k">Shareable link</span>
					<div class="share-row">
						<input class="share-url" readonly value={shareUrl} />
						<button class="btn" onclick={copyLink}>{copied ? 'Copied!' : 'Copy'}</button>
						<a class="btn" href={shareUrl} target="_blank" rel="noopener">Open</a>
					</div>
					<button class="link" onclick={rotate}>Generate new link</button>
				</div>
			</section>

			<!-- Preview -->
			<section class="preview">
				<div class="preview-head"><h2>Preview</h2>{#if previewing}<span class="muted">Updating…</span>{/if}</div>
				<ReportView data={preview} {metric} />
			</section>
		</div>
	</main>
</div>

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 1180px; margin: 0 auto; width: 100%; padding: 24px 28px 80px; }
	.crumbs { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 16px; }
	.crumbs a { color: #6D5BD0; text-decoration: none; font-weight: 600; }
	.crumbs a:hover { text-decoration: underline; }
	.crumbs .sep { color: #ccc; } .crumbs .current { color: #9a9a9a; font-weight: 600; }

	.grid { display: grid; grid-template-columns: 400px 1fr; gap: 20px; align-items: start; }
	@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }

	.panel { background: #fff; border: 1px solid #ececec; border-radius: 14px; padding: 18px; position: sticky; top: 16px; }
	.panel-head, .preview-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
	.panel-head h2, .preview-head h2 { font-size: 15px; font-weight: 800; margin: 0; }
	.muted { font-size: 12px; color: #a1a1aa; }

	.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 9px; background: white; font-size: 13px; font-weight: 600; font-family: inherit; color: #18181B; cursor: pointer; text-decoration: none; }
	.btn.primary { background: #F57832; color: white; border-color: #F57832; }
	.btn:disabled { opacity: 0.6; }

	.fld { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: #6b5e4e; margin-bottom: 12px; }
	.fld input, .fld select { font-family: inherit; font-size: 13px; font-weight: 500; color: #18181B; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
	.fld input:focus, .fld select:focus { outline: none; border-color: #F57832; }

	.rules-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #8a7550; margin-top: 6px; }
	.add { font-family: inherit; font-size: 12px; font-weight: 700; color: #B15A12; background: #FDEEE4; border: 1px solid #F6CDAB; border-radius: 100px; padding: 4px 11px; cursor: pointer; }
	.add:hover { background: #FBDDC7; }
	.hint { font-size: 11.5px; color: #a1a1aa; margin: 6px 0 10px; line-height: 1.4; }
	.empty-rule { font-size: 12.5px; color: #8a7550; background: #FBF7EF; border: 1px solid #F1EADB; border-radius: 8px; padding: 8px 10px; margin: 0 0 10px; }

	.rules { display: flex; flex-direction: column; gap: 8px; }
	.rule { display: grid; grid-template-columns: 86px 1fr auto; gap: 6px; align-items: start; background: #fafafa; border: 1px solid #eee; border-radius: 10px; padding: 8px; }
	.rule.exclude { background: #fdf5f3; border-color: #f3d8d2; }
	.rule select, .rule input { font-family: inherit; font-size: 12.5px; color: #18181B; border: 1px solid var(--border); border-radius: 7px; padding: 6px 8px; background: #fff; width: 100%; box-sizing: border-box; }
	.r-kind { grid-column: 1 / 3; }
	.r-value { grid-column: 1 / 3; position: relative; min-width: 0; }
	.r-del { grid-row: 1 / 3; grid-column: 3; align-self: center; background: none; border: none; color: #b6795a; font-size: 13px; cursor: pointer; padding: 4px 6px; border-radius: 6px; }
	.r-del:hover { background: #fce4de; color: #c4381b; }
	.drop { position: absolute; z-index: 20; left: 0; right: 0; margin-top: 4px; background: #fff; border: 1px solid var(--border); border-radius: 8px; max-height: 200px; overflow-y: auto; box-shadow: 0 8px 24px rgba(0,0,0,0.1); }
	.opt { display: block; width: 100%; text-align: left; background: none; border: none; font-family: inherit; font-size: 12.5px; padding: 7px 10px; cursor: pointer; color: #3f3a33; }
	.opt:hover { background: #FFF5D2; }

	.share { margin-top: 18px; padding-top: 16px; border-top: 1px solid #eee; }
	.share-k { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #8a7550; }
	.share-row { display: flex; gap: 6px; margin: 8px 0; }
	.share-url { flex: 1; min-width: 0; font-family: ui-monospace, monospace; font-size: 11.5px; color: #555; border: 1px solid var(--border); border-radius: 8px; padding: 7px 9px; background: #fafafa; }
	.link { background: none; border: none; padding: 0; font: inherit; font-size: 12px; font-weight: 600; color: #6D5BD0; cursor: pointer; }
	.link:hover { text-decoration: underline; }

	.preview { min-width: 0; }
</style>
