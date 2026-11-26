<script>
	import { invalidateAll } from '$app/navigation';
	let { eventId, tombola, entries = [], shoutouts = [], bare = false } = $props();

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
	const short = (u) => (u ?? '').replace(/^https?:\/\//, '');
	function fmt(ts) {
		if (!ts) return '';
		try { return new Date(ts.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
		catch { return ts; }
	}
</script>

<div class:card={!bare}>
	{#if !bare}
	<div class="head">
		<h2 class="card-title">🎟️ Tombola <span class="muted">· QR sign-up, big screen &amp; prize draw</span></h2>
		{#if tombola}
			<span class="pill" class:open={tombola.status === 'open'}>{tombola.status === 'open' ? 'Open for sign-ups' : 'Closed'}</span>
		{/if}
	</div>
	{/if}

	{#if !tombola}
		<p class="hint top">Show a QR code on a screen at the event: guests sign up on their phone (name, email, zip), pop up live on the screen and can send shoutouts. Then draw winners with a big animated reveal.</p>
		<button class="btn primary" onclick={create} disabled={busy}>{busy ? 'Creating…' : 'Create tombola'}</button>
	{:else}
		<div class="tiles">
			<div class="tile"><span class="t-label">Participants</span><span class="t-val">{entries.length}</span></div>
			<div class="tile"><span class="t-label">Winners</span><span class="t-val">{winners.length}</span></div>
			<div class="tile"><span class="t-label">Shoutouts</span><span class="t-val">{shoutouts.length}</span></div>
			<div class="tile">
				<span class="t-label">Sign-ups</span>
				<div class="t-status">
					<span class="t-val st" class:open={tombola.status === 'open'}><span class="sdot"></span>{tombola.status === 'open' ? 'Open' : 'Closed'}</span>
					{#if tombola.status === 'open'}
						<button class="t-link" onclick={() => setStatus('closed')} disabled={busy}>Close</button>
					{:else}
						<button class="t-link" onclick={() => setStatus('open')} disabled={busy}>Re-open</button>
					{/if}
				</div>
			</div>
		</div>

		<div class="links">
			<div class="lrow">
				<span class="l-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><rect x="7" y="2.5" width="10" height="19" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10.5 18.5h3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>
				<div class="l-main">
					<span class="l-title">Sign-up page</span>
					<a class="l-url" href={tombola.joinUrl} target="_blank" rel="noopener" title={tombola.joinUrl}>{short(tombola.joinUrl)}</a>
				</div>
				<div class="l-actions">
					<button class="btn sm" onclick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
				</div>
			</div>
			<div class="lrow">
				<span class="l-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><rect x="2.5" y="4" width="19" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8.5 21h7M12 17v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>
				<div class="l-main">
					<span class="l-title">Big screen</span>
					<a class="l-url" href={tombola.screenUrl} target="_blank" rel="noopener" title={tombola.screenUrl}>{short(tombola.screenUrl)}</a>
				</div>
				<div class="l-actions">
					{#if pinEdit}
						<input class="pin-input" bind:value={pinValue} inputmode="numeric" maxlength="8" placeholder="4–8 digits" onkeydown={(e) => e.key === 'Enter' && savePin()} />
						<button class="btn sm primary" onclick={savePin} disabled={busy}>Save</button>
						<button class="btn sm" onclick={() => (pinEdit = false)}>Cancel</button>
						{#if pinErr}<span class="pin-err">{pinErr}</span>{/if}
					{:else}
						<button class="pin" onclick={startPin} title="Screen PIN — lets someone without a Portal login run the big screen. Click to change.">
							<span class="pin-label">PIN</span><code>{tombola.pin ?? '—'}</code>
							<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>
						</button>
					{/if}
					<button class="btn sm" onclick={copyScreen}>{copiedScreen ? 'Copied ✓' : 'Copy link'}</button>
					<a class="btn sm primary" href={tombola.screenUrl} target="_blank" rel="noopener">Open ↗</a>
				</div>
			</div>
		</div>

		{#if winners.length}
			<div class="winners">
				{#each winners as w, i}<span class="win"><span class="win-n">{i + 1}</span>{w.first_name} {w.last_name}</span>{/each}
			</div>
		{/if}

		<div class="lists-bar">
			{#if entries.length}
				<button class="chip-btn" class:on={showPeople} onclick={() => (showPeople = !showPeople)}>Participants <b>{entries.length}</b> <span class="caret">{showPeople ? '▴' : '▾'}</span></button>
			{/if}
			{#if shoutouts.length}
				<button class="chip-btn" class:on={showShouts} onclick={() => (showShouts = !showShouts)}>Shoutouts <b>{shoutouts.length}</b> <span class="caret">{showShouts ? '▴' : '▾'}</span></button>
			{/if}
			<a class="btn sm export" href="/api/event-tombola/{eventId}/export" download>Export CSV</a>
		</div>

		{#if entries.length && showPeople}
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

		{#if shoutouts.length && showShouts}
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
		{#if !bare}<p class="hint">Participants are kept permanently — re-opening the board later at the same event picks up everyone who already joined. The same person can only win once.</p>{/if}
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
	.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 10px; background: white; font-size: 13px; font-weight: 600; font-family: inherit; color: #18181B; cursor: pointer; text-decoration: none; white-space: nowrap; }
	.btn:hover:not(:disabled) { background: #FAFAFA; }
	.btn:disabled { opacity: .5; cursor: default; }
	.btn.primary { background: #F57832; color: white; border-color: #F57832; }
	.btn.primary:hover:not(:disabled) { background: #e26a26; }
	.btn.sm { padding: 4px 10px; font-size: 12px; }
	.table-wrap { max-height: 360px; overflow: auto; margin-top: 10px; border: 1px solid #F4F4F5; border-radius: 10px; }
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
	.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
	.tile { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border: 1px solid #F0F0F1; background: #FAFAFA; border-radius: 12px; min-width: 0; }
	.t-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #A1A1AA; }
	.t-val { font-size: 22px; font-weight: 800; color: #18181B; line-height: 1.1; font-variant-numeric: tabular-nums; }
	.t-status { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.t-val.st { display: inline-flex; align-items: center; gap: 7px; font-size: 16px; color: #71717A; }
	.t-val.st.open { color: #15803D; }
	.sdot { width: 8px; height: 8px; border-radius: 50%; background: #A1A1AA; }
	.open .sdot { background: #16a34a; box-shadow: 0 0 0 3px #DCFCE7; }
	.t-link { border: none; background: none; padding: 0; font: inherit; font-size: 12px; font-weight: 600; color: #71717A; text-decoration: underline; cursor: pointer; }
	.t-link:hover { color: #18181B; }
	.links { margin-top: 12px; border: 1px solid #F0F0F1; border-radius: 12px; }
	.lrow { display: flex; align-items: center; gap: 12px; padding: 10px 12px; min-height: 56px; box-sizing: border-box; }
	.lrow + .lrow { border-top: 1px solid #F0F0F1; }
	.l-icon { width: 34px; height: 34px; border-radius: 9px; background: #FFF4ED; color: #F57832; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
	.l-main { display: flex; flex-direction: column; min-width: 0; flex: 1; }
	.l-title { font-size: 13px; font-weight: 700; color: #18181B; }
	.l-url { font-size: 12px; color: #A1A1AA; text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.l-url:hover { color: #F57832; }
	.l-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
	.pin { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px; border: 1px solid var(--border); border-radius: 8px; background: white; font-family: inherit; color: #71717A; cursor: pointer; }
	.pin:hover { background: #FAFAFA; color: #18181B; }
	.pin-label { font-size: 10px; font-weight: 700; letter-spacing: .05em; }
	.pin code { font-size: 13px; font-weight: 800; letter-spacing: .15em; color: #18181B; }
	.pin-input { width: 100px; font-family: monospace; font-size: 13px; letter-spacing: .1em; padding: 5px 8px; border: 1px solid var(--border); border-radius: 8px; }
	.pin-err { color: #dc2626; font-size: 12px; font-weight: 600; }
	.winners { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
	.win { display: inline-flex; align-items: center; gap: 6px; background: #FEF3C7; color: #92400E; font-weight: 600; font-size: 12px; padding: 3px 10px 3px 3px; border-radius: 99px; }
	.win-n { min-width: 20px; height: 20px; border-radius: 99px; background: #F59E0B; color: white; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
	.lists-bar { display: flex; align-items: center; gap: 6px; margin-top: 12px; }
	.chip-btn { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px; border: 1px solid var(--border); border-radius: 99px; background: white; font-family: inherit; font-size: 12px; font-weight: 600; color: #52525B; cursor: pointer; }
	.chip-btn b { color: #18181B; }
	.chip-btn:hover, .chip-btn.on { background: #F4F4F5; }
	.caret { font-size: 10px; color: #A1A1AA; }
	.export { margin-left: auto; }
	@media (max-width: 720px) {
		.tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.lrow { flex-wrap: wrap; }
		.l-actions { width: 100%; justify-content: flex-end; }
	}
</style>
