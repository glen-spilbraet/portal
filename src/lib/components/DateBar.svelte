<script>
	import { goto } from '$app/navigation';

	// Shared sticky date picker for Stats + Product. Navigates within the current
	// route (period/from/to) and writes a `statsRange` cookie so the selection
	// mirrors when switching between the two views. `filters` (optional) is
	// preserved in the URL on date changes.
	let { selected, range, yearOptions, quarterOptions, monthOptions, filters = {} } = $props();

	let scrollY = $state(0);
	const isQuickSelected = $derived(selected !== 'custom');
	// Disable the picker only while a date change WE triggered is loading. Prevents
	// the race where a user picks a quick option (which auto-navigates) and then
	// clicks Apply mid-load, overriding the pick with the stale custom-range inputs.
	// Scoped to bar-initiated navigations so it doesn't flash on menu route changes.
	let busy = $state(false);

	function addFilters(p) {
		if (filters.levels?.length) p.set('level', filters.levels.join(','));
		if (filters.groups?.length) p.set('group', filters.groups.join(','));
		if (filters.countries?.length) p.set('country', filters.countries.join(','));
		if (filters.rep) p.set('rep', filters.rep);
		return p;
	}
	function setCookie(datePart) {
		document.cookie = `statsRange=${encodeURIComponent(datePart)}; path=/; max-age=31536000; samesite=lax`;
	}
	async function pickQuick(e) {
		if (busy) return;
		const v = e.currentTarget.value;
		if (!v) return;
		setCookie(`period=${v}`);
		const p = new URLSearchParams();
		p.set('period', v);
		busy = true;
		try {
			await goto(`?${addFilters(p).toString()}`, { noScroll: true });
		} finally {
			busy = false;
		}
	}
	async function applyCustom(e) {
		e.preventDefault();
		if (busy) return;
		const f = e.currentTarget;
		if (!f.from.value || !f.to.value) return;
		setCookie(`from=${f.from.value}&to=${f.to.value}`);
		const p = new URLSearchParams();
		p.set('from', f.from.value);
		p.set('to', f.to.value);
		busy = true;
		try {
			await goto(`?${addFilters(p).toString()}`, { noScroll: true });
		} finally {
			busy = false;
		}
	}
</script>

<svelte:window bind:scrollY />

<div class="date-bar" class:scrolled={scrollY > 4}>
	<div class="date-bar-inner">
		<div class="range-controls" class:busy aria-busy={busy}>
			<select class="quick-select" class:active={isQuickSelected} aria-label="Quick select" onchange={pickQuick} disabled={busy}>
				<option value="" disabled selected={!isQuickSelected}>Quick Select</option>
				<optgroup label="Year">
					{#each yearOptions as o}<option value={o.key} selected={selected === o.key}>{o.label}</option>{/each}
				</optgroup>
				<optgroup label="Quarter">
					{#each quarterOptions as o}<option value={o.key} selected={selected === o.key}>{o.label}</option>{/each}
				</optgroup>
				<optgroup label="Month">
					{#each monthOptions as o}<option value={o.key} selected={selected === o.key}>{o.label}</option>{/each}
				</optgroup>
			</select>

			<form class="custom-range" onsubmit={applyCustom}>
				<input type="date" name="from" value={range.start} class="date-input" aria-label="From date" disabled={busy} />
				<span class="range-dash">–</span>
				<input type="date" name="to" value={range.endInclusive} class="date-input" aria-label="To date" disabled={busy} />
				<button type="submit" class="apply-btn" class:active={selected === 'custom'} disabled={busy}>
					{#if busy}<span class="spinner" aria-hidden="true"></span>Loading{:else}Apply{/if}
				</button>
			</form>
		</div>
	</div>
</div>

<style>
	.date-bar {
		position: sticky;
		top: 0;
		z-index: 30;
		background: #fff;
		border-bottom: 1px solid var(--border);
		transition: box-shadow 0.18s ease;
	}
	.date-bar.scrolled { box-shadow: 0 3px 14px rgba(0, 0, 0, 0.06); }
	.date-bar-inner {
		max-width: 1140px;
		margin: 0 auto;
		padding: 9px 28px;
		display: flex;
		align-items: center;
		justify-content: flex-end;
	}
	.range-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; transition: opacity 0.15s ease; }
	.range-controls.busy { opacity: 0.75; }
	.range-controls.busy .quick-select,
	.range-controls.busy .date-input { cursor: progress; }
	.quick-select:disabled,
	.date-input:disabled { background: #F7F4EE; color: #9A8C74; cursor: progress; }
	.quick-select {
		font-family: inherit; font-size: 13px; font-weight: 700; color: #524431;
		background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px; cursor: pointer;
	}
	.quick-select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.15); }
	.quick-select.active { background: #FFE6A5; color: #7B3803; border-color: #F4CE7A; }
	.custom-range { display: flex; align-items: center; gap: 6px; }
	.date-input {
		font-family: inherit; font-size: 13px; font-weight: 600; color: #524431;
		background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px;
	}
	.date-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.15); }
	.range-dash { color: #A88B52; font-weight: 700; }
	.apply-btn {
		display: inline-flex; align-items: center; gap: 6px;
		font-family: inherit; font-size: 13px; font-weight: 700; color: #fff;
		background: var(--accent); border: none; border-radius: 8px; padding: 7px 14px; transition: background 0.15s;
	}
	.apply-btn:hover { background: var(--accent-hover); }
	.apply-btn.active { box-shadow: 0 0 0 3px rgba(245, 120, 50, 0.2); }
	.apply-btn:disabled { cursor: progress; opacity: 0.9; }
	.spinner {
		width: 12px; height: 12px; border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.45); border-top-color: #fff;
		animation: db-spin 0.6s linear infinite;
	}
	@keyframes db-spin { to { transform: rotate(360deg); } }
</style>
