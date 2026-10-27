<script>
	// Deliberately tiny Markdown editor: a textarea + a few toolbar buttons +
	// live preview. Supports only H1–H3, bullets and numbered lists, paragraphs, links, bold/italic
	// (see $lib/markdown.js). No WYSIWYG, so nothing messy can be pasted in.
	import { mdToHtml } from '$lib/markdown.js';

	let { value = $bindable(''), placeholder = 'Write the long description…', onchange = null } = $props();
	let el = $state(null);
	let tab = $state('write'); // 'write' | 'preview'
	const html = $derived(mdToHtml(value));

	function replaceRange(start, end, text, caret) {
		value = value.slice(0, start) + text + value.slice(end);
		requestAnimationFrame(() => {
			if (!el) return;
			el.focus();
			const pos = start + (caret ?? text.length);
			el.selectionStart = el.selectionEnd = pos;
		});
	}
	function wrap(before, after) {
		const s = el.selectionStart, e = el.selectionEnd;
		const sel = value.slice(s, e) || 'text';
		replaceRange(s, e, before + sel + after, (before + sel + after).length);
	}
	function linePrefix(prefix) {
		const s = el.selectionStart;
		const lineStart = value.lastIndexOf('\n', s - 1) + 1;
		replaceRange(lineStart, lineStart, prefix, prefix.length + (s - lineStart));
	}
	// ── Link modal (web URL or product shortcode) ──────────────────────────────
	let linkOpen = $state(false);
	let linkText = $state('');
	let linkKind = $state('url');   // 'url' | 'product'
	let linkUrl = $state('https://');
	let linkSku = $state('');
	let linkSel = { start: 0, end: 0 };
	function openLink() {
		const s = el?.selectionStart ?? value.length, e = el?.selectionEnd ?? value.length;
		linkSel = { start: s, end: e };
		linkText = value.slice(s, e);     // selected text → link text
		linkKind = 'url'; linkUrl = 'https://'; linkSku = '';
		linkOpen = true;
	}
	const linkValid = $derived(linkKind === 'product'
		? !!linkSku.trim()
		: /^(https?:\/\/.+|mailto:.+|\/.+)/i.test(linkUrl.trim()));
	function insertLink() {
		if (!linkValid) return;
		const text = (linkText.trim() || (linkKind === 'product' ? 'product' : 'link'));
		const target = linkKind === 'product' ? `sku:${linkSku.trim()}` : linkUrl.trim();
		const md = `[${text}](${target})`;
		linkOpen = false;
		replaceRange(linkSel.start, linkSel.end, md, md.length);
		onchange?.(value);
	}
</script>

<div class="md">
	<div class="md-bar">
		<div class="tools" class:dim={tab !== 'write'}>
			<button type="button" title="Heading 1" onclick={() => linePrefix('# ')}>H1</button>
			<button type="button" title="Heading 2" onclick={() => linePrefix('## ')}>H2</button>
			<button type="button" title="Heading 3" onclick={() => linePrefix('### ')}>H3</button>
			<span class="div"></span>
			<button type="button" title="Bullet" onclick={() => linePrefix('- ')}>• List</button>
			<button type="button" class="b" title="Bold" onclick={() => wrap('**', '**')}>B</button>
			<button type="button" class="i" title="Italic" onclick={() => wrap('*', '*')}>i</button>
			<button type="button" title="Link" onclick={openLink}>🔗 Link</button>
		</div>
		<div class="tabs">
			<button type="button" class:on={tab === 'write'} onclick={() => (tab = 'write')}>Write</button>
			<button type="button" class:on={tab === 'preview'} onclick={() => (tab = 'preview')}>Preview</button>
		</div>
	</div>
	{#if tab === 'write'}
		<textarea bind:this={el} bind:value {placeholder} onblur={() => onchange?.(value)} rows="10"></textarea>
	{:else}
		<div class="preview">{#if html}{@html html}{:else}<p class="empty">Nothing to preview.</p>{/if}</div>
	{/if}
</div>

{#if linkOpen}
	<div class="lm-overlay" role="presentation" onpointerdown={(e) => e.target === e.currentTarget && (linkOpen = false)}>
		<div class="lm" role="dialog" aria-modal="true" aria-label="Insert link">
			<h3>Insert link</h3>
			<label class="lm-fld"><span>Link text</span>
				<input bind:value={linkText} placeholder="Text to show" />
			</label>
			<div class="lm-kind">
				<button type="button" class:on={linkKind === 'url'} onclick={() => (linkKind = 'url')}>Web URL</button>
				<button type="button" class:on={linkKind === 'product'} onclick={() => (linkKind = 'product')}>Product</button>
			</div>
			{#if linkKind === 'product'}
				<label class="lm-fld"><span>Product SKU</span>
					<input bind:value={linkSku} placeholder="e.g. LPFI403" onkeydown={(e) => e.key === 'Enter' && insertLink()} />
				</label>
				<p class="lm-hint">Links to this product in the webshop. Inserts <code>[text](sku:{linkSku.trim() || 'SKU'})</code></p>
			{:else}
				<label class="lm-fld"><span>URL</span>
					<input bind:value={linkUrl} placeholder="https://…" onkeydown={(e) => e.key === 'Enter' && insertLink()} />
				</label>
			{/if}
			<div class="lm-foot">
				<button type="button" class="lm-ghost" onclick={() => (linkOpen = false)}>Cancel</button>
				<button type="button" class="lm-primary" disabled={!linkValid} onclick={insertLink}>Insert link</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.md { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: #fff; }
	.md-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 8px; border-bottom: 1px solid var(--border); background: #FBF7EF; flex-wrap: wrap; }
	.tools { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
	.tools.dim { opacity: 0.4; pointer-events: none; }
	.tools button, .tabs button { font-family: inherit; font-size: 12.5px; font-weight: 700; color: #6b5e4e; background: #fff; border: 1px solid var(--border); border-radius: 7px; padding: 4px 9px; cursor: pointer; }
	.tools button:hover { border-color: #F57832; color: #B15A12; }
	.tools .b { font-weight: 800; } .tools .i { font-style: italic; }
	.div { width: 1px; height: 18px; background: var(--border); margin: 0 4px; }
	.tabs { display: inline-flex; gap: 4px; }
	.tabs button.on { background: #18181B; color: #fff; border-color: #18181B; }
	textarea { width: 100%; box-sizing: border-box; border: none; outline: none; padding: 12px 14px; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 13px; line-height: 1.6; color: #18181B; resize: vertical; min-height: 180px; }
	.preview { padding: 14px 16px; min-height: 180px; font-size: 14px; line-height: 1.65; color: #27272A; }
	.preview :global(h2) { font-size: 20px; font-weight: 800; margin: 12px 0 6px; }
	.preview :global(h3) { font-size: 16px; font-weight: 800; margin: 12px 0 6px; }
	.preview :global(h4) { font-size: 14px; font-weight: 800; margin: 10px 0 6px; text-transform: uppercase; letter-spacing: 0.3px; color: #52525B; }
	.preview :global(p) { margin: 0 0 10px; }
	.preview :global(ul), .preview :global(ol) { margin: 0 0 10px; padding-left: 20px; }
	.preview :global(li) { margin: 2px 0; }
	.preview :global(a) { color: #B15A12; }
	.preview :global(a.md-product) { display: inline-flex; align-items: center; gap: 3px; font-weight: 700; color: #B15A12; background: #FBF4E2; border: 1px solid #F0E3C0; border-radius: 6px; padding: 0 6px; text-decoration: none; }
	.preview :global(a.md-product)::before { content: '📦'; font-size: 0.85em; }
	.preview .empty { color: #A1A1AA; }

	/* Link modal */
	.lm-overlay { position: fixed; inset: 0; background: rgba(24,24,27,0.5); display: flex; align-items: center; justify-content: center; z-index: 70; padding: 20px; }
	.lm { background: #fff; border-radius: 14px; width: 100%; max-width: 420px; padding: 18px 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
	.lm h3 { margin: 0 0 12px; font-size: 15px; font-weight: 800; color: #18181B; }
	.lm-fld { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
	.lm-fld span { font-size: 11px; font-weight: 700; color: #8a7550; }
	.lm-fld input { font-size: 13px; font-family: inherit; color: #18181B; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
	.lm-fld input:focus { outline: none; border-color: #F57832; box-shadow: 0 0 0 3px rgba(245,120,50,0.12); }
	.lm-kind { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 12px; }
	.lm-kind button { font-size: 12px; font-weight: 700; font-family: inherit; padding: 6px 14px; background: #fff; color: #71717A; border: none; cursor: pointer; }
	.lm-kind button + button { border-left: 1px solid var(--border); }
	.lm-kind button.on { background: #F57832; color: #fff; }
	.lm-hint { font-size: 11.5px; color: #A1A1AA; margin: -4px 0 12px; }
	.lm-hint code { background: #F4F4F5; padding: 1px 5px; border-radius: 4px; color: #52525B; }
	.lm-foot { display: flex; justify-content: flex-end; gap: 8px; }
	.lm-foot button { font-size: 13px; font-weight: 700; font-family: inherit; border-radius: 9px; padding: 8px 14px; cursor: pointer; border: 1px solid var(--border); }
	.lm-ghost { background: #fff; color: #52525B; }
	.lm-primary { background: #F57832; border-color: #F57832; color: #fff; }
	.lm-primary:disabled { opacity: 0.5; cursor: default; }
</style>
