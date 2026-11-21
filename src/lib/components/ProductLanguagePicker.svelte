<script>
	/**
	 * Which languages a product comes in (components and/or rule book).
	 *
	 *  - The languages inside our markets are one-click chips.
	 *  - Any other language is found by typing in the search box.
	 *  - Each chosen language can be marked "Manual only" (only the rule book is
	 *    in that language).
	 *
	 * value: [{ code, manual_only? }] in display order.
	 * onchange(next) is called with the new list on every change; return false
	 * (or a promise of false) when the save failed and the picker goes back.
	 */
	import { MARKET_LANGUAGE_CODES, allProductLanguages, productLanguageName, sanitizeProductLanguages } from '$lib/productLanguages.js';
	import { langShort } from '$lib/languages.js';

	let { value = [], onchange = async () => true } = $props();

	let list = $state(sanitizeProductLanguages(value));
	// Follow the sheet when another one is opened in the same editor.
	$effect(() => { list = sanitizeProductLanguages(value); });

	const ALL = allProductLanguages();
	const chosen = $derived(new Set(list.map((l) => l.code)));

	let query = $state('');
	let open = $state(false);
	let active = $state(0);
	/** Search hits: not chosen yet, name or code matches; names starting with the text first. */
	const hits = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		const match = ALL.filter((l) => !chosen.has(l.code) && (l.name.toLowerCase().includes(q) || l.code.toLowerCase() === q));
		const starts = (/** @type {{ name: string, code: string }} */ l) => (l.name.toLowerCase().startsWith(q) || l.code.toLowerCase() === q ? 0 : 1);
		return match.sort((a, b) => starts(a) - starts(b)).slice(0, 8);
	});

	async function commit(next) {
		const prev = list;
		list = next;
		const ok = await onchange(next);
		if (ok === false) list = prev;
	}
	function add(code) {
		if (chosen.has(code)) return;
		commit([...list, { code }]);
		query = ''; open = false; active = 0;
	}
	function remove(code) { commit(list.filter((l) => l.code !== code)); }
	function toggleQuick(code) { if (chosen.has(code)) remove(code); else add(code); }
	function setManualOnly(code, on) {
		commit(list.map((l) => (l.code === code ? (on ? { code, manual_only: true } : { code }) : l)));
	}

	function onKey(e) {
		if (e.key === 'ArrowDown') { e.preventDefault(); open = true; active = Math.min(active + 1, Math.max(hits.length - 1, 0)); }
		else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); }
		else if (e.key === 'Enter') { e.preventDefault(); if (hits[active]) add(hits[active].code); }
		else if (e.key === 'Escape') { open = false; }
	}
</script>

<div class="pl">
	<div class="quick" role="group" aria-label="Languages in our markets">
		{#each MARKET_LANGUAGE_CODES as code (code)}
			<button type="button" class="chip" class:on={chosen.has(code)} aria-pressed={chosen.has(code)}
				title={productLanguageName(code)} onclick={() => toggleQuick(code)}>{langShort(code)}</button>
		{/each}
	</div>

	<div class="search">
		<input
			type="text" placeholder="Add another language…" autocomplete="off" spellcheck="false"
			role="combobox" aria-expanded={open && hits.length > 0} aria-controls="pl-hits" aria-autocomplete="list"
			bind:value={query}
			oninput={() => { open = true; active = 0; }}
			onfocus={() => (open = true)}
			onblur={() => setTimeout(() => (open = false), 120)}
			onkeydown={onKey} />
		{#if open && query.trim()}
			<ul class="hits" id="pl-hits" role="listbox">
				{#each hits as h, i (h.code)}
					<li role="option" aria-selected={i === active}>
						<button type="button" class:active={i === active} onmousedown={(e) => { e.preventDefault(); add(h.code); }}>
							<span>{h.name}</span><span class="code">{h.code}</span>
						</button>
					</li>
				{:else}
					<li class="none">No language matches “{query.trim()}”</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if list.length}
		<ul class="chosen">
			{#each list as l (l.code)}
				<li>
					<span class="name">{productLanguageName(l.code)}</span>
					<label class="manual" title="Only the rule book / manual is in {productLanguageName(l.code)}">
						<input type="checkbox" checked={!!l.manual_only} onchange={(e) => setManualOnly(l.code, e.currentTarget.checked)} />
						Manual only
					</label>
					<button type="button" class="x" aria-label="Remove {productLanguageName(l.code)}" onclick={() => remove(l.code)}>✕</button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="empty">No languages chosen yet.</p>
	{/if}
</div>

<style>
	.pl { padding: 12px 16px 14px; }
	.quick { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 9px; }
	.chip { font: inherit; font-size: 11.5px; font-weight: 800; letter-spacing: 0.2px; color: #71717A; background: #F4F4F5; border: 1px solid var(--border, #E4E4E7); border-radius: 7px; padding: 4px 8px; cursor: pointer; }
	.chip:hover { border-color: #F5C9A8; }
	.chip.on { color: #fff; background: #F57832; border-color: #F57832; }

	.search { position: relative; }
	.search input { width: 100%; box-sizing: border-box; font: inherit; font-size: 12.5px; color: #18181B; background: #fff; border: 1px solid var(--border, #E4E4E7); border-radius: 8px; padding: 7px 9px; }
	.search input:focus { outline: none; border-color: #F57832; box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.12); }
	.hits { position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px); margin: 0; padding: 4px; list-style: none; background: #fff; border: 1px solid var(--border, #E4E4E7); border-radius: 10px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1); max-height: 260px; overflow-y: auto; }
	.hits button { display: flex; justify-content: space-between; gap: 8px; width: 100%; font: inherit; font-size: 12.5px; text-align: left; color: #27272A; background: none; border: 0; border-radius: 7px; padding: 6px 8px; cursor: pointer; }
	.hits button:hover, .hits button.active { background: #FFF1E7; }
	.hits .code { font-size: 11px; color: #A1A1AA; text-transform: uppercase; }
	.hits .none { font-size: 12px; color: #A1A1AA; padding: 6px 8px; }

	.chosen { list-style: none; margin: 10px 0 0; padding: 0; }
	.chosen li { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-top: 1px solid var(--border, #F0F0F2); font-size: 12.5px; }
	.chosen li:first-child { border-top: 0; }
	.name { flex: 1; min-width: 0; font-weight: 600; color: #27272A; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.manual { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #71717A; white-space: nowrap; cursor: pointer; }
	.manual input { accent-color: #F57832; width: 13px; height: 13px; margin: 0; cursor: pointer; }
	.x { font: inherit; font-size: 11px; line-height: 1; color: #A1A1AA; background: none; border: 0; padding: 4px; border-radius: 5px; cursor: pointer; }
	.x:hover { color: #DC2626; background: #FEF2F2; }
	.empty { font-size: 12px; color: #A1A1AA; margin: 9px 0 0; }
</style>
