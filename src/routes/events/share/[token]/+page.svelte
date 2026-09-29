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

	// ── Product material modal ──────────────────────────────────────────────────
	/** @type {any} */
	let modalProduct = $state(null);

	/** Build the downloadable material list for a product. */
	function materialsFor(p) {
		const items = [];
		if (p.images?.box) items.push({ url: p.images.box, label: 'Box photo', filename: `${p.sku}-box`, image: true });
		(p.images?.gallery ?? []).forEach((g, i) => items.push({ url: g, label: `Photo ${i + 1}`, filename: `${p.sku}-photo-${i + 1}`, image: true }));
		(data.badges[p.sku] ?? []).forEach((b) => items.push({ url: `/api/img/${b.image_key}`, label: `${b.kind} badge`, filename: `${p.sku}-${b.kind}-badge`, image: true }));
		return items;
	}
	function materialCount(p) { return materialsFor(p).length; }

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
						<div class="prod-body">
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
						</div>
						{#if materialCount(p) > 0}
							<button class="dl-btn" onclick={() => (modalProduct = p)}>
								⬇ Download material <span class="dl-count">{materialCount(p)}</span>
							</button>
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

{#if modalProduct}
	<div class="modal-overlay" onclick={() => (modalProduct = null)} role="presentation">
		<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Download material">
			<button class="modal-x" onclick={() => (modalProduct = null)} aria-label="Close">✕</button>
			<h3 class="modal-title">{modalProduct.name}</h3>
			<p class="modal-sub">Click any item to download.</p>
			<div class="mat-grid">
				{#each materialsFor(modalProduct) as m}
					<a class="mat" href={m.url} download={m.filename}>
						<div class="mat-thumb">
							{#if m.image}<img src={m.url} alt={m.label} />{:else}<span class="mat-file">📄</span>{/if}
							<span class="mat-dl">⬇</span>
						</div>
						<span class="mat-label">{m.label}</span>
					</a>
				{/each}
			</div>
		</div>
	</div>
{/if}

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') modalProduct = null; }} />

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

	.prod-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 16px; }
	@media (max-width: 720px) { .prod-grid { grid-template-columns: repeat(2, 1fr); } }
	@media (max-width: 480px) { .prod-grid { grid-template-columns: 1fr; } }
	.prod { display: flex; flex-direction: column; background: white; border: 1px solid #E7E7E4; border-radius: 14px; padding: 14px; }
	.prod-body { flex: 1; }
	.thumb { position: relative; aspect-ratio: 1; background: #FAFAFA; border-radius: 10px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
	.thumb img { width: 100%; height: 100%; object-fit: contain; }
	.badges { position: absolute; bottom: 6px; right: 6px; display: flex; gap: 4px; }
	.badges img { width: 38px; height: 38px; object-fit: contain; }
	.prod h3 { font-size: 14px; font-weight: 700; margin: 12px 0 6px; line-height: 1.3; }
	.specs { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; padding: 0; margin: 0 0 8px; }
	.specs li { font-size: 11px; font-weight: 600; color: #52525B; background: #F4F4F5; padding: 2px 8px; border-radius: 100px; }
	.bullets { margin: 0; padding-left: 18px; }
	.bullets li { font-size: 12px; color: #52525B; line-height: 1.5; }

	.dl-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; margin-top: 14px; padding: 10px; border: none; border-radius: 10px; background: #F57832; color: white; font-size: 13px; font-weight: 700; font-family: inherit; cursor: pointer; transition: background 0.15s; }
	.dl-btn:hover { background: #e26a26; }
	.dl-count { background: rgba(255,255,255,0.25); border-radius: 100px; padding: 1px 8px; font-size: 12px; }

	/* Material modal */
	.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
	.modal { position: relative; background: white; border-radius: 16px; padding: 24px; max-width: 640px; width: 100%; max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
	.modal-x { position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border: none; background: #F4F4F5; border-radius: 8px; font-size: 15px; color: #52525B; cursor: pointer; }
	.modal-x:hover { background: #E4E4E7; }
	.modal-title { font-size: 18px; font-weight: 700; margin: 0 0 2px; padding-right: 40px; }
	.modal-sub { color: #71717A; font-size: 13px; margin: 0 0 18px; }
	.mat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; }
	.mat { text-decoration: none; color: #18181B; }
	.mat-thumb { position: relative; aspect-ratio: 1; background: #FAFAFA; border: 1px solid #E7E7E4; border-radius: 10px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
	.mat-thumb img { width: 100%; height: 100%; object-fit: contain; padding: 6px; }
	.mat-file { font-size: 32px; }
	.mat-dl { position: absolute; bottom: 6px; right: 6px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: #F57832; color: white; border-radius: 7px; font-size: 12px; opacity: 0; transition: opacity 0.15s; }
	.mat:hover .mat-dl { opacity: 1; }
	.mat:hover .mat-thumb { border-color: #F57832; }
	.mat-label { display: block; font-size: 12px; font-weight: 600; text-align: center; margin-top: 6px; }

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
