<script>
	/**
	 * Availability picker: "All markets" or "Some markets" (tick DK/SE/NO/INT/PL).
	 * value: string[] | null  — null = all markets; array = exactly those markets
	 * (empty array = none). Calls onchange(null | string[]) on every change.
	 */
	let { value = null, onchange } = $props();
	const MARKETS = ['DK', 'SE', 'NO', 'INT', 'PL'];
	const isAll = $derived(value == null);
	const set = $derived(new Set(Array.isArray(value) ? value : []));

	function chooseAll() { if (!isAll) onchange?.(null); }
	function chooseSome() { if (isAll) onchange?.([...MARKETS]); } // default to all ticked
	function toggle(m) {
		const s = new Set(set);
		if (s.has(m)) s.delete(m); else s.add(m);
		onchange?.(MARKETS.filter((x) => s.has(x)));
	}
</script>

<div class="avail">
	<div class="modes">
		<button type="button" class="mode" class:on={isAll} onclick={chooseAll}>All markets</button>
		<button type="button" class="mode" class:on={!isAll} onclick={chooseSome}>Some markets</button>
	</div>
	{#if !isAll}
		<div class="mkts">
			{#each MARKETS as m}
				<button type="button" class="mkt" class:on={set.has(m)} onclick={() => toggle(m)}>{m}</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.avail { display: flex; flex-direction: column; gap: 6px; }
	.modes { display: inline-flex; border: 1px solid var(--border, #E4E4E7); border-radius: 8px; overflow: hidden; width: fit-content; }
	.mode { font-size: 11px; font-weight: 700; font-family: inherit; padding: 4px 10px; background: #fff; color: #71717A; border: none; cursor: pointer; }
	.mode + .mode { border-left: 1px solid var(--border, #E4E4E7); }
	.mode.on { background: #F57832; color: #fff; }
	.mkts { display: flex; flex-wrap: wrap; gap: 4px; }
	.mkt { font-size: 10.5px; font-weight: 800; letter-spacing: 0.3px; color: #A1A1AA; background: #fff; border: 1px solid var(--border, #E4E4E7); border-radius: 6px; padding: 3px 7px; cursor: pointer; font-family: inherit; }
	.mkt.on { color: #fff; background: #F57832; border-color: #F57832; }
</style>
