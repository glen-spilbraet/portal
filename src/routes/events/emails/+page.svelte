<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll, goto } from '$app/navigation';

	let { data } = $props();
	let busy = $state(false);

	const LANGS = ['da', 'se', 'no', 'en'];

	function offsetLabel(d) {
		if (d === 0) return 'On the day';
		const abs = Math.abs(d);
		const unit = abs % 7 === 0 ? `${abs / 7} week${abs / 7 > 1 ? 's' : ''}` : `${abs} day${abs > 1 ? 's' : ''}`;
		return d < 0 ? `${unit} before` : `${unit} after`;
	}

	async function addStep() {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch('/api/events/emails', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: 'New step', offset_days: 1, ask_participants: true })
			});
			const body = await res.json();
			if (!res.ok) throw new Error(body.message ?? 'Failed');
			await goto(`/events/emails/${body.id}`);
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { busy = false; }
	}

	async function toggleActive(step) {
		await fetch(`/api/events/emails/${step.id}`, {
			method: 'PUT', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ active: !step.active })
		});
		await invalidateAll();
	}

	async function deleteStep(id) {
		if (!confirm('Delete this email step?')) return;
		await fetch(`/api/events/emails/${id}`, { method: 'DELETE' });
		await invalidateAll();
	}
</script>

<svelte:head><title>Event emails — Product Portal</title></svelte:head>

<div class="page">
	<AppNav active="events-emails" user={data.user} />

	<main>
		<div class="page-header">
			<div>
				<h1 class="page-title">Event emails</h1>
				<p class="page-sub">Timed emails around each event — asking contacts for participant numbers and images. Ordered before → after the event.</p>
			</div>
			<button class="btn primary" onclick={addStep} disabled={busy}>+ Add step</button>
		</div>

		{#if data.steps.length === 0}
			<p class="empty">No steps yet. Add one to start your flow.</p>
		{:else}
			<div class="flow">
				{#each data.steps as s (s.id)}
					<div class="step" class:inactive={!s.active}>
						<div class="offset"><span class="offset-badge {s.offset_days < 0 ? 'before' : s.offset_days > 0 ? 'after' : 'day'}">{offsetLabel(s.offset_days)}</span></div>
						<div class="step-main">
							<a class="step-name" href="/events/emails/{s.id}">{s.name}</a>
							<div class="asks">
								{#if s.ask_participants}<span class="ask">Participants</span>{/if}
								{#if s.ask_images}<span class="ask">Images</span>{/if}
								{#if s.skip_if_complete}<span class="ask muted-ask">Skip if complete</span>{/if}
							</div>
						</div>
						<div class="langs">
							{#each LANGS as l}<span class="lang {s.languages.includes(l) ? 'on' : ''}">{l}</span>{/each}
						</div>
						<div class="step-actions">
							<button class="pill {s.active ? 'on' : 'off'}" onclick={() => toggleActive(s)}>{s.active ? 'Active' : 'Off'}</button>
							<a class="btn sm" href="/events/emails/{s.id}">Edit</a>
							<button class="btn sm danger" onclick={() => deleteStep(s.id)}>Delete</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</main>
</div>

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 1000px; margin: 0 auto; width: 100%; padding: 32px 28px 80px; }
	.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
	.page-title { font-size: 18px; font-weight: 700; color: #18181B; margin: 0 0 2px; }
	.page-sub { font-size: 13px; color: #A1A1AA; margin: 0; max-width: 620px; }

	.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 10px; background: white; font-size: 13px; font-weight: 600; font-family: inherit; color: #18181B; cursor: pointer; text-decoration: none; }
	.btn:hover:not(:disabled) { background: #FAFAFA; }
	.btn:disabled { opacity: 0.5; cursor: default; }
	.btn.primary { background: #F57832; color: white; border-color: #F57832; }
	.btn.primary:hover:not(:disabled) { background: #e26a26; }
	.btn.sm { padding: 5px 10px; font-size: 12px; }
	.btn.danger { color: #dc2626; }
	.empty { color: #A1A1AA; font-size: 13px; padding: 20px 0; }

	.flow { display: flex; flex-direction: column; gap: 8px; }
	.step { display: flex; align-items: center; gap: 16px; background: white; border: 1px solid var(--border); border-radius: 12px; padding: 12px 16px; }
	.step.inactive { opacity: 0.6; }
	.offset { width: 130px; flex-shrink: 0; }
	.offset-badge { font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 100px; white-space: nowrap; }
	.offset-badge.before { background: #DBEAFE; color: #1d4ed8; }
	.offset-badge.after { background: #FEF3C7; color: #a16207; }
	.offset-badge.day { background: #E9F7EC; color: #16a34a; }
	.step-main { flex: 1; min-width: 0; }
	.step-name { font-size: 14px; font-weight: 600; color: #18181B; text-decoration: none; }
	.step-name:hover { text-decoration: underline; }
	.asks { display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
	.ask { font-size: 11px; font-weight: 600; color: #52525B; background: #F4F4F5; padding: 2px 8px; border-radius: 100px; }
	.muted-ask { color: #A1A1AA; }
	.langs { display: flex; gap: 3px; }
	.lang { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #C4C4C8; background: #F4F4F5; padding: 3px 6px; border-radius: 5px; }
	.lang.on { color: #16a34a; background: #E9F7EC; }
	.step-actions { display: flex; align-items: center; gap: 8px; }
	.pill { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 100px; border: 1px solid var(--border); cursor: pointer; background: white; }
	.pill.on { background: #E9F7EC; color: #16a34a; border-color: #bbf7d0; }
	.pill.off { color: #A1A1AA; }
</style>
