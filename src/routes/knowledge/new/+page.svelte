<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();
	const today = new Date().toISOString().slice(0, 10);
	let f = $state({ title: '', happened_on: today, visibility: 'participants', participants: '', transcript: '', tldr: '', decisions: '', topics: '' });
	let teams = $state(new Set());
	let saving = $state(false);
	let error = $state('');

	function toggleTeam(t) { teams.has(t) ? teams.delete(t) : teams.add(t); teams = new Set(teams); }

	async function save() {
		if (!f.title.trim() || saving) return;
		saving = true; error = '';
		try {
			const res = await fetch('/api/knowledge', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ...f, teams: [...teams] }),
			});
			const b = await res.json();
			if (!res.ok) throw new Error(b.message ?? 'Failed');
			await goto(`/knowledge/${b.id}`);
		} catch (e) { error = e instanceof Error ? e.message : String(e); } finally { saving = false; }
	}
</script>

<svelte:head><title>Add meeting — Knowledge</title></svelte:head>

<div class="page">
	<AppNav active="knowledge" user={data.user} />
	<main>
		<nav class="crumbs"><a href="/knowledge">Knowledge</a><span>›</span><span class="cur">Add meeting</span></nav>
		<h1>Add meeting</h1>
		<p class="sub">Paste a transcript now; a TL;DR / decisions can be added here or generated via Claude later. Tip: for the full flow, drop the transcript into Claude and let it write the structured notes straight into the portal.</p>

		<div class="form">
			<label class="fld"><span>Title *</span><input bind:value={f.title} placeholder="e.g. Sales weekly — week 42" /></label>
			<div class="row2">
				<label class="fld"><span>Date</span><input type="date" bind:value={f.happened_on} /></label>
				<label class="fld"><span>Visibility</span>
					<select bind:value={f.visibility}>
						<option value="participants">Participants + tagged teams</option>
						<option value="all_staff">All staff</option>
					</select>
				</label>
			</div>
			<div class="fld"><span>Teams (grant access)</span>
				<div class="chips">
					{#each data.departments as t}
						<button type="button" class="chip" class:on={teams.has(t)} onclick={() => toggleTeam(t)}>{t}</button>
					{/each}
				</div>
			</div>
			<label class="fld"><span>Participants <small>(emails for internal, names for external — one per line or comma-separated)</small></span><textarea rows="2" bind:value={f.participants} placeholder="glen@spilbraet.dk, External Guest"></textarea></label>
			<label class="fld"><span>Transcript</span><textarea rows="8" bind:value={f.transcript} placeholder="Paste the meeting transcript…"></textarea></label>
			<label class="fld"><span>TL;DR <small>(optional)</small></span><textarea rows="2" bind:value={f.tldr}></textarea></label>
			<div class="row2">
				<label class="fld"><span>Decisions <small>(one per line)</small></span><textarea rows="3" bind:value={f.decisions}></textarea></label>
				<label class="fld"><span>Topics <small>(one per line)</small></span><textarea rows="3" bind:value={f.topics}></textarea></label>
			</div>
			{#if error}<p class="err">{error}</p>{/if}
			<div class="actions">
				<a class="btn" href="/knowledge">Cancel</a>
				<button class="btn primary" onclick={save} disabled={saving || !f.title.trim()}>{saving ? 'Saving…' : 'Save meeting'}</button>
			</div>
		</div>
	</main>
</div>

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 760px; margin: 0 auto; width: 100%; padding: 24px 28px 80px; }
	.crumbs { display: flex; gap: 8px; align-items: center; font-size: 13px; margin-bottom: 12px; }
	.crumbs a { color: #6D5BD0; text-decoration: none; font-weight: 600; }
	.crumbs span:not(.cur) { color: #ccc; } .crumbs .cur { color: #9a9a9a; font-weight: 600; }
	h1 { font-size: 20px; font-weight: 800; margin: 0 0 4px; }
	.sub { font-size: 13px; color: #A1A1AA; margin: 0 0 18px; line-height: 1.5; }
	.form { display: flex; flex-direction: column; gap: 14px; background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 20px; box-shadow: var(--shadow); }
	.fld { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 700; color: #6b5e4e; }
	.fld small { font-weight: 500; color: #a1a1aa; }
	.fld input, .fld select, .fld textarea { font-family: inherit; font-size: 13px; font-weight: 500; color: #18181B; border: 1px solid var(--border); border-radius: 9px; padding: 9px 11px; background: #fff; resize: vertical; }
	.fld input:focus, .fld select:focus, .fld textarea:focus { outline: none; border-color: #F57832; }
	.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
	@media (max-width: 560px) { .row2 { grid-template-columns: 1fr; } }
	.chips { display: flex; flex-wrap: wrap; gap: 8px; }
	.chip { font-family: inherit; font-size: 12.5px; font-weight: 600; padding: 6px 12px; border-radius: 100px; border: 1px solid var(--border); background: #fff; color: #52525B; cursor: pointer; }
	.chip.on { background: #F57832; color: #fff; border-color: #F57832; }
	.err { color: #c23b26; font-size: 13px; margin: 0; }
	.actions { display: flex; justify-content: flex-end; gap: 8px; }
	.btn { display: inline-flex; align-items: center; padding: 9px 16px; border: 1px solid var(--border); border-radius: 9px; background: #fff; font-size: 13px; font-weight: 600; color: #18181B; text-decoration: none; cursor: pointer; font-family: inherit; }
	.btn.primary { background: #F57832; color: #fff; border-color: #F57832; }
	.btn:disabled { opacity: 0.6; }
</style>
