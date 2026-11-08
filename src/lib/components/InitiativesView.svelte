<script>
	/**
	 * Publisher-facing "Initiatives" for a shared report: awards, press and
	 * events featuring the report's products, as cards. Data from
	 * /reports/share/[token]/initiatives (loaded lazily by the page).
	 */
	let { data } = $props();

	let filter = $state('all');
	const FILTERS = $derived([
		{ key: 'all', label: 'All', n: data.awards.length + data.press.length + data.events.length },
		{ key: 'awards', label: 'Awards', n: data.awards.length },
		{ key: 'press', label: 'Press', n: data.press.length },
		{ key: 'events', label: 'Events', n: data.events.length },
	].filter((f) => f.key === 'all' || f.n > 0));

	const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const dParts = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return { y, m: MON[m - 1], d }; };
	const fDate = (s) => { const p = dParts(s); return p ? `${p.d} ${p.m} ${p.y}` : ''; };
	const nf = new Intl.NumberFormat('en-GB');
	const prod = (sku) => data.products[sku] ?? { sku: sku.toUpperCase(), name: sku.toUpperCase(), image: null };
	const scoreText = (q, scale) => (q.score == null ? null : scale ? `${nf.format(q.score)}/${scale}` : nf.format(q.score));
	// One timeline, newest first, all kinds mixed; each card carries a type badge.
	const items = $derived([
		...data.awards.map((x) => ({ kind: 'awards', x })),
		...data.press.map((x) => ({ kind: 'press', x })),
		...data.events.map((x) => ({ kind: 'events', x })),
	].sort((a, b) => String(b.x.date ?? '').localeCompare(String(a.x.date ?? ''))));
	const boxOf = (skus) => skus.map((s) => prod(s).image).find(Boolean) ?? null;
	const shown = $derived(filter === 'all' ? items : items.filter((i) => i.kind === filter));
	const typeBadge = (i) =>
		i.kind === 'awards' ? (i.x.status === 'winner' ? { label: 'Award winner', cls: 'win' } : { label: 'Nominee', cls: 'nom' })
		: i.kind === 'press' ? { label: 'Press', cls: 'press' }
		: i.x.upcoming ? { label: 'Upcoming event', cls: 'up' } : { label: 'Event', cls: 'event' };
	const empty = $derived(!data.awards.length && !data.press.length && !data.events.length);
</script>

{#snippet products(skus)}
	<ul class="prods">
		{#each skus as s (s)}
			{@const p = prod(s)}
			<li>
				{#if p.image}<img src="{p.image}?size=300" alt="" loading="lazy" />{:else}<span class="ph"></span>{/if}
				<span class="pn" title={p.name}>{p.name}</span>
			</li>
		{/each}
	</ul>
{/snippet}

{#snippet quote(q, scale)}
	{#if q.text || q.score != null}
		<blockquote>
			{#if q.text}<p title={q.text}>“{q.text}”</p>{/if}
			{#if scoreText(q, scale)}<span class="score">{scoreText(q, scale)}</span>{/if}
		</blockquote>
	{/if}
{/snippet}

{#if empty}
	<div class="none">
		<p class="none-t">No initiatives yet</p>
		<p class="none-s">Awards, press and events featuring these products will appear here.</p>
	</div>
{:else}
	<div class="kpis">
		<div class="kpi"><span class="kv">{data.summary.awards}</span><span class="kl">Awards</span>
			{#if data.summary.wins || data.summary.nominations}<span class="ks">{data.summary.wins} won · {data.summary.nominations} nominated</span>{/if}</div>
		<div class="kpi"><span class="kv">{data.summary.press}</span><span class="kl">Press</span></div>
		<div class="kpi"><span class="kv">{data.summary.events}</span><span class="kl">Events</span>
			{#if data.summary.participants}<span class="ks">{nf.format(data.summary.participants)} participants</span>{/if}</div>
		<div class="kpi"><span class="kv">{data.summary.products}</span><span class="kl">Products featured</span></div>
	</div>

	{#if FILTERS.length > 2}
		<div class="chips" role="tablist" aria-label="Filter initiatives">
			{#each FILTERS as f (f.key)}
				<button type="button" role="tab" class:on={filter === f.key} aria-selected={filter === f.key} onclick={() => (filter = f.key)}>{f.label}<span>{f.n}</span></button>
			{/each}
		</div>
	{/if}

	<div class="grid">
		{#each shown as i (i.kind + i.x.id)}
			{@const tb = typeBadge(i)}
			{#if i.kind === 'awards'}
				{@const a = i.x}
				{@const box = boxOf(a.skus)}
				{@const meta = [a.category ? a.media : null, a.country, fDate(a.date)].filter(Boolean).join(' · ')}
				<article class="card award" class:win={a.status === 'winner'}>
					<div class="sq">
						{#if box}
							<div class="box"><img class="box-img" src="{box}?size=1000" alt="" loading="lazy" />
								{#if a.badge}<img class="ov-badge" src="{a.badge}?size=400" style={a.badgeStyle} alt="{a.media} {tb.label}" loading="lazy" />{/if}
							</div>
						{:else if a.badge}
							<img class="solo-badge" src="{a.badge}?size=400" alt="{a.media} {tb.label}" loading="lazy" />
						{:else}
							<span class="trophy" aria-hidden="true">
								<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>
							</span>
						{/if}
						<span class="pill {tb.cls}">{tb.label}</span>
					</div>
					<div class="c-body">
						<h3 title={a.category ?? a.media}>{a.category ?? a.media}</h3>
						<p class="meta" title={meta}>{meta}</p>
						{#each a.quotes as q}{@render quote(q, null)}{/each}
						{@render products(a.skus)}
						{#if a.link}<a class="more" href={a.link} target="_blank" rel="noopener">View announcement ↗</a>{/if}
					</div>
				</article>
			{:else if i.kind === 'press'}
				{@const p = i.x}
				{@const top = p.quotes.find((q) => q.score != null)}
				{@const box = boxOf(p.skus)}
				{@const meta = [p.country, fDate(p.date)].filter(Boolean).join(' · ')}
				<article class="card press">
					<div class="sq">
						{#if box}<div class="box"><img class="box-img" src="{box}?size=1000" alt="" loading="lazy" /></div>
						{:else}<span class="trophy press-ico" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h13v14H6a2 2 0 0 1-2-2V5z"/><path d="M17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5"/></svg></span>{/if}
						<span class="pill {tb.cls}">{tb.label}</span>
						{#if top && scoreText(top, p.scale)}<span class="ring" title="Review score">{scoreText(top, p.scale)}</span>{/if}
					</div>
					<div class="c-body">
						<h3 title={p.media}>{p.media}</h3>
						<p class="meta" title={meta}>{meta}</p>
						{#each p.quotes as q}{#if q.text}<blockquote><p title={q.text}>“{q.text}”</p></blockquote>{/if}{/each}
						{@render products(p.skus)}
						{#if p.link}<a class="more" href={p.link} target="_blank" rel="noopener">Read the article ↗</a>{/if}
					</div>
				</article>
			{:else}
				{@const e = i.x}
				{@const d = dParts(e.date)}
				{@const meta = [e.country, e.type].filter(Boolean).join(' · ')}
				<article class="card event">
					<div class="sq e-media" class:noimg={!e.images.length}>
						{#if e.images.length}<img class="cover" src="{e.images[0]}?size=1000" alt="" loading="lazy" />{/if}
						<span class="pill {tb.cls}">{tb.label}</span>
						{#if d}<div class="cal"><span class="cm">{d.m}</span><span class="cd">{d.d}</span><span class="cy">{d.y}</span></div>{/if}
					</div>
					<div class="c-body">
						<h3 title={e.title}>{e.title}</h3>
						<p class="meta" title={meta}>{meta || ' '}</p>
						{#if e.participants || e.expected}
							<p class="people">
								<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.5 3.5 5.2"/></svg>
								{#if e.participants}{nf.format(e.participants)} participants{:else}{nf.format(e.expected)} expected{/if}
							</p>
						{/if}
						{@render products(e.skus)}
						{#if e.images.length > 1}
							<div class="thumbs">
								{#each e.images.slice(1, 5) as src}<a href={src} target="_blank" rel="noopener"><img src="{src}?size=300" alt="" loading="lazy" /></a>{/each}
							</div>
						{/if}
					</div>
				</article>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
	.kpi { background: rgba(255,255,255,.82); border: 1px solid rgba(214,190,150,.45); border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; }
	.kv { font-size: 28px; font-weight: 800; color: #18181B; letter-spacing: -0.6px; line-height: 1.1; }
	.kl { font-size: 12.5px; font-weight: 700; color: #8a7f6a; margin-top: 2px; }
	.ks { font-size: 11.5px; color: #a99f8c; margin-top: 3px; font-weight: 600; }

	.chips { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 6px; }
	.chips button { font-family: inherit; font-size: 13px; font-weight: 700; color: #6B6355; background: rgba(255,255,255,.7); border: 1px solid rgba(214,190,150,.55); border-radius: 100px; padding: 6px 13px; cursor: pointer; display: inline-flex; gap: 7px; align-items: center; }
	.chips button span { font-size: 11.5px; color: #a99f8c; }
	.chips button.on { background: #18181B; border-color: #18181B; color: #fff; }
	.chips button.on span { color: #d8cfbf; }

	.chips { margin-bottom: 16px; }
	.sec { font-size: 15px; font-weight: 800; color: #18181B; margin: 22px 0 12px; letter-spacing: -0.2px; display: flex; align-items: center; gap: 12px; }
	.sec::after { content: ''; flex: 1; height: 1px; background: rgba(184,160,120,.35); }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
	.ev-grid { grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); }

	.card { background: #fff; border: 1px solid rgba(214,190,150,.45); border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 1px 2px rgba(120,90,40,.05), 0 8px 24px -12px rgba(120,90,40,.18); }
	.c-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
	/* One line each, so cards line up; full text in the tooltip. */
	h3 { font-size: 15px; font-weight: 800; color: #18181B; margin: 0; letter-spacing: -0.2px; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.meta { font-size: 12.5px; color: #8a7f6a; margin: -4px 0 0; font-weight: 600; line-height: 1.4; min-height: 1.4em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

	/* Square top on every card: product box (+ award badge) or event photo. */
	.sq { position: relative; aspect-ratio: 1 / 1; background: #FBF7EF; display: grid; place-items: center; overflow: hidden; }
	.sq > .pill { position: absolute; top: 10px; left: 10px; z-index: 4; box-shadow: 0 2px 8px rgba(0,0,0,.10); }
	.box { position: relative; width: 100%; height: 100%; }
	.box-img { position: absolute; inset: 7%; width: 86%; height: 86%; object-fit: contain; }
	.ov-badge { position: absolute; height: auto; z-index: 3; object-fit: contain; pointer-events: none; }
	.solo-badge { width: 46%; height: auto; object-fit: contain; }
	.sq .ring { position: absolute; right: 10px; bottom: 10px; z-index: 4; }

	.pill { font-size: 11.5px; font-weight: 800; padding: 3px 10px; border-radius: 100px; white-space: nowrap; letter-spacing: .1px; }
	.pill.win { background: #F5B731; color: #4A2A00; }
	.pill.nom { background: #FFE6A5; color: #7B3803; }
	.pill.press { background: #E8EEF9; color: #2B4C7E; }
	.pill.event { background: #E6F4EC; color: #1E6B45; }
	.pill.up { background: #F57832; color: #fff; }
	.pill.inline { align-self: flex-start; }

	.award.win .sq { background: linear-gradient(160deg, #FFF8E4, #FBEBC6); }
	.trophy { width: 60px; height: 60px; border-radius: 50%; display: grid; place-items: center; background: #fff; color: #C98A1E; }

	.ring { flex-shrink: 0; min-width: 52px; height: 52px; border-radius: 50%; border: 3px solid #F57832; display: grid; place-items: center; font-size: 14px; font-weight: 800; color: #7B3803; background: #FFF7EC; padding: 0 4px; }

	blockquote { margin: 2px 0; padding: 10px 12px; background: #FBF7EF; border-radius: 10px; position: relative; }
	blockquote p { margin: 0; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 14px; line-height: 1.5; color: #3F3A31; }
	blockquote .score { display: inline-block; margin-top: 6px; font-size: 12px; font-weight: 800; color: #7B3803; }

	.prods { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
	.prods li { display: flex; align-items: center; gap: 9px; min-width: 0; }
	.prods img, .prods .ph { width: 36px; height: 36px; border-radius: 8px; object-fit: contain; background: #FBF7EF; flex-shrink: 0; }
	.pn { font-size: 13px; font-weight: 700; color: #3F3A31; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.more { margin-top: auto; padding-top: 4px; font-size: 12.5px; font-weight: 700; color: #C4581B; text-decoration: none; }
	.more:hover { text-decoration: underline; }

	.e-media { background: #F3E7D2; place-items: stretch; }
	.e-media .cover { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
	.e-media.noimg { background: linear-gradient(160deg, #FDEBD2, #F6D1A6); }
	.cal { z-index: 3; position: absolute; left: 12px; bottom: 12px; background: #fff; border-radius: 10px; width: 54px; text-align: center; padding: 5px 0 6px; box-shadow: 0 4px 14px rgba(0,0,0,.14); display: flex; flex-direction: column; line-height: 1.05; }
	.cm { font-size: 10.5px; font-weight: 800; color: #F57832; text-transform: uppercase; letter-spacing: .5px; }
	.cd { font-size: 21px; font-weight: 800; color: #18181B; }
	.cy { font-size: 10px; font-weight: 700; color: #a99f8c; }
	.people { margin: 0; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: #524431; }
	.thumbs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 2px; }
	.thumbs img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; display: block; }

	.none { text-align: center; padding: 56px 20px; background: rgba(255,255,255,.7); border: 1px dashed rgba(184,160,120,.6); border-radius: 16px; }
	.none-t { font-size: 16px; font-weight: 800; color: #18181B; margin: 0 0 4px; }
	.none-s { font-size: 13.5px; color: #8a7f6a; margin: 0; }

	@media (max-width: 720px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
