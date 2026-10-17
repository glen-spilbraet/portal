<script>
	// Deliberately tiny Markdown editor: a textarea + a few toolbar buttons +
	// live preview. Supports only H1–H3, bullets, paragraphs, links, bold/italic
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
	function link() {
		const s = el.selectionStart, e = el.selectionEnd;
		const sel = value.slice(s, e) || 'link text';
		const md = `[${sel}](https://)`;
		replaceRange(s, e, md, md.length);
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
			<button type="button" title="Link" onclick={link}>🔗 Link</button>
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
	.preview :global(ul) { margin: 0 0 10px; padding-left: 20px; }
	.preview :global(li) { margin: 2px 0; }
	.preview :global(a) { color: #B15A12; }
	.preview .empty { color: #A1A1AA; }
</style>
