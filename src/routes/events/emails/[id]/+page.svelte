<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { invalidateAll, goto } from '$app/navigation';

	let { data } = $props();

	const LANGS = [
		{ code: 'da', label: 'Dansk' },
		{ code: 'se', label: 'Svenska' },
		{ code: 'no', label: 'Norsk' },
		{ code: 'en', label: 'English' },
	];
	const PLACEHOLDERS = ['{{event_title}}', '{{venue_name}}', '{{event_date}}', '{{start_time}}', '{{contact_name}}', '{{share_url}}'];

	// Settings form
	let name = $state(data.step.name);
	let dir = $state(data.step.offset_days === 0 ? 'day' : data.step.offset_days < 0 ? 'before' : 'after');
	let days = $state(Math.abs(data.step.offset_days) || 0);
	let askParticipants = $state(!!data.step.ask_participants);
	let askImages = $state(!!data.step.ask_images);
	let skipIfComplete = $state(!!data.step.skip_if_complete);
	let active = $state(!!data.step.active);
	let savingSettings = $state(false);
	let settingsSaved = $state(false);

	function offsetDays() {
		if (dir === 'day') return 0;
		return dir === 'before' ? -Math.abs(days) : Math.abs(days);
	}

	async function saveSettings() {
		if (savingSettings) return;
		savingSettings = true; settingsSaved = false;
		try {
			const res = await fetch(`/api/events/emails/${data.step.id}`, {
				method: 'PUT', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name, offset_days: offsetDays(),
					ask_participants: askParticipants, ask_images: askImages,
					skip_if_complete: skipIfComplete, active,
				})
			});
			if (!res.ok) throw new Error('Failed to save');
			settingsSaved = true; setTimeout(() => (settingsSaved = false), 1500);
			await invalidateAll();
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { savingSettings = false; }
	}

	async function removeStep() {
		if (!confirm('Delete this email step?')) return;
		await fetch(`/api/events/emails/${data.step.id}`, { method: 'DELETE' });
		await goto('/events/emails');
	}

	// Templates — local copy per language
	let tab = $state('da');
	let templates = $state(structuredClone(data.step.templates));
	let savingTpl = $state(false);
	let tplSaved = $state(false);

	async function saveTemplate() {
		if (savingTpl) return;
		savingTpl = true; tplSaved = false;
		try {
			const res = await fetch(`/api/events/emails/${data.step.id}/template`, {
				method: 'PUT', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ lang: tab, subject: templates[tab].subject, body: templates[tab].body })
			});
			if (!res.ok) throw new Error('Failed to save');
			tplSaved = true; setTimeout(() => (tplSaved = false), 1500);
		} catch (e) { alert(e instanceof Error ? e.message : String(e)); } finally { savingTpl = false; }
	}

	function hasContent(l) {
		const t = templates[l];
		return !!((t?.subject && t.subject.trim()) || (t?.body && t.body.trim()));
	}
</script>

<svelte:head><title>{name || 'Email step'} — Product Portal</title></svelte:head>

<div class="page">
	<AppNav active="events-emails" user={data.user} />

	<main>
		<div class="page-header">
			<a class="back-link" href="/events/emails">← Event emails</a>
			<div class="header-actions">
				<button class="btn danger" onclick={removeStep}>Delete step</button>
			</div>
		</div>

		<!-- Settings -->
		<div class="card">
			<h2 class="card-title">Step settings</h2>
			<div class="form-grid">
				<label class="fld span2"><span>Name (internal)</span><input bind:value={name} /></label>

				<div class="fld"><span>Timing</span>
					<div class="combo">
						<div class="seg seg-grow"><small>When</small>
							<select bind:value={dir}>
								<option value="before">Before event</option>
								<option value="after">After event</option>
								<option value="day">On the day</option>
							</select>
						</div>
						{#if dir !== 'day'}
							<div class="seg"><small>Days</small><input type="number" min="0" bind:value={days} /></div>
						{/if}
					</div>
				</div>

				<label class="fld"><span>Status</span>
					<select bind:value={active}>
						<option value={true}>Active</option>
						<option value={false}>Off</option>
					</select>
				</label>

				<div class="fld span2"><span>This email asks for</span>
					<div class="toggles">
						<label class="tog"><input type="checkbox" bind:checked={askParticipants} /> Participant numbers</label>
						<label class="tog"><input type="checkbox" bind:checked={askImages} /> Images</label>
						<label class="tog"><input type="checkbox" bind:checked={skipIfComplete} /> Skip if already complete <span class="muted">(after-event: both actual participants + an image present)</span></label>
					</div>
				</div>
			</div>
			<div class="right">
				{#if settingsSaved}<span class="flash">Saved ✓</span>{/if}
				<button class="btn primary" onclick={saveSettings} disabled={savingSettings}>{savingSettings ? 'Saving…' : 'Save settings'}</button>
			</div>
		</div>

		<!-- Templates -->
		<div class="card">
			<h2 class="card-title">Email content</h2>
			<div class="tabs">
				{#each LANGS as l}
					<button class="tab" class:active={tab === l.code} onclick={() => (tab = l.code)}>
						{l.label}
						{#if hasContent(l.code)}<span class="dot"></span>{/if}
					</button>
				{/each}
			</div>

			<label class="fld"><span>Subject</span><input bind:value={templates[tab].subject} placeholder="e.g. How many are joining {'{{'}event_title{'}}'}?" /></label>
			<label class="fld"><span>Body</span><textarea rows="12" bind:value={templates[tab].body} placeholder="Write the email…"></textarea></label>

			<div class="placeholders">
				<span class="ph-label">Placeholders:</span>
				{#each PLACEHOLDERS as p}<code class="ph">{p}</code>{/each}
			</div>

			<div class="right">
				{#if tplSaved}<span class="flash">Saved ✓</span>{/if}
				<button class="btn primary" onclick={saveTemplate} disabled={savingTpl}>{savingTpl ? 'Saving…' : `Save ${LANGS.find((l) => l.code === tab)?.label}`}</button>
			</div>
		</div>
	</main>
</div>

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 860px; margin: 0 auto; width: 100%; padding: 24px 28px 80px; }
	.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
	.back-link { font-size: 13px; font-weight: 600; color: #71717A; text-decoration: none; }
	.back-link:hover { color: #18181B; }
	.flash { font-size: 12px; color: #16a34a; font-weight: 600; }

	.btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid var(--border); border-radius: 10px; background: white; font-size: 13px; font-weight: 600; font-family: inherit; color: #18181B; cursor: pointer; }
	.btn:hover:not(:disabled) { background: #FAFAFA; }
	.btn:disabled { opacity: 0.5; cursor: default; }
	.btn.primary { background: #F57832; color: white; border-color: #F57832; }
	.btn.primary:hover:not(:disabled) { background: #e26a26; }
	.btn.danger { color: #dc2626; }

	.card { background: white; border: 1px solid var(--border); border-radius: 14px; padding: 18px; margin-bottom: 16px; }
	.card-title { font-size: 14px; font-weight: 700; color: #18181B; margin: 0 0 14px; }
	.muted { color: #A1A1AA; font-weight: 500; }

	.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.fld { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
	.fld span { font-size: 12px; font-weight: 600; color: #71717A; }
	.fld.span2 { grid-column: 1 / -1; }
	input, select, textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-family: inherit; color: #18181B; background: white; outline: none; }
	input:focus, select:focus, textarea:focus { border-color: #A1A1AA; }
	textarea { resize: vertical; line-height: 1.5; }
	select {
		appearance: none; -webkit-appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10' fill='none'%3E%3Cpath d='M2 3.5l3 3 3-3' stroke='%2371717A' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
		background-repeat: no-repeat; background-position: right 12px center; padding-right: 32px;
	}

	.combo { display: flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: white; }
	.combo .seg { display: flex; flex-direction: column; min-width: 0; flex: 1; }
	.combo .seg-grow { flex: 1.6; }
	.combo .seg + .seg { border-left: 1px solid var(--border); }
	.combo .seg small { font-size: 11px; font-weight: 600; color: #A1A1AA; padding: 6px 10px 0; }
	.combo .seg input, .combo .seg select { border: none; border-radius: 0; padding: 4px 10px 8px; background: transparent; }
	.combo .seg select { padding-right: 28px; background-position: right 8px center; }
	.combo .seg input:focus, .combo .seg select:focus { border: none; box-shadow: none; }

	.toggles { display: flex; flex-direction: column; gap: 8px; }
	.tog { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: #18181B; }
	.tog input { width: auto; }

	.right { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 8px; }

	.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 16px; }
	.tab { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; padding: 8px 14px; font-size: 13px; font-weight: 600; color: #71717A; cursor: pointer; border-bottom: 2px solid transparent; }
	.tab.active { color: #18181B; border-bottom-color: #F57832; }
	.dot { width: 6px; height: 6px; border-radius: 50%; background: #16a34a; }

	.placeholders { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 12px 0 4px; }
	.ph-label { font-size: 12px; color: #A1A1AA; font-weight: 600; }
	.ph { font-size: 12px; background: #F4F4F5; color: #52525B; padding: 2px 7px; border-radius: 6px; font-family: monospace; }
</style>
