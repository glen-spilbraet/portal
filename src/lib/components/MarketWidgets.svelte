<script>
	// 5 KPI cards (Total + markets): revenue + colored YoY index chip.
	let { widgets = [] } = $props();
	const dkkFmt = new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 });
	const formatDkk = (n) => dkkFmt.format(Math.round(n ?? 0)) + ' kr';
	function indexClass(idx) {
		if (idx === null || idx === undefined) return '';
		if (idx >= 100) return 'green';
		if (idx >= 96) return 'orange';
		return 'red';
	}
</script>

<section class="grid">
	{#each widgets as w (w.key)}
		<div class="card" class:total={w.key === 'total'}>
			<div class="card-label">{w.label}</div>
			<div class="card-value">{formatDkk(w.dkk)}</div>
			<div class="index-row">
				<span class="index-chip {indexClass(w.index)}">{w.index !== null ? `Index ${w.index}` : 'Index —'}</span>
			</div>
		</div>
	{/each}
</section>

<style>
	.grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; }
	@media (max-width: 900px) { .grid { grid-template-columns: repeat(2, 1fr); } }
	@media (max-width: 520px) { .grid { grid-template-columns: 1fr; } }
	.card { background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow); padding: 18px 20px; }
	.card.total { background: #FFF8E6; border-color: #F4CE7A; }
	.card-label { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #A88B52; }
	.card.total .card-label { color: #B4611A; }
	.card-value { font-size: 24px; font-weight: 800; color: #18181B; letter-spacing: -0.5px; margin: 6px 0 10px; }
	.card.total .card-value { color: #7B3803; }
	.index-chip { display: inline-block; font-size: 12px; font-weight: 800; padding: 3px 10px; border-radius: 100px; background: #F4F4F5; color: #71717A; }
	.index-chip.green { background: #EAF7EF; color: #16794C; }
	.index-chip.orange { background: #FDEBD2; color: #B4611A; }
	.index-chip.red { background: #FDECEC; color: #C4381B; }
</style>
