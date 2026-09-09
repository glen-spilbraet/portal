<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	// ── Manual check ──────────────────────────────────────────────────────────
	let orderNo = $state('');
	let sendEmail = $state(true);
	let running = $state(false);
	let result = $state(null);
	let runError = $state('');

	async function runCheck() {
		if (!orderNo.trim() || running) return;
		running = true; runError = ''; result = null;
		try {
			const res = await fetch('/api/rest-check/run', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ order_number: orderNo.trim(), send_email: sendEmail }),
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Run failed');
			result = d;
			await invalidateAll();
		} catch (e) { runError = e.message; } finally { running = false; }
	}

	// ── Settings ──────────────────────────────────────────────────────────────
	let recipient = $state(data.settings.recipient_email ?? '');
	let fromEmail = $state(data.settings.from_email ?? '');
	let enabled = $state(!!data.settings.enabled);
	let savingSettings = $state(false);
	let settingsMsg = $state('');

	async function saveSettings() {
		savingSettings = true; settingsMsg = '';
		try {
			const res = await fetch('/api/rest-check/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ recipient_email: recipient, from_email: fromEmail, enabled }),
			});
			if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'Save failed');
			settingsMsg = 'Saved';
			setTimeout(() => (settingsMsg = ''), 2000);
		} catch (e) { settingsMsg = e.message; } finally { savingSettings = false; }
	}

	// ── Helpers ───────────────────────────────────────────────────────────────
	let expanded = $state(null);
	const dtFmt = new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	function ftime(ts) { return ts ? dtFmt.format(new Date(ts * 1000)) : '—'; }
	function parse(j) { try { return JSON.parse(j || '[]'); } catch { return []; } }
	const STATUS = {
		ok: { label: 'Rest found', tone: 'accent' },
		no_rest: { label: 'No rest orders', tone: 'muted' },
		no_match: { label: 'No HubSpot match', tone: 'warn' },
		error: { label: 'Error', tone: 'danger' },
	};
</script>

<svelte:head><title>Rest Check · Orders · Product Portal</title></svelte:head>

<AppNav active="rest-check" user={data.user} />

<main class="wrap">
	<div class="head"><h1>Rest Check</h1><p class="sub">Ved en ny Rackbeat-ordre tjekkes om kunden har restordrer i HubSpot ("[0] Rest") hvis varer nu er på lager.</p></div>

	<!-- Manual check -->
	<section class="card">
		<h2>Manuelt check</h2>
		<p class="hint">Indtast et Rackbeat-ordrenummer og kør præcis samme logik som webhook'en.</p>
		<div class="run-row">
			<input class="in" placeholder="Rackbeat-ordrenr" bind:value={orderNo} onkeydown={(e) => e.key === 'Enter' && runCheck()} />
			<label class="chk"><input type="checkbox" bind:checked={sendEmail} /> Send mail</label>
			<button class="btn primary" onclick={runCheck} disabled={running || !orderNo.trim()}>{running ? 'Kører…' : 'Kør check'}</button>
		</div>
		{#if runError}<p class="err">{runError}</p>{/if}

		{#if result}
			<div class="result">
				<div class="res-head">
					<span class="pill {STATUS[result.status]?.tone ?? 'muted'}">{STATUS[result.status]?.label ?? result.status}</span>
					{#if result.email_sent}<span class="pill accent">Mail sendt → {result.email_to}</span>{/if}
				</div>
				<div class="res-meta">
					<span><b>Kunde:</b> {result.customer_name ?? '—'} ({result.rb_customer_number ?? '—'})</span>
					<span><b>Ny ordre:</b> {#if result.rb_order_url}<a href={result.rb_order_url} target="_blank" rel="noreferrer">{result.rb_order_number}</a>{:else}{result.rb_order_number ?? '—'}{/if}</span>
				</div>
				{#if result.line_items?.length}
					<table class="li">
						<thead><tr><th>Deal</th><th>SKU</th><th>Produkt</th><th class="num">Antal</th><th class="num">Lager</th></tr></thead>
						<tbody>
							{#each result.line_items as li}
								<tr class:in-stock={li.available_quantity > 0}>
									<td>{#if li.deal_url}<a href={li.deal_url} target="_blank" rel="noreferrer">{li.deal_name}</a>{:else}{li.deal_name}{/if}</td><td class="mono">{li.sku}</td><td>{li.product_name}</td>
									<td class="num">{li.quantity}</td><td class="num stock">{li.available_quantity}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else}
					<p class="hint">Ingen restordre-linjer.</p>
				{/if}
			</div>
		{/if}
	</section>

	<!-- Logs -->
	<section class="card">
		<h2>Log</h2>
		{#if !data.logs.length}
			<p class="hint">Ingen checks endnu.</p>
		{:else}
			<div class="table-card">
				<table>
					<thead><tr><th>Tid</th><th>Kilde</th><th>Kunde</th><th>Ordre</th><th>Status</th><th class="num">Linjer</th><th class="num">På lager</th><th>Mail</th><th></th></tr></thead>
					<tbody>
						{#each data.logs as l (l.id)}
							{@const items = parse(l.line_items)}
							<tr>
								<td class="nowrap">{ftime(l.created_at)}</td>
								<td class="muted">{l.source}</td>
								<td>{l.customer_name || l.rb_customer_number || '—'}</td>
								<td class="mono">{l.rb_order_number || '—'}</td>
								<td><span class="pill sm {STATUS[l.status]?.tone ?? 'muted'}">{STATUS[l.status]?.label ?? l.status}</span></td>
								<td class="num">{items.length}</td>
								<td class="num">{l.in_stock_count ?? 0}</td>
								<td>{l.email_sent ? `✓ ${l.email_to ?? ''}` : '—'}</td>
								<td class="actions">{#if items.length}<button class="link" onclick={() => expanded = expanded === l.id ? null : l.id}>{expanded === l.id ? 'Skjul' : 'Detaljer'}</button>{/if}</td>
							</tr>
							{#if expanded === l.id}
								<tr class="detail-row"><td colspan="9">
									<table class="li">
										<thead><tr><th>Deal</th><th>SKU</th><th>Produkt</th><th class="num">Antal</th><th class="num">Lager</th></tr></thead>
										<tbody>
											{#each items as li}
												<tr class:in-stock={li.available_quantity > 0}>
													<td>{#if li.deal_url}<a href={li.deal_url} target="_blank" rel="noreferrer">{li.deal_name}</a>{:else}{li.deal_name}{/if}</td><td class="mono">{li.sku}</td><td>{li.product_name}</td>
													<td class="num">{li.quantity}</td><td class="num stock">{li.available_quantity}</td>
												</tr>
											{/each}
										</tbody>
									</table>
									{#if l.error}<p class="err">{l.error}</p>{/if}
								</td></tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<!-- Settings -->
	<section class="card">
		<h2>Indstillinger</h2>
		<div class="settings">
			<label class="fld"><span>Modtager-mail</span><input class="in" bind:value={recipient} placeholder="support@spilbraet.dk" /></label>
			<label class="fld"><span>Afsender (valgfri — Resend-verificeret domæne)</span><input class="in" bind:value={fromEmail} placeholder="fx no-reply@spilbraet.dk" /></label>
			<label class="chk"><input type="checkbox" bind:checked={enabled} /> Aktivér automatisk mail (webhook)</label>
			<div class="save-row">
				<button class="btn primary" onclick={saveSettings} disabled={savingSettings}>{savingSettings ? 'Gemmer…' : 'Gem'}</button>
				{#if settingsMsg}<span class="msg">{settingsMsg}</span>{/if}
			</div>
		</div>
	</section>
</main>

<style>
	.wrap { max-width: 1040px; margin: 0 auto; padding: 22px 28px 64px; }
	.head { margin-bottom: 16px; }
	.head h1 { font-size: 20px; font-weight: 800; color: #18181B; margin: 0; }
	.sub { color: #98876e; font-size: 13px; margin: 4px 0 0; }
	.card { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; margin-bottom: 16px; }
	.card h2 { font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #A88B52; margin: 0 0 4px; }
	.hint { font-size: 12px; color: #98876e; margin: 0 0 12px; }
	.btn { font-family: inherit; font-size: 13px; font-weight: 700; padding: 9px 15px; border-radius: 9px; border: 1px solid var(--border); background: #fff; color: #524431; cursor: pointer; }
	.btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
	.btn:disabled { opacity: 0.6; cursor: default; }
	.in { font-family: inherit; font-size: 13px; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; color: #18181B; }
	.in:focus { outline: none; border-color: var(--accent); }
	.chk { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #524431; white-space: nowrap; }
	.chk input { width: 15px; height: 15px; accent-color: var(--accent); }
	.run-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
	.run-row .in { min-width: 200px; }
	.err { color: #C4381B; font-size: 13px; margin: 10px 0 0; }

	.result { margin-top: 16px; border-top: 1px solid #F1EADB; padding-top: 14px; }
	.res-head { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
	.res-meta { display: flex; gap: 22px; font-size: 13px; color: #524431; flex-wrap: wrap; margin-bottom: 10px; }
	.pill { display: inline-block; font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 100px; }
	.pill.sm { font-size: 10px; padding: 2px 7px; }
	.pill.accent { background: #FDEEE4; color: #B15A12; } .pill.muted { background: #F1EADB; color: #8A7550; }
	.pill.warn { background: #FBF0D6; color: #9A6B00; } .pill.danger { background: #FCE4DE; color: #C4381B; }

	.table-card { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
	table { width: 100%; border-collapse: collapse; font-size: 13px; }
	th { text-align: left; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #A88B52; padding: 9px 12px; background: #FBF7EF; border-bottom: 1px solid var(--border); }
	th.num { text-align: right; }
	td { padding: 9px 12px; border-bottom: 1px solid #F1EADB; color: #18181B; }
	td.num { text-align: right; font-variant-numeric: tabular-nums; }
	td.muted { color: #98876e; } .nowrap { white-space: nowrap; } .mono { font-family: ui-monospace, monospace; font-size: 12px; }
	.actions { text-align: right; }
	.link { background: none; border: none; font-family: inherit; font-size: 12px; font-weight: 700; color: #B15A12; cursor: pointer; }
	.detail-row td { background: #FBF7EF; padding: 8px 12px; }
	.li { margin: 0; }
	.li th { background: #fff; }
	tr.in-stock td { background: #E9F7EC; }
	tr.in-stock td.stock { font-weight: 800; color: #1E7A34; }

	.settings { display: flex; flex-direction: column; gap: 12px; max-width: 460px; }
	.fld { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 700; color: #6b5e4e; }
	.save-row { display: flex; align-items: center; gap: 12px; }
	.msg { font-size: 13px; color: #1E7A34; font-weight: 600; }
</style>
