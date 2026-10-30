<script>
	import AppNav from '$lib/components/AppNav.svelte';

	let { data } = $props();

	// Local, mutable copies (deep-reactive via $state proxies).
	let boards = $state(data.boards ?? []);
	let tasks  = $state(data.tasks ?? []);
	const users  = data.users ?? [];
	const events = data.events ?? [];

	let selectedBoardId = $state(boards[0]?.id ?? null);

	const selectedBoard = $derived(boards.find((b) => b.id === selectedBoardId) ?? null);
	const boardTasks = $derived(
		tasks.filter((t) => t.board_id === selectedBoardId)
		     .sort((a, b) => (a.position - b.position) || a.created_at?.localeCompare?.(b.created_at ?? '') || 0)
	);

	let expandedId = $state(null);
	let busy = $state(false);

	// ── Option maps (Monday-style coloured pills) ───────────────────────────────
	const STATUS_OPTS = [
		{ v: 'not_started',      label: 'Not started',          color: '#C4C7D0', fg: '#2B2B35' },
		{ v: 'working',          label: 'Working',              color: '#FDAB3D', fg: '#fff' },
		{ v: 'stuck',            label: 'Stuck',                color: '#E2445C', fg: '#fff' },
		{ v: 'waiting_approval', label: 'Waiting for Approval', color: '#A25DDC', fg: '#fff' },
		{ v: 'done',             label: 'Done',                 color: '#00C875', fg: '#fff' },
	];
	const PRIORITY_OPTS = [
		{ v: 'low',      label: 'Low',      color: '#9AA7FC', fg: '#1E2347' },
		{ v: 'medium',   label: 'Medium',   color: '#579BFC', fg: '#fff' },
		{ v: 'high',     label: 'High',     color: '#FDAB3D', fg: '#fff' },
		{ v: 'critical', label: 'Critical', color: '#E2445C', fg: '#fff' },
	];
	const statusOf   = (v) => STATUS_OPTS.find((o) => o.v === v) ?? STATUS_OPTS[0];
	const priorityOf = (v) => PRIORITY_OPTS.find((o) => o.v === v) ?? PRIORITY_OPTS[1];

	const KIND_META = {
		product:  { short: 'SKU',   color: '#0F7B6C', bg: '#DEF5F1' },
		customer: { short: 'Cust',  color: '#9A5B00', bg: '#FCEBD2' },
		event:    { short: 'Event', color: '#5A2DA8', bg: '#ECE2FB' },
	};

	const taskCount = (boardId) => tasks.filter((t) => t.board_id === boardId).length;
	const userName  = (email) => users.find((u) => u.email === email)?.name ?? email;

	// ── API helper ──────────────────────────────────────────────────────────────
	async function api(url, method = 'GET', body) {
		const res = await fetch(url, {
			method,
			headers: body ? { 'Content-Type': 'application/json' } : undefined,
			body: body ? JSON.stringify(body) : undefined,
		});
		const out = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(out.message ?? 'Request failed');
		return out;
	}

	// ── Boards ──────────────────────────────────────────────────────────────────
	async function addBoard() {
		busy = true;
		try {
			const { id, name } = await api('/api/tasks/boards', 'POST', { name: 'New board' });
			boards = [...boards, { id, name, position: boards.length, archived: 0 }];
			selectedBoardId = id;
		} finally { busy = false; }
	}

	async function renameBoard(board, name) {
		if (!name || name === board.name) return;
		board.name = name;
		await api(`/api/tasks/boards/${board.id}`, 'PUT', { name });
	}

	async function removeBoard(board) {
		if (!confirm(`Delete board "${board.name}" and all of its tasks? This cannot be undone.`)) return;
		await api(`/api/tasks/boards/${board.id}`, 'DELETE');
		boards = boards.filter((b) => b.id !== board.id);
		tasks  = tasks.filter((t) => t.board_id !== board.id);
		if (selectedBoardId === board.id) selectedBoardId = boards[0]?.id ?? null;
	}

	// ── Tasks ───────────────────────────────────────────────────────────────────
	async function addTask() {
		if (!selectedBoardId) return;
		busy = true;
		try {
			const { id } = await api('/api/tasks', 'POST', { board_id: selectedBoardId, name: '' });
			const now = new Date().toISOString();
			tasks = [...tasks, {
				id, board_id: selectedBoardId, name: '', description: '',
				status: 'not_started', priority: 'medium', due_date: null,
				assignee_email: null, position: boardTasks.length,
				created_at: now, updated_at: now, associations: [],
			}];
			expandedId = id;
		} finally { busy = false; }
	}

	async function patchTask(task, patch) {
		Object.assign(task, patch);
		await api(`/api/tasks/${task.id}`, 'PUT', patch);
	}

	async function removeTask(task) {
		if (!confirm('Delete this task?')) return;
		await api(`/api/tasks/${task.id}`, 'DELETE');
		tasks = tasks.filter((t) => t.id !== task.id);
	}

	function commitName(task, el) {
		const v = el.value.trim();
		if (v !== (task.name ?? '')) patchTask(task, { name: v });
	}
	function commitDesc(task, el) {
		const v = el.value;
		if (v !== (task.description ?? '')) patchTask(task, { description: v });
	}

	// ── Associations + picker ────────────────────────────────────────────────────
	let picker = $state(null);          // the task whose associations we're editing
	let pickKind = $state('product');
	let pickQuery = $state('');
	let pickResults = $state([]);
	let pickLoading = $state(false);
	let pickTimer;

	function openPicker(task) {
		picker = task; pickKind = 'product'; pickQuery = ''; pickResults = []; pickLoading = false;
	}
	function closePicker() { picker = null; }

	const eventResults = $derived.by(() => {
		if (pickKind !== 'event') return [];
		const q = pickQuery.trim().toLowerCase();
		return events
			.filter((e) => !q || (e.title ?? '').toLowerCase().includes(q) || (e.date ?? '').includes(q))
			.slice(0, 40);
	});

	function onPickInput() {
		clearTimeout(pickTimer);
		if (pickKind === 'event') return;
		const q = pickQuery;
		if (q.trim().length < 2) { pickResults = []; pickLoading = false; return; }
		pickLoading = true;
		pickTimer = setTimeout(async () => {
			try {
				pickResults = await api(`/api/tasks/pickers?type=${pickKind}&q=${encodeURIComponent(q)}`);
			} catch { pickResults = []; }
			pickLoading = false;
		}, 220);
	}

	function switchKind(k) {
		pickKind = k; pickQuery = ''; pickResults = []; pickLoading = false;
	}

	async function pick(ref_id, label) {
		const task = picker;
		if (task.associations.some((a) => a.kind === pickKind && a.ref_id === String(ref_id))) return;
		const { id } = await api(`/api/tasks/${task.id}/associations`, 'POST', {
			kind: pickKind, ref_id, ref_label: label,
		});
		task.associations = [...task.associations, { id, task_id: task.id, kind: pickKind, ref_id: String(ref_id), ref_label: label }];
	}

	async function removeAssoc(task, assoc) {
		await api(`/api/tasks/associations/${assoc.id}`, 'DELETE');
		task.associations = task.associations.filter((a) => a.id !== assoc.id);
	}

	function fmtDate(d) {
		if (!d) return '';
		try { return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
		catch { return d; }
	}
</script>

<svelte:head><title>Tasks</title></svelte:head>

<div class="page">
	<AppNav active="" user={data.user} />

	<div class="workspace">
		<!-- Left: board list (room for future view types) -->
		<aside class="sidebar">
			<div class="side-head">
				<h1>Tasks</h1>
			</div>

			<div class="side-section">
				<div class="side-label">Boards</div>
				{#each boards as b (b.id)}
					<button class="board-item" class:active={b.id === selectedBoardId} onclick={() => (selectedBoardId = b.id)}>
						<span class="dot"></span>
						<span class="bi-name">{b.name}</span>
						<span class="bi-count">{taskCount(b.id)}</span>
					</button>
				{/each}
				{#if boards.length === 0}
					<div class="side-empty">No boards yet</div>
				{/if}
				<button class="add-board" onclick={addBoard} disabled={busy}>+ New board</button>
			</div>

			<div class="side-section views-stub">
				<div class="side-label">Views</div>
				<div class="side-empty">Table <span class="soon">· more soon</span></div>
			</div>
		</aside>

		<!-- Right: full-width board -->
		<main class="board-area">
			{#if !selectedBoard}
				<div class="blank">
					<p>Create your first board to get started.</p>
					<button class="btn primary" onclick={addBoard} disabled={busy}>+ New board</button>
				</div>
			{:else}
				<header class="board-head">
					<input
						class="board-title"
						value={selectedBoard.name}
						onblur={(e) => { const v = e.currentTarget.value.trim(); if (v) renameBoard(selectedBoard, v); else e.currentTarget.value = selectedBoard.name; }}
						onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
					/>
					<div class="board-meta">{boardTasks.length} {boardTasks.length === 1 ? 'task' : 'tasks'}</div>
					<div class="spacer"></div>
					<button class="btn primary" onclick={addTask} disabled={busy}>+ Add task</button>
					<button class="btn ghost danger" onclick={() => removeBoard(selectedBoard)} title="Delete board">Delete board</button>
				</header>

				<div class="table-wrap">
					<table class="tasks">
						<thead>
							<tr>
								<th class="c-exp"></th>
								<th class="c-name">Task</th>
								<th class="c-status">Status</th>
								<th class="c-prio">Priority</th>
								<th class="c-due">Due date</th>
								<th class="c-assignee">Assigned to</th>
								<th class="c-links">Linked to</th>
								<th class="c-act"></th>
							</tr>
						</thead>
						<tbody>
							{#each boardTasks as task (task.id)}
								<tr class="trow">
									<td class="c-exp">
										<button class="exp" class:open={expandedId === task.id} onclick={() => (expandedId = expandedId === task.id ? null : task.id)} aria-label="Toggle details">▸</button>
									</td>
									<td class="c-name">
										<input
											class="task-name"
											value={task.name}
											placeholder="Untitled task"
											onblur={(e) => commitName(task, e.currentTarget)}
											onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
										/>
									</td>
									<td class="c-status">
										<select class="pill" style="background-color:{statusOf(task.status).color};color:{statusOf(task.status).fg};"
											value={task.status} onchange={(e) => patchTask(task, { status: e.currentTarget.value })}>
											{#each STATUS_OPTS as o}<option value={o.v}>{o.label}</option>{/each}
										</select>
									</td>
									<td class="c-prio">
										<select class="pill" style="background-color:{priorityOf(task.priority).color};color:{priorityOf(task.priority).fg};"
											value={task.priority} onchange={(e) => patchTask(task, { priority: e.currentTarget.value })}>
											{#each PRIORITY_OPTS as o}<option value={o.v}>{o.label}</option>{/each}
										</select>
									</td>
									<td class="c-due">
										<input type="date" class="due" value={task.due_date ?? ''}
											onchange={(e) => patchTask(task, { due_date: e.currentTarget.value || null })} />
									</td>
									<td class="c-assignee">
										<select class="assignee" value={task.assignee_email ?? ''}
											onchange={(e) => patchTask(task, { assignee_email: e.currentTarget.value || null })}>
											<option value="">—</option>
											{#each users as u}<option value={u.email}>{u.name}</option>{/each}
										</select>
									</td>
									<td class="c-links">
										<div class="chips">
											{#each task.associations as a (a.id)}
												{@const m = KIND_META[a.kind]}
												<span class="chip" style="color:{m.color};background:{m.bg};">
													<span class="chip-k">{m.short}</span>
													<span class="chip-l">{a.ref_label ?? a.ref_id}</span>
													<button class="chip-x" onclick={() => removeAssoc(task, a)} aria-label="Remove">×</button>
												</span>
											{/each}
											<button class="chip-add" onclick={() => openPicker(task)}>+ Link</button>
										</div>
									</td>
									<td class="c-act">
										<button class="row-del" onclick={() => removeTask(task)} title="Delete task" aria-label="Delete task">✕</button>
									</td>
								</tr>
								{#if expandedId === task.id}
									<tr class="detail-row">
										<td></td>
										<td colspan="7">
											<div class="detail">
												<label class="det-label" for="desc-{task.id}">Description</label>
												<textarea id="desc-{task.id}" class="desc" rows="3" placeholder="Add a description…"
													value={task.description ?? ''}
													onblur={(e) => commitDesc(task, e.currentTarget)}></textarea>
												<div class="det-stamps">
													Created {fmtDate(task.created_at)} · Updated {fmtDate(task.updated_at)}
												</div>
											</div>
										</td>
									</tr>
								{/if}
							{/each}
							{#if boardTasks.length === 0}
								<tr><td colspan="8"><div class="empty-tasks">No tasks yet. <button class="linkish" onclick={addTask}>Add the first one.</button></div></td></tr>
							{/if}
						</tbody>
					</table>
				</div>
			{/if}
		</main>
	</div>
</div>

<!-- Association picker -->
{#if picker}
	<div class="overlay" onclick={closePicker} role="presentation"></div>
	<div class="pick-modal" role="dialog" aria-modal="true">
		<div class="pm-head">
			<strong>Link to task</strong>
			<button class="pm-close" onclick={closePicker} aria-label="Close">×</button>
		</div>
		<div class="pm-tabs">
			<button class:active={pickKind === 'product'}  onclick={() => switchKind('product')}>Products</button>
			<button class:active={pickKind === 'customer'} onclick={() => switchKind('customer')}>Customers</button>
			<button class:active={pickKind === 'event'}    onclick={() => switchKind('event')}>Events</button>
		</div>
		<input
			class="pm-search"
			placeholder={pickKind === 'event' ? 'Filter events…' : pickKind === 'product' ? 'Search SKU or name…' : 'Search company name…'}
			bind:value={pickQuery}
			oninput={onPickInput}
		/>
		<div class="pm-results">
			{#if pickKind === 'event'}
				{#each eventResults as e (e.id)}
					<button class="pm-item" onclick={() => pick(e.id, e.title || `Event ${e.date ?? ''}`.trim())}>
						<span class="pm-l">{e.title || 'Untitled event'}</span>
						<span class="pm-sub">{e.date ?? ''}</span>
					</button>
				{/each}
				{#if eventResults.length === 0}<div class="pm-empty">No events.</div>{/if}
			{:else}
				{#if pickLoading}<div class="pm-empty">Searching…</div>{/if}
				{#each pickResults as r (r.ref_id)}
					<button class="pm-item" onclick={() => pick(r.ref_id, r.label)}>
						<span class="pm-l">{r.label}</span>
						<span class="pm-sub">{r.ref_id}</span>
					</button>
				{/each}
				{#if !pickLoading && pickResults.length === 0 && pickQuery.trim().length >= 2}<div class="pm-empty">No matches.</div>{/if}
				{#if !pickLoading && pickQuery.trim().length < 2}<div class="pm-empty">Type at least 2 characters.</div>{/if}
			{/if}
		</div>
		{#if picker.associations.length}
			<div class="pm-current">
				{#each picker.associations as a (a.id)}
					{@const m = KIND_META[a.kind]}
					<span class="chip" style="color:{m.color};background:{m.bg};">
						<span class="chip-k">{m.short}</span><span class="chip-l">{a.ref_label ?? a.ref_id}</span>
						<button class="chip-x" onclick={() => removeAssoc(picker, a)} aria-label="Remove">×</button>
					</span>
				{/each}
			</div>
		{/if}
	</div>
{/if}

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; background: #F2F2F3; }
	.workspace { flex: 1; display: flex; min-height: 0; }

	/* ── Sidebar ──────────────────────────────────────────── */
	.sidebar {
		width: 248px; flex-shrink: 0; background: #fff; border-right: 1px solid #ECECEF;
		display: flex; flex-direction: column; overflow-y: auto;
	}
	.side-head { padding: 20px 20px 8px; }
	.side-head h1 { margin: 0; font-size: 22px; font-weight: 800; color: #18181B; }
	.side-section { padding: 10px 12px; }
	.side-label { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #A1A1AA; padding: 6px 8px; }
	.board-item {
		width: 100%; display: flex; align-items: center; gap: 9px; padding: 8px 10px; border: 0;
		background: none; border-radius: 8px; cursor: pointer; font-size: 14px; color: #3F3F46; text-align: left;
	}
	.board-item:hover { background: #F6F3EC; }
	.board-item.active { background: #FDEFE2; color: #18181B; font-weight: 700; }
	.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
	.bi-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.bi-count { font-size: 12px; color: #A1A1AA; }
	.side-empty { padding: 6px 10px; font-size: 13px; color: #A1A1AA; }
	.soon { color: #C7BCAB; }
	.add-board {
		width: 100%; margin-top: 4px; padding: 8px 10px; border: 1px dashed var(--border); background: none;
		border-radius: 8px; cursor: pointer; font-size: 13px; color: #9A5B00; font-weight: 600;
	}
	.add-board:hover { background: #FDF6EC; }
	.views-stub { margin-top: auto; border-top: 1px solid #F0F0F2; }

	/* ── Board area ──────────────────────────────────────── */
	.board-area { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
	.blank { margin: auto; text-align: center; color: #52525B; display: flex; flex-direction: column; gap: 14px; align-items: center; }

	.board-head { display: flex; align-items: center; gap: 12px; padding: 20px 28px 14px; }
	.board-title {
		font-size: 24px; font-weight: 800; color: #18181B; border: 1px solid transparent; background: none;
		border-radius: 8px; padding: 4px 8px; margin: -4px -8px; max-width: 520px;
	}
	.board-title:hover { border-color: #ECECEF; }
	.board-title:focus { outline: none; border-color: var(--accent); background: #fff; }
	.board-meta { font-size: 13px; color: #A1A1AA; font-weight: 600; }
	.spacer { flex: 1; }

	.btn { border: 1px solid var(--border); background: #fff; border-radius: 9px; padding: 8px 14px; font-size: 14px; font-weight: 600; cursor: pointer; color: #3F3F46; }
	.btn:hover { background: #FAF6EE; }
	.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
	.btn.primary:hover { background: var(--accent-hover); }
	.btn.ghost { background: none; border-color: transparent; color: #A1A1AA; }
	.btn.ghost.danger:hover { color: var(--danger); background: #FEF2F2; }
	.btn:disabled { opacity: .5; cursor: default; }

	.table-wrap { flex: 1; overflow: auto; padding: 0 28px 60px; }
	table.tasks { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 14px; }
	table.tasks thead th {
		position: sticky; top: 0; z-index: 2; background: #FAFAFA; text-align: left; font-size: 12px; font-weight: 700;
		color: #71717A; padding: 10px 12px; border-bottom: 1px solid #ECECEF; white-space: nowrap;
	}
	.c-exp { width: 30px; }
	.c-name { min-width: 240px; }
	.c-status, .c-prio { width: 180px; }
	.c-due { width: 150px; }
	.c-assignee { width: 160px; }
	.c-links { min-width: 260px; }
	.c-act { width: 40px; }

	.trow td { padding: 6px 12px; border-bottom: 1px solid #F1F1F3; background: #fff; vertical-align: middle; }
	.trow:hover td { background: #FCFBF8; }

	.exp { border: 0; background: none; cursor: pointer; color: #B4B4BC; font-size: 13px; transition: transform .12s; padding: 4px; }
	.exp.open { transform: rotate(90deg); color: var(--accent); }

	.task-name { width: 100%; border: 1px solid transparent; background: none; border-radius: 7px; padding: 7px 9px; font-size: 14px; font-weight: 600; color: #18181B; }
	.task-name:hover { border-color: #ECECEF; }
	.task-name:focus { outline: none; border-color: var(--accent); background: #fff; }

	/* Coloured pill selects */
	.pill {
		appearance: none; -webkit-appearance: none; background-image: none !important; border: 0;
		border-radius: 7px; padding: 7px 12px; font-size: 13px; font-weight: 700; text-align: center;
		text-align-last: center; cursor: pointer; width: 100%; box-shadow: inset 0 0 0 1px rgba(0,0,0,.04);
	}
	.pill:focus { outline: 2px solid rgba(0,0,0,.18); outline-offset: 1px; }

	.due, .assignee {
		width: 100%; border: 1px solid #ECECEF; background: #fff; border-radius: 7px; padding: 7px 9px;
		font-size: 13px; color: #3F3F46; background-image: none;
	}
	.due:focus, .assignee:focus { outline: none; border-color: var(--accent); }

	/* Chips */
	.chips { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
	.chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 7px; border-radius: 7px; font-size: 12px; font-weight: 600; max-width: 230px; }
	.chip-k { font-size: 10px; font-weight: 800; text-transform: uppercase; opacity: .7; }
	.chip-l { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.chip-x { border: 0; background: none; cursor: pointer; font-size: 14px; line-height: 1; color: inherit; opacity: .5; padding: 0 1px; }
	.chip-x:hover { opacity: 1; }
	.chip-add { border: 1px dashed var(--border); background: none; border-radius: 7px; padding: 3px 9px; font-size: 12px; font-weight: 600; color: #9A5B00; cursor: pointer; }
	.chip-add:hover { background: #FDF6EC; }

	.row-del { border: 0; background: none; cursor: pointer; color: #D4D4D8; font-size: 13px; padding: 6px; border-radius: 6px; }
	.row-del:hover { color: var(--danger); background: #FEF2F2; }

	.detail-row td { background: #FCFBF8; border-bottom: 1px solid #F1F1F3; padding: 0 12px 14px; }
	.detail { display: flex; flex-direction: column; gap: 6px; padding: 10px 0 4px; max-width: 760px; }
	.det-label { font-size: 12px; font-weight: 700; color: #71717A; }
	.desc { width: 100%; border: 1px solid #ECECEF; border-radius: 8px; padding: 9px 11px; font-size: 13px; font-family: inherit; resize: vertical; color: #18181B; }
	.desc:focus { outline: none; border-color: var(--accent); }
	.det-stamps { font-size: 11px; color: #A1A1AA; }

	.empty-tasks { padding: 28px 12px; text-align: center; color: #A1A1AA; font-size: 14px; }
	.linkish { border: 0; background: none; color: var(--accent); font-weight: 700; cursor: pointer; font-size: 14px; }

	/* ── Picker modal ─────────────────────────────────────── */
	.overlay { position: fixed; inset: 0; background: rgba(24,24,27,.28); z-index: 40; }
	.pick-modal {
		position: fixed; z-index: 41; top: 50%; left: 50%; transform: translate(-50%, -50%);
		width: min(460px, calc(100vw - 32px)); background: #fff; border-radius: var(--radius-lg);
		box-shadow: var(--shadow-lg); padding: 16px; display: flex; flex-direction: column; gap: 12px; max-height: 80vh;
	}
	.pm-head { display: flex; align-items: center; justify-content: space-between; }
	.pm-close { border: 0; background: none; font-size: 22px; line-height: 1; cursor: pointer; color: #A1A1AA; }
	.pm-tabs { display: flex; gap: 6px; }
	.pm-tabs button { flex: 1; border: 1px solid #ECECEF; background: #fff; border-radius: 8px; padding: 7px; font-size: 13px; font-weight: 600; cursor: pointer; color: #52525B; }
	.pm-tabs button.active { background: var(--accent); border-color: var(--accent); color: #fff; }
	.pm-search { border: 1px solid var(--border); border-radius: 9px; padding: 9px 11px; font-size: 14px; }
	.pm-search:focus { outline: none; border-color: var(--accent); }
	.pm-results { overflow-y: auto; display: flex; flex-direction: column; gap: 2px; min-height: 60px; }
	.pm-item { display: flex; flex-direction: column; gap: 1px; align-items: flex-start; text-align: left; border: 0; background: none; border-radius: 8px; padding: 8px 10px; cursor: pointer; }
	.pm-item:hover { background: #F6F3EC; }
	.pm-l { font-size: 14px; font-weight: 600; color: #18181B; }
	.pm-sub { font-size: 12px; color: #A1A1AA; }
	.pm-empty { padding: 14px 10px; font-size: 13px; color: #A1A1AA; text-align: center; }
	.pm-current { border-top: 1px solid #F0F0F2; padding-top: 10px; display: flex; flex-wrap: wrap; gap: 5px; }

	@media (max-width: 760px) {
		.sidebar { width: 180px; }
		.board-head { padding: 16px; }
		.table-wrap { padding: 0 12px 40px; }
	}
</style>
