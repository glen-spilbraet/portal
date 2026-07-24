<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { enhance } from '$app/forms';

	let { data } = $props();

	let addYear = $state(data.currentYear);
	let addName = $state('');
	let addIndex = $state(115);
</script>

<svelte:head><title>Targets · Product Portal</title></svelte:head>

<AppNav active="targets" user={data.user} />

<main class="wrap">
	<header class="page-head">
		<h1>Index Targets</h1>
		<p class="sub">Set the YoY index tiers shown in the quarterly target tracker. Each rep is measured on their own index; admins on the company total.</p>
	</header>

	<section class="add-card">
		<form method="POST" action="?/create" use:enhance class="add-form">
			<div class="field">
				<label for="y">Year</label>
				<input id="y" name="year" type="number" bind:value={addYear} min="2000" max="2100" required />
			</div>
			<div class="field grow">
				<label for="n">Target name</label>
				<input id="n" name="name" type="text" bind:value={addName} placeholder="e.g. Bonus, Stretch, Gold…" required />
			</div>
			<div class="field">
				<label for="i">Index</label>
				<input id="i" name="index_value" type="number" bind:value={addIndex} min="1" required />
			</div>
			<button type="submit" class="btn-primary">Add target</button>
		</form>
	</section>

	{#each data.years as group (group.year)}
		<section class="year-block">
			<h2>{group.year}</h2>
			<div class="rows">
				{#each group.items as t (t.id)}
					<form method="POST" action="?/update" use:enhance class="row">
						<input type="hidden" name="id" value={t.id} />
						<input class="row-name" name="name" value={t.name} />
						<div class="row-index">
							<span class="idx-label">Index</span>
							<input class="idx-input" name="index_value" type="number" value={t.index_value} min="1" />
						</div>
						<button type="submit" class="btn-save">Save</button>
						<button type="submit" formaction="?/delete" class="btn-del" aria-label="Delete target">✕</button>
					</form>
				{/each}
			</div>
		</section>
	{/each}

	{#if data.years.length === 0}
		<p class="empty">No targets yet. Add your first one above.</p>
	{/if}
</main>

<style>
	.wrap { max-width: 820px; margin: 0 auto; padding: 28px; }
	.page-head { margin-bottom: 20px; }
	h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.4px; margin: 0; }
	.sub { font-size: 14px; color: #8A7550; margin: 6px 0 0; max-width: 620px; }

	.add-card {
		background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg);
		box-shadow: var(--shadow); padding: 18px; margin-bottom: 26px;
	}
	.add-form { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
	.field { display: flex; flex-direction: column; gap: 5px; }
	.field.grow { flex: 1; min-width: 180px; }
	.field label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; color: #A88B52; }
	.field input, .row-name, .idx-input {
		font-family: inherit; font-size: 14px; font-weight: 600; color: #18181B;
		background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px;
	}
	.field input:focus, .row-name:focus, .idx-input:focus {
		outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(245,120,50,0.15);
	}
	.field input[type="number"] { width: 90px; }

	.btn-primary {
		font-family: inherit; font-size: 14px; font-weight: 700; color: #fff;
		background: var(--accent); border: none; border-radius: 8px; padding: 9px 18px;
	}
	.btn-primary:hover { background: var(--accent-hover); }

	.year-block { margin-bottom: 22px; }
	.year-block h2 { font-size: 16px; font-weight: 800; margin: 0 0 10px; color: #7B3803; }
	.rows { display: flex; flex-direction: column; gap: 8px; }
	.row {
		display: flex; align-items: center; gap: 10px;
		background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px;
	}
	.row-name { flex: 1; }
	.row-index { display: flex; align-items: center; gap: 6px; }
	.idx-label { font-size: 12px; font-weight: 700; color: #A88B52; }
	.idx-input { width: 80px; }

	.btn-save {
		font-family: inherit; font-size: 13px; font-weight: 700; color: #7B3803;
		background: #FFE6A5; border: none; border-radius: 8px; padding: 8px 14px;
	}
	.btn-save:hover { background: #F8D97F; }
	.btn-del {
		font-family: inherit; font-size: 13px; font-weight: 800; color: #A1A1AA;
		background: #F4F4F5; border: none; border-radius: 8px; padding: 8px 11px;
	}
	.btn-del:hover { background: #FEF2F2; color: #dc2626; }

	.empty { color: #A1A1AA; font-size: 14px; }
</style>
