<script>
	import { onMount, untrack } from 'svelte';
	import { renderBulletStory, renderProductStory, assignSlots, formatAttr, loadImage, toBlob } from '$lib/storyRender.js';

	let { data } = $props();

	const LANG_LABELS = { da: 'Dansk', sv: 'Svenska', no: 'Norsk', en: 'English' };
	const TILTS = [-2.5, 2.5, -2.5];

	let lang = $state(data.lang);
	const t = $derived(data.texts[lang]);

	// Default photos: cycle through the people-playing photos (content photos only
	// if there are no people photos at all). The user can pick any photo per story.
	const peopleIdx = data.photos.map((p, i) => (p.type === 'people_playing' ? i : -1)).filter((i) => i >= 0);
	const pool = peopleIdx.length ? peopleIdx : data.photos.map((_, i) => i);
	let picks = $state([0, 1, 2].map((i) => (pool.length ? pool[i % pool.length] : -1)));
	let positions = $state(['bottom', 'bottom', 'bottom']);

	/** One entry per story: { url, blob, busy, error }. Story 1–3 are skipped when the bullet is empty. */
	/** @type {{ url: string, blob: Blob | null, busy: boolean, error: string }[]} */
	let stories = $state([0, 1, 2, 3].map(() => ({ url: '', blob: null, busy: true, error: '' })));
	const included = $derived([0, 1, 2, 3].filter((i) => (i < 3 ? !!t.bullets[i] : true)));

	const fileName = (i) => `${data.sku}_${lang}_story-${i + 1}.jpg`;
	const photoSrc = (p) => `/api/img/${p.key}?size=1600`;

	// ── Rendering ───────────────────────────────────────────────────────────
	let renderSeq = [0, 0, 0, 0];
	async function renderStory(i) {
		const seq = ++renderSeq[i];
		stories[i].busy = true;
		stories[i].error = '';
		try {
			let canvas;
			if (i < 3) {
				const p = data.photos[picks[i]];
				const photo = p ? await loadImage(photoSrc(p)) : null;
				canvas = await renderBulletStory({
					photo,
					cropX: p?.cropX ?? 50,
					cropY: p?.cropY ?? 50,
					text: t.bullets[i],
					position: positions[i],
					tilt: TILTS[i],
				});
			} else {
				const box = data.boxImageKey ? await loadImage(`/api/img/${data.boxImageKey}?size=1600`) : null;
				const placed = assignSlots(data.badges);
				const badges = await Promise.all(
					placed.map(async (s) => ({ ...s, img: await loadImage(`/api/img/${s.b.image_key}?size=1000`) }))
				);
				canvas = await renderProductStory({
					box,
					badges,
					name: t.name,
					description: t.description,
					attrs: {
						age: formatAttr('age', data.attrs.age),
						time: formatAttr('time', data.attrs.time),
						players: formatAttr('players', data.attrs.players),
					},
					lang,
				});
			}
			const blob = await toBlob(canvas);
			if (seq !== renderSeq[i]) return; // a newer render superseded this one
			if (stories[i].url) URL.revokeObjectURL(stories[i].url);
			stories[i] = { url: URL.createObjectURL(blob), blob, busy: false, error: '' };
		} catch (e) {
			if (seq !== renderSeq[i]) return;
			stories[i].busy = false;
			stories[i].error = 'Could not render this story (an image failed to load).';
			console.error(e);
		}
	}

	// Re-render a story when its inputs change.
	// (renderStory writes to `stories`, so it runs untracked to avoid a loop.)
	for (const i of [0, 1, 2]) {
		$effect(() => { void lang; void picks[i]; void positions[i]; if (t.bullets[i]) untrack(() => renderStory(i)); });
	}
	$effect(() => { void lang; untrack(() => renderStory(3)); });

	// ── Saving ──────────────────────────────────────────────────────────────
	// Mobile = touch device whose browser can share files → share sheet (Instagram,
	// Save to Photos, …). Everything else downloads.
	let canShareFiles = $state(false);
	onMount(() => {
		try {
			const probe = new File([new Blob(['x'], { type: 'image/jpeg' })], 'x.jpg', { type: 'image/jpeg' });
			const touch = window.matchMedia('(pointer: coarse)').matches;
			canShareFiles = touch && !!navigator.canShare?.({ files: [probe] });
		} catch { canShareFiles = false; }
	});

	const toFile = (i) => new File([/** @type {Blob} */ (stories[i].blob)], fileName(i), { type: 'image/jpeg' });
	const allReady = $derived(included.every((i) => stories[i].blob && !stories[i].busy));

	let msg = $state('');
	function flash(m) { msg = m; setTimeout(() => { if (msg === m) msg = ''; }, 2500); }

	// share() must run inside the tap's user activation, so the blobs are rendered
	// in advance and nothing is awaited before navigator.share().
	function shareOne(i) {
		if (!stories[i].blob) return;
		navigator.share({ files: [toFile(i)] }).catch((e) => { if (e?.name !== 'AbortError') downloadOne(i); });
	}
	function shareAll() {
		if (!allReady) return;
		const files = included.map(toFile);
		if (!navigator.canShare?.({ files })) { flash('This phone can only share one story at a time.'); return; }
		navigator.share({ files }).catch((e) => { if (e?.name !== 'AbortError') flash('Sharing failed — try one story at a time.'); });
	}

	function saveBlob(blob, name) {
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = name;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	}
	function downloadOne(i) {
		if (stories[i].blob) saveBlob(stories[i].blob, fileName(i));
	}

	let zipping = $state(false);
	async function downloadZip() {
		if (!allReady) return;
		zipping = true;
		try {
			const { default: JSZip } = await import('jszip');
			const zip = new JSZip();
			for (const i of included) zip.file(fileName(i), /** @type {Blob} */ (stories[i].blob));
			const blob = await zip.generateAsync({ type: 'blob' });
			saveBlob(blob, `${data.sku}_${lang}_stories.zip`);
		} finally {
			zipping = false;
		}
	}
</script>

<svelte:head><title>SoMe Stories — {data.sku}</title></svelte:head>

<div class="page">
	<header class="head">
		<nav class="crumbs">
			<a href="/sheets">Sheets</a>
			<span class="sep">›</span>
			<a href="/sheet/{data.sheetId}?lang={lang}">{t.name}</a>
			<span class="sep">›</span>
			<span class="current">SoMe stories</span>
		</nav>
		<div class="title-row">
			<h1>{t.name} <span class="sku">{data.sku}</span></h1>
			<div class="langs">
				{#each data.languages as l}
					<button class="lang" class:on={lang === l} onclick={() => (lang = l)}>{LANG_LABELS[l] ?? l}</button>
				{/each}
			</div>
		</div>
	</header>

	<div class="savebar">
		{#if canShareFiles}
			<button class="btn" disabled={!allReady} onclick={shareAll}>Share all {included.length}</button>
			<span class="hint">Pick <strong>Instagram</strong> in the share sheet — or <strong>Save images</strong> to put them in Photos.</span>
		{:else}
			<button class="btn" disabled={!allReady || zipping} onclick={downloadZip}>
				{zipping ? 'Zipping…' : `Download all ${included.length} (ZIP)`}
			</button>
			<span class="hint">1080×1920 JPG, ready for Instagram &amp; Facebook stories.</span>
		{/if}
		{#if msg}<span class="msg">{msg}</span>{/if}
	</div>

	{#if !data.photos.length}
		<p class="warn">This sheet has no people-playing photos yet — stories 1–3 use a plain orange background until you add some in the sheet editor.</p>
	{/if}
	{#if !data.boxImageKey}
		<p class="warn">No box photo on this sheet — story 4 will be without a box.</p>
	{/if}

	<div class="grid">
		{#each [0, 1, 2, 3] as i}
			{#if included.includes(i)}
				<section class="story">
					<h2>Story {i + 1} <span>{i < 3 ? `Bullet ${i + 1}` : 'Product'}</span></h2>
					<div class="frame">
						{#if stories[i].url}<img src={stories[i].url} alt="Story {i + 1}" class:dim={stories[i].busy} />{/if}
						{#if stories[i].busy}<div class="spin">Rendering…</div>{/if}
					</div>
					{#if stories[i].error}<p class="err">{stories[i].error}</p>{/if}

					{#if i < 3}
						<div class="seg">
							<button class:on={positions[i] === 'top'} onclick={() => (positions[i] = 'top')}>Text top</button>
							<button class:on={positions[i] === 'bottom'} onclick={() => (positions[i] = 'bottom')}>Text bottom</button>
						</div>
						{#if data.photos.length > 1}
							<div class="thumbs">
								{#each data.photos as p, j}
									<button class="thumb" class:sel={picks[i] === j} onclick={() => (picks[i] = j)} title={p.type === 'content' ? 'Content photo' : 'People playing'}>
										<img src="/api/img/{p.key}?size=300" alt="" loading="lazy" />
										{#if p.type === 'content'}<span class="tag">Content</span>{/if}
									</button>
								{/each}
							</div>
						{/if}
					{/if}

					<div class="actions">
						{#if canShareFiles}
							<button class="btn" disabled={!stories[i].blob || stories[i].busy} onclick={() => shareOne(i)}>Share</button>
							<button class="btn ghost" disabled={!stories[i].blob || stories[i].busy} onclick={() => downloadOne(i)}>Save</button>
						{:else}
							<button class="btn ghost" disabled={!stories[i].blob || stories[i].busy} onclick={() => downloadOne(i)}>Download</button>
						{/if}
					</div>
				</section>
			{/if}
		{/each}
	</div>

	{#if included.length < 4}
		<p class="hint">Stories for empty bullets are left out.</p>
	{/if}
</div>

<style>
	.page { max-width: 1240px; margin: 0 auto; padding: 28px 24px 60px; }
	.head { margin-bottom: 18px; }
	.crumbs { display: flex; align-items: center; gap: 8px; font-size: 13px; flex-wrap: wrap; }
	.crumbs a { color: #6D5BD0; text-decoration: none; font-weight: 600; }
	.crumbs a:hover { text-decoration: underline; }
	.crumbs .sep { color: #c7c7c7; }
	.crumbs .current { color: #9a9a9a; font-weight: 600; }
	.title-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-top: 8px; }
	h1 { font-size: 24px; margin: 0; letter-spacing: -0.3px; }
	.sku { font-size: 14px; color: #9a9a9a; font-weight: 500; margin-left: 6px; }

	.langs { display: flex; gap: 6px; flex-wrap: wrap; }
	.lang { border: 1px solid #e2e0ea; background: white; border-radius: 100px; padding: 6px 14px; font: inherit; font-size: 13px; font-weight: 600; color: #555; cursor: pointer; }
	.lang.on { background: #6D5BD0; border-color: #6D5BD0; color: white; }

	.savebar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; background: white; border: 1px solid #ececec; border-radius: 14px; padding: 12px 16px; margin-bottom: 18px; }
	.hint { font-size: 12.5px; color: #888; }
	.msg { font-size: 12.5px; color: #c27803; font-weight: 600; }
	.warn { font-size: 13px; color: #8a5a00; background: #FDF0E0; border-radius: 10px; padding: 10px 14px; margin: 0 0 14px; }
	.err { font-size: 12.5px; color: #c0392b; margin: 6px 0 0; }

	.grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; align-items: start; }
	@media (max-width: 1000px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	@media (max-width: 520px) { .grid { grid-template-columns: 1fr; } .page { padding: 20px 16px 48px; } }

	.story h2 { font-size: 13px; margin: 0 0 8px; color: #333; }
	.story h2 span { color: #9a9a9a; font-weight: 600; margin-left: 4px; }
	.frame { position: relative; aspect-ratio: 9 / 16; border-radius: 14px; overflow: hidden; background: #eee; box-shadow: 0 6px 22px rgba(0, 0, 0, 0.14); }
	.frame img { width: 100%; height: 100%; display: block; transition: opacity 0.15s; }
	.frame img.dim { opacity: 0.4; }
	.spin { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; color: #666; }

	.seg { display: flex; margin-top: 10px; border: 1px solid #e2e0ea; border-radius: 100px; overflow: hidden; width: max-content; }
	.seg button { border: 0; background: white; padding: 6px 14px; font: inherit; font-size: 12.5px; font-weight: 600; color: #555; cursor: pointer; }
	.seg button.on { background: #6D5BD0; color: white; }

	.thumbs { display: flex; gap: 6px; overflow-x: auto; margin-top: 10px; padding-bottom: 4px; }
	.thumb { position: relative; flex: 0 0 56px; height: 56px; padding: 0; border: 2px solid transparent; border-radius: 8px; overflow: hidden; cursor: pointer; background: none; opacity: 0.6; }
	.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
	.thumb.sel { border-color: #F57832; opacity: 1; }
	.thumb:hover { opacity: 1; }
	.tag { position: absolute; left: 0; right: 0; bottom: 0; font-size: 9px; font-weight: 700; color: white; background: rgba(0, 0, 0, 0.55); text-align: center; }

	.actions { display: flex; gap: 8px; margin-top: 12px; }
	.btn { padding: 8px 18px; border: none; border-radius: 100px; cursor: pointer; background: #6D5BD0; color: white; font: inherit; font-size: 13px; font-weight: 600; }
	.btn:hover:not(:disabled) { background: #5B49BE; }
	.btn:disabled { opacity: 0.5; cursor: default; }
	.btn.ghost { background: white; color: #6D5BD0; border: 1px solid #ddd9f0; }
	.btn.ghost:hover:not(:disabled) { background: #f6f4fd; }
</style>
