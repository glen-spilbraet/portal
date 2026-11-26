<script>
	import { tt, tenderWhen } from '$lib/guruTender.js';

	let { data } = $props();
	const lang = data.lang;
	const t = (k, v) => tt(lang, k, v);

	let status = $state(data.proposal.status);
	let myOpening = $state(data.proposal.opening_id);
	let openings = $state(data.openings);
	let saving = $state(false);
	let notice = $state('');

	const p = data.proposal;
	const when = tenderWhen(lang, p);
	const place = [p.venue_name, [p.venue_zip, p.venue_city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
	const closed = p.event_status === 'cancelled' || p.event_status === 'done';

	const tender = $derived(openings.length > 0);
	const booked = $derived(status === 'accepted' || status === 'confirmed');
	const mine = $derived(openings.find((o) => o.id === myOpening) ?? null);
	const anyFree = $derived(openings.some((o) => o.slots - o.filled > 0));

	async function respond(choice, openingId = null) {
		if (saving) return;
		if (choice === 'declined' && booked && !confirm(t('cancelConfirm'))) return;
		saving = true; notice = '';
		try {
			const res = await fetch(`/api/events/guru/${data.token}/respond`, {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: choice, opening_id: openingId })
			});
			const body = await res.json().catch(() => ({}));
			if (body.openings) openings = body.openings;
			if (res.status === 409) { notice = t('gone'); return; }
			if (!res.ok) { notice = t('error'); return; }
			status = body.status; myOpening = body.opening_id;
		} catch { notice = t('error'); }
		finally { saving = false; }
	}
</script>

<svelte:head><title>{t('tag')} — Spilbræt</title></svelte:head>

<div class="wrap">
	<div class="card">
		<span class="tag">{t('tag')}</span>
		<h1>{t('hi', { name: p.guru_name?.split(' ')[0] ?? '' })}</h1>
		<p class="lead">{tender ? t('lead') : t('leadSingle')}</p>

		<div class="event">
			<div class="event-title">{p.event_title || 'Event'}</div>
			{#if when}<div class="event-line">📅 {when}</div>{/if}
			{#if place}<div class="event-line">📍 {place}</div>{/if}
			{#if p.venue_address}<div class="event-line muted">{p.venue_address}</div>{/if}
		</div>

		{#if closed}
			<div class="result no">{t('allFull')}</div>
		{:else if tender}
			{#if booked}
				<div class="result yes">{mine ? t('booked', { label: ` — ${mine.label || t('general')}` }) : t('bookedSingle')}</div>
			{:else if status === 'declined'}
				<div class="result neutral">{t('declined')}{#if anyFree}<br /><small>{t('changed')}</small>{/if}</div>
			{:else if !anyFree}
				<div class="result neutral">{t('allFull')}</div>
			{/if}

			{#if notice}<div class="notice">{notice}</div>{/if}

			<ul class="openings">
				{#each openings as o (o.id)}
					{@const free = o.slots - o.filled}
					{@const isMine = booked && o.id === myOpening}
					<li class="opening" class:mine={isMine} class:full={free <= 0 && !isMine}>
						<div class="o-main">
							<span class="o-label">{o.label || t('general')}</span>
							<span class="o-dots" aria-hidden="true">{#each Array(o.slots) as _, i}<span class="dot" class:taken={i < o.filled}></span>{/each}</span>
							<span class="o-sub">{t('spotsLeft', { n: Math.max(free, 0), total: o.slots })}</span>
						</div>
						{#if isMine}
							<span class="o-check" aria-label="✓">✓</span>
						{:else if !booked}
							<button class="btn yes sm" onclick={() => respond('accepted', o.id)} disabled={saving || free <= 0}>{free > 0 ? t('take') : t('full')}</button>
						{/if}
					</li>
				{/each}
			</ul>

			{#if booked}
				<div class="actions"><button class="btn ghost" onclick={() => respond('declined')} disabled={saving}>{t('cancel')}</button></div>
			{:else if status !== 'declined' && anyFree}
				<div class="actions"><button class="btn ghost" onclick={() => respond('declined')} disabled={saving}>{t('decline')}</button></div>
			{/if}
		{:else}
			{#if booked}
				<div class="result yes">{t('bookedSingle')}</div>
				<div class="actions"><button class="btn ghost" onclick={() => respond('declined')} disabled={saving}>{t('cancel')}</button></div>
			{:else if status === 'declined'}
				<div class="result neutral">{t('declined')}</div>
				<div class="actions"><button class="btn yes" onclick={() => respond('accepted')} disabled={saving}>{t('yesSingle')}</button></div>
			{:else}
				<div class="actions two">
					<button class="btn yes" onclick={() => respond('accepted')} disabled={saving}>{t('yesSingle')}</button>
					<button class="btn ghost" onclick={() => respond('declined')} disabled={saving}>{t('noSingle')}</button>
				</div>
			{/if}
			{#if notice}<div class="notice">{notice}</div>{/if}
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
	.opening.full .btn:disabled { background: #E4E4E7; color: #71717A; }
	.btn.yes { background: #F57832; color: white; }
	.btn.yes:hover:not(:disabled) { background: #e26a26; }
	.btn.ghost { background: white; color: #52525B; border: 1px solid #E7E7E4; }
	.btn.ghost:hover:not(:disabled) { background: #FAFAFA; }
	.result { margin-top: 22px; padding: 16px; border-radius: 14px; font-size: 15px; font-weight: 600; }
	.result small { font-weight: 400; color: #71717A; }
	.result.yes { background: #F0FDF4; color: #16a34a; }
	.result.no { background: #FEF2F2; color: #b91c1c; }
	.result.neutral { background: rgba(255,255,255,0.8); color: #52525B; }
	.notice { margin-top: 14px; padding: 10px 14px; border-radius: 12px; background: #FEF3C7; color: #92400E; font-size: 14px; font-weight: 600; }
	.openings { list-style: none; padding: 0; margin: 20px 0 0; display: flex; flex-direction: column; gap: 10px; text-align: left; }
	.opening { display: flex; align-items: center; gap: 12px; background: white; border: 2px solid transparent; border-radius: 16px; padding: 14px 16px; box-shadow: 0 14px 30px -24px rgba(150,108,20,0.5); }
	.opening.mine { border-color: #16a34a; background: #F0FDF4; }
	.opening.full { opacity: .55; }
	.o-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
	.o-label { font-size: 16px; font-weight: 700; color: #241E12; }
	.o-dots { display: flex; gap: 4px; }
	.o-dots .dot { width: 10px; height: 10px; border-radius: 50%; background: #FDE7D6; border: 1.5px solid #F57832; box-sizing: border-box; }
	.o-dots .dot.taken { background: #D4D4D8; border-color: #D4D4D8; }
	.o-sub { font-size: 13px; color: #71717A; }
	.o-check { width: 32px; height: 32px; border-radius: 50%; background: #16a34a; color: white; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
	.btn.sm { flex: none; padding: 10px 16px; font-size: 14px; }
	footer { text-align: center; color: #8A7B58; font-size: 12px; margin-top: 32px; }
</style>
