<script>
	import { LANG_LABELS, langShort } from '$lib/languages.js';
	import AppNav from '$lib/components/AppNav.svelte';
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	/** @param {Record<string, any>} labels */
	const title = (labels) => labels.en?.name || labels.da?.name || Object.values(labels)[0]?.name || '(unnamed)';

	/** @type {{ id: string, labels: Record<string, any>, position: number, heading: string } | null} */
	let modal = $state(null);

	function newType() {
		modal = { id: '', labels: {}, position: data.types.length + 1, heading: 'New relation type' };
	}
	/** @param {any} t */
	function editType(t) {
		modal = { id: t.id, labels: structuredClone(t.labels), position: t.position, heading: `Edit “${title(t.labels)}”` };
	}

	/** @type {import('@sveltejs/kit').SubmitFunction} */
	const submitModal = () => async ({ result, update }) => {
		await update();
		if (result.type === 'success') modal = null;
	};

	/** @param {SubmitEvent} e @param {any} t */
	function confirmDelete(e, t) {
		if (!confirm(`Delete “${title(t.labels)}”${t.count ? ` and its ${t.count} link${t.count === 1 ? '' : 's'}` : ''}?`)) e.preventDefault();
	}

	const PH = /** @type {Record<string, [string, string, string]>} */ ({
		en: ['Expansion', 'Expansion for', 'Expansions'],
		da: ['Udvidelse', 'Udvidelse til', 'Udvidelser']
	});
</script>

<svelte:head><title>Relations · Admin</title></svelte:head>

<AppNav active="relations" user={data.user} />

<main class="page">
	<div class="page-header">
		<h1 class="page-title">Relations</h1>
		<button class="btn-primary" onclick={newType}>+ New type</button>
	</div>

	{#if form?.error && !modal}<p class="msg bad">{form.error}</p>{/if}
	{#if form?.ok}<p class="msg ok">{form.ok}</p>{/if}

	<section class="card">
		{#if data.types.length}
			<table>
				<thead>
					<tr>
						<th>Type</th>
						<th>Language</th><th>Name</th>
						<th>On the add-on <span class="info" title="Shown on e.g. the expansion, before the products it fits: “Expansion for Catan”">ⓘ</span></th>
						<th>On the main product <span class="info" title="Heading on e.g. the base game, above the products that fit it: “Expansions”">ⓘ</span></th>
						<th class="num">Links</th><th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.types as t (t.id)}
						{#each data.langs as lang, i}
							{@const l = t.labels[lang]}
							<tr class:first={i === 0}>
								{#if i === 0}<td class="name" rowspan={data.langs.length}>{title(t.labels)}<span class="id">{t.id}</span></td>{/if}
								<td class="lang">{langShort(lang)}</td>
								<td class:missing={!l}>{l?.name ?? '—'}</td>
								<td class:missing={!l?.forward}>{l?.forward ?? '—'}</td>
								<td class:missing={!l?.inverse}>{l?.inverse ?? '—'}</td>
								{#if i === 0}
									<td class="num" rowspan={data.langs.length}>{t.count}</td>
									<td class="actions" rowspan={data.langs.length}>
										<div class="row-actions">
											<button class="btn-sm" onclick={() => editType(t)}>Edit</button>
											<form method="POST" action="?/delete" use:enhance onsubmit={(e) => confirmDelete(e, t)}>
												<input type="hidden" name="id" value={t.id} />
												<button class="btn-del">Delete</button>
											</form>
										</div>
									</td>
								{/if}
							</tr>
						{/each}
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="empty">No relation types yet. <button class="link" onclick={newType}>Create the first one</button></p>
		{/if}
	</section>
</main>

{#if modal}
	<div class="backdrop" onclick={() => (modal = null)} role="presentation"></div>
	<div class="modal" role="dialog" aria-modal="true" aria-label={modal.heading}>
		<form method="POST" action="?/save" use:enhance={submitModal}>
			<div class="modal-head"><h2>{modal.heading}</h2><button type="button" class="x" onclick={() => (modal = null)}>✕</button></div>
			<div class="modal-body">
				<input type="hidden" name="id" value={modal.id} />
				{#if form?.error}<p class="msg bad">{form.error}</p>{/if}
				<div class="grid">
					<span></span><span class="col">Name</span><span class="col">On the add-on</span><span class="col">On the main product</span>
					{#each data.langs as lang}
						<span class="lname">{LANG_LABELS[lang]}</span>
						<input name={`name_${lang}`} value={modal.labels[lang]?.name ?? ''} placeholder={PH[lang]?.[0] ?? ''} />
						<input name={`forward_${lang}`} value={modal.labels[lang]?.forward ?? ''} placeholder={PH[lang]?.[1] ?? ''} />
						<input name={`inverse_${lang}`} value={modal.labels[lang]?.inverse ?? ''} placeholder={PH[lang]?.[2] ?? ''} />
					{/each}
				</div>
				<label class="field small">
					<span>Order</span>
					<input name="position" type="number" value={modal.position} />
				</label>
			</div>
			<div class="modal-foot">
				<button type="button" class="btn-ghost" onclick={() => (modal = null)}>Cancel</button>
				<button class="btn-primary">{modal.id ? 'Save' : 'Create'}</button>
			</div>
		</form>
	</div>
{/if}

<style>
	.page { max-width: 1200px; margin: 0 auto; padding: 40px 28px 80px; }
	.page-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
	.page-title { font-size: 26px; font-weight: 800; color: #18181B; letter-spacing: -0.5px; margin: 0; }

	.card { background: #fff; border: 1px solid var(--border); border-radius: 14px; overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
	thead th { text-align: left; color: #A89060; font-weight: 700; font-size: 12px; padding: 9px 14px; border-bottom: 1px solid #F5EDD8; white-space: nowrap; }
	tbody td { padding: 5px 14px; color: #3f3a33; vertical-align: middle; }
	tbody tr.first td { border-top: 1px solid #F5EDD8; padding-top: 10px; }
	tbody tr:first-child td { border-top: none; }
	td.name { font-weight: 800; color: #18181B; vertical-align: top; padding-top: 10px; }
	td.name .id { display: block; font-size: 11px; font-weight: 600; color: #A1A1AA; font-family: ui-monospace, monospace; }
	td.lang { font-size: 11px; font-weight: 800; color: #8a7550; width: 1%; }
	td.missing { color: #D4D4D8; }
	th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; vertical-align: top; }
	td.actions { width: 1%; white-space: nowrap; vertical-align: top; }
	.info { cursor: help; color: #C4B590; }
	.row-actions { display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
	.empty { color: #A1A1AA; font-size: 13px; padding: 14px 18px; margin: 0; }
	.link { border: 0; background: none; color: #F57832; font-weight: 700; cursor: pointer; padding: 0; font: inherit; }

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
	.modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 310; width: min(760px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; background: #fff; border-radius: 16px; box-shadow: 0 24px 60px rgba(50,30,0,0.28); }
	.modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
	.modal-head h2 { font-size: 15px; font-weight: 800; margin: 0; color: #18181B; }
	.x { border: 0; background: none; font-size: 16px; cursor: pointer; color: #A1A1AA; }
	.modal-body { padding: 18px 20px; display: grid; gap: 14px; }
	.modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--border); }
	.grid { display: grid; grid-template-columns: 90px repeat(3, minmax(0, 1fr)); gap: 8px 10px; align-items: center; }
	.grid .col { font-size: 11px; font-weight: 800; color: #A89060; }
	.grid .lname { font-size: 13px; font-weight: 700; color: #7B3803; }
	.grid input, .field input { padding: 8px 10px; border: 1px solid var(--border); border-radius: 9px; font-size: 13.5px; font-family: inherit; background: #FFFBF0; min-width: 0; }
	.grid input:focus, .field input:focus { outline: none; border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); background: #fff; }
	.field { display: grid; grid-template-columns: 90px 1fr; align-items: center; gap: 12px; }
	.field span { font-size: 13px; font-weight: 700; color: #7B3803; }
	.field.small input { width: 90px; }
	@media (max-width: 640px) { .grid { grid-template-columns: 1fr; } .grid .col { display: none; } }
</style>
