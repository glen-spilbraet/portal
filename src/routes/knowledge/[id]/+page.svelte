<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();
	const i = $derived(data.item);
	let showTranscript = $state(false);
	const canDelete = $derived(data.user?.role === 'admin' || i.created_by === data.user?.email);

	function fmt(d) { return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'; }
	function pName(p) { return p.external_name || p.user_email; }

	async function del() {
		if (!confirm('Delete this knowledge item?')) return;
		const res = await fetch(`/api/knowledge/${i.id}`, { method: 'DELETE' });
		if (res.ok) goto('/knowledge'); else alert('Delete failed');
	}
</script>

<svelte:head><title>{i.title || 'Knowledge'} — Portal</title></svelte:head>

<div class="page">
	<AppNav active="knowledge" user={data.user} />
	<main>
		<nav class="crumbs"><a href="/knowledge">Knowledge</a><span>›</span><span class="cur">{i.title || 'Untitled'}</span></nav>

		<div class="head">
			<div>
				<h1>{i.title || 'Untitled'}</h1>
				<p class="meta">{i.type} · {fmt(i.happened_on)}{#if i.visibility === 'all_staff'} · All staff{/if}</p>
			</div>
			{#if canDelete}<button class="btn danger" onclick={del}>Delete</button>{/if}
		</div>

		<div class="chips">
			{#each i.customer_groups ?? [] as c}<span class="tag customer">{c}</span>{/each}
			{#each i.teams as t}<span class="tag">{t}</span>{/each}
			{#each i.participants as p}<span class="tag person">{pName(p)}</span>{/each}
			{#each i.tags ?? [] as t}<span class="tag label">#{t}</span>{/each}
		</div>

		{#if i.tldr}<section class="block"><h3>Summary</h3><p class="tldr">{i.tldr}</p></section>{/if}

		{#if i.decisions?.length}
			<section class="block"><h3>Decisions</h3><ul>{#each i.decisions as d}<li>{d}</li>{/each}</ul></section>
		{/if}
		{#if i.action_items?.length}
			<section class="block"><h3>Action items</h3><ul>{#each i.action_items as a}<li>{typeof a === 'string' ? a : a.text}{#if a && a.owner} <span class="owner">— {a.owner}</span>{/if}</li>{/each}</ul></section>
		{/if}
		{#if i.topics?.length}
			<section class="block"><h3>Topics</h3><div class="chips">{#each i.topics as t}<span class="tag topic">{t}</span>{/each}</div></section>
		{/if}

		{#if i.transcript}
			<section class="block">
				<button class="toggle" onclick={() => (showTranscript = !showTranscript)}>{showTranscript ? 'Hide' : 'Show'} transcript</button>
				{#if showTranscript}<pre class="transcript">{i.transcript}</pre>{/if}
			</section>
		{/if}
	</main>
</div>

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 820px; margin: 0 auto; width: 100%; padding: 24px 28px 80px; }
	.crumbs { display: flex; gap: 8px; align-items: center; font-size: 13px; margin-bottom: 14px; }
	.crumbs a { color: #6D5BD0; text-decoration: none; font-weight: 600; }
	.crumbs span:not(.cur) { color: #ccc; } .crumbs .cur { color: #9a9a9a; font-weight: 600; }
	.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
	h1 { font-size: 22px; font-weight: 800; color: #18181B; margin: 0 0 3px; }
	.meta { font-size: 13px; color: #8a7f6a; margin: 0; font-weight: 600; }
	.btn { padding: 8px 14px; border: 1px solid var(--border); border-radius: 9px; background: #fff; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
	.btn.danger { color: #c23b26; border-color: #f0c9c2; }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
	.tag { font-size: 11.5px; font-weight: 700; padding: 3px 9px; border-radius: 100px; background: #F4EEDF; color: #8a6a2a; }
	.tag.person { background: #EEF4FF; color: #1D4ED8; }
	.tag.topic { background: #F4F4F5; color: #52525B; }
	.tag.customer { background: #FDEEE4; color: #B15A12; }
	.tag.label { background: #EFEDFB; color: #6D5BD0; }
	.block { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 14px 18px; margin-top: 14px; box-shadow: var(--shadow); }
	.block h3 { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px; color: #8a7550; margin: 0 0 10px; }
	.tldr { font-size: 14px; color: #3a3228; line-height: 1.6; margin: 0; }
	.block ul { margin: 0; padding-left: 20px; }
	.block li { font-size: 14px; color: #3a3228; line-height: 1.6; margin-bottom: 4px; }
	.owner { color: #8a7f6a; font-size: 12.5px; }
	.toggle { background: none; border: none; color: #6D5BD0; font: inherit; font-weight: 700; font-size: 13px; cursor: pointer; padding: 0; }
	.transcript { margin-top: 12px; white-space: pre-wrap; font-family: inherit; font-size: 13px; color: #3a3228; line-height: 1.6; background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 14px; max-height: 500px; overflow: auto; }
</style>
