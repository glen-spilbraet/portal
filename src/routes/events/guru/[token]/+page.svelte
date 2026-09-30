<script>
	let { data } = $props();

	let status = $state(data.proposal.status);
	let saving = $state(false);

	async function respond(choice) {
		if (saving) return;
		saving = true;
		try {
			const res = await fetch(`/api/events/guru/${data.token}/respond`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: choice })
			});
			const body = await res.json();
			if (res.ok) status = body.status;
			else alert('Something went wrong — please try again.');
		} catch { alert('Something went wrong — please try again.'); }
		finally { saving = false; }
	}

	const p = data.proposal;
	function fmtDate(d) {
		if (!d) return '';
		try { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
		catch { return d; }
	}
	const when = [fmtDate(p.event_date), [p.start_time, p.end_time].filter(Boolean).join('–')].filter(Boolean).join(' · ');
	const place = [p.venue_name, [p.venue_zip, p.venue_city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
</script>

<svelte:head><title>Guru invitation — Spilbræt</title></svelte:head>

<div class="wrap">
	<div class="card">
		<span class="tag">Game Guru invitation</span>
		<h1>Hi {p.guru_name} 👋</h1>
		<p class="lead">Would you like to be a Game Guru for this event?</p>

		<div class="event">
			<div class="event-title">{p.event_title || 'Event'}</div>
			{#if when}<div class="event-line">📅 {when}</div>{/if}
			{#if place}<div class="event-line">📍 {place}</div>{/if}
			{#if p.venue_address}<div class="event-line muted">{p.venue_address}</div>{/if}
		</div>

		{#if status === 'accepted'}
			<div class="result yes">You're in — thanks! We'll be in touch. 🎉<br /><small>Changed your mind? You can still decline below.</small></div>
			<div class="actions"><button class="btn ghost" onclick={() => respond('declined')} disabled={saving}>Actually, I can't make it</button></div>
		{:else if status === 'declined'}
			<div class="result no">Thanks for letting us know — maybe next time.<br /><small>Changed your mind?</small></div>
			<div class="actions"><button class="btn yes" onclick={() => respond('accepted')} disabled={saving}>Yes, I'll be a guru</button></div>
		{:else}
			<div class="actions two">
				<button class="btn yes" onclick={() => respond('accepted')} disabled={saving}>Yes, I'll be a guru</button>
				<button class="btn ghost" onclick={() => respond('declined')} disabled={saving}>Can't make it</button>
			</div>
		{/if}
	</div>
	<footer>Spilbræt</footer>
</div>

<style>
	:global(body) {
		background: #FFE6A5;
		background-image:
			radial-gradient(900px 520px at 12% -8%, #FFF8E3 0%, rgba(255,248,227,0) 60%),
			radial-gradient(1000px 620px at 108% -4%, #FFF1CA 0%, rgba(255,241,202,0) 55%),
			linear-gradient(180deg, #FFF1CC 0%, #FFE6A5 60%, #FFE1A0 100%);
		background-attachment: fixed; min-height: 100vh;
	}
	.wrap { max-width: 540px; margin: 0 auto; padding: 60px 20px; font-family: system-ui, -apple-system, sans-serif; color: #2A2417; }
	.card { background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.7); border-radius: 24px; padding: 36px 30px; box-shadow: 0 40px 80px -40px rgba(150,108,20,0.45); text-align: center; }
	.tag { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: #B45309; background: rgba(255,255,255,0.7); border: 1px solid rgba(180,83,9,0.15); padding: 4px 12px; border-radius: 100px; margin-bottom: 16px; }
	h1 { font-size: 26px; font-weight: 800; margin: 0 0 6px; color: #241E12; }
	.lead { font-size: 15px; color: #4A4130; margin: 0 0 22px; }
	.event { background: white; border-radius: 16px; padding: 18px 20px; text-align: left; box-shadow: 0 20px 44px -30px rgba(150,108,20,0.4); }
	.event-title { font-size: 17px; font-weight: 700; margin-bottom: 8px; }
	.event-line { font-size: 14px; color: #52525B; margin-top: 3px; }
	.event-line.muted { color: #A1A1AA; font-size: 13px; }
	.actions { margin-top: 24px; display: flex; flex-direction: column; gap: 10px; }
	.actions.two { flex-direction: row; }
	.btn { flex: 1; padding: 14px 20px; border-radius: 12px; border: none; font-size: 15px; font-weight: 700; font-family: inherit; cursor: pointer; }
	.btn:disabled { opacity: 0.6; cursor: default; }
	.btn.yes { background: #F57832; color: white; }
	.btn.yes:hover:not(:disabled) { background: #e26a26; }
	.btn.ghost { background: white; color: #52525B; border: 1px solid #E7E7E4; }
	.btn.ghost:hover:not(:disabled) { background: #FAFAFA; }
	.result { margin-top: 22px; padding: 16px; border-radius: 14px; font-size: 15px; font-weight: 600; }
	.result small { font-weight: 400; color: #71717A; }
	.result.yes { background: #F0FDF4; color: #16a34a; }
	.result.no { background: #FEF2F2; color: #b91c1c; }
	footer { text-align: center; color: #8A7B58; font-size: 12px; margin-top: 32px; }
</style>
