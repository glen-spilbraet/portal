<script>
	import { invalidateAll } from '$app/navigation';
	let { eventId, tombola, entries = [], shoutouts = [] } = $props();

	let busy = $state(false);
	let copied = $state(false);
	let showPeople = $state(false);
	let showShouts = $state(false);

	const winners = $derived(entries.filter((e) => e.won_at).sort((a, b) => a.won_at.localeCompare(b.won_at)));

	async function create() {
		busy = true;
		const r = await fetch(`/api/event-tombola/${eventId}`, { method: 'POST' });
		busy = false;
		if (!r.ok) return alert('Could not create the tombola');
		await invalidateAll();
	}
	async function setStatus(status) {
		if (status === 'closed' && !confirm('Close sign-ups? New people won’t be able to join (everyone already in stays in the draw).')) return;
		busy = true;
		const r = await fetch(`/api/event-tombola/${eventId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
		busy = false;
		if (!r.ok) return alert('Could not change the status');
		await invalidateAll();
	}
	async function toggleHidden(s) {
		await fetch(`/api/event-tombola/${eventId}/shoutouts/${s.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hidden: !s.hidden }) });
		await invalidateAll();
	}
	function copy() {
		navigator.clipboard?.writeText(tombola.joinUrl);
		copied = true; setTimeout(() => (copied = false), 1500);
	}
	let copiedScreen = $state(false);
	function copyScreen() {
		navigator.clipboard?.writeText(tombola.screenUrl);
		copiedScreen = true; setTimeout(() => (copiedScreen = false), 1500);
	}

	// Screen PIN (lets someone without a Portal login run the big screen)
	let pinEdit = $state(false);
	let pinValue = $state('');
	let pinErr = $state('');
	function startPin() { pinValue = tombola.pin ?? ''; pinErr = ''; pinEdit = true; }
	async function savePin() {
		if (!/^\d{4,8}$/.test(pinValue)) { pinErr = '4–8 digits'; return; }
		busy = true;
		const r = await fetch(`/api/event-tombola/${eventId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin: pinValue }) });
		busy = false;
		if (!r.ok) { pinErr = 'Could not save'; return; }
		pinEdit = false;
		await invalidateAll();
	}
	function fmt(ts) {
		if (!ts) return '';
		try { return new Date(ts.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
		catch { return ts; }
	}
</script>

<div class="card">
	<div class="head">
		<h2 class="card-title">🎟️ Tombola <span class="muted">· QR sign-up, big screen &amp; prize draw</span></h2>
		{#if tombola}
			<span class="pill" class:open={tombola.status === 'open'}>{tombola.status === 'open' ? 'Open for sign-ups' : 'Closed'}</span>
		{/if}
	</div>

	{#if !tombola}
		<p class="hint top">Show a QR code on a screen at the event: guests sign up on their phone (name, email, zip), pop up live on the screen and can send shoutouts. Then draw winners with a big animated reveal.</p>
		<button class="btn primary" onclick={create} disabled={busy}>{busy ? 'Creating…' : 'Create tombola'}</button>
	{:else}
		<div class="stats">
			<div><b>{entries.length}</b> participants</div>
			<div><b>{winners.length}</b> winners</div>
			<div><b>{shoutouts.length}</b> shoutouts</div>
		</div>

		<div class="row">
			<input class="link" readonly value={tombola.joinUrl} />
			<button class="btn" onclick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
		</div>

		<div class="actions">
			<a class="btn primary" href={tombola.screenUrl} target="_blank" rel="noopener">Open big screen ↗</a>
			<button class="btn" onclick={copyScreen}>{copiedScreen ? 'Copied ✓' : 'Copy screen link'}</button>
			{#if tombola.status === 'open'}
				<button class="btn" onclick={() => setStatus('closed')} disabled={busy}>🔒 Close sign-ups</button>
			{:else}
				<button class="btn" onclick={() => setStatus('open')} disabled={busy}>🔓 Re-open sign-ups</button>
			{/if}
			<a class="btn" href="/api/event-tombola/{eventId}/export" download>⬇ Export CSV</a>
		</div>

		<div class="pin-row">
			<span class="pin-label">Screen PIN</span>
			{#if pinEdit}
				<input class="pin-input" bind:value={pinValue} inputmode="numeric" maxlength="8" placeholder="4–8 digits" onkeydown={(e) => e.key === 'Enter' && savePin()} />
				<button class="btn sm primary" onclick={savePin} disabled={busy}>Save</button>
				<button class="btn sm" onclick={() => (pinEdit = false)}>Cancel</button>
				{#if pinErr}<span class="pin-err">{pinErr}</span>{/if}
			{:else}
				<code class="pin">{tombola.pin ?? '—'}</code>
				<button class="btn sm" onclick={startPin}>Change</button>
			{/if}
		</div>

		{#if winners.length}
			<div class="winners">
				{#each winners as w, i}<span class="win">🏆 {i + 1}. {w.first_name} {w.last_name}</span>{/each}
			</div>
		{/if}

		{#if entries.length}
			<button class="toggle" onclick={() => (showPeople = !showPeople)}>{showPeople ? '▾' : '▸'} Participants ({entries.length})</button>
			{#if showPeople}
				<div class="table-wrap">
					<table>
						<thead><tr><th>Name</th><th>Email</th><th>Zip</th><th>Joined</th><th></th></tr></thead>
						<tbody>
							{#each entries as e (e.id)}
								<tr>
									<td>{e.first_name} {e.last_name}</td>
									<td>{e.email}</td>
									<td>{e.zip}</td>
									<td class="nowrap">{fmt(e.created_at)}</td>
									<td>{#if e.won_at}<span class="won">Winner</span>{/if}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{/if}

		{#if shoutouts.length}
			<button class="toggle" onclick={() => (showShouts = !showShouts)}>{showShouts ? '▾' : '▸'} Shoutouts ({shoutouts.length})</button>
			{#if showShouts}
				<ul class="shouts">
					{#each shoutouts as s (s.id)}
						<li class:hidden={s.hidden}>
							<span class="who">{s.first_name} {s.last_name}</span>
							<span class="msg">{s.message}</span>
							<button class="btn sm" onclick={() => toggleHidden(s)}>{s.hidden ? 'Show' : 'Hide'}</button>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
		<p class="hint">Participants are kept permanently — re-opening the board later at the same event picks up everyone who already joined. The same person can only win once.</p>
	{/if}
</div>

<style>
	.card { background: white; border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px 22px; margin-bottom: 16px; box-shadow: var(--shadow); }
	.head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.card-title { font-size: 15px; font-weight: 800; margin: 0; }
	.muted { color: #A1A1AA; font-weight: 500; font-size: 12px; }
	.hint { font-size: 12px; color: #A1A1AA; margin: 12px 0 0; }
	.hint.top { margin: 8px 0 12px; }
	.pill { font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 99px; background: #F4F4F5; color: #71717A; white-space: nowrap; }
	.pill.open { background: #DCFCE7; color: #15803D; }
	.stats { display: flex; gap: 22px; margin: 12px 0; font-size: 13px; color: #52525B; }
	.stats b { font-size: 20px; color: #18181B; margin-right: 2px; }
	.row { display: flex; gap: 8px; }
	.link { flex: 1; font-family: monospace; font-size: 12px; }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
	.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 10px; background: white; font-size: 13px; font-weight: 600; font-family: inherit; color: #18181B; cursor: pointer; text-decoration: none; white-space: nowrap; }
	.btn:hover:not(:disabled) { background: #FAFAFA; }
	.btn:disabled { opacity: .5; cursor: default; }
	.btn.primary { background: #F57832; color: white; border-color: #F57832; }
	.btn.primary:hover:not(:disabled) { background: #e26a26; }
	.btn.sm { padding: 4px 10px; font-size: 12px; }
	.pin-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 13px; }
	.pin-label { font-weight: 700; color: #52525B; }
	.pin { font-size: 15px; font-weight: 800; letter-spacing: .15em; background: #FAFAFA; border: 1px solid var(--border); border-radius: 8px; padding: 3px 10px; }
	.pin-input { width: 110px; font-family: monospace; font-size: 14px; letter-spacing: .1em; }
	.pin-err { color: #dc2626; font-size: 12px; font-weight: 600; }
	.winners { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
	.win { background: #FEF3C7; color: #92400E; font-weight: 700; font-size: 12px; padding: 4px 10px; border-radius: 99px; }
	.toggle { display: block; margin-top: 14px; background: none; border: 0; padding: 0; font: inherit; font-size: 13px; font-weight: 700; color: #52525B; cursor: pointer; }
	.table-wrap { max-height: 360px; overflow: auto; margin-top: 8px; border: 1px solid #F4F4F5; border-radius: 10px; }
	table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
	th { position: sticky; top: 0; background: #FAFAFA; text-align: left; font-weight: 700; color: #71717A; padding: 7px 10px; }
	td { padding: 6px 10px; border-top: 1px solid #F4F4F5; }
	.nowrap { white-space: nowrap; }
	.won { background: #FEF3C7; color: #92400E; font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 99px; }
	.shouts { list-style: none; padding: 0; margin: 8px 0 0; display: flex; flex-direction: column; gap: 4px; max-height: 300px; overflow: auto; }
	.shouts li { display: flex; align-items: center; gap: 10px; font-size: 13px; padding: 5px 8px; border-radius: 8px; background: #FAFAFA; }
	.shouts li.hidden { opacity: .45; text-decoration: line-through; }
	.who { font-weight: 700; white-space: nowrap; }
	.msg { flex: 1; }
</style>
