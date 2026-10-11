<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();
	let q = $state('');
	let team = $state('');
	let tag = $state('');
	let group = $state('');

	const splitList = (s) => (s ?? '').split(', ').map((x) => x.trim()).filter(Boolean);
	const tagOpts = $derived([...new Set(data.items.flatMap((i) => splitList(i.tags)))].sort((a, b) => a.localeCompare(b)));
	const groupOpts = $derived([...new Set(data.items.flatMap((i) => splitList(i.customer_groups)))].sort((a, b) => a.localeCompare(b)));

	const filtered = $derived(data.items.filter((i) => {
		if (team && !splitList(i.teams).includes(team)) return false;
		if (tag && !splitList(i.tags).includes(tag)) return false;
		if (group && !splitList(i.customer_groups).includes(group)) return false;
		const s = q.trim().toLowerCase();
		if (!s) return true;
		return `${i.title ?? ''} ${i.tldr ?? ''} ${i.teams ?? ''} ${i.tags ?? ''} ${i.customer_groups ?? ''}`.toLowerCase().includes(s);
	}));

	function fmt(d) { return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; }
</script>

<svelte:head><title>Knowledge — Product Portal</title></svelte:head>

<div class="page">
	<AppNav active="knowledge" user={data.user} />
	<main>
		<div class="head">
			<div>
				<h1>Knowledge</h1>
				<p class="sub">Meetings, decisions and notes — searchable here and by Claude via the MCP.</p>
			</div>
			<div class="head-actions">
				{#if data.user?.role === 'admin'}<a class="btn" href="/admin/knowledge">Admin overview</a>{/if}
				<a class="btn primary" href="/knowledge/new">+ Add meeting</a>
			</div>
		</div>

		<div class="filters">
			<input class="search" type="search" bind:value={q} placeholder="Search meetings, decisions…" />
			<select class="sel" bind:value={team}>
				<option value="">All teams</option>
				{#each data.departments as d}<option value={d}>{d}</option>{/each}
			</select>
			{#if groupOpts.length}
				<select class="sel" bind:value={group}>
					<option value="">All customers</option>
					{#each groupOpts as g}<option value={g}>{g}</option>{/each}
				</select>
			{/if}
			{#if tagOpts.length}
				<select class="sel" bind:value={tag}>
					<option value="">All tags</option>
					{#each tagOpts as t}<option value={t}>{t}</option>{/each}
				</select>
			{/if}
		</div>

		{#if filtered.length === 0}
			<p class="empty">No knowledge items{data.items.length ? ' match the filters' : ' yet'}.</p>
		{:else}
			<div class="list">
				{#each filtered as i (i.id)}
					<button class="card" onclick={() => goto(`/knowledge/${i.id}`)}>
						<div class="card-top">
							<span class="card-title">{i.title || 'Untitled'}</span>
							<span class="card-date">{fmt(i.happened_on)}</span>
						</div>
						{#if i.tldr}<p class="card-tldr">{i.tldr}</p>{/if}
						<div class="card-meta">
							<span class="type">{i.type}</span>
							{#if i.customer_groups}{#each i.customer_groups.split(', ') as c}<span class="tag customer">{c}</span>{/each}{/if}
							{#if i.teams}{#each i.teams.split(', ') as t}<span class="tag">{t}</span>{/each}{/if}
							{#if i.tags}{#each i.tags.split(', ') as t}<span class="tag label">#{t}</span>{/each}{/if}
							{#if i.visibility === 'all_staff'}<span class="tag all">All staff</span>{/if}
							<span class="pcount">{i.participants} participant{i.participants === 1 ? '' : 's'}</span>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</main>
</div>

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	main { flex: 1; max-width: 920px; margin: 0 auto; width: 100%; padding: 32px 28px 80px; }
	.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
	h1 { font-size: 20px; font-weight: 800; color: #18181B; margin: 0 0 3px; }
	.sub { font-size: 13px; color: #A1A1AA; margin: 0; max-width: 560px; }
	.head-actions { display: flex; gap: 8px; }
	.btn { display: inline-flex; align-items: center; padding: 8px 14px; border: 1px solid var(--border); border-radius: 10px; background: #fff; font-size: 13px; font-weight: 600; color: #18181B; text-decoration: none; }
	.btn.primary { background: #F57832; color: #fff; border-color: #F57832; }

	.filters { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
	.search { flex: 1; min-width: 200px; font-family: inherit; font-size: 13px; border: 1px solid var(--border); border-radius: 9px; padding: 8px 12px; background: #fff; }
	.sel { font-family: inherit; font-size: 13px; border: 1px solid var(--border); border-radius: 9px; padding: 8px 10px; background: #fff; }
	.empty { color: #A1A1AA; font-size: 14px; padding: 30px 0; }

	.list { display: flex; flex-direction: column; gap: 10px; }
	.card { text-align: left; background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; cursor: pointer; font-family: inherit; box-shadow: var(--shadow); transition: box-shadow 0.15s, transform 0.1s; }
	.card:hover { box-shadow: var(--shadow-lg); transform: translateY(-1px); }
	.card-top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
	.card-title { font-size: 15px; font-weight: 700; color: #18181B; }
	.card-date { font-size: 12px; color: #A1A1AA; white-space: nowrap; }
	.card-tldr { font-size: 13px; color: #52525B; margin: 6px 0 0; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
	.card-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
	.type { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #8a7550; }
	.tag { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 100px; background: #F4EEDF; color: #8a6a2a; }
	.tag.all { background: #E7F6EC; color: #16794C; }
	.tag.customer { background: #FDEEE4; color: #B15A12; }
	.tag.label { background: #EFEDFB; color: #6D5BD0; }
	.pcount { font-size: 11px; color: #A1A1AA; margin-left: auto; }
</style>
