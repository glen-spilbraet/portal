<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const LANG_NAMES = /** @type {Record<string, string>} */ ({ da: 'Dansk', sv: 'Svenska', no: 'Norsk', en: 'English', pl: 'Polski' });
	/** @param {Record<string, string>} labels */
	const title = (labels) => labels.da || labels.en || Object.values(labels)[0] || '(unnamed)';
	/** Other languages as "sv · no · en". @param {Record<string, string>} labels */
	const others = (labels) => data.langs.filter((l) => l !== 'da' && labels[l]).map((l) => `${l.toUpperCase()}: ${labels[l]}`).join(' · ');

	/**
	 * The one modal for creating/editing groups and categories.
	 * @type {{ kind: 'group' | 'category', id: string, groupId: string, labels: Record<string, string>, position: number, heading: string } | null}
	 */
	let modal = $state(null);

	function newGroup() {
		modal = { kind: 'group', id: '', groupId: '', labels: {}, position: data.groups.length + 1, heading: 'New category group' };
	}
	/** @param {any} g */
	function editGroup(g) {
		modal = { kind: 'group', id: g.id, groupId: '', labels: { ...g.labels }, position: g.position, heading: `Edit group “${title(g.labels)}”` };
	}
	/** @param {any} g */
	function newCategory(g) {
		modal = { kind: 'category', id: '', groupId: g.id, labels: {}, position: g.categories.length + 1, heading: `New category in “${title(g.labels)}”` };
	}
	/** @param {any} g @param {any} c */
	function editCategory(g, c) {
		modal = { kind: 'category', id: c.id, groupId: g.id, labels: { ...c.labels }, position: c.position, heading: `Edit category “${title(c.labels)}”` };
	}

	/** Close the modal after a successful save; keep it open to show errors. @type {import('@sveltejs/kit').SubmitFunction} */
	const submitModal = () => async ({ result, update }) => {
		await update();
		if (result.type === 'success') modal = null;
	};

	/** @param {SubmitEvent} e @param {string} what */
	function confirmDelete(e, what) {
		if (!confirm(`Delete ${what}?`)) e.preventDefault();
	}

	let skuInput = $state(data.product?.sku ?? '');
</script>

<svelte:head><title>Categories · Admin</title></svelte:head>

<AppNav active="categories" user={data.user} />

<main class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">Categories</h1>
			<p class="page-sub">Category groups (e.g. Game type) with their categories, translated per language. The B2B shop shows them as filters.</p>
		</div>
		<button class="btn-primary" onclick={newGroup}>+ New group</button>
	</div>

	{#if form?.error && !modal}<p class="msg bad">{form.error}</p>{/if}
	{#if form?.ok}<p class="msg ok">{form.ok}</p>{/if}

	{#each data.groups as g (g.id)}
		<section class="card group">
			<header class="group-head">
				<div>
					<h2>{title(g.labels)}</h2>
					{#if others(g.labels)}<p class="tr">{others(g.labels)}</p>{/if}
				</div>
				<div class="row-actions">
					<button class="btn-sm" onclick={() => newCategory(g)}>+ Category</button>
					<button class="btn-sm" onclick={() => editGroup(g)}>Edit</button>
					<form method="POST" action="?/delete" use:enhance onsubmit={(e) => confirmDelete(e, `group “${title(g.labels)}” and all its categories`)}>
						<input type="hidden" name="type" value="group" /><input type="hidden" name="id" value={g.id} />
						<button class="btn-del">Delete</button>
					</form>
				</div>
			</header>

			{#if g.categories.length}
				<table>
					<thead><tr><th>Category</th><th>Translations</th><th class="num">Products</th><th></th></tr></thead>
					<tbody>
						{#each g.categories as c (c.id)}
							<tr>
								<td class="name">{title(c.labels)}</td>
								<td class="tr">{others(c.labels) || '—'}</td>
								<td class="num">{c.count}</td>
								<td class="actions">
									<div class="row-actions">
										<button class="btn-sm" onclick={() => editCategory(g, c)}>Edit</button>
										<form method="POST" action="?/delete" use:enhance onsubmit={(e) => confirmDelete(e, `“${title(c.labels)}”`)}>
											<input type="hidden" name="type" value="category" /><input type="hidden" name="id" value={c.id} />
											<button class="btn-del">Delete</button>
										</form>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="empty">No categories yet. <button class="link" onclick={() => newCategory(g)}>Add the first one</button></p>
			{/if}
		</section>
	{:else}
		<section class="card group"><p class="empty">No category groups yet. <button class="link" onclick={newGroup}>Create the first group</button></p></section>
	{/each}

	<h2 class="section-title">Categories per product</h2>
	<form method="GET" class="lookup">
		<input class="search" name="sku" placeholder="SKU, e.g. LPFI852" bind:value={skuInput} />
		<button class="btn-ghost">Open</button>
	</form>

	{#if data.product}
		<section class="card group">
			<h3>{data.product.sku}{#if data.product.name} <span class="muted">— {data.product.name}</span>{/if}</h3>
			{#if data.groups.length === 0}
				<p class="empty">Create a group with categories first.</p>
			{:else}
				<form method="POST" action="?/product" use:enhance>
					<input type="hidden" name="sku" value={data.product.sku} />
					{#each data.groups as g (g.id)}
						<fieldset>
							<legend>{title(g.labels)}</legend>
							{#each g.categories as c (c.id)}
								<label class="check"><input type="checkbox" name="category" value={c.id} checked={data.product.selected.includes(c.id)} /> {title(c.labels)}</label>
							{:else}<span class="empty">No categories yet</span>{/each}
						</fieldset>
					{/each}
					<button class="btn-primary">Save categories</button>
				</form>
			{/if}
		</section>
	{/if}
</main>

{#if modal}
	<div class="backdrop" onclick={() => (modal = null)} role="presentation"></div>
	<div class="modal" role="dialog" aria-modal="true" aria-label={modal.heading}>
		<form method="POST" action={modal.kind === 'group' ? '?/saveGroup' : '?/saveCategory'} use:enhance={submitModal}>
			<div class="modal-head"><h2>{modal.heading}</h2><button type="button" class="x" onclick={() => (modal = null)}>✕</button></div>
			<div class="modal-body">
				<input type="hidden" name="id" value={modal.id} />
				{#if modal.kind === 'category'}<input type="hidden" name="group_id" value={modal.groupId} />{/if}
				{#if form?.error}<p class="msg bad">{form.error}</p>{/if}
				{#each data.langs as lang}
					<label class="field">
						<span>{LANG_NAMES[lang]}</span>
						<input name={`label_${lang}`} value={modal.labels[lang] ?? ''} placeholder={lang === 'en' ? (modal.kind === 'group' ? 'e.g. Game type' : 'e.g. Strategy') : ''} />
					</label>
				{/each}
				<label class="field small">
					<span>Order</span>
					<input name="position" type="number" value={modal.position} />
				</label>
				<p class="hint">Danish or English is required; the shop shows the label in each market's language.</p>
			</div>
			<div class="modal-foot">
				<button type="button" class="btn-ghost" onclick={() => (modal = null)}>Cancel</button>
				<button class="btn-primary">{modal.id ? 'Save' : 'Create'}</button>
			</div>
		</form>
	</div>
{/if}

<style>
	.page { max-width: 940px; margin: 0 auto; padding: 40px 28px 80px; }
	.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
	.page-title { font-size: 26px; font-weight: 800; color: #18181B; letter-spacing: -0.5px; margin: 0 0 4px; }
	.page-sub { font-size: 14px; color: #A89060; font-weight: 500; margin: 0; }
	.section-title { font-size: 18px; font-weight: 800; margin: 36px 0 10px; color: #18181B; }

	.card { background: #fff; border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
	.group { margin-bottom: 14px; }
	.group-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 18px; background: #FFFBF0; border-bottom: 1px solid var(--border); }
	.group-head h2 { margin: 0; font-size: 16px; font-weight: 800; color: #7B3803; }
	.tr { margin: 2px 0 0; font-size: 12px; color: #A89060; }
	table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
	thead th { text-align: left; color: #A89060; font-weight: 700; font-size: 12px; padding: 9px 18px; border-bottom: 1px solid #F5EDD8; }
	tbody td { padding: 9px 18px; border-bottom: 1px solid #F5EDD8; color: #3f3a33; vertical-align: middle; }
	tbody tr:last-child td { border-bottom: none; }
	td.name { font-weight: 700; color: #18181B; }
	th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
	td.actions { width: 1%; white-space: nowrap; }
	.row-actions { display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
	.empty { color: #A1A1AA; font-size: 13px; padding: 14px 18px; margin: 0; }
	.link { border: 0; background: none; color: #F57832; font-weight: 700; cursor: pointer; padding: 0; font: inherit; }

	.lookup { display: flex; gap: 8px; margin-bottom: 12px; }
	.search { flex: 1; max-width: 340px; padding: 9px 14px; border: 1px solid var(--border); border-radius: 9px; font-size: 14px; font-family: inherit; outline: none; background: #FFFBF0; }
	.search:focus { border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); background: #fff; }
	h3 { margin: 0; padding: 14px 18px 0; font-size: 16px; }
	.muted { color: #A89060; font-weight: 600; }
	fieldset { border: 0; padding: 0 18px; margin: 14px 0; display: flex; flex-wrap: wrap; gap: 6px 18px; }
	legend { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #7B3803; margin-bottom: 6px; padding: 0 18px; }
	.check { display: flex; gap: 6px; align-items: center; font-size: 14px; }
	.check input { accent-color: #F57832; }
	form > .btn-primary { margin: 4px 18px 18px; }

	.msg { padding: 10px 14px; border-radius: 10px; font-weight: 700; font-size: 13px; margin: 0 0 12px; }
	.msg.ok { background: #DCFCE7; color: #15803D; }
	.msg.bad { background: #FEF2F2; color: #b91c1c; }

	.btn-primary { padding: 9px 16px; background: #F57832; color: #fff; border: none; border-radius: 9px; font-size: 14px; font-weight: 700; font-family: inherit; cursor: pointer; white-space: nowrap; }
	.btn-ghost { padding: 9px 16px; background: #fff; border: 1px solid var(--border); border-radius: 9px; font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer; white-space: nowrap; }
	.btn-sm { padding: 5px 11px; background: #fff; border: 1px solid var(--border); border-radius: 8px; font-size: 12px; font-weight: 700; font-family: inherit; cursor: pointer; color: #18181B; white-space: nowrap; }
	.btn-sm:hover { background: #FAFAFA; }
	.btn-del { padding: 5px 11px; border: 1px solid #fecaca; color: #dc2626; background: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
	.btn-del:hover { background: #FEF2F2; }

	.backdrop { position: fixed; inset: 0; background: rgba(40,25,0,0.35); z-index: 300; }
	.modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 310; width: min(520px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; background: #fff; border-radius: 16px; box-shadow: 0 24px 60px rgba(50,30,0,0.28); }
	.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
	.modal-head h2 { font-size: 15px; font-weight: 800; margin: 0; color: #18181B; }
	.x { border: 0; background: none; font-size: 16px; cursor: pointer; color: #A1A1AA; }
	.modal-body { padding: 18px 20px; display: grid; gap: 12px; }
	.modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--border); }
	.field { display: grid; grid-template-columns: 90px 1fr; align-items: center; gap: 12px; }
	.field span { font-size: 13px; font-weight: 700; color: #7B3803; }
	.field input { padding: 9px 12px; border: 1px solid var(--border); border-radius: 9px; font-size: 14px; font-family: inherit; background: #FFFBF0; }
	.field input:focus { outline: none; border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); background: #fff; }
	.field.small input { width: 90px; }
	.hint { margin: 2px 0 0; font-size: 12px; color: #A89060; }
</style>
