<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import BrandPageEditor from '$lib/components/BrandPageEditor.svelte';
	import { invalidateAll } from '$app/navigation';

	let { data } = $props();

	/** Series whose editor is open. @type {string | null} */
	let open = $state(null);
	const LANGS = ['da', 'sv', 'no', 'en', 'pl'];
</script>

<svelte:head><title>Shop page — {data.name}</title></svelte:head>

<AppNav active="publishers" user={data.user} />

<main class="page">
	<div class="nav-links">
		<a class="back" href="/admin/publishers">← Publishers</a>
		<a class="back" href="/admin/publishers/{encodeURIComponent(data.name)}">Map SKUs</a>
		<a class="back" href="/admin/publishers/{encodeURIComponent(data.name)}/series">Series</a>
	</div>
	<h1 class="page-title">Shop page — <span class="pub">{data.name}</span></h1>
	<p class="page-sub">Subheader, text and a 4:3 image (often the logo) for the webshop's landing pages. The shop builds a page for the publisher and for each of its series.</p>

	<h2 class="sec">Publisher</h2>
	<div class="card pad">
		<BrandPageEditor kind="publisher" ref={data.name} initial={data.page} />
	</div>

	<h2 class="sec">Series <span class="sec-hint">({data.series.length})</span></h2>
	{#if data.series.length}
		<div class="card">
			{#each data.series as s (s.id)}
				{@const st = data.status[s.id]}
				<div class="row" class:open={open === s.id}>
					<button type="button" class="row-head" onclick={() => (open = open === s.id ? null : s.id)} aria-expanded={open === s.id}>
						<span class="chev">{open === s.id ? '▾' : '▸'}</span>
						<span class="s-name">{s.name}</span>
						<span class="s-count">{s.mapped_count} product{s.mapped_count === 1 ? '' : 's'}</span>
						<span class="status">
							<span class="pill" class:ok={st?.image}>{st?.image ? 'Image' : 'No image'}</span>
							{#each LANGS as l (l)}<span class="lang" class:ok={st?.langs.includes(l)}>{l.toUpperCase()}</span>{/each}
						</span>
					</button>
					{#if open === s.id}
						<div class="row-body">
							<BrandPageEditor kind="series" ref={s.id} onsaved={() => invalidateAll()} />
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		<p class="empty">No series under {data.name}. <a href="/admin/publishers/{encodeURIComponent(data.name)}/series">Add series</a></p>
	{/if}
</main>

<style>
	.page { max-width: 900px; margin: 0 auto; padding: 32px 28px 80px; }
	@media (max-width: 640px) { .page { padding: 24px 16px 60px; } }
	.nav-links { display: flex; gap: 16px; flex-wrap: wrap; }
	.back { font-size: 13px; font-weight: 600; color: #71717A; text-decoration: none; }
	.back:hover { color: #18181B; }
	.page-title { font-size: 24px; font-weight: 800; color: #18181B; letter-spacing: -0.5px; margin: 10px 0 4px; }
	.pub { color: #7B3803; }
	.page-sub { font-size: 14px; color: #A89060; font-weight: 500; margin: 0 0 20px; }
	.sec { font-size: 15px; font-weight: 800; color: #18181B; margin: 26px 0 10px; }
	.sec-hint { font-size: 12px; font-weight: 500; color: #A1A1AA; }
	.empty { color: #A1A1AA; padding: 12px 0; }
	.empty a { color: #F57832; }

	.card { background: #fff; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
	.card.pad { padding: 18px; }
	.row { border-bottom: 1px solid #F5EDD8; }
	.row:last-child { border-bottom: none; }
	.row.open { background: #FFFDF8; }
	.row-head { width: 100%; display: flex; align-items: center; gap: 10px; padding: 11px 14px; background: none; border: none; cursor: pointer; font: inherit; text-align: left; flex-wrap: wrap; }
	.row-head:hover { background: #FFF8EC; }
	.chev { color: #A1A1AA; width: 12px; }
	.s-name { font-weight: 700; color: #18181B; }
	.s-count { font-size: 12px; color: #A1A1AA; margin-right: auto; }
	.status { display: inline-flex; gap: 4px; align-items: center; }
	.pill { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 100px; background: #F4F4F5; color: #A1A1AA; }
	.pill.ok { background: #E9F7EC; color: #16a34a; }
	.lang { font-size: 10px; font-weight: 700; padding: 2px 5px; border-radius: 5px; background: #F4F4F5; color: #C4C4CC; }
	.lang.ok { background: #E9F7EC; color: #16a34a; }
	.row-body { padding: 4px 18px 18px 36px; }
	@media (max-width: 640px) { .row-body { padding: 4px 14px 14px; } }
</style>
