<script>
	// Generic 3-year (+ index) breakdown table with search + sort. `leadCols` are
	// the descriptive columns before the year columns, e.g. [{key,header,bold}].
	let {
		title, rows = [], leadCols = [], yearCols = ['—', '—', '—'], colNoData = [false, false, false],
		searchPlaceholder = 'Search…', emptyText = 'No data in this period.', caption = '', onRowClick = null,
		childrenByKey = null, onChildClick = null, canOpenRow = null,
	} = $props();

	const rowOpenable = (r) => !!onRowClick && (!canOpenRow || canOpenRow(r));

	let expanded = $state({});
	const hasChildren = (k) => !!(childrenByKey && Array.isArray(childrenByKey[k]) && childrenByKey[k].length);
	function toggle(k) { expanded = { ...expanded, [k]: !expanded[k] }; }

	const numFmt = new Intl.NumberFormat('da-DK');
	function indexClass(idx) {
		if (idx === null || idx === undefined) return '';
		if (idx >= 100) return 'green';
		if (idx >= 96) return 'orange';
		return 'red';
	}

	let search = $state('');
	let sortKey = $state('rev2');
	let sortDir = $state('desc');
	function setSort(key) {
		if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		else { sortKey = key; sortDir = ['rev0', 'rev1', 'rev2', 'index'].includes(key) ? 'desc' : 'asc'; }
	}
	const caret = (k) => (sortKey === k ? (sortDir === 'asc' ? '▲' : '▼') : '');

	let loadingKey = $state(null);
	function openRow(r) {
		if (!rowOpenable(r)) return;
		loadingKey = r.key; // spinner until navigation swaps the page
		onRowClick?.(r);
	}

	const shown = $derived(
		(search.trim()
			? rows.filter((r) => {
					const t = search.trim().toLowerCase();
					return leadCols.some((c) => String(r[c.key] ?? '').toLowerCase().includes(t));
				})
			: rows
		).slice().sort((a, b) => {
			let av, bv;
			if (sortKey === 'index') { av = a.index ?? -Infinity; bv = b.index ?? -Infinity; }
			else if (['rev0', 'rev1', 'rev2'].includes(sortKey)) { av = a[sortKey] ?? 0; bv = b[sortKey] ?? 0; }
			else { av = String(a[sortKey] ?? '').toLowerCase(); bv = String(b[sortKey] ?? '').toLowerCase(); }
			if (av < bv) return sortDir === 'asc' ? -1 : 1;
			if (av > bv) return sortDir === 'asc' ? 1 : -1;
			return 0;
		})
	);
</script>

<section class="table-wrap">
	<div class="table-head">
		<h3>{title}</h3>
		<span class="count">{numFmt.format(shown.length)}</span>
	</div>
	<div class="dim-filter">
		<div class="dim-search">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
			</svg>
			<input type="text" bind:value={search} placeholder={searchPlaceholder} aria-label={searchPlaceholder} />
			{#if search}<button class="clear" onclick={() => (search = '')} aria-label="Clear search">×</button>{/if}
		</div>
		{#if caption}<p class="hint">{caption}</p>{/if}
	</div>
	<div class="table-scroll">
		<table>
			<colgroup>
				{#each leadCols as c}<col style={c.width ? `width:${c.width}` : ''} />{/each}
				<col style="width:112px" /><col style="width:112px" /><col style="width:112px" /><col style="width:84px" />
			</colgroup>
			<thead>
				<tr>
					{#each leadCols as c}
						<th class="th-sort" class:sorted={sortKey === c.key} onclick={() => setSort(c.key)}>{c.header} {caret(c.key)}</th>
					{/each}
					{#each ['rev0', 'rev1', 'rev2'] as key, i}
						<th class="th-sort num" class:sorted={sortKey === key} onclick={() => setSort(key)}>{yearCols[i]} {caret(key)}</th>
					{/each}
					<th class="th-sort num" class:sorted={sortKey === 'index'} onclick={() => setSort('index')}>Index {caret('index')}</th>
				</tr>
			</thead>
			<tbody>
				{#snippet revIdx(row)}
					{#each ['rev0', 'rev1', 'rev2'] as key, i}
						<td class="num" class:nodata={colNoData[i]}>{colNoData[i] ? '—' : numFmt.format(Math.round(row[key]))}</td>
					{/each}
					<td class="num">
						{#if row.index !== null && row.index !== undefined}<span class="index-chip {indexClass(row.index)}">{row.index}</span>{:else}<span class="muted">–</span>{/if}
					</td>
				{/snippet}
				{#each shown as r (r.key)}
					<tr>
						{#each leadCols as c, ci}
							<td class:lead={ci === 0} class:bold={c.bold}>
								{#if ci === 0}
									<div class="name-cell">
										{#if hasChildren(r.key)}
											<button class="chev" class:open={expanded[r.key]} onclick={() => toggle(r.key)} aria-label="Toggle series" title="Show series">▶</button>
										{/if}
										{#if c.link}<a class="cname linkcell" href={c.link(r)}>{r[c.key] ?? '—'}</a>{:else}<span class="cname">{r[c.key] ?? '—'}</span>{/if}
										{#if rowOpenable(r)}
											<button class="detail-btn" onclick={() => openRow(r)} aria-label="Open details" title="Open details">
												{#if loadingKey === r.key}
													<svg class="spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
												{:else}
													<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
												{/if}
											</button>
										{/if}
									</div>
								{:else if c.link}
									<a class="linkcell" href={c.link(r)}>{r[c.key] ?? '—'}</a>
								{:else}{r[c.key] ?? '—'}{/if}
							</td>
						{/each}
						{@render revIdx(r)}
					</tr>
					{#if hasChildren(r.key) && expanded[r.key]}
						{#each childrenByKey[r.key] as ch (ch.key)}
							<tr class="child">
								{#each leadCols as c, ci}
									<td class:lead={ci === 0}>
										{#if ci === 0}
											<div class="name-cell child-name">
												<span class="cname" class:rest={ch.isRest}>{ch.label}</span>
												{#if onChildClick && !ch.isRest}
													<button class="detail-btn" onclick={() => onChildClick(ch)} aria-label="Open series" title="Open series">
														<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
													</button>
												{/if}
											</div>
										{/if}
									</td>
								{/each}
								{@render revIdx(ch)}
							</tr>
						{/each}
					{/if}
				{/each}
				{#if shown.length === 0}
					<tr><td colspan={leadCols.length + 4} class="empty">{search.trim() ? 'No matches.' : emptyText}</td></tr>
				{/if}
			</tbody>
		</table>
	</div>
</section>

<style>
	.table-wrap { background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow); overflow: hidden; margin-top: 18px; }
	.table-head { display: flex; align-items: center; gap: 10px; padding: 16px 20px; border-bottom: 1px solid var(--border); }
	.table-head h3 { font-size: 15px; font-weight: 800; color: #18181B; margin: 0; letter-spacing: -0.2px; }
	.count { font-size: 12px; font-weight: 700; color: #A88B52; background: #FFF5D2; padding: 2px 9px; border-radius: 100px; }
	.dim-filter { padding: 10px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
	.dim-search { display: inline-flex; align-items: center; gap: 7px; width: 100%; max-width: 300px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 8px; background: #fff; }
	.dim-search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.12); }
	.dim-search svg { color: #B7A579; flex-shrink: 0; }
	.dim-search input { flex: 1; min-width: 0; border: none; background: none; outline: none; font-family: inherit; font-size: 13px; color: #3f3a33; }
	.clear { flex-shrink: 0; border: none; background: none; cursor: pointer; color: #A88B52; font-size: 16px; line-height: 1; }
	.hint { margin: 0; font-size: 12px; color: #A88B52; }
	.table-scroll { max-height: 620px; overflow: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
	thead th { position: sticky; top: 0; z-index: 1; background: #FBEFCB; color: #7B3803; font-weight: 800; text-align: left; padding: 11px 20px; white-space: nowrap; border-bottom: 1px solid var(--border); user-select: none; }
	th.num, td.num { text-align: right; white-space: nowrap; }
	.th-sort { cursor: pointer; }
	.th-sort:hover { background: #F8E6B0; }
	.th-sort.sorted { color: #B15A12; }
	tbody td { padding: 11px 20px; border-bottom: 1px solid #F5EDD8; color: #3f3a33; }
	tbody tr:nth-child(even) td { background: #FFFBEF; }
	tbody tr:hover td { background: #FFF5D2; }
	td.lead.bold, td.bold { font-weight: 700; color: #18181B; }
	.name-cell { display: flex; align-items: center; gap: 8px; }
	.cname { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
	.linkcell { color: #B15A12; text-decoration: none; }
	.linkcell:hover { text-decoration: underline; }
	.chev { flex-shrink: 0; border: none; background: none; color: #B7A579; cursor: pointer; font-size: 10px; line-height: 1; padding: 2px; transition: transform 0.12s, color 0.12s; display: inline-flex; }
	.chev.open { transform: rotate(90deg); color: #B15A12; }
	tbody tr.child td { background: #FFFDF6; }
	tbody tr.child:hover td { background: #FFF5D2; }
	.child-name { padding-left: 20px; }
	.child-name .cname { color: #52525B; font-weight: 600; }
	.child-name .cname.rest { color: #A1A1AA; font-style: italic; font-weight: 500; }
	.detail-btn {
		flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
		width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--border);
		background: #fff; color: #A88B52; cursor: pointer; opacity: 0;
		transition: opacity 0.12s, background 0.12s, color 0.12s;
	}
	tbody tr:hover .detail-btn { opacity: 1; }
	.detail-btn:hover { background: #FFE6A5; color: #7B3803; }
	@media (hover: none) { .detail-btn { opacity: 1; } }
	@keyframes spin { to { transform: rotate(360deg); } }
	.spin { animation: spin 0.7s linear infinite; opacity: 1; }
	.name-cell:has(.spin) .detail-btn { opacity: 1; }
	td.num { font-variant-numeric: tabular-nums; font-weight: 600; }
	td.num.nodata { color: #C7C7CC; font-weight: 500; }
	.muted { color: #C0AC7C; }
	.index-chip { display: inline-block; font-size: 12px; font-weight: 800; padding: 2px 9px; border-radius: 100px; }
	.index-chip.green { background: #EAF7EF; color: #16794C; }
	.index-chip.orange { background: #FDEBD2; color: #B4611A; }
	.index-chip.red { background: #FDECEC; color: #C4381B; }
	.empty { text-align: center; color: #A1A1AA; padding: 28px; }
</style>
