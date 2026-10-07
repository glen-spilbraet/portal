<script>
	import { PRIORITY_COUNTRIES, OTHER_COUNTRIES } from '$lib/countries.js';

	let { value = $bindable(''), id = undefined, placeholder = 'Select country…' } = $props();

	// Keep any legacy / free-text value that isn't in our lists so editing an old
	// record never silently drops its country.
	const known = new Set([...PRIORITY_COUNTRIES, ...OTHER_COUNTRIES]);
	const extra = $derived(value && !known.has(value) ? value : null);
</script>

<select {id} class="country-select" bind:value>
	<option value="">{placeholder}</option>
	{#if extra}<option value={extra}>{extra}</option>{/if}
	{#each PRIORITY_COUNTRIES as c}<option value={c}>{c}</option>{/each}
	<option disabled>──────────</option>
	{#each OTHER_COUNTRIES as c}<option value={c}>{c}</option>{/each}
</select>

<style>
	.country-select {
		width: 100%;
		padding: 8px 10px;
		border: 1px solid var(--border);
		border-radius: 8px;
		font-family: inherit;
		font-size: 13px;
		font-weight: 500;
		color: #18181B;
		background: white;
		outline: none;
	}
	.country-select:focus { border-color: var(--accent); }
</style>
