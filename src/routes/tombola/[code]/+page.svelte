<script>
	import { onMount } from 'svelte';
	let { data } = $props();

	const KEY = `tombola:${data.code}`;
	const QUICK = ['🎲 Let’s go!', '🍀 Pick me!', '🔥 Best event ever', '👋 Hi everyone!', '🏆 Feeling lucky'];

	let phase = $state('loading'); // loading | form | joined
	let status = $state(data.status);
	let token = $state('');
	let me = $state(/** @type {any} */ (null));
	let shouts = $state(/** @type {any[]} */ ([]));

	let f = $state({ first_name: '', last_name: '', email: '', zip: '', consent: false });
	let busy = $state(false);
	let err = $state('');

	let msg = $state('');
	let sending = $state(false);
	let shoutErr = $state('');
	let sentFlash = $state(false);

	const ERRORS = {
		missing: 'Please fill in all fields.',
		email: 'That email doesn’t look right.',
		consent: 'Please tick the box to join the draw.',
		duplicate: 'This email is already in the draw — good luck! 🍀',
		closed: 'Sign-ups for this tombola are closed.',
	};

	function readToken() { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } }
	function writeToken(t) { try { localStorage.setItem(KEY, t); } catch {} }

	async function refresh() {
		if (!token) return;
		const r = await fetch(`/api/tombola/${data.code}/me`, { headers: { 'x-tombola-token': token } }).catch(() => null);
		if (!r?.ok) return;
		const j = await r.json();
		status = j.status;
		if (j.entry) { me = j.entry; shouts = j.shoutouts; phase = 'joined'; }
		else if (phase === 'loading') phase = 'form';
	}

	onMount(() => {
		token = readToken();
		if (!token) phase = 'form';
		else refresh().then(() => { if (phase === 'loading') phase = 'form'; });
		// Light poll so a phone finds out it won (and if sign-ups close).
		const iv = setInterval(() => { if (!document.hidden && token) refresh(); }, 12000);
		return () => clearInterval(iv);
	});

	async function join(e) {
		e.preventDefault();
		err = '';
		busy = true;
		try {
			const r = await fetch(`/api/tombola/${data.code}/join`, {
				method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f),
			});
			const j = await r.json().catch(() => ({}));
			if (!r.ok) { err = ERRORS[j.error] ?? 'Something went wrong — please try again.'; if (j.error === 'closed') status = 'closed'; return; }
			token = j.token;
			writeToken(token);
			me = { ...j.entry, won_at: null };
			shouts = [];
			phase = 'joined';
		} finally { busy = false; }
	}

	async function shout(text) {
		const message = (text ?? msg).trim();
		if (!message || sending) return;
		shoutErr = '';
		sending = true;
		try {
			const r = await fetch(`/api/tombola/${data.code}/shout`, {
				method: 'POST', headers: { 'content-type': 'application/json', 'x-tombola-token': token }, body: JSON.stringify({ message }),
			});
			const j = await r.json().catch(() => ({}));
			if (!r.ok) { shoutErr = j.error === 'cooldown' ? `Easy there! Wait ${j.wait}s before the next one.` : 'Could not send — try again.'; return; }
			shouts = [{ ...j.shout, created_at: new Date().toISOString() }, ...shouts];
			msg = '';
			sentFlash = true;
			setTimeout(() => (sentFlash = false), 1800);
		} finally { sending = false; }
	}
</script>

<svelte:head>
	<title>Tombola — {data.eventTitle}</title>
	<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
	<meta name="theme-color" content="#1b1033" />
</svelte:head>

<div class="wrap">
	<header>
		<div class="tag">🎟️ Tombola</div>
		<h1>{data.eventTitle}</h1>
		{#if data.venueName}<p class="venue">{data.venueName}</p>{/if}
	</header>

	{#if phase === 'loading'}
		<div class="card center"><div class="spinner"></div></div>

	{:else if phase === 'form'}
		{#if status !== 'open'}
			<div class="card center">
				<div class="big-emoji">🔒</div>
				<h2>Sign-ups are closed</h2>
				<p class="muted">This tombola isn’t taking new participants any more.</p>
			</div>
		{:else}
			<form class="card" onsubmit={join}>
				<h2>Join the draw!</h2>
				<p class="muted">Sign up and watch your name pop up on the big screen.</p>
				<div class="row">
					<label>First name<input bind:value={f.first_name} autocomplete="given-name" maxlength="40" required /></label>
					<label>Last name<input bind:value={f.last_name} autocomplete="family-name" maxlength="40" required /></label>
				</div>
				<label>Email<input type="email" bind:value={f.email} autocomplete="email" inputmode="email" maxlength="120" required /></label>
				<label>Zip code<input bind:value={f.zip} autocomplete="postal-code" inputmode="numeric" maxlength="12" required /></label>
				<label class="consent">
					<input type="checkbox" bind:checked={f.consent} />
					<span>I agree that Spilbræt may contact me by email about this draw and with news &amp; offers. I can unsubscribe at any time.</span>
				</label>
				{#if err}<p class="err">{err}</p>{/if}
				<button class="go" disabled={busy}>{busy ? 'Joining…' : 'Count me in! 🎉'}</button>
				<p class="fine">Only your first and last name are ever shown on the screen.</p>
			</form>
		{/if}

	{:else if phase === 'joined' && me}
		{#if me.won_at}
			<div class="card won">
				<div class="big-emoji">🏆</div>
				<h2>You won, {me.first_name}!</h2>
				<p>Come and collect your prize from our team.</p>
			</div>
		{/if}

		<div class="ticket">
			<div class="ticket-top">You’re in! ✅</div>
			<div class="ticket-name">{me.first_name} {me.last_name}</div>
			<div class="ticket-sub">Keep an eye on the big screen — good luck! 🍀</div>
		</div>

		<div class="card">
			<h2>Shout out to the screen 📣</h2>
			<div class="chips">
				{#each QUICK as q}<button type="button" class="chip" disabled={sending} onclick={() => shout(q)}>{q}</button>{/each}
			</div>
			<form class="composer" onsubmit={(e) => { e.preventDefault(); shout(); }}>
				<input bind:value={msg} maxlength="120" placeholder="Write a short message…" />
				<button class="send" disabled={sending || !msg.trim()}>Send</button>
			</form>
			<div class="meta">
				{#if shoutErr}<span class="err">{shoutErr}</span>{:else if sentFlash}<span class="ok">Sent to the big screen! 🚀</span>{:else}<span class="muted">{120 - msg.length} characters left</span>{/if}
			</div>
			{#if shouts.length}
				<ul class="mine">
					{#each shouts as s (s.id)}<li><span class="bubble">{s.message}</span></li>{/each}
				</ul>
			{/if}
		</div>
		{#if status !== 'open'}<p class="fine center-text">Sign-ups are now closed — you’re still in the draw.</p>{/if}
	{/if}
</div>

<style>
	:global(body) { margin: 0; background: radial-gradient(120% 80% at 50% 0%, #3a1d6e 0%, #1b1033 60%, #120a24 100%) fixed; min-height: 100vh; }
	.wrap { max-width: 480px; margin: 0 auto; padding: 24px 16px 48px; font-family: Nunito, system-ui, sans-serif; color: #fff; }
	header { text-align: center; margin-bottom: 18px; }
	.tag { display: inline-block; background: #F57832; color: #fff; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; font-size: 12px; padding: 5px 12px; border-radius: 99px; }
	h1 { font-size: 26px; font-weight: 900; margin: 10px 0 2px; line-height: 1.15; }
	.venue { margin: 0; opacity: .7; font-weight: 600; }
	.card { background: #fff; color: #2a1f3d; border-radius: 20px; padding: 20px; margin-bottom: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.35); }
	.card h2 { margin: 0 0 4px; font-size: 20px; font-weight: 900; }
	.center { text-align: center; }
	.center-text { text-align: center; }
	.muted { color: #7a6f8a; margin: 0 0 14px; font-size: 14px; }
	.row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
	label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 800; color: #5b4f6b; margin-bottom: 12px; }
	input:not([type=checkbox]) { font: inherit; font-size: 16px; font-weight: 600; padding: 12px 12px; border: 2px solid #e6dff0; border-radius: 12px; outline: none; color: #2a1f3d; width: 100%; box-sizing: border-box; }
	input:focus { border-color: #F57832; }
	.consent { flex-direction: row; align-items: flex-start; gap: 10px; font-weight: 600; font-size: 12.5px; line-height: 1.4; }
	.consent input { width: 20px; height: 20px; flex-shrink: 0; margin: 1px 0 0; accent-color: #F57832; }
	.go { width: 100%; font: inherit; font-size: 19px; font-weight: 900; color: #fff; background: linear-gradient(135deg, #ff9a4d, #F57832 50%, #e2551b); border: 0; border-radius: 14px; padding: 15px; cursor: pointer; box-shadow: 0 6px 0 #b8430f; transition: transform .08s; }
	.go:active { transform: translateY(3px); box-shadow: 0 3px 0 #b8430f; }
	.go:disabled { opacity: .7; }
	.err { color: #d62f4b; font-weight: 700; font-size: 14px; margin: 0 0 10px; }
	.ok { color: #1a9a5a; font-weight: 800; }
	.fine { font-size: 12px; opacity: .65; text-align: center; margin: 10px 0 0; }
	.big-emoji { font-size: 54px; line-height: 1; margin-bottom: 8px; }
	.ticket { position: relative; background: linear-gradient(135deg, #ffd166, #F57832); color: #2a1300; border-radius: 20px; padding: 22px 20px; margin-bottom: 14px; text-align: center; box-shadow: 0 12px 40px rgba(0,0,0,.35); animation: pop .5s cubic-bezier(.2,1.6,.4,1); }
	.ticket::before, .ticket::after { content: ''; position: absolute; top: 50%; width: 22px; height: 22px; margin-top: -11px; border-radius: 50%; background: #1b1033; }
	.ticket::before { left: -11px; } .ticket::after { right: -11px; }
	.ticket-top { font-weight: 900; text-transform: uppercase; letter-spacing: .1em; font-size: 13px; }
	.ticket-name { font-size: 30px; font-weight: 900; margin: 6px 0; line-height: 1.1; word-break: break-word; }
	.ticket-sub { font-weight: 700; font-size: 14px; opacity: .8; }
	.won { background: linear-gradient(135deg, #2fd88a, #13a463); color: #fff; text-align: center; animation: pop .6s cubic-bezier(.2,1.6,.4,1); }
	.won p { margin: 4px 0 0; font-weight: 700; }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 12px; }
	.chip { font: inherit; font-size: 13px; font-weight: 800; background: #f4eefb; color: #4a2d7a; border: 0; border-radius: 99px; padding: 7px 11px; cursor: pointer; }
	.chip:active { background: #e6d9f7; }
	.composer { display: flex; gap: 8px; }
	.send { font: inherit; font-weight: 900; background: #6a3fd1; color: #fff; border: 0; border-radius: 12px; padding: 0 16px; cursor: pointer; }
	.send:disabled { opacity: .5; }
	.meta { font-size: 13px; margin-top: 6px; min-height: 18px; }
	.meta .muted { margin: 0; }
	.mine { list-style: none; padding: 0; margin: 14px 0 0; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
	.bubble { display: inline-block; background: #f4eefb; border-radius: 14px 14px 14px 4px; padding: 7px 12px; font-weight: 700; font-size: 14px; }
	.spinner { width: 34px; height: 34px; border: 4px solid #eee; border-top-color: #F57832; border-radius: 50%; margin: 10px auto; animation: spin .8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	@keyframes pop { from { transform: scale(.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }
</style>
