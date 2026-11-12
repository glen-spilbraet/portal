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

	// ── Per-story menu (⋯) and photo picker modal ──────────────────────────
	let menuFor = $state(-1);
	let pickerFor = $state(-1);
	function toggleMenu(i, e) { e.stopPropagation(); menuFor = menuFor === i ? -1 : i; }
	function openPicker(i) { menuFor = -1; pickerFor = i; }
	function choosePhoto(j) { picks[pickerFor] = j; pickerFor = -1; }
	function onKey(e) { if (e.key === 'Escape') { menuFor = -1; pickerFor = -1; } }

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
<svelte:window onclick={() => (menuFor = -1)} onkeydown={onKey} />

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
					<div class="frame" class:menu-open={menuFor === i}>
						{#if stories[i].url}<img src={stories[i].url} alt="Story {i + 1}" class:dim={stories[i].busy} />{/if}
						{#if stories[i].busy}<div class="spin">Rendering…</div>{/if}
						{#if i < 3}
							<button class="dots" aria-label="Story options" onclick={(e) => toggleMenu(i, e)}>
								<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/></svg>
							</button>
							{#if menuFor === i}
								<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
								<div class="menu" onclick={(e) => e.stopPropagation()}>
									<div class="menu-label">Text position</div>
									<div class="seg">
										<button class:on={positions[i] === 'top'} onclick={() => (positions[i] = 'top')}>Top</button>
										<button class:on={positions[i] === 'bottom'} onclick={() => (positions[i] = 'bottom')}>Bottom</button>
									</div>
									{#if data.photos.length > 1}
										<button class="menu-item" onclick={() => openPicker(i)}>
											<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="M21 15l-5-5L5 21"/></svg>
											Choose other photo
										</button>
									{/if}
								</div>
							{/if}
						{/if}
					</div>
					{#if stories[i].error}<p class="err">{stories[i].error}</p>{/if}

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

{#if pickerFor >= 0}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="overlay" onclick={() => (pickerFor = -1)}>
		<div class="modal" role="dialog" tabindex="-1" aria-label="Choose photo" onclick={(e) => e.stopPropagation()}>
			<div class="modal-head">
				<h3>Choose photo for story {pickerFor + 1}</h3>
				<button class="close" aria-label="Close" onclick={() => (pickerFor = -1)}>×</button>
			</div>
			<div class="photo-grid">
				{#each data.photos as p, j}
					<button class="photo" class:sel={picks[pickerFor] === j} onclick={() => choosePhoto(j)}>
						<img src="/api/img/{p.key}?size=400" alt="" loading="lazy" />
						{#if p.type === 'content'}<span class="tag">Content</span>{/if}
						{#if picks[pickerFor] === j}<span class="check">✓</span>{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.page { max-width: 1240px; margin: 0 auto; padding: 28px 24px 60px; }
	.head { margin-bottom: 18px; }
	.crumbs { display: flex; align-items: center; gap: 8px; font-size: 13px; flex-wrap: wrap; }
	.crumbs a { color: #F57832; text-decoration: none; font-weight: 600; }
	.crumbs a:hover { text-decoration: underline; }
	.crumbs .sep { color: #c7c7c7; }
	.crumbs .current { color: #9a9a9a; font-weight: 600; }
	.title-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-top: 8px; }
	h1 { font-size: 24px; margin: 0; letter-spacing: -0.3px; }
	.sku { font-size: 14px; color: #9a9a9a; font-weight: 500; margin-left: 6px; }

	.langs { display: flex; gap: 6px; flex-wrap: wrap; }
	.lang { border: 1px solid #ece6df; background: white; border-radius: 100px; padding: 6px 14px; font: inherit; font-size: 13px; font-weight: 600; color: #555; cursor: pointer; }
	.lang.on { background: #F57832; border-color: #F57832; color: white; }

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

	/* ⋯ menu on bullet stories (shown on hover; always on touch screens) */
	.dots { position: absolute; top: 10px; right: 10px; width: 34px; height: 34px; border-radius: 50%; border: none; background: rgba(255, 255, 255, 0.92); color: #333; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2); opacity: 0; transition: opacity 0.15s; }
	.frame:hover .dots, .frame.menu-open .dots, .dots:focus-visible { opacity: 1; }
	@media (hover: none) { .dots { opacity: 1; } }
	.menu { position: absolute; top: 50px; right: 10px; z-index: 5; background: white; border-radius: 12px; padding: 12px; min-width: 190px; box-shadow: 0 10px 34px rgba(0, 0, 0, 0.22); }
	.menu-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #999; margin-bottom: 6px; }
	.seg { display: flex; border: 1px solid #ece6df; border-radius: 100px; overflow: hidden; }
	.seg button { flex: 1; border: 0; background: white; padding: 6px 14px; font: inherit; font-size: 12.5px; font-weight: 600; color: #555; cursor: pointer; }
	.seg button.on { background: #F57832; color: white; }
	.menu-item { display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 10px; padding: 8px 6px; border: 0; border-top: 1px solid #f1ece6; background: none; font: inherit; font-size: 13px; font-weight: 600; color: #333; cursor: pointer; text-align: left; border-radius: 0; }
	.menu-item:hover { color: #F57832; }

	/* Photo picker modal */
	.overlay { position: fixed; inset: 0; z-index: 100; background: rgba(0, 0, 0, 0.55); display: flex; align-items: center; justify-content: center; padding: 16px; }
	.modal { background: white; border-radius: 16px; width: min(760px, 100%); max-height: 86vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3); }
	.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px 10px; }
	.modal-head h3 { margin: 0; font-size: 15px; }
	.close { border: 0; background: none; font-size: 26px; line-height: 1; color: #888; cursor: pointer; }
	.photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; padding: 6px 18px 18px; overflow-y: auto; }
	.photo { position: relative; aspect-ratio: 1; padding: 0; border: 3px solid transparent; border-radius: 10px; overflow: hidden; cursor: pointer; background: #eee; }
	.photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
	.photo:hover { border-color: #FBD3B8; }
	.photo.sel { border-color: #F57832; }
	.check { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; border-radius: 50%; background: #F57832; color: white; font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
	.tag { position: absolute; left: 0; right: 0; bottom: 0; font-size: 10px; font-weight: 700; color: white; background: rgba(0, 0, 0, 0.55); text-align: center; padding: 2px 0; }

	.actions { display: flex; gap: 8px; margin-top: 12px; }
	.btn { padding: 8px 18px; border: none; border-radius: 100px; cursor: pointer; background: #F57832; color: white; font: inherit; font-size: 13px; font-weight: 600; }
	.btn:hover:not(:disabled) { background: #DD6420; }
	.btn:disabled { opacity: 0.5; cursor: default; }
	.btn.ghost { background: white; color: #F57832; border: 1px solid #FBD3B8; }
	.btn.ghost:hover:not(:disabled) { background: #FFF5D2; }
</style>
