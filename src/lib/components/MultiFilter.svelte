<script>
	// A compact filter dropdown. Multi-select (checkboxes + Apply) by default,
	// or single-select (radio, applies immediately) when `single` is set.
	let { label, options = [], selected = [], single = false, allLabel = 'All', onApply } = $props();

	let open = $state(false);
	let pending = $state([...selected]);
	let query = $state('');

	// Re-sync the pending set whenever the applied selection changes (post-nav).
	$effect(() => { pending = [...selected]; });

	const filtered = $derived(
		query.trim()
			? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
			: options
	);

	const display = $derived(
		single
			? (selected.length ? (options.find((o) => o.value === selected[0])?.label ?? label) : label)
			: label
	);

	function toggle(v) {
		if (single) { onApply([v]); open = false; return; }
		pending = pending.includes(v) ? pending.filter((x) => x !== v) : [...pending, v];
	}
	function apply() { onApply([...pending]); open = false; }
	function clear() {
		if (single) { onApply([]); open = false; }
		else pending = [];
	}
	function close() { open = false; query = ''; pending = [...selected]; }
</script>

<div class="mf">
	<button type="button" class="mf-btn" class:active={selected.length > 0} onclick={() => (open ? close() : (open = true))}>
		<span class="mf-label">{display}</span>
		{#if !single && selected.length > 0}<span class="mf-badge">{selected.length}</span>{/if}
		<svg class="mf-chev" width="10" height="10" viewBox="0 0 10 10" fill="none">
			<path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>

	{#if open}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="mf-backdrop" onclick={close}></div>
		<div class="mf-panel">
			{#if options.length > 8}
				<input class="mf-search" placeholder="Search…" bind:value={query} />
			{/if}
			<div class="mf-list">
				{#if single}
					<button type="button" class="mf-opt" onclick={clear}>
						<span class="mf-radio" class:on={selected.length === 0}></span>{allLabel}
					</button>
				{/if}
				{#each filtered as o (o.value)}
					<button type="button" class="mf-opt" onclick={() => toggle(o.value)}>
						{#if single}
							<span class="mf-radio" class:on={selected[0] === o.value}></span>
						{:else}
							<span class="mf-check" class:on={pending.includes(o.value)}></span>
						{/if}
						<span class="mf-opt-label">{o.label}</span>
					</button>
				{/each}
				{#if filtered.length === 0}
					<div class="mf-empty">No matches</div>
				{/if}
			</div>
			{#if !single}
				<div class="mf-foot">
					<button type="button" class="mf-clear" onclick={clear}>Clear</button>
					<button type="button" class="mf-apply" onclick={apply}>Apply</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.mf { position: relative; }
	.mf-btn {
		display: inline-flex; align-items: center; gap: 7px;
		font-family: inherit; font-size: 13px; font-weight: 700; color: #524431;
		background: #fff; border: 1px solid var(--border); border-radius: 9px;
		padding: 8px 12px; cursor: pointer; white-space: nowrap;
		transition: border-color 0.12s, background 0.12s;
	}
	.mf-btn:hover { background: #FFFBEF; }
	.mf-btn.active { background: #FFE6A5; border-color: #F4CE7A; color: #7B3803; }
	.mf-label { max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
	.mf-badge {
		background: var(--accent); color: #fff; font-size: 11px; font-weight: 800;
		min-width: 17px; height: 17px; padding: 0 5px; border-radius: 100px;
		display: inline-flex; align-items: center; justify-content: center;
	}
	.mf-chev { opacity: 0.5; flex-shrink: 0; }

	.mf-backdrop { position: fixed; inset: 0; z-index: 40; }
	.mf-panel {
		position: absolute; top: calc(100% + 6px); left: 0; z-index: 50;
		min-width: 220px; max-width: 300px;
		background: #fff; border: 1px solid var(--border); border-radius: 12px;
		box-shadow: 0 10px 34px rgba(100, 60, 0, 0.16);
		padding: 8px; display: flex; flex-direction: column;
	}
	.mf-search {
		font-family: inherit; font-size: 13px; color: #18181B;
		border: 1px solid var(--border); border-radius: 8px; padding: 7px 9px; margin-bottom: 6px;
	}
	.mf-search:focus { outline: none; border-color: var(--accent); }
	.mf-list { max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; }
	.mf-opt {
		display: flex; align-items: center; gap: 9px;
		font-family: inherit; font-size: 13px; font-weight: 600; color: #3f3a33;
		background: none; border: none; border-radius: 8px; padding: 8px 9px;
		cursor: pointer; text-align: left; width: 100%;
	}
	.mf-opt:hover { background: #FFF5D2; }
	.mf-opt-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.mf-check, .mf-radio {
		flex-shrink: 0; width: 16px; height: 16px; border: 1.5px solid #D8C79A;
		display: inline-flex; align-items: center; justify-content: center;
	}
	.mf-check { border-radius: 5px; }
	.mf-radio { border-radius: 50%; }
	.mf-check.on { background: var(--accent); border-color: var(--accent); }
	.mf-check.on::after { content: '✓'; color: #fff; font-size: 11px; font-weight: 900; }
	.mf-radio.on { border-color: var(--accent); }
	.mf-radio.on::after { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
	.mf-empty { padding: 12px; font-size: 13px; color: #A1A1AA; text-align: center; }

	.mf-foot { display: flex; gap: 6px; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border); }
	.mf-clear {
		flex: 1; font-family: inherit; font-size: 13px; font-weight: 700; color: #8A7550;
		background: #F4F0E4; border: none; border-radius: 8px; padding: 8px; cursor: pointer;
	}
	.mf-clear:hover { background: #EDE6D2; }
	.mf-apply {
		flex: 1; font-family: inherit; font-size: 13px; font-weight: 700; color: #fff;
		background: var(--accent); border: none; border-radius: 8px; padding: 8px; cursor: pointer;
	}
	.mf-apply:hover { background: var(--accent-hover); }
</style>
