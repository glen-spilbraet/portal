<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { fly, fade } from 'svelte/transition';
	import { onMount } from 'svelte';

	let { data } = $props();

	// Measure where the board content starts (below the top bar + nav) so the
	// detail pane can sit beneath the top chrome rather than over it.
	let workspaceEl;
	let paneTop = $state(72);
	function measureTop() { if (workspaceEl) paneTop = Math.max(16, Math.round(workspaceEl.getBoundingClientRect().top)); }
	onMount(() => {
		measureTop();
		window.addEventListener('resize', measureTop);
		return () => window.removeEventListener('resize', measureTop);
	});

	// Local, mutable copies (deep-reactive via $state proxies).
	let boards = $state(data.boards ?? []);
	let tasks  = $state(data.tasks ?? []);
	const users  = data.users ?? [];
	const events = data.events ?? [];

	let selectedBoardId = $state(boards[0]?.id ?? null);

	const selectedBoard = $derived(boards.find((b) => b.id === selectedBoardId) ?? null);
	const boardTasks = $derived(
		tasks.filter((t) => t.board_id === selectedBoardId)
		     .sort((a, b) => (a.position - b.position) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
	);

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

	const KIND_META = {
		product:  { short: 'SKU',   color: '#0F7B6C', bg: '#DEF5F1' },
		customer: { short: 'Cust',  color: '#9A5B00', bg: '#FCEBD2' },
		event:    { short: 'Event', color: '#5A2DA8', bg: '#ECE2FB' },
	};

	const taskCount = (boardId) => tasks.filter((t) => t.board_id === boardId).length;
	const userName  = (email) => users.find((u) => u.email === email)?.name ?? (email ?? '');

	function fmtDay(d) {
		if (!d) return '';
		try { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
		catch { return d; }
	}
	function fmtWhen(d) {
		if (!d) return '';
		try { return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
		catch { return d; }
	}

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
	async function addTask(opts = {}) {
		if (!selectedBoardId) return;
		busy = true;
		try {
			const { id } = await api('/api/tasks', 'POST', { board_id: selectedBoardId, name: '' });
			const now = new Date().toISOString();
			const t = {
				id, board_id: selectedBoardId, name: '', description: '',
				status: opts.status ?? 'not_started', priority: 'medium', due_date: opts.due ?? null,
				assignee_email: null, position: 9999,
				created_at: now, updated_at: now, associations: [],
			};
			tasks = [...tasks, t];
			const patch = {};
			if (opts.status && opts.status !== 'not_started') patch.status = opts.status;
			if (opts.due) patch.due_date = opts.due;
			if (Object.keys(patch).length) await api(`/api/tasks/${id}`, 'PUT', patch);
			openTask(t);
		} finally { busy = false; }
	}
	async function patchTask(task, patch) {
		Object.assign(task, patch);
		await api(`/api/tasks/${task.id}`, 'PUT', patch);
	}
	async function removeTask(task) {
		if (!confirm('Delete this task?')) return;
		await api(`/api/tasks/${task.id}`, 'DELETE');
		if (paneTaskId === task.id) paneTaskId = null;
		tasks = tasks.filter((t) => t.id !== task.id);
	}

	// ── Views (table / board / calendar) ──────────────────────────────────────────
	const view = $derived(selectedBoard?.view_type ?? 'table');
	function setView(v) {
		if (!selectedBoard || selectedBoard.view_type === v) return;
		selectedBoard.view_type = v;
		api(`/api/tasks/boards/${selectedBoard.id}`, 'PUT', { view_type: v });
	}
	const statusColor = (v) => (STATUS_OPTS.find((o) => o.v === v) ?? STATUS_OPTS[0]).color;

	// Calendar (month grid, Monday-start)
	const pad = (n) => String(n).padStart(2, '0');
	const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	let calY = $state(new Date().getFullYear());
	let calM = $state(new Date().getMonth());
	const calLabel = $derived(new Date(calY, calM, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }));
	const calDays = $derived.by(() => {
		const first = new Date(calY, calM, 1);
		const startDow = (first.getDay() + 6) % 7; // Monday = 0
		const dim = new Date(calY, calM + 1, 0).getDate();
		const cells = [];
		for (let i = 0; i < startDow; i++) cells.push(null);
		for (let d = 1; d <= dim; d++) cells.push(new Date(calY, calM, d));
		while (cells.length % 7) cells.push(null);
		return cells;
	});
	function calPrev() { if (calM === 0) { calM = 11; calY--; } else calM--; }
	function calNext() { if (calM === 11) { calM = 0; calY++; } else calM++; }
	function calToday() { const n = new Date(); calY = n.getFullYear(); calM = n.getMonth(); }
	const todayYmd = ymd(new Date());
	const tasksForDay = (d) => { const k = ymd(d); return boardTasks.filter((t) => t.due_date === k); };
	const unscheduled = $derived(boardTasks.filter((t) => !t.due_date));

	// ── Pill dropdown menus ──────────────────────────────────────────────────────
	let openMenu = $state(null); // `${taskId}:${field}`
	function toggleMenu(id, field) { const k = `${id}:${field}`; openMenu = openMenu === k ? null : k; }

	// ── Date picker (click text → native calendar) ───────────────────────────────
	function openDate(e) {
		const inp = e.currentTarget.parentElement.querySelector('input[type="date"]');
		if (!inp) return;
		try { inp.showPicker ? inp.showPicker() : inp.focus(); } catch { inp.focus(); }
	}

	// ── Detail pane ───────────────────────────────────────────────────────────────
	let paneTaskId = $state(null);
	const paneTask = $derived(tasks.find((t) => t.id === paneTaskId) ?? null);
	let updates = $state([]);
	let updatesLoading = $state(false);
	let newUpdate = $state('');

	async function openTask(task) {
		paneTaskId = task.id;
		openMenu = null;
		updates = []; updatesLoading = true; newUpdate = '';
		try { updates = await api(`/api/tasks/${task.id}/updates`); } catch { updates = []; }
		updatesLoading = false;
	}
	function closePane() { paneTaskId = null; }

	async function postUpdate() {
		const text = newUpdate.trim();
		if (!text || !paneTask) return;
		const u = await api(`/api/tasks/${paneTask.id}/updates`, 'POST', { body: text });
		updates = [...updates, u];
		newUpdate = '';
	}

	// ── Association picker ─────────────────────────────────────────────────────────
	let picker = $state(null);
	let pickKind = $state('product');
	let pickQuery = $state('');
	let pickResults = $state([]);
	let pickLoading = $state(false);
	let pickTimer;

	function openPicker(task) { picker = task; pickKind = 'product'; pickQuery = ''; pickResults = []; pickLoading = false; }
	function closePicker() { picker = null; }

	const eventResults = $derived.by(() => {
		if (pickKind !== 'event') return [];
		const q = pickQuery.trim().toLowerCase();
		return events.filter((e) => !q || (e.title ?? '').toLowerCase().includes(q) || (e.date ?? '').includes(q)).slice(0, 40);
	});

	function onPickInput() {
		clearTimeout(pickTimer);
		if (pickKind === 'event') return;
		const q = pickQuery;
		if (q.trim().length < 2) { pickResults = []; pickLoading = false; return; }
		pickLoading = true;
		pickTimer = setTimeout(async () => {
			try { pickResults = await api(`/api/tasks/pickers?type=${pickKind}&q=${encodeURIComponent(q)}`); }
			catch { pickResults = []; }
			pickLoading = false;
		}, 220);
	}
	function switchKind(k) { pickKind = k; pickQuery = ''; pickResults = []; pickLoading = false; }

	async function pick(ref_id, label) {
		const task = picker;
		if (task.associations.some((a) => a.kind === pickKind && a.ref_id === String(ref_id))) return;
		const { id } = await api(`/api/tasks/${task.id}/associations`, 'POST', { kind: pickKind, ref_id, ref_label: label });
		task.associations = [...task.associations, { id, task_id: task.id, kind: pickKind, ref_id: String(ref_id), ref_label: label }];
	}
	async function removeAssoc(task, assoc) {
		await api(`/api/tasks/associations/${assoc.id}`, 'DELETE');
		task.associations = task.associations.filter((a) => a.id !== assoc.id);
	}
</script>

<svelte:head><title>Tasks</title></svelte:head>

<!-- Reusable coloured pill with dropdown menu -->
{#snippet pill(task, field, opts)}
	{@const cur = opts.find((o) => o.v === task[field]) ?? opts[0]}
	<div class="pill-wrap">
		<button class="pill" style="background-color:{cur.color};color:{cur.fg};" onclick={(e) => { e.stopPropagation(); toggleMenu(task.id, field); }}>{cur.label}</button>
		{#if openMenu === `${task.id}:${field}`}
			<div class="menu" transition:fade={{ duration: 80 }}>
				{#each opts as o}
					<button class="menu-item" onclick={(e) => { e.stopPropagation(); patchTask(task, { [field]: o.v }); openMenu = null; }}>
						<span class="swatch" style="background:{o.color};"></span>{o.label}
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/snippet}

{#if openMenu}<div class="menu-backdrop" onclick={() => (openMenu = null)} role="presentation"></div>{/if}

<div class="page">
	<AppNav active="" user={data.user} />

	<div class="workspace" bind:this={workspaceEl}>
		<!-- Left: board list (room for future view types) -->
		<aside class="sidebar">
			<div class="side-head"><h1>Tasks</h1></div>

			<div class="side-section">
				<div class="side-label">Boards</div>
				{#each boards as b (b.id)}
					<button class="board-item" class:active={b.id === selectedBoardId} onclick={() => (selectedBoardId = b.id)}>
						<span class="dot"></span>
						<span class="bi-name">{b.name}</span>
						<span class="bi-count">{taskCount(b.id)}</span>
					</button>
				{/each}
				{#if boards.length === 0}<div class="side-empty">No boards yet</div>{/if}
				<button class="add-board" onclick={addBoard} disabled={busy}>+ New board</button>
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
					<input class="board-title" value={selectedBoard.name}
						onblur={(e) => { const v = e.currentTarget.value.trim(); if (v) renameBoard(selectedBoard, v); else e.currentTarget.value = selectedBoard.name; }}
						onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
					<div class="board-meta">{boardTasks.length} {boardTasks.length === 1 ? 'task' : 'tasks'}</div>
					<div class="viewseg">
						<button class:active={view === 'table'} onclick={() => setView('table')}>Table</button>
						<button class:active={view === 'board'} onclick={() => setView('board')}>Board</button>
						<button class:active={view === 'calendar'} onclick={() => setView('calendar')}>Calendar</button>
					</div>
					<div class="spacer"></div>
					<button class="btn primary" onclick={() => addTask()} disabled={busy}>+ Add task</button>
					<button class="btn ghost danger" onclick={() => removeBoard(selectedBoard)} title="Delete board">Delete board</button>
				</header>

				{#if view === 'table'}
				<div class="table-wrap">
					<table class="tasks">
						<thead>
							<tr>
								<th class="c-name">Task</th>
								<th class="c-status ctr">Status</th>
								<th class="c-prio ctr">Priority</th>
								<th class="c-due ctr">Due date</th>
								<th class="c-assignee">Assigned to</th>
								<th class="c-act"></th>
							</tr>
						</thead>
						<tbody>
							{#each boardTasks as task (task.id)}
								<tr class="trow" class:sel={paneTaskId === task.id}>
									<td class="c-name">
										<button class="task-open" onclick={() => openTask(task)}>
											{task.name || 'Untitled task'}
										</button>
									</td>
									<td class="c-status">{@render pill(task, 'status', STATUS_OPTS)}</td>
									<td class="c-prio">{@render pill(task, 'priority', PRIORITY_OPTS)}</td>
									<td class="c-due">
										<button class="due-btn" class:empty={!task.due_date} onclick={openDate}>{task.due_date ? fmtDay(task.due_date) : '—'}</button>
										<input type="date" class="due-hidden" value={task.due_date ?? ''} onchange={(e) => patchTask(task, { due_date: e.currentTarget.value || null })} />
									</td>
									<td class="c-assignee">
										<select class="assignee" value={task.assignee_email ?? ''} onchange={(e) => patchTask(task, { assignee_email: e.currentTarget.value || null })}>
											<option value="">—</option>
											{#each users as u}<option value={u.email}>{u.name}</option>{/each}
										</select>
									</td>
									<td class="c-act">
										<button class="row-del" onclick={() => removeTask(task)} title="Delete task" aria-label="Delete task">✕</button>
									</td>
								</tr>
							{/each}
							{#if boardTasks.length === 0}
								<tr><td colspan="6"><div class="empty-tasks">No tasks yet. <button class="linkish" onclick={() => addTask()}>Add the first one.</button></div></td></tr>
							{/if}
						</tbody>
					</table>
				</div>

				{:else if view === 'board'}
				<div class="kanban">
					{#each STATUS_OPTS as col (col.v)}
						<section class="kcol">
							<header class="kcol-head">
								<span class="kdot" style="background:{col.color};"></span>{col.label}
								<span class="kcount">{boardTasks.filter((t) => t.status === col.v).length}</span>
							</header>
							<div class="kcol-body">
								{#each boardTasks.filter((t) => t.status === col.v) as task (task.id)}
									<article class="kcard" onclick={() => openTask(task)}>
										<div class="kc-name">{task.name || 'Untitled task'}</div>
										<div class="kc-pill">{@render pill(task, 'priority', PRIORITY_OPTS)}</div>
										<div class="kc-foot">
											{#if task.due_date}<span class="kc-due">{fmtDay(task.due_date)}</span>{/if}
											{#if task.assignee_email}<span class="kc-who">{userName(task.assignee_email)}</span>{/if}
											{#if task.associations.length}<span class="kc-links">{task.associations.length} linked</span>{/if}
										</div>
									</article>
								{/each}
								<button class="kadd" onclick={() => addTask({ status: col.v })}>+ Add</button>
							</div>
						</section>
					{/each}
				</div>

				{:else}
				<div class="calendar">
					<div class="cal-head">
						<button class="cal-nav" onclick={calPrev} aria-label="Previous month">‹</button>
						<strong>{calLabel}</strong>
						<button class="cal-nav" onclick={calNext} aria-label="Next month">›</button>
						<button class="cal-today" onclick={calToday}>Today</button>
					</div>
					<div class="cal-grid">
						{#each ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as d}<div class="cal-dow">{d}</div>{/each}
						{#each calDays as day, i (i)}
							<div class="cal-cell" class:out={!day} class:today={day && ymd(day) === todayYmd}>
								{#if day}
									<div class="cal-dnum">
										<span>{day.getDate()}</span>
										<button class="cal-add" onclick={() => addTask({ due: ymd(day) })} aria-label="Add task">+</button>
									</div>
									<div class="cal-items">
										{#each tasksForDay(day) as task (task.id)}
											<button class="cal-item" style="border-left-color:{statusColor(task.status)};" onclick={() => openTask(task)}>{task.name || 'Untitled task'}</button>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
					{#if unscheduled.length}
						<div class="cal-unsched">
							<span class="cu-label">No due date</span>
							{#each unscheduled as task (task.id)}
								<button class="cal-item inline" style="border-left-color:{statusColor(task.status)};" onclick={() => openTask(task)}>{task.name || 'Untitled task'}</button>
							{/each}
						</div>
					{/if}
				</div>
				{/if}
			{/if}
		</main>
	</div>
</div>

<!-- ── Task detail pane ─────────────────────────────────────────────── -->
{#if paneTask}
	<div class="overlay" onclick={closePane} role="presentation" transition:fade={{ duration: 120 }}></div>
	<aside class="pane" style="top:{paneTop}px" transition:fly={{ x: 440, duration: 180 }}>
		<div class="pane-head">
			<span class="pane-kicker">Task</span>
			<button class="pane-close" onclick={closePane} aria-label="Close">×</button>
		</div>

		<textarea class="pane-title" rows="1" placeholder="Untitled task"
			value={paneTask.name}
			oninput={(e) => { e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'; }}
			onblur={(e) => { const v = e.currentTarget.value.trim(); if (v !== (paneTask.name ?? '')) patchTask(paneTask, { name: v }); }}></textarea>

		<div class="pane-grid">
			<div class="pg-row"><span class="pg-k">Status</span><div class="pg-v">{@render pill(paneTask, 'status', STATUS_OPTS)}</div></div>
			<div class="pg-row"><span class="pg-k">Priority</span><div class="pg-v">{@render pill(paneTask, 'priority', PRIORITY_OPTS)}</div></div>
			<div class="pg-row"><span class="pg-k">Assigned to</span>
				<div class="pg-v">
					<select class="assignee wide" value={paneTask.assignee_email ?? ''} onchange={(e) => patchTask(paneTask, { assignee_email: e.currentTarget.value || null })}>
						<option value="">— Unassigned</option>
						{#each users as u}<option value={u.email}>{u.name}</option>{/each}
					</select>
				</div>
			</div>
			<div class="pg-row"><span class="pg-k">Due date</span>
				<div class="pg-v">
					<button class="due-btn" class:empty={!paneTask.due_date} onclick={openDate}>{paneTask.due_date ? fmtDay(paneTask.due_date) : 'Set a date'}</button>
					<input type="date" class="due-hidden" value={paneTask.due_date ?? ''} onchange={(e) => patchTask(paneTask, { due_date: e.currentTarget.value || null })} />
				</div>
			</div>
		</div>

		<div class="pane-sec">
			<div class="sec-label">Description</div>
			<textarea class="desc" rows="4" placeholder="Add a description…"
				value={paneTask.description ?? ''}
				onblur={(e) => { const v = e.currentTarget.value; if (v !== (paneTask.description ?? '')) patchTask(paneTask, { description: v }); }}></textarea>
		</div>

		<div class="pane-sec">
			<div class="sec-label">Links</div>
			<div class="chips">
				{#each paneTask.associations as a (a.id)}
					{@const m = KIND_META[a.kind]}
					<span class="chip" style="color:{m.color};background:{m.bg};">
						<span class="chip-k">{m.short}</span><span class="chip-l">{a.ref_label ?? a.ref_id}</span>
						<button class="chip-x" onclick={() => removeAssoc(paneTask, a)} aria-label="Remove">×</button>
					</span>
				{/each}
				<button class="chip-add" onclick={() => openPicker(paneTask)}>+ Link</button>
			</div>
		</div>

		<div class="pane-sec updates">
			<div class="sec-label">Updates</div>
			<div class="upd-list">
				{#if updatesLoading}<div class="upd-empty">Loading…</div>
				{:else if updates.length === 0}<div class="upd-empty">No updates yet.</div>
				{:else}
					{#each updates as u (u.id)}
						<div class="upd">
							<div class="upd-head"><span class="upd-who">{userName(u.author_email)}</span><span class="upd-when">{fmtWhen(u.created_at)}</span></div>
							<div class="upd-body">{u.body}</div>
						</div>
					{/each}
				{/if}
			</div>
			<div class="upd-compose">
				<textarea rows="2" placeholder="Write an update…" bind:value={newUpdate}
					onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); postUpdate(); } }}></textarea>
				<button class="btn primary sm" onclick={postUpdate} disabled={!newUpdate.trim()}>Post update</button>
			</div>
		</div>
	</aside>
{/if}

<!-- ── Association picker modal ──────────────────────────────────────── -->
{#if picker}
	<div class="overlay high" onclick={closePicker} role="presentation"></div>
	<div class="pick-modal" role="dialog" aria-modal="true">
		<div class="pm-head"><strong>Link to task</strong><button class="pm-close" onclick={closePicker} aria-label="Close">×</button></div>
		<div class="pm-tabs">
			<button class:active={pickKind === 'product'} onclick={() => switchKind('product')}>Products</button>
			<button class:active={pickKind === 'customer'} onclick={() => switchKind('customer')}>Customers</button>
			<button class:active={pickKind === 'event'} onclick={() => switchKind('event')}>Events</button>
		</div>
		<input class="pm-search" bind:value={pickQuery} oninput={onPickInput}
			placeholder={pickKind === 'event' ? 'Filter events…' : pickKind === 'product' ? 'Search SKU or name…' : 'Search company name…'} />
		<div class="pm-results">
			{#if pickKind === 'event'}
				{#each eventResults as e (e.id)}
					<button class="pm-item" onclick={() => pick(e.id, e.title || `Event ${e.date ?? ''}`.trim())}>
						<span class="pm-l">{e.title || 'Untitled event'}</span><span class="pm-sub">{e.date ?? ''}</span>
					</button>
				{/each}
				{#if eventResults.length === 0}<div class="pm-empty">No events.</div>{/if}
			{:else}
				{#if pickLoading}<div class="pm-empty">Searching…</div>{/if}
				{#each pickResults as r (r.ref_id)}
					<button class="pm-item" onclick={() => pick(r.ref_id, r.label)}>
						<span class="pm-l">{r.label}</span><span class="pm-sub">{r.ref_id}</span>
					</button>
				{/each}
				{#if !pickLoading && pickResults.length === 0 && pickQuery.trim().length >= 2}<div class="pm-empty">No matches.</div>{/if}
				{#if !pickLoading && pickQuery.trim().length < 2}<div class="pm-empty">Type at least 2 characters.</div>{/if}
			{/if}
		</div>
	</div>
{/if}

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; background: #F2F2F3; }
	.workspace { flex: 1; display: flex; min-height: 0; }

	/* ── Sidebar ──────────────────────────────────────────── */
	.sidebar { width: 248px; flex-shrink: 0; background: #fff; border-right: 1px solid #ECECEF; display: flex; flex-direction: column; overflow-y: auto; }
	.side-head { padding: 20px 20px 8px; }
	.side-head h1 { margin: 0; font-size: 22px; font-weight: 800; color: #18181B; }
	.side-section { padding: 10px 12px; }
	.side-label { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #A1A1AA; padding: 6px 8px; }
	.board-item { width: 100%; display: flex; align-items: center; gap: 9px; padding: 8px 10px; border: 0; background: none; border-radius: 8px; cursor: pointer; font-size: 14px; color: #3F3F46; text-align: left; }
	.board-item:hover { background: #F6F3EC; }
	.board-item.active { background: #FDEFE2; color: #18181B; font-weight: 700; }
	.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
	.bi-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.bi-count { font-size: 12px; color: #A1A1AA; }
	.side-empty { padding: 6px 10px; font-size: 13px; color: #A1A1AA; }
	.add-board { width: 100%; margin-top: 4px; padding: 8px 10px; border: 1px dashed var(--border); background: none; border-radius: 8px; cursor: pointer; font-size: 13px; color: #9A5B00; font-weight: 600; }
	.add-board:hover { background: #FDF6EC; }

	/* ── Board area ──────────────────────────────────────── */
	.board-area { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
	.blank { margin: auto; text-align: center; color: #52525B; display: flex; flex-direction: column; gap: 14px; align-items: center; }
	.board-head { display: flex; align-items: center; gap: 12px; padding: 20px 28px 14px; }
	.board-title { font-size: 24px; font-weight: 800; color: #18181B; border: 1px solid transparent; background: none; border-radius: 8px; padding: 4px 8px; margin: -4px -8px; max-width: 520px; }
	.board-title:hover { border-color: #ECECEF; }
	.board-title:focus { outline: none; border-color: var(--accent); background: #fff; }
	.board-meta { font-size: 13px; color: #A1A1AA; font-weight: 600; }
	.spacer { flex: 1; }

	.viewseg { display: inline-flex; background: #EFEDE8; border-radius: 9px; padding: 3px; }
	.viewseg button { border: 0; background: none; border-radius: 7px; padding: 6px 13px; font-size: 13px; font-weight: 600; color: #52525B; cursor: pointer; }
	.viewseg button.active { background: #fff; color: #18181B; box-shadow: 0 1px 2px rgba(0,0,0,.08); }

	.btn { border: 1px solid var(--border); background: #fff; border-radius: 9px; padding: 8px 14px; font-size: 14px; font-weight: 600; cursor: pointer; color: #3F3F46; }
	.btn:hover { background: #FAF6EE; }
	.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
	.btn.primary:hover { background: var(--accent-hover); }
	.btn.primary:disabled { opacity: .5; cursor: default; }
	.btn.sm { padding: 7px 12px; font-size: 13px; }
	.btn.ghost { background: none; border-color: transparent; color: #A1A1AA; }
	.btn.ghost.danger:hover { color: var(--danger); background: #FEF2F2; }
	.btn:disabled { opacity: .5; cursor: default; }

	.table-wrap { flex: 1; overflow: auto; padding: 0 28px 60px; }
	table.tasks { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 14px; }
	table.tasks thead th { position: sticky; top: 0; z-index: 2; background: #FAFAFA; text-align: left; font-size: 12px; font-weight: 700; color: #71717A; padding: 10px 12px; border-bottom: 1px solid #ECECEF; white-space: nowrap; }
	th.ctr { text-align: center; }
	.c-name { min-width: 280px; }
	.c-status, .c-prio { width: 190px; }
	.c-due { width: 160px; }
	.c-assignee { width: 180px; }
	.c-act { width: 40px; }

	.trow td { padding: 6px 12px; border-bottom: 1px solid #F1F1F3; background: #fff; vertical-align: middle; }
	.trow:hover td { background: #FCFBF8; }
	.trow.sel td { background: #FDF6EC; }

	.task-open { width: 100%; text-align: left; border: 1px solid transparent; background: none; border-radius: 7px; padding: 8px 9px; font-size: 14px; font-weight: 600; color: #18181B; cursor: pointer; }
	.task-open:hover { border-color: #ECECEF; background: #fff; }

	/* Pill + menu */
	.pill-wrap { position: relative; display: flex; justify-content: center; }
	.pill { width: 100%; border: 0; border-radius: 7px; padding: 8px 10px; font-size: 13px; font-weight: 700; text-align: center; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0,0,0,.04); }
	.menu { position: absolute; top: calc(100% + 4px); left: 0; right: 0; min-width: 170px; background: #fff; border: 1px solid #ECECEF; border-radius: 10px; box-shadow: var(--shadow-lg); padding: 5px; z-index: 30; }
	.menu-item { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: none; padding: 8px 9px; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 600; color: #3F3F46; text-align: left; }
	.menu-item:hover { background: #F6F3EC; }
	.swatch { width: 12px; height: 12px; border-radius: 4px; flex-shrink: 0; }
	.menu-backdrop { position: fixed; inset: 0; z-index: 25; }

	/* Date cell */
	.due-btn { width: 100%; text-align: center; border: 1px solid transparent; background: none; border-radius: 7px; padding: 8px 10px; font-size: 13px; font-weight: 600; color: #3F3F46; cursor: pointer; }
	.due-btn:hover { border-color: #ECECEF; background: #fff; }
	.due-btn.empty { color: #B4B4BC; font-weight: 600; }
	.due-hidden { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

	.assignee { width: 100%; border: 1px solid #ECECEF; background: #fff; border-radius: 7px; padding: 8px 9px; font-size: 13px; color: #3F3F46; }
	.assignee:focus { outline: none; border-color: var(--accent); }
	.assignee.wide { max-width: 260px; }

	.row-del { border: 0; background: none; cursor: pointer; color: #D4D4D8; font-size: 13px; padding: 6px; border-radius: 6px; }
	.row-del:hover { color: var(--danger); background: #FEF2F2; }

	.empty-tasks { padding: 28px 12px; text-align: center; color: #A1A1AA; font-size: 14px; }
	.linkish { border: 0; background: none; color: var(--accent); font-weight: 700; cursor: pointer; font-size: 14px; }

	/* ── Board (kanban) view ──────────────────────────────── */
	.kanban { flex: 1; overflow: auto; display: flex; gap: 14px; padding: 4px 28px 60px; align-items: flex-start; }
	.kcol { flex: 0 0 280px; background: #F7F6F3; border: 1px solid #EEECE6; border-radius: 12px; display: flex; flex-direction: column; max-height: 100%; }
	.kcol-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; font-size: 13px; font-weight: 800; color: #3F3F46; }
	.kdot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
	.kcount { margin-left: auto; font-size: 12px; color: #A1A1AA; font-weight: 700; }
	.kcol-body { display: flex; flex-direction: column; gap: 8px; padding: 0 10px 12px; overflow-y: auto; }
	.kcard { background: #fff; border: 1px solid #ECECEF; border-radius: 10px; padding: 10px 11px; cursor: pointer; box-shadow: 0 1px 2px rgba(100,60,0,.05); display: flex; flex-direction: column; gap: 8px; text-align: left; }
	.kcard:hover { border-color: var(--border); }
	.kc-name { font-size: 14px; font-weight: 700; color: #18181B; }
	.kc-pill { display: flex; }
	.kc-pill :global(.pill-wrap) { justify-content: flex-start; }
	.kc-pill :global(.pill) { width: auto; min-width: 0; padding: 4px 11px; font-size: 12px; }
	.kc-foot { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: #71717A; align-items: center; }
	.kc-due { font-weight: 700; color: #52525B; }
	.kc-links { color: #9A5B00; font-weight: 600; }
	.kadd { border: 1px dashed var(--border); background: none; border-radius: 9px; padding: 8px; font-size: 13px; font-weight: 600; color: #9A5B00; cursor: pointer; }
	.kadd:hover { background: #FDF6EC; }

	/* ── Calendar view ────────────────────────────────────── */
	.calendar { flex: 1; overflow: auto; padding: 8px 28px 60px; display: flex; flex-direction: column; }
	.cal-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
	.cal-head strong { font-size: 16px; min-width: 170px; text-align: center; color: #18181B; }
	.cal-nav, .cal-today { border: 1px solid var(--border); background: #fff; border-radius: 8px; padding: 6px 13px; cursor: pointer; font-size: 14px; font-weight: 700; color: #3F3F46; }
	.cal-nav:hover, .cal-today:hover { background: #FAF6EE; }
	.cal-today { margin-left: 4px; font-size: 13px; }
	.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
	.cal-dow { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #A1A1AA; padding: 2px 6px; }
	.cal-cell { min-height: 108px; background: #fff; border: 1px solid #F0F0F2; border-radius: 10px; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
	.cal-cell.out { background: transparent; border-color: transparent; }
	.cal-cell.today { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
	.cal-dnum { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 700; color: #52525B; }
	.cal-add { opacity: 0; border: 0; background: none; cursor: pointer; color: var(--accent); font-size: 17px; line-height: 1; font-weight: 700; padding: 0 2px; }
	.cal-cell:hover .cal-add { opacity: 1; }
	.cal-items { display: flex; flex-direction: column; gap: 3px; overflow: hidden; }
	.cal-item { display: block; width: 100%; text-align: left; border: 0; border-left: 3px solid #ccc; background: #FAFAF8; border-radius: 5px; padding: 3px 7px; font-size: 12px; font-weight: 600; color: #3F3F46; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.cal-item:hover { background: #F2EFE8; }
	.cal-item.inline { width: auto; max-width: 220px; }
	.cal-unsched { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
	.cu-label { font-size: 12px; font-weight: 700; color: #A1A1AA; margin-right: 4px; }

	/* Chips */
	.chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
	.chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border-radius: 7px; font-size: 12px; font-weight: 600; max-width: 100%; }
	.chip-k { font-size: 10px; font-weight: 800; text-transform: uppercase; opacity: .7; }
	.chip-l { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.chip-x { border: 0; background: none; cursor: pointer; font-size: 14px; line-height: 1; color: inherit; opacity: .5; padding: 0 1px; }
	.chip-x:hover { opacity: 1; }
	.chip-add { border: 1px dashed var(--border); background: none; border-radius: 7px; padding: 4px 10px; font-size: 12px; font-weight: 600; color: #9A5B00; cursor: pointer; }
	.chip-add:hover { background: #FDF6EC; }

	/* ── Detail pane ───────────────────────────────────────── */
	.overlay { position: fixed; inset: 0; background: rgba(24,24,27,.28); z-index: 150; }
	.overlay.high { z-index: 160; }
	.pane { position: fixed; z-index: 151; top: 16px; right: 16px; bottom: 16px; width: min(460px, calc(100vw - 32px)); background: #fff; border-radius: var(--radius-lg); box-shadow: 0 12px 40px rgba(100,60,0,.20); display: flex; flex-direction: column; overflow-y: auto; }
	.pane-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px 0; }
	.pane-kicker { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #A1A1AA; }
	.pane-close { border: 0; background: none; font-size: 24px; line-height: 1; cursor: pointer; color: #A1A1AA; }
	.pane-close:hover { color: #18181B; }
	.pane-title { margin: 4px 20px 6px; border: 1px solid transparent; border-radius: 8px; padding: 6px 8px; font-size: 20px; font-weight: 800; color: #18181B; font-family: inherit; resize: none; overflow: hidden; }
	.pane-title:hover { border-color: #ECECEF; }
	.pane-title:focus { outline: none; border-color: var(--accent); }

	.pane-grid { padding: 6px 20px 4px; display: flex; flex-direction: column; gap: 4px; }
	.pg-row { display: grid; grid-template-columns: 110px 1fr; align-items: center; gap: 10px; padding: 5px 0; }
	.pg-k { font-size: 13px; font-weight: 600; color: #71717A; }
	.pg-v { display: flex; }
	.pg-v .pill-wrap { justify-content: flex-start; }
	.pg-v .pill { width: auto; min-width: 150px; }
	.pg-v .due-btn { width: auto; text-align: left; padding-left: 9px; border-color: #ECECEF; }

	.pane-sec { padding: 12px 20px; border-top: 1px solid #F3F3F5; }
	.sec-label { font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #A1A1AA; margin-bottom: 8px; }
	.desc { width: 100%; border: 1px solid #ECECEF; border-radius: 8px; padding: 9px 11px; font-size: 13px; font-family: inherit; resize: vertical; color: #18181B; }
	.desc:focus { outline: none; border-color: var(--accent); }

	.updates { flex: 1; display: flex; flex-direction: column; }
	.upd-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
	.upd-empty { font-size: 13px; color: #A1A1AA; padding: 4px 0; }
	.upd { background: #FAFAF8; border: 1px solid #F0EEE8; border-radius: 10px; padding: 9px 11px; }
	.upd-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 3px; }
	.upd-who { font-size: 13px; font-weight: 700; color: #18181B; }
	.upd-when { font-size: 11px; color: #A1A1AA; }
	.upd-body { font-size: 13px; color: #3F3F46; white-space: pre-wrap; word-break: break-word; }
	.upd-compose { display: flex; flex-direction: column; gap: 8px; margin-top: auto; }
	.upd-compose textarea { width: 100%; border: 1px solid #ECECEF; border-radius: 8px; padding: 9px 11px; font-size: 13px; font-family: inherit; resize: vertical; color: #18181B; }
	.upd-compose textarea:focus { outline: none; border-color: var(--accent); }
	.upd-compose .btn { align-self: flex-end; }

	/* ── Picker modal ─────────────────────────────────────── */
	.pick-modal { position: fixed; z-index: 161; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(460px, calc(100vw - 32px)); background: #fff; border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: 16px; display: flex; flex-direction: column; gap: 12px; max-height: 80vh; }
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

	@media (max-width: 760px) {
		.sidebar { width: 170px; }
		.board-head { padding: 16px; }
		.table-wrap { padding: 0 12px 40px; }
	}
</style>
