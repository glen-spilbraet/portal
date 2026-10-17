<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
	const LANG_NAMES = /** @type {Record<string, string>} */ ({ da: 'Dansk', sv: 'Svenska', no: 'Norsk', en: 'English', pl: 'Polski' });
	/** @param {Record<string, string>} labels */
	const title = (labels) => labels.da || labels.en || Object.values(labels)[0] || '(unnamed)';
	let skuInput = $state(data.product?.sku ?? '');
</script>

<svelte:head><title>Categories · Admin</title></svelte:head>

<div class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">Categories</h1>
			<p class="page-sub">Category groups (e.g. Game type) and their categories, translated per language. The B2B shop shows them as filters.</p>
		</div>
	</div>

	{#if form?.error}<p class="msg bad">{form.error}</p>{/if}
	{#if form?.ok}<p class="msg ok">{form.ok}</p>{/if}

	{#each data.groups as g (g.id)}
		<section class="card group">
			<form method="POST" action="?/save" use:enhance class="labels head">
				<input type="hidden" name="type" value="group" /><input type="hidden" name="id" value={g.id} />
				<span class="kind">Group</span>
				{#each data.langs as lang}
					<label><small>{LANG_NAMES[lang]}</small><input name={`label_${lang}`} value={g.labels[lang] ?? ''} /></label>
				{/each}
				<label class="pos"><small>Order</small><input name="position" type="number" value={g.position} /></label>
				<button class="btn-sm">Save</button>
			</form>
			<form method="POST" action="?/delete" use:enhance class="del" onsubmit={(e) => { if (!confirm(`Delete group “${title(g.labels)}” and all its categories?`)) e.preventDefault(); }}>
				<input type="hidden" name="type" value="group" /><input type="hidden" name="id" value={g.id} />
				<button class="btn-del">Delete group</button>
			</form>

			<div class="cats">
				{#each g.categories as c (c.id)}
					<div class="cat">
						<form method="POST" action="?/save" use:enhance class="labels">
							<input type="hidden" name="type" value="category" /><input type="hidden" name="id" value={c.id} />
							{#each data.langs as lang}
								<label><small>{LANG_NAMES[lang]}</small><input name={`label_${lang}`} value={c.labels[lang] ?? ''} /></label>
							{/each}
							<label class="pos"><small>Order</small><input name="position" type="number" value={c.position} /></label>
							<span class="count" title="Products with this category">{c.count}</span>
							<button class="btn-sm">Save</button>
						</form>
						<form method="POST" action="?/delete" use:enhance onsubmit={(e) => { if (!confirm(`Delete “${title(c.labels)}”?`)) e.preventDefault(); }}>
							<input type="hidden" name="type" value="category" /><input type="hidden" name="id" value={c.id} />
							<button class="btn-del">Delete</button>
						</form>
					</div>
				{/each}
				<form method="POST" action="?/addCategory" use:enhance class="labels add">
					<input type="hidden" name="group_id" value={g.id} />
					<span class="kind">New category</span>
					{#each data.langs as lang}
						<label><small>{LANG_NAMES[lang]}</small><input name={`label_${lang}`} /></label>
					{/each}
					<label class="pos"><small>Order</small><input name="position" type="number" value={g.categories.length + 1} /></label>
					<button class="btn-primary">Add</button>
				</form>
			</div>
		</section>
	{/each}

	<section class="card group">
		<form method="POST" action="?/addGroup" use:enhance class="labels add">
			<span class="kind">New group</span>
			{#each data.langs as lang}
				<label><small>{LANG_NAMES[lang]}</small><input name={`label_${lang}`} placeholder={lang === 'en' ? 'e.g. Game type' : ''} /></label>
			{/each}
			<label class="pos"><small>Order</small><input name="position" type="number" value={data.groups.length + 1} /></label>
			<button class="btn-primary">Add group</button>
		</form>
	</section>

	<h2 class="section-title">Categories per product</h2>
	<form method="GET" class="lookup">
		<input class="search" name="sku" placeholder="SKU, e.g. LPFI852" bind:value={skuInput} />
		<button class="btn-ghost">Open</button>
	</form>

	{#if data.product}
		<section class="card group">
			<h3>{data.product.sku}{#if data.product.name} — {data.product.name}{/if}</h3>
			{#if data.groups.length === 0}
				<p class="none">Create a group with categories first.</p>
			{:else}
				<form method="POST" action="?/product" use:enhance>
					<input type="hidden" name="sku" value={data.product.sku} />
					{#each data.groups as g (g.id)}
						<fieldset>
							<legend>{title(g.labels)}</legend>
							{#each g.categories as c (c.id)}
								<label class="check"><input type="checkbox" name="category" value={c.id} checked={data.product.selected.includes(c.id)} /> {title(c.labels)}</label>
							{:else}<span class="none">No categories yet</span>{/each}
						</fieldset>
					{/each}
					<button class="btn-primary">Save categories</button>
				</form>
			{/if}
		</section>
	{/if}
</div>

<style>
	.page { max-width: 1100px; margin: 0 auto; padding: 40px 28px 80px; }
	.page-header { margin-bottom: 18px; }
	.page-title { font-size: 26px; font-weight: 800; color: #18181B; letter-spacing: -0.5px; margin: 0 0 4px; }
	.page-sub { font-size: 14px; color: #A89060; font-weight: 500; margin: 0; }
	.section-title { font-size: 18px; font-weight: 800; margin: 36px 0 10px; }
	.card { background: #fff; border: 1px solid var(--border); border-radius: 14px; }
	.group { padding: 16px 18px; margin-bottom: 14px; position: relative; }
	.labels { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
	.labels label { display: grid; gap: 2px; flex: 1; min-width: 110px; }
	.labels label.pos { flex: 0 0 70px; min-width: 70px; }
	.labels small { font-size: 11px; font-weight: 700; color: #A89060; }
	.labels input { padding: 7px 10px; border: 1px solid var(--border); border-radius: 8px; font: inherit; font-size: 13px; background: #FFFBF0; }
	.labels input:focus { outline: none; border-color: #F57832; background: #fff; }
	.head input { font-weight: 800; }
	.kind { flex-basis: 100%; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #7B3803; }
	.del { position: absolute; top: 14px; right: 18px; }
	.cats { margin: 14px 0 0 18px; padding-left: 14px; border-left: 3px solid #FBEFCB; display: grid; gap: 10px; }
	.cat { display: flex; gap: 8px; align-items: flex-end; }
	.cat .labels { flex: 1; }
	.count { align-self: center; min-width: 28px; text-align: center; font-size: 12px; font-weight: 800; color: #7B3803; background: #FBEFCB; border-radius: 100px; padding: 2px 8px; }
	.add { padding-top: 6px; }
	.lookup { display: flex; gap: 8px; margin-bottom: 12px; }
	.search { flex: 1; max-width: 340px; padding: 9px 14px; border: 1px solid var(--border); border-radius: 9px; font-size: 14px; font-family: inherit; background: #FFFBF0; }
	h3 { margin: 0 0 12px; font-size: 16px; }
	fieldset { border: 0; padding: 0; margin: 0 0 14px; display: flex; flex-wrap: wrap; gap: 6px 16px; }
	legend { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #7B3803; margin-bottom: 6px; width: 100%; }
	.check { display: flex; gap: 6px; align-items: center; font-size: 14px; }
	.check input { accent-color: #F57832; }
	.none { color: #C4B998; font-size: 13px; font-style: italic; }
	.msg { padding: 10px 14px; border-radius: 10px; font-weight: 700; font-size: 13px; }
	.msg.ok { background: #DCFCE7; color: #15803D; }
	.msg.bad { background: #FEF2F2; color: #b91c1c; }
	.btn-primary { padding: 8px 14px; background: #F57832; color: #fff; border: none; border-radius: 9px; font-size: 13px; font-weight: 700; font-family: inherit; cursor: pointer; white-space: nowrap; }
	.btn-ghost { padding: 9px 16px; background: #fff; border: 1px solid var(--border); border-radius: 9px; font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; }
	.btn-sm { padding: 7px 12px; background: #fff; border: 1px solid var(--border); border-radius: 8px; font-size: 12px; font-weight: 700; font-family: inherit; cursor: pointer; }
	.btn-del { padding: 6px 11px; border: 1px solid #fecaca; color: #dc2626; background: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
</style>
