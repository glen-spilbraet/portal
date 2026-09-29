<script>
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';

	let { data } = $props();

	let uploading = $state(false);
	let uploadMsg = $state('');

	async function upload(e) {
		const files = Array.from(e.currentTarget.files ?? []);
		if (!files.length) return;
		uploading = true; uploadMsg = '';
		let ok = 0;
		try {
			for (const file of files) {
				const fd = new FormData();
				fd.append('file', file);
				const res = await fetch(`/api/events/share/${$page.params.token}/upload`, { method: 'POST', body: fd });
				if (res.ok) ok++;
			}
			uploadMsg = `Thanks! ${ok} file${ok === 1 ? '' : 's'} uploaded.`;
			await invalidateAll();
		} catch { uploadMsg = 'Something went wrong — please try again.'; }
		finally { uploading = false; e.target.value = ''; }
	}

	function fmtDate(d) {
		if (!d) return '';
		try { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
		catch { return d; }
	}
	const ev = data.event;
	const when = $derived([fmtDate(ev.event_date), [ev.start_time, ev.end_time].filter(Boolean).join('–')].filter(Boolean).join(' · '));
</script>

<svelte:head><title>{ev.title || 'Event'} — Spilbræt</title></svelte:head>

<div class="wrap">
	<header class="hero">
		<h1>{ev.title || 'Event'}</h1>
		<p class="sub">
			{#if ev.venue_name}<strong>{ev.venue_name}</strong>{/if}
			{#if ev.venue_address}<span class="muted"> · {ev.venue_address}</span>{/if}
		</p>
		{#if when}<p class="when">{when}</p>{/if}
	</header>

	{#if data.products.length > 0}
		<section>
			<h2>Products at this event</h2>
			<div class="prod-grid">
				{#each data.products as p (p.sku)}
					<article class="prod">
						<div class="thumb">
							{#if p.images?.box}<img src={p.images.box} alt={p.name} />{/if}
							{#if data.badges[p.sku]?.length}
								<div class="badges">
									{#each data.badges[p.sku] as b}<img src="/api/img/{b.image_key}" alt={b.kind} title={b.kind} />{/each}
								</div>
							{/if}
						</div>
						<h3>{p.name}</h3>
						{#if p.attributes}
							<ul class="specs">
								{#if p.attributes.age}<li>Age {p.attributes.age}</li>{/if}
								{#if p.attributes.players}<li>{p.attributes.players} players</li>{/if}
								{#if p.attributes.play_time}<li>{p.attributes.play_time}</li>{/if}
							</ul>
						{/if}
						{#if p.bullets?.length}
							<ul class="bullets">{#each p.bullets.slice(0, 4) as b}<li>{b}</li>{/each}</ul>
						{/if}
					</article>
				{/each}
			</div>
		</section>
	{/if}

	{#if data.marketing.length > 0}
		<section>
			<h2>Marketing material</h2>
			<p class="section-sub">Download and use these assets to promote the event.</p>
			<div class="dl-grid">
				{#each data.marketing as a (a.id)}
					<a class="dl" href="/api/img/{a.r2_key}" target="_blank" rel="noopener" download>
						{#if a.kind === 'image'}<img src="/api/img/{a.r2_key}" alt={a.filename} />{:else}<div class="dl-file">📄</div>{/if}
						<span class="dl-name">{a.filename ?? 'Download'}</span>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<section>
		<h2>Share your photos & video</h2>
		<p class="section-sub">Took pictures at the event? Upload them here — they go straight to us.</p>
		<label class="upload-box">
			<input type="file" hidden multiple accept="image/*,video/*" onchange={upload} disabled={uploading} />
			<span>{uploading ? 'Uploading…' : '＋ Choose files to upload'}</span>
		</label>
		{#if uploadMsg}<p class="upload-msg">{uploadMsg}</p>{/if}

		{#if data.media.length > 0}
			<div class="media-grid">
				{#each data.media as a (a.id)}
					<div class="media">
						{#if a.kind === 'image'}<img src="/api/img/{a.r2_key}" alt={a.filename} />
						{:else if a.kind === 'video'}<video src="/api/img/{a.r2_key}" controls><track kind="captions" /></video>
						{:else}<a class="dl-file" href="/api/img/{a.r2_key}">📄</a>{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<footer>Spilbræt · Event material</footer>
</div>

<style>
	:global(body) { background: #F7F7F5; }
	.wrap { max-width: 900px; margin: 0 auto; padding: 32px 20px 80px; font-family: system-ui, -apple-system, sans-serif; color: #18181B; }
	.hero { text-align: center; padding: 24px 0 12px; }
	.hero h1 { font-size: 28px; font-weight: 800; margin: 0 0 8px; letter-spacing: -0.5px; }
	.sub { margin: 0; font-size: 15px; }
	.muted { color: #A1A1AA; }
	.when { margin: 6px 0 0; color: #52525B; font-size: 14px; }

	section { margin-top: 36px; }
	h2 { font-size: 18px; font-weight: 700; margin: 0 0 4px; }
	.section-sub { color: #71717A; font-size: 14px; margin: 0 0 16px; }

	.prod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-top: 16px; }
	.prod { background: white; border: 1px solid #E7E7E4; border-radius: 14px; padding: 14px; }
	.thumb { position: relative; aspect-ratio: 1; background: #FAFAFA; border-radius: 10px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
	.thumb img { width: 100%; height: 100%; object-fit: contain; }
	.badges { position: absolute; bottom: 6px; right: 6px; display: flex; gap: 4px; }
	.badges img { width: 38px; height: 38px; object-fit: contain; }
	.prod h3 { font-size: 14px; font-weight: 700; margin: 12px 0 6px; line-height: 1.3; }
	.specs { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; padding: 0; margin: 0 0 8px; }
	.specs li { font-size: 11px; font-weight: 600; color: #52525B; background: #F4F4F5; padding: 2px 8px; border-radius: 100px; }
	.bullets { margin: 0; padding-left: 18px; }
	.bullets li { font-size: 12px; color: #52525B; line-height: 1.5; }

	.dl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
	.dl { display: block; background: white; border: 1px solid #E7E7E4; border-radius: 12px; padding: 10px; text-decoration: none; color: #18181B; }
	.dl img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; }
	.dl-file { display: flex; align-items: center; justify-content: center; aspect-ratio: 1; background: #FAFAFA; border-radius: 8px; font-size: 32px; text-decoration: none; }
	.dl-name { display: block; font-size: 12px; margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.upload-box { display: flex; align-items: center; justify-content: center; border: 2px dashed #D4D4D8; border-radius: 14px; padding: 32px; cursor: pointer; background: white; font-weight: 600; color: #52525B; transition: border-color 0.15s, background 0.15s; }
	.upload-box:hover { border-color: #F57832; background: #FFF7F2; color: #F57832; }
	.upload-msg { color: #16a34a; font-weight: 600; font-size: 14px; margin: 12px 0 0; }

	.media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin-top: 16px; }
	.media img, .media video { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 10px; background: #FAFAFA; }

	footer { text-align: center; color: #A1A1AA; font-size: 12px; margin-top: 48px; }
</style>
