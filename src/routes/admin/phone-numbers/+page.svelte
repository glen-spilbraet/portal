<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	let phase = $state('idle'); // idle | scanning | scanned | applying | done
	let scanned = $state(0);
	let changes = $state([]);
	let skipped = $state([]);
	let counts = $state({ scanned: 0, contactsToChange: 0, fieldsToChange: 0, alreadyOk: 0, invalid: 0, noCompany: 0, noCountry: 0 });
	let errorMsg = $state('');
	let applied = $state(0);
	let applyFailed = $state(0);
	let showSkipped = $state(false);
	let stop = $state(false);

	const PREVIEW_LIMIT = 300;
	const previewRows = $derived(changes.slice(0, PREVIEW_LIMIT));

	async function post(bodyObj) {
		const res = await fetch('/api/admin/phone-normalize', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(bodyObj)
		});
		return res.json();
	}

	async function runScan() {
		phase = 'scanning';
		scanned = 0; changes = []; skipped = []; applied = 0; applyFailed = 0; errorMsg = '';
		counts = { scanned: 0, contactsToChange: 0, fieldsToChange: 0, alreadyOk: 0, invalid: 0, noCompany: 0, noCountry: 0 };
		stop = false;

		let after = null;
		const acc = { scanned: 0, contactsToChange: 0, fieldsToChange: 0, alreadyOk: 0, invalid: 0, noCompany: 0, noCountry: 0 };
		const allChanges = [];
		const allSkipped = [];

		do {
			const r = await post({ action: 'scan', after });
			if (!r.ok) { errorMsg = r.message || 'Scan failed.'; phase = 'idle'; return; }
			for (const k in acc) acc[k] += r.counts[k] ?? 0;
			allChanges.push(...r.changes);
			allSkipped.push(...r.skipped);
			scanned += r.counts.scanned ?? 0;
			after = r.next;
		} while (after && !stop);

		changes = allChanges;
		skipped = allSkipped;
		counts = acc;
		phase = 'scanned';
	}

	async function runApply() {
		phase = 'applying';
		applied = 0; applyFailed = 0; errorMsg = '';
		stop = false;

		for (let i = 0; i < changes.length && !stop; i += 100) {
			const batch = changes.slice(i, i + 100).map((c) => ({ id: c.id, properties: c.properties }));
			const r = await post({ action: 'apply', updates: batch });
			if (!r.ok && r.error === 'scope') { errorMsg = r.message; phase = 'scanned'; return; }
			applied += r.updated ?? 0;
			applyFailed += (r.failed?.length) ?? 0;
		}
		phase = 'done';
	}

	function reset() {
		phase = 'idle'; scanned = 0; changes = []; skipped = []; applied = 0; applyFailed = 0; errorMsg = '';
	}
</script>

<svelte:head><title>Phone Numbers · Admin · Product Portal</title></svelte:head>

<AppNav active="phone-numbers" user={data.user} />

<main class="wrap">
	<div class="head">
		<h1>Phone Number Normalization</h1>
		<p class="sub">
			Adds the country code to HubSpot contact phone numbers (<code>phone</code> and <code>mobilephone</code>),
			using the country of each contact's primary company. Formats as international (e.g. <code>+45 20 12 34 56</code>).
			Numbers that already have a country code are kept and just reformatted. Nothing is written until you press
			<strong>Apply</strong>.
		</p>
	</div>

	{#if errorMsg}
		<div class="banner err">{errorMsg}</div>
	{/if}

	<div class="actions">
		{#if phase === 'idle'}
			<button class="btn primary" onclick={runScan}>Scan contacts (dry run)</button>
		{:else if phase === 'scanning'}
			<button class="btn" onclick={() => (stop = true)}>Stop</button>
			<span class="prog">Scanning… {scanned.toLocaleString('da-DK')} contacts checked</span>
		{:else if phase === 'scanned'}
			{#if changes.length}
				<button class="btn primary" onclick={runApply}>Apply {changes.length.toLocaleString('da-DK')} change{changes.length === 1 ? '' : 's'} to HubSpot</button>
			{/if}
			<button class="btn" onclick={reset}>Reset</button>
		{:else if phase === 'applying'}
			<button class="btn" onclick={() => (stop = true)}>Stop</button>
			<span class="prog">Writing… {applied.toLocaleString('da-DK')} / {changes.length.toLocaleString('da-DK')}</span>
		{:else if phase === 'done'}
			<span class="prog done">✓ Updated {applied.toLocaleString('da-DK')} contact{applied === 1 ? '' : 's'}{applyFailed ? ` · ${applyFailed} failed` : ''}</span>
			<button class="btn" onclick={reset}>Done</button>
		{/if}
	</div>

	{#if phase === 'scanned' || phase === 'applying' || phase === 'done'}
		<div class="cards">
			<div class="card"><span class="k">Scanned</span><span class="v">{counts.scanned.toLocaleString('da-DK')}</span></div>
			<div class="card hi"><span class="k">To change</span><span class="v">{counts.contactsToChange.toLocaleString('da-DK')}</span><span class="k2">{counts.fieldsToChange.toLocaleString('da-DK')} fields</span></div>
			<div class="card"><span class="k">Already OK</span><span class="v">{counts.alreadyOk.toLocaleString('da-DK')}</span></div>
			<div class="card warn"><span class="k">Skipped</span><span class="v">{(counts.invalid + counts.noCompany + counts.noCountry).toLocaleString('da-DK')}</span><span class="k2">{counts.invalid} invalid · {counts.noCompany + counts.noCountry} no country</span></div>
		</div>
	{/if}

	{#if phase === 'scanned' && changes.length}
		<div class="table-card">
			<table>
				<thead>
					<tr><th>Contact</th><th>Company</th><th>Country</th><th>Field</th><th>Current</th><th></th><th>Normalized</th></tr>
				</thead>
				<tbody>
					{#each previewRows as c (c.id)}
						{#each Object.entries(c.fields) as [f, v], i}
							<tr>
								<td>{i === 0 ? c.name : ''}</td>
								<td class="muted">{i === 0 ? c.company : ''}</td>
								<td class="muted">{i === 0 ? c.country : ''}</td>
								<td class="field">{f}</td>
								<td class="old">{v.old}</td>
								<td class="arrow">→</td>
								<td class="new">{v.new}</td>
							</tr>
						{/each}
					{/each}
				</tbody>
			</table>
			{#if changes.length > PREVIEW_LIMIT}
				<div class="more">Showing first {PREVIEW_LIMIT} of {changes.length.toLocaleString('da-DK')} contacts. All will be applied.</div>
			{/if}
		</div>
	{/if}

	{#if phase === 'scanned' && skipped.length}
		<div class="skip-head">
			<button class="link" onclick={() => (showSkipped = !showSkipped)}>
				{showSkipped ? 'Hide' : 'Show'} skipped ({skipped.length.toLocaleString('da-DK')})
			</button>
		</div>
		{#if showSkipped}
			<div class="table-card">
				<table>
					<thead><tr><th>Contact</th><th>Field</th><th>Value</th><th>Country</th><th>Reason</th></tr></thead>
					<tbody>
						{#each skipped.slice(0, PREVIEW_LIMIT) as s, i (s.id + s.field + i)}
							<tr>
								<td>{s.name}</td>
								<td class="field">{s.field}</td>
								<td class="old">{s.old}</td>
								<td class="muted">{s.country || '—'}</td>
								<td class="muted">{s.reason}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				{#if skipped.length > PREVIEW_LIMIT}<div class="more">Showing first {PREVIEW_LIMIT} of {skipped.length.toLocaleString('da-DK')}.</div>{/if}
			</div>
		{/if}
	{/if}
</main>

<style>
	.wrap { max-width: 1140px; margin: 0 auto; padding: 22px 28px 60px; }
	.head h1 { font-size: 20px; font-weight: 800; color: #18181B; margin: 0 0 6px; letter-spacing: -0.3px; }
	.sub { font-size: 13px; color: #6b5e4e; line-height: 1.55; margin: 0 0 18px; max-width: 760px; }
	code { background: #F5F0E6; padding: 1px 5px; border-radius: 5px; font-size: 12px; }

	.banner { padding: 11px 14px; border-radius: 9px; font-size: 13px; font-weight: 600; margin-bottom: 14px; }
	.banner.err { background: #FEF2F2; color: #B42318; border: 1px solid #FECDCA; }

	.actions { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
	.btn { font-family: inherit; font-size: 13px; font-weight: 700; padding: 9px 16px; border-radius: 9px; border: 1px solid var(--border); background: #fff; color: #524431; cursor: pointer; }
	.btn:hover { background: #FBF7EF; }
	.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
	.btn.primary:hover { background: var(--accent-hover); }
	.prog { font-size: 13px; font-weight: 600; color: #6b5e4e; }
	.prog.done { color: #16794C; font-weight: 700; }

	.cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
	.card { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; }
	.card .k { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #A88B52; }
	.card .k2 { font-size: 11px; color: #98876e; margin-top: 1px; }
	.card .v { font-size: 22px; font-weight: 800; color: #18181B; }
	.card.hi { background: #FFF8E8; border-color: #F4CE7A; }
	.card.warn .v { color: #B42318; }

	.table-card { background: #fff; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-bottom: 14px; }
	table { width: 100%; border-collapse: collapse; font-size: 13px; }
	th { text-align: left; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #A88B52; padding: 10px 14px; background: #FBF7EF; border-bottom: 1px solid var(--border); }
	td { padding: 9px 14px; border-bottom: 1px solid #F1EADB; }
	tbody tr:last-child td { border-bottom: none; }
	.muted { color: #8A7550; }
	.field { font-variant: small-caps; color: #6b5e4e; font-weight: 700; }
	.old { color: #98876e; font-variant-numeric: tabular-nums; }
	.new { color: #16794C; font-weight: 700; font-variant-numeric: tabular-nums; }
	.arrow { color: #C0AC7C; text-align: center; }
	.more { padding: 10px 14px; font-size: 12px; color: #8A7550; background: #FBF7EF; }

	.skip-head { margin: 4px 0 10px; }
	.link { background: none; border: none; font-family: inherit; font-size: 13px; font-weight: 700; color: #B15A12; cursor: pointer; padding: 0; }
	.link:hover { text-decoration: underline; }

	@media (max-width: 720px) { .cards { grid-template-columns: 1fr 1fr; } }
</style>
