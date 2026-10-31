<script>
	import AppNav from '$lib/components/AppNav.svelte';
	import { fly, fade } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { browser } from '$app/environment';

	let { data } = $props();

	// Measure where the board content starts (below the top bar + nav) so the
	// detail pane can sit beneath the top chrome rather than over it.
	let workspaceEl;
	let paneTop = $state(72);
	function measureTop() { if (workspaceEl) paneTop = Math.max(16, Math.round(workspaceEl.getBoundingClientRect().top)); }
	onMount(() => {
		measureTop();
		const closeMenu = () => { if (openMenu) openMenu = null; };
		window.addEventListener('resize', measureTop);
		window.addEventListener('resize', closeMenu);
		window.addEventListener('scroll', closeMenu, true); // capture inner scrollers too
		return () => {
			window.removeEventListener('resize', measureTop);
			window.removeEventListener('resize', closeMenu);
			window.removeEventListener('scroll', closeMenu, true);
		};
	});

	// Keep ?v= in the URL in sync with the selected view, so refresh stays put.
	$effect(() => {
		if (!browser) return;
		const u = new URL(window.location.href);
		if (u.searchParams.get('v') !== panel) {
			u.searchParams.set('v', panel);
			replaceState(u, {});
		}
	});

	// Local, mutable copies (deep-reactive via $state proxies).
	let boards = $state(data.boards ?? []);
	let tasks  = $state(data.tasks ?? []);
	const users  = data.users ?? [];
	const events = data.events ?? [];
	const userEmail = data.user?.email ?? null;

	// Left-panel selection: a standard view ('my' | 'created') or a board id.
	// Initialised from the URL (?v=) so a refresh stays on the same view.
	const initPanel = data.initialPanel;
	let panel = $state(
		(initPanel === 'my' || initPanel === 'created' || boards.some((b) => b.id === initPanel)) ? initPanel : 'my'
	);
	let hideDone = $state(true); // completed tasks hidden by default, across every view
	const notHidden = (t) => !(hideDone && t.status === 'done');
	const isView = $derived(panel === 'my' || panel === 'created');
	const selectedBoard = $derived(boards.find((b) => b.id === panel) ?? null);
	const boardTasks = $derived(
		tasks.filter((t) => t.board_id === selectedBoard?.id && notHidden(t))
		     .sort((a, b) => (a.position - b.position) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
	);
	const boardName = (id) => boards.find((b) => b.id === id)?.name ?? '—';

	let busy = $state(false);

	// ── Standard views (My tasks / Created by me) ──────────────────────────────────
	const MS = 86400000;
	const today0 = new Date(); today0.setHours(0, 0, 0, 0);
	const dowMon = (today0.getDay() + 6) % 7; // Mon = 0
	const endThisWeek = new Date(today0.getTime() + (6 - dowMon) * MS);
	const endNextWeek = new Date(endThisWeek.getTime() + 7 * MS);
	function dueBucket(due) {
		if (!due) return 'none';
		const d = new Date(due + 'T00:00:00'); d.setHours(0, 0, 0, 0);
		const diff = Math.round((d - today0) / MS);
		if (diff < 0) return 'overdue';
		if (diff === 0) return 'today';
		if (diff === 1) return 'tomorrow';
		if (d <= endThisWeek) return 'this_week';
		if (d <= endNextWeek) return 'next_week';
		return 'later';
	}
	const DUE_ORDER = ['overdue', 'today', 'tomorrow', 'this_week', 'next_week', 'later', 'none'];
	const DUE_LABEL = { overdue: 'Overdue', today: 'Due Today', tomorrow: 'Due Tomorrow', this_week: 'Due This Week', next_week: 'Due Next Week', later: 'Due Later', none: 'No due date' };
	const byDue = (a, b) => (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31');

	function groupByDue(list) {
		const buckets = {};
		for (const t of list) (buckets[dueBucket(t.due_date)] ??= []).push(t);
		return DUE_ORDER.filter((k) => buckets[k]?.length).map((k) => ({ key: k, label: DUE_LABEL[k], tasks: buckets[k].sort(byDue) }));
	}

	const myTasksGroups = $derived.by(() => groupByDue(tasks.filter((t) => t.assignee_email === userEmail && notHidden(t))));
	const createdGroups = $derived.by(() => {
		const mine = tasks.filter((t) => (t.created_by ?? null) === userEmail && notHidden(t));
		const map = new Map();
		for (const t of mine) { const k = t.assignee_email ?? '__none'; if (!map.has(k)) map.set(k, []); map.get(k).push(t); }
		const entries = [...map.entries()].map(([k, arr]) => ({ key: k, label: k === '__none' ? 'Unassigned' : userName(k), tasks: arr.sort(byDue) }));
		entries.sort((a, b) => (a.key === '__none' ? 1 : 0) - (b.key === '__none' ? 1 : 0) || a.label.localeCompare(b.label));
		return entries;
	});
	const myTasksCount = $derived(tasks.filter((t) => t.assignee_email === userEmail).length);
	const createdCount = $derived(tasks.filter((t) => (t.created_by ?? null) === userEmail).length);
	const overviewGroups = $derived(panel === 'created' ? createdGroups : myTasksGroups);
	const overviewCount = $derived(overviewGroups.reduce((n, g) => n + g.tasks.length, 0));

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

	// Board icons — a fixed set the user can pick from (inner SVG, stroke-based).
	const BOARD_ICONS = {
		board: '<rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/>',
		list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
		megaphone: '<path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
		chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
		calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
		cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
		box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
		star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
		flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
		bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.5.4.9 1 1 1.6V18h6v-1.7c.1-.6.5-1.2 1-1.6A7 7 0 0 0 12 2z"/>',
		rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
		heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
		tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
		truck: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
		image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
		pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
		check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
		folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
		globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
		users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
		bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
		gift: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
		target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
	};
	const ICON_KEYS = Object.keys(BOARD_ICONS);

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
			boards = [...boards, { id, name, position: boards.length, archived: 0, view_type: 'table', icon: 'board' }];
			panel = id;
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
		if (panel === board.id) panel = 'my';
	}

	// ── Board settings modal (rename / icon / archive / delete) ─────────────────────
	let boardCfg = $state(null);
	let cfgName = $state('');
	let cfgIcon = $state('board');
	function openBoardCfg(board, e) {
		e?.stopPropagation();
		boardCfg = board; cfgName = board.name; cfgIcon = board.icon ?? 'board';
	}
	function closeBoardCfg() { boardCfg = null; }
	async function saveBoardCfg() {
		const patch = {};
		const nm = cfgName.trim();
		if (nm && nm !== boardCfg.name) patch.name = nm;
		if (cfgIcon !== (boardCfg.icon ?? 'board')) patch.icon = cfgIcon;
		if (Object.keys(patch).length) { Object.assign(boardCfg, patch); await api(`/api/tasks/boards/${boardCfg.id}`, 'PUT', patch); }
		boardCfg = null;
	}
	async function archiveBoard() {
		const b = boardCfg;
		if (!confirm(`Archive "${b.name}"? It will be hidden from the board list.`)) return;
		await api(`/api/tasks/boards/${b.id}`, 'PUT', { archived: 1 });
		boards = boards.filter((x) => x.id !== b.id);
		if (panel === b.id) panel = 'my';
		boardCfg = null;
	}
	function deleteBoardCfg() { const b = boardCfg; boardCfg = null; removeBoard(b); }

	// ── Tasks ───────────────────────────────────────────────────────────────────
	// ── Create task (staged — nothing is saved until "Save task") ────────────────────
	let creating = $state(false);
	let draft = $state(null);
	function openCreate(prefill = {}) {
		if (boards.length === 0) return;
		paneTaskId = null;
		draft = {
			board_id: prefill.board_id ?? selectedBoard?.id ?? boards[0]?.id ?? null,
			name: '', description: '',
			status: prefill.status ?? 'not_started', priority: 'medium',
			due_date: prefill.due ?? null, assignee_email: userEmail,
			associations: [],
		};
		creating = true;
	}
	function closeCreate() { creating = false; draft = null; }
	async function saveCreate() {
		if (!draft?.board_id) return;
		busy = true;
		try {
			const { id } = await api('/api/tasks', 'POST', { board_id: draft.board_id, name: draft.name });
			const patch = {};
			for (const k of ['description', 'status', 'priority', 'due_date', 'assignee_email']) {
				if (draft[k] !== null && draft[k] !== '') patch[k] = draft[k];
			}
			if (Object.keys(patch).length) await api(`/api/tasks/${id}`, 'PUT', patch);
			const createdAssoc = [];
			for (const a of draft.associations) {
				const r = await api(`/api/tasks/${id}/associations`, 'POST', { kind: a.kind, ref_id: a.ref_id, ref_label: a.ref_label });
				createdAssoc.push({ id: r.id, task_id: id, kind: a.kind, ref_id: a.ref_id, ref_label: a.ref_label });
			}
			const now = new Date().toISOString();
			const t = {
				id, board_id: draft.board_id, name: draft.name, description: draft.description,
				status: draft.status, priority: draft.priority, due_date: draft.due_date,
				assignee_email: draft.assignee_email, created_by: userEmail, position: 9999,
				created_at: now, updated_at: now, associations: createdAssoc,
			};
			tasks = [...tasks, t];
			creating = false; draft = null;
			openTask(t);
		} finally { busy = false; }
	}
	async function patchTask(task, patch) {
		Object.assign(task, patch);
		if (!task.id) return; // unsaved draft — local only
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

	// ── Drag & drop (board → status, calendar → date) ──────────────────────────────
	let dragTaskId = $state(null);
	let dragOver = $state(null); // status value | 'YYYY-MM-DD' | 'unsched'
	function onDragStart(e, task) {
		dragTaskId = task.id;
		e.dataTransfer.effectAllowed = 'move';
		try { e.dataTransfer.setData('text/plain', task.id); } catch {}
	}
	function onDragEnd() { dragTaskId = null; dragOver = null; }
	function allowDrop(e, key) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOver !== key) dragOver = key; }
	async function dropToStatus(e, status) {
		e.preventDefault();
		const t = tasks.find((x) => x.id === dragTaskId);
		dragOver = null; dragTaskId = null;
		if (t && t.status !== status) await patchTask(t, { status });
	}
	async function dropToDate(e, dateStr) {
		e.preventDefault();
		const t = tasks.find((x) => x.id === dragTaskId);
		dragOver = null; dragTaskId = null;
		if (t && (t.due_date ?? null) !== (dateStr ?? null)) await patchTask(t, { due_date: dateStr });
	}

	// ── Pill dropdown menus (fixed-positioned so they escape table clipping) ────────
	let openMenu = $state(null); // `${taskId}:${field}`
	let menuPos = $state({ left: 0, top: 0, width: 170 });
	function toggleMenu(id, field, e) {
		const k = `${id}:${field}`;
		if (openMenu === k) { openMenu = null; return; }
		const r = e.currentTarget.getBoundingClientRect();
		menuPos = { left: r.left, top: r.bottom + 4, width: r.width };
		openMenu = k;
	}

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
		if (!task.id) { // unsaved draft — stage locally, attached on save
			task.associations = [...task.associations, { kind: pickKind, ref_id: String(ref_id), ref_label: label }];
			return;
		}
		const { id } = await api(`/api/tasks/${task.id}/associations`, 'POST', { kind: pickKind, ref_id, ref_label: label });
		task.associations = [...task.associations, { id, task_id: task.id, kind: pickKind, ref_id: String(ref_id), ref_label: label }];
	}
	async function removeAssoc(task, assoc) {
		if (!task.id || !assoc.id) { task.associations = task.associations.filter((a) => a !== assoc); return; }
		await api(`/api/tasks/associations/${assoc.id}`, 'DELETE');
		task.associations = task.associations.filter((a) => a.id !== assoc.id);
	}
</script>

<svelte:head><title>Tasks</title></svelte:head>

<!-- Reusable coloured pill with dropdown menu -->
{#snippet pill(task, field, opts)}
	{@const cur = opts.find((o) => o.v === task[field]) ?? opts[0]}
	<div class="pill-wrap">
		<button class="pill" style="background-color:{cur.color};color:{cur.fg};" onclick={(e) => { e.stopPropagation(); toggleMenu(task.id, field, e); }}>{cur.label}</button>
		{#if openMenu === `${task.id}:${field}`}
			<div class="menu" style="left:{menuPos.left}px; top:{menuPos.top}px; min-width:{Math.max(menuPos.width, 170)}px;" transition:fade={{ duration: 80 }}>
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

<!-- Shared top-right actions for every view: Hide completed + Add task -->
{#snippet headerActions()}
	<label class="toggle ctl-box" title="Hide completed tasks">
		<input type="checkbox" checked={hideDone} onchange={(e) => (hideDone = e.currentTarget.checked)} />
		<span class="track"><span class="knob"></span></span>
		<span class="tlabel">Hide completed</span>
	</label>
	<button class="btn primary" onclick={() => openCreate()} disabled={busy || boards.length === 0}>
		<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
		Add task
	</button>
{/snippet}

<!-- Board icon from the fixed set -->
{#snippet bicon(key, size)}
	<svg class="bic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{@html BOARD_ICONS[key] ?? BOARD_ICONS.board}</svg>
{/snippet}

<!-- Overview table for the standard views (sections + a Board column) -->
{#snippet otable(groups)}
	{#if groups.length === 0}
		<div class="empty-tasks">Nothing here yet.</div>
	{:else}
		{#each groups as g, gi (g.key)}
			<section class="ov-sec">
				<header class="ov-sec-head"><span class="ov-sec-title">{g.label}</span><span class="ov-sec-count">{g.tasks.length}</span></header>
				<table class="tasks ov">
					<colgroup><col class="oc-name" /><col class="oc-board" /><col class="oc-status" /><col class="oc-prio" /><col class="oc-due" /></colgroup>
					{#if gi === 0}
						<thead><tr><th class="c-name">Task</th><th>Board</th><th class="ctr">Status</th><th class="ctr">Priority</th><th class="ctr">Due date</th></tr></thead>
					{/if}
					<tbody>
						{#each g.tasks as task (task.id)}
							<tr class="trow" class:sel={paneTaskId === task.id}>
								<td class="c-name"><button class="task-open" onclick={() => openTask(task)}>{task.name || 'Untitled task'}</button></td>
								<td><button class="board-chip" onclick={() => (panel = task.board_id)}><span class="dot"></span>{boardName(task.board_id)}</button></td>
								<td class="c-status">{@render pill(task, 'status', STATUS_OPTS)}</td>
								<td class="c-prio">{@render pill(task, 'priority', PRIORITY_OPTS)}</td>
								<td class="c-due">
									<button class="due-btn" class:empty={!task.due_date} onclick={openDate}>{task.due_date ? fmtDay(task.due_date) : '—'}</button>
									<input type="date" class="due-hidden" value={task.due_date ?? ''} onchange={(e) => patchTask(task, { due_date: e.currentTarget.value || null })} />
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/each}
	{/if}
{/snippet}

<div class="page">
	<AppNav active="" user={data.user} />

	<div class="workspace" bind:this={workspaceEl}>
		<!-- Left: board list (room for future view types) -->
		<aside class="sidebar">
			<div class="side-section">
				<div class="side-label">Views</div>
				<button class="board-item" class:active={panel === 'my'} onclick={() => (panel = 'my')}>
					<svg class="vico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
					<span class="bi-name">My tasks</span>
					<span class="bi-count">{myTasksCount}</span>
				</button>
				<button class="board-item" class:active={panel === 'created'} onclick={() => (panel = 'created')}>
					<svg class="vico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
					<span class="bi-name">Created by me</span>
					<span class="bi-count">{createdCount}</span>
				</button>
			</div>

			<div class="side-section">
				<div class="side-label">Boards</div>
				{#each boards as b (b.id)}
					<div class="board-item" class:active={b.id === panel} role="button" tabindex="0"
						onclick={() => (panel = b.id)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); panel = b.id; } }}>
						<span class="bico">{@render bicon(b.icon ?? 'board', 15)}</span>
						<span class="bi-name">{b.name}</span>
						<button class="bi-gear" onclick={(e) => openBoardCfg(b, e)} aria-label="Board settings" title="Board settings">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
						</button>
						<span class="bi-count">{taskCount(b.id)}</span>
					</div>
				{/each}
				{#if boards.length === 0}<div class="side-empty">No boards yet</div>{/if}
				<button class="add-board" onclick={addBoard} disabled={busy}>+ New board</button>
			</div>
		</aside>

		<!-- Right: full-width board -->
		<main class="board-area">
			{#if isView}
				<header class="board-head">
					<span class="board-ico">{@render bicon(panel === 'created' ? 'pen' : 'list', 20)}</span>
					<div class="board-title static">{panel === 'created' ? 'Created by me' : 'My tasks'}</div>
					<div class="board-meta">{overviewCount} {overviewCount === 1 ? 'task' : 'tasks'}</div>
					<div class="spacer"></div>
					<div class="head-group">{@render headerActions()}</div>
				</header>
				<div class="table-wrap">
					{@render otable(overviewGroups)}
				</div>
			{:else if !selectedBoard}
				<div class="blank">
					<p>Create your first board to get started.</p>
					<button class="btn primary" onclick={addBoard} disabled={busy}>+ New board</button>
				</div>
			{:else}
				<header class="board-head">
					<span class="board-ico">{@render bicon(selectedBoard.icon ?? 'board', 20)}</span>
					<div class="board-title static">{selectedBoard.name}</div>
					<div class="board-meta">{boardTasks.length} {boardTasks.length === 1 ? 'task' : 'tasks'}</div>
					<div class="spacer"></div>
					<div class="head-group">
						<div class="viewseg">
							<button class:active={view === 'table'} onclick={() => setView('table')}>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="15" x2="21" y2="15"/></svg>Table
							</button>
							<button class:active={view === 'board'} onclick={() => setView('board')}>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>Board
							</button>
							<button class:active={view === 'calendar'} onclick={() => setView('calendar')}>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Calendar
							</button>
						</div>
						{@render headerActions()}
					</div>
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
								</tr>
							{/each}
							{#if boardTasks.length === 0}
								<tr><td colspan="5"><div class="empty-tasks">No tasks yet. <button class="linkish" onclick={() => openCreate()}>Add the first one.</button></div></td></tr>
							{/if}
						</tbody>
					</table>
				</div>

				{:else if view === 'board'}
				<div class="kanban">
					{#each STATUS_OPTS as col (col.v)}
						<section class="kcol" class:dragover={dragOver === col.v}>
							<header class="kcol-head">
								<span class="kdot" style="background:{col.color};"></span>{col.label}
								<span class="kcount">{boardTasks.filter((t) => t.status === col.v).length}</span>
							</header>
							<div class="kcol-body" ondragover={(e) => allowDrop(e, col.v)} ondrop={(e) => dropToStatus(e, col.v)} role="list">
								{#each boardTasks.filter((t) => t.status === col.v) as task (task.id)}
									<article class="kcard" draggable="true" ondragstart={(e) => onDragStart(e, task)} ondragend={onDragEnd} onclick={() => openTask(task)}>
										<div class="kc-name">{task.name || 'Untitled task'}</div>
										<div class="kc-pill">{@render pill(task, 'priority', PRIORITY_OPTS)}</div>
										<div class="kc-foot">
											{#if task.due_date}<span class="kc-due">{fmtDay(task.due_date)}</span>{/if}
											{#if task.assignee_email}<span class="kc-who">{userName(task.assignee_email)}</span>{/if}
											{#if task.associations.length}<span class="kc-links">{task.associations.length} linked</span>{/if}
										</div>
									</article>
								{/each}
								<button class="kadd" onclick={() => openCreate({ status: col.v })}>+ Add</button>
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
							<div class="cal-cell" class:out={!day} class:today={day && ymd(day) === todayYmd} class:dragover={day && dragOver === ymd(day)}
								ondragover={day ? (e) => allowDrop(e, ymd(day)) : undefined}
								ondrop={day ? (e) => dropToDate(e, ymd(day)) : undefined}
								role={day ? 'listitem' : undefined}>
								{#if day}
									<div class="cal-dnum">
										<span>{day.getDate()}</span>
										<button class="cal-add" onclick={() => openCreate({ due: ymd(day) })} aria-label="Add task">+</button>
									</div>
									<div class="cal-items">
										{#each tasksForDay(day) as task (task.id)}
											<button class="cal-item" draggable="true" ondragstart={(e) => onDragStart(e, task)} ondragend={onDragEnd} style="border-left-color:{statusColor(task.status)};" onclick={() => openTask(task)}>{task.name || 'Untitled task'}</button>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
					<div class="cal-unsched" class:dragover={dragOver === 'unsched'} ondragover={(e) => allowDrop(e, 'unsched')} ondrop={(e) => dropToDate(e, null)} role="list">
						<span class="cu-label">No due date</span>
						{#each unscheduled as task (task.id)}
							<button class="cal-item inline" draggable="true" ondragstart={(e) => onDragStart(e, task)} ondragend={onDragEnd} style="border-left-color:{statusColor(task.status)};" onclick={() => openTask(task)}>{task.name || 'Untitled task'}</button>
						{/each}
						{#if unscheduled.length === 0}<span class="cu-hint">Drag a task here to clear its date</span>{/if}
					</div>
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
			<div class="ph-actions">
				<button class="pane-del" onclick={() => removeTask(paneTask)} title="Delete task" aria-label="Delete task">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
				</button>
				<button class="pane-close" onclick={closePane} aria-label="Close">×</button>
			</div>
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

<!-- ── Create task pane (staged; nothing saved until Save) ───────────── -->
{#if creating && draft}
	<div class="overlay" onclick={closeCreate} role="presentation" transition:fade={{ duration: 120 }}></div>
	<aside class="pane" style="top:{paneTop}px" transition:fly={{ x: 440, duration: 180 }}>
		<div class="pane-head">
			<span class="pane-kicker">New task</span>
			<button class="pane-close" onclick={closeCreate} aria-label="Close">×</button>
		</div>

		<textarea class="pane-title" rows="1" placeholder="Task name…"
			value={draft.name}
			oninput={(e) => { draft.name = e.currentTarget.value; e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'; }}></textarea>

		<div class="pane-grid">
			<div class="pg-row"><span class="pg-k">Board</span>
				<div class="pg-v">
					<select class="assignee wide" value={draft.board_id ?? ''} onchange={(e) => (draft.board_id = e.currentTarget.value)}>
						{#each boards as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
					</select>
				</div>
			</div>
			<div class="pg-row"><span class="pg-k">Status</span><div class="pg-v">{@render pill(draft, 'status', STATUS_OPTS)}</div></div>
			<div class="pg-row"><span class="pg-k">Priority</span><div class="pg-v">{@render pill(draft, 'priority', PRIORITY_OPTS)}</div></div>
			<div class="pg-row"><span class="pg-k">Assigned to</span>
				<div class="pg-v">
					<select class="assignee wide" value={draft.assignee_email ?? ''} onchange={(e) => (draft.assignee_email = e.currentTarget.value || null)}>
						<option value="">— Unassigned</option>
						{#each users as u}<option value={u.email}>{u.name}</option>{/each}
					</select>
				</div>
			</div>
			<div class="pg-row"><span class="pg-k">Due date</span>
				<div class="pg-v">
					<button class="due-btn" class:empty={!draft.due_date} onclick={openDate}>{draft.due_date ? fmtDay(draft.due_date) : 'Set a date'}</button>
					<input type="date" class="due-hidden" value={draft.due_date ?? ''} onchange={(e) => (draft.due_date = e.currentTarget.value || null)} />
				</div>
			</div>
		</div>

		<div class="pane-sec">
			<div class="sec-label">Description</div>
			<textarea class="desc" rows="4" placeholder="Add a description…"
				value={draft.description ?? ''} oninput={(e) => (draft.description = e.currentTarget.value)}></textarea>
		</div>

		<div class="pane-sec">
			<div class="sec-label">Links</div>
			<div class="chips">
				{#each draft.associations as a (a.kind + ':' + a.ref_id)}
					{@const m = KIND_META[a.kind]}
					<span class="chip" style="color:{m.color};background:{m.bg};">
						<span class="chip-k">{m.short}</span><span class="chip-l">{a.ref_label ?? a.ref_id}</span>
						<button class="chip-x" onclick={() => removeAssoc(draft, a)} aria-label="Remove">×</button>
					</span>
				{/each}
				<button class="chip-add" onclick={() => openPicker(draft)}>+ Link</button>
			</div>
		</div>

		<div class="pane-foot">
			<button class="btn ghost" onclick={closeCreate}>Cancel</button>
			<button class="btn primary" onclick={saveCreate} disabled={busy || !draft.board_id}>Save task</button>
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

<!-- ── Board settings modal ──────────────────────────────────────────── -->
{#if boardCfg}
	<div class="overlay high" onclick={closeBoardCfg} role="presentation"></div>
	<div class="pick-modal bcfg" role="dialog" aria-modal="true">
		<div class="pm-head"><strong>Board settings</strong><button class="pm-close" onclick={closeBoardCfg} aria-label="Close">×</button></div>
		<label class="cfg-label" for="cfg-name">Name</label>
		<input id="cfg-name" class="pm-search" bind:value={cfgName} onkeydown={(e) => { if (e.key === 'Enter') saveBoardCfg(); }} />
		<div class="cfg-label">Icon</div>
		<div class="icon-grid">
			{#each ICON_KEYS as k (k)}
				<button class="icon-opt" class:sel={cfgIcon === k} onclick={() => (cfgIcon = k)} aria-label={k}>{@render bicon(k, 18)}</button>
			{/each}
		</div>
		<div class="bcfg-foot">
			<button class="btn ghost" onclick={archiveBoard}>Archive</button>
			<button class="btn ghost danger" onclick={deleteBoardCfg}>Delete</button>
			<div class="spacer"></div>
			<button class="btn" onclick={closeBoardCfg}>Cancel</button>
			<button class="btn primary" onclick={saveBoardCfg}>Save</button>
		</div>
	</div>
{/if}

<style>
	.page { min-height: 100vh; display: flex; flex-direction: column; background: #F2F2F3; }
	.workspace { flex: 1; display: flex; min-height: 0; }

	/* ── Sidebar ──────────────────────────────────────────── */
	.sidebar { width: 248px; flex-shrink: 0; background: #fff; border-right: 1px solid #ECECEF; display: flex; flex-direction: column; overflow-y: auto; padding-top: 14px; }
	.side-section { padding: 10px 12px; }
	.vico { color: var(--accent); opacity: .9; flex-shrink: 0; }
	.side-label { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #A1A1AA; padding: 6px 8px; }
	.board-item { width: 100%; display: flex; align-items: center; gap: 9px; padding: 8px 10px; border: 0; background: none; border-radius: 8px; cursor: pointer; font-size: 14px; color: #3F3F46; text-align: left; }
	.board-item:hover { background: #F6F3EC; }
	.board-item.active { background: #FDEFE2; color: #18181B; font-weight: 700; }
	.bico, .vico { color: var(--accent); display: flex; align-items: center; flex-shrink: 0; }
	.bi-gear { display: none; border: 0; background: none; cursor: pointer; color: #A1A1AA; padding: 3px; border-radius: 6px; margin-left: auto; }
	.bi-gear:hover { color: #18181B; background: #EBE6DA; }
	.board-item:hover .bi-gear { display: flex; }
	.board-item:hover .bi-count { display: none; }
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
	.board-title.static { cursor: default; }
	.board-title.static:hover { border-color: transparent; }
	.board-meta { font-size: 13px; color: #A1A1AA; font-weight: 600; }
	.spacer { flex: 1; }

	.head-group { display: flex; align-items: center; gap: 10px; }
	.board-ico { color: var(--accent); display: flex; align-items: center; flex-shrink: 0; }

	.viewseg { display: inline-flex; background: #EFEDE8; border-radius: 9px; padding: 3px; }
	.viewseg button { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; border-radius: 7px; padding: 7px 12px; font-size: 13px; font-weight: 600; color: #52525B; cursor: pointer; }
	.viewseg button svg { opacity: .8; }
	.viewseg button.active { background: #fff; color: #18181B; box-shadow: 0 1px 2px rgba(0,0,0,.08); }

	/* Hide-completed toggle (boxed to align with the buttons) */
	.toggle { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; font-size: 13px; font-weight: 600; color: #52525B; }
	.toggle.ctl-box { border: 1px solid var(--border); background: #fff; border-radius: 9px; padding: 7px 12px; }
	.toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
	.toggle .track { width: 38px; height: 22px; border-radius: 999px; background: #D4D4D8; position: relative; transition: background .15s; flex-shrink: 0; }
	.toggle .knob { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform .15s; }
	.toggle input:checked + .track { background: var(--accent); }
	.toggle input:checked + .track .knob { transform: translateX(16px); }
	.toggle input:focus-visible + .track { outline: 2px solid var(--accent); outline-offset: 2px; }
	.toggle .tlabel { white-space: nowrap; }

	.btn { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--border); background: #fff; border-radius: 9px; padding: 8px 14px; font-size: 14px; font-weight: 600; cursor: pointer; color: #3F3F46; }
	.btn:hover { background: #FAF6EE; }
	.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
	.btn.primary:hover { background: var(--accent-hover); }
	.btn.primary:disabled { opacity: .5; cursor: default; }
	.btn.sm { padding: 7px 12px; font-size: 13px; }
	.btn.ghost { background: none; border-color: transparent; color: #A1A1AA; }
	.btn.ghost.danger:hover { color: var(--danger); background: #FEF2F2; }
	.btn:disabled { opacity: .5; cursor: default; }

	.table-wrap { flex: 1; overflow: auto; padding: 4px 28px 60px; }
	table.tasks { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 14px; background: #fff; border: 1px solid #EFECE4; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 2px rgba(100,60,0,.04); }
	table.tasks thead th { position: sticky; top: 0; z-index: 2; background: #FBFAF7; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #9A8F7B; padding: 15px 16px; border-bottom: 1px solid #F0ECE2; white-space: nowrap; }
	th.ctr { text-align: center; }
	.c-name { min-width: 280px; }
	.c-status, .c-prio { width: 170px; }
	.c-due { width: 150px; }
	.c-assignee { width: 170px; }

	.trow td { padding: 4px 16px; border-bottom: 1px solid #F4F1EA; background: #fff; vertical-align: middle; transition: background .1s; }
	.trow:last-child td { border-bottom: 0; }
	.trow:hover td { background: #FCFBF8; }
	.trow.sel td { background: #FDF6EC; }

	.task-open { width: 100%; text-align: left; border: 1px solid transparent; background: none; border-radius: 7px; padding: 6px 8px; margin-left: -8px; font-size: 14px; font-weight: 600; color: #18181B; cursor: pointer; }
	.task-open:hover { border-color: #ECECEF; background: #fff; }

	/* Pill + menu */
	.pill-wrap { position: relative; display: flex; justify-content: center; }
	.pill { width: 100%; border: 0; border-radius: 7px; padding: 5px 10px; font-size: 12px; font-weight: 700; text-align: center; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0,0,0,.04); }
	.menu { position: fixed; min-width: 170px; background: #fff; border: 1px solid #ECECEF; border-radius: 10px; box-shadow: var(--shadow-lg); padding: 5px; z-index: 210; }
	.menu-item { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; background: none; padding: 8px 9px; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 600; color: #3F3F46; text-align: left; }
	.menu-item:hover { background: #F6F3EC; }
	.swatch { width: 12px; height: 12px; border-radius: 4px; flex-shrink: 0; }
	.menu-backdrop { position: fixed; inset: 0; z-index: 200; }

	/* Date cell */
	.due-btn { width: 100%; text-align: center; border: 1px solid transparent; background: none; border-radius: 7px; padding: 6px 10px; font-size: 13px; font-weight: 600; color: #3F3F46; cursor: pointer; }
	.due-btn:hover { border-color: #ECECEF; background: #fff; }
	.due-btn.empty { color: #B4B4BC; font-weight: 600; }
	.due-hidden { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

	.assignee { width: 100%; border: 1px solid #ECECEF; background: #fff; border-radius: 7px; padding: 6px 9px; font-size: 13px; color: #3F3F46; }
	.assignee:focus { outline: none; border-color: var(--accent); }
	.assignee.wide { max-width: 260px; }

	.empty-tasks { padding: 28px 12px; text-align: center; color: #A1A1AA; font-size: 14px; }
	.linkish { border: 0; background: none; color: var(--accent); font-weight: 700; cursor: pointer; font-size: 14px; }

	/* ── Overview views (My tasks / Created by me) ─────────── */
	.ov-sec { margin-bottom: 22px; }
	.ov-sec-head { display: flex; align-items: baseline; gap: 8px; padding: 2px 2px 8px; }
	.ov-sec-title { font-size: 13px; font-weight: 800; color: #18181B; }
	.ov-sec-count { font-size: 12px; color: #A1A1AA; font-weight: 700; }
	.tasks.ov { table-layout: fixed; }
	.oc-board { width: 184px; } .oc-status { width: 160px; } .oc-prio { width: 160px; } .oc-due { width: 150px; }
	.board-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #ECECEF; background: #fff; border-radius: 7px; padding: 5px 9px; font-size: 12.5px; font-weight: 600; color: #52525B; cursor: pointer; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.board-chip:hover { background: #FAF6EE; border-color: var(--border); }
	.board-chip .dot { width: 7px; height: 7px; }

	/* ── Board (kanban) view ──────────────────────────────── */
	.kanban { flex: 1; overflow: auto; display: flex; gap: 14px; padding: 4px 28px 60px; align-items: flex-start; }
	.kcol { flex: 0 0 280px; background: #F7F6F3; border: 1px solid #EEECE6; border-radius: 12px; display: flex; flex-direction: column; max-height: 100%; }
	.kcol-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; font-size: 13px; font-weight: 800; color: #3F3F46; }
	.kdot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
	.kcount { margin-left: auto; font-size: 12px; color: #A1A1AA; font-weight: 700; }
	.kcol-body { display: flex; flex-direction: column; gap: 8px; padding: 0 10px 12px; overflow-y: auto; min-height: 60px; }
	.kcard { background: #fff; border: 1px solid #ECECEF; border-radius: 10px; padding: 10px 11px; cursor: grab; box-shadow: 0 1px 2px rgba(100,60,0,.05); display: flex; flex-direction: column; gap: 8px; text-align: left; }
	.kcard:hover { border-color: var(--border); }
	.kcard:active { cursor: grabbing; }
	.kcol.dragover { background: #FBF3E8; }
	.kcol.dragover .kcol-body { outline: 2px dashed var(--accent); outline-offset: -2px; border-radius: 10px; }
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
	.cal-cell.dragover { border-color: var(--accent); border-style: dashed; background: #FDF6EC; }
	.cal-dnum { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 700; color: #52525B; }
	.cal-add { opacity: 0; border: 0; background: none; cursor: pointer; color: var(--accent); font-size: 17px; line-height: 1; font-weight: 700; padding: 0 2px; }
	.cal-cell:hover .cal-add { opacity: 1; }
	.cal-items { display: flex; flex-direction: column; gap: 3px; overflow: hidden; }
	.cal-item { display: block; width: 100%; text-align: left; border: 0; border-left: 3px solid #ccc; background: #FAFAF8; border-radius: 5px; padding: 3px 7px; font-size: 12px; font-weight: 600; color: #3F3F46; cursor: grab; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.cal-item:hover { background: #F2EFE8; }
	.cal-item:active { cursor: grabbing; }
	.cal-item.inline { width: auto; max-width: 220px; }
	.cal-unsched { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; border: 1px dashed transparent; border-radius: 10px; padding: 6px; }
	.cal-unsched.dragover { border-color: var(--accent); background: #FDF6EC; }
	.cu-label { font-size: 12px; font-weight: 700; color: #A1A1AA; margin-right: 4px; }
	.cu-hint { font-size: 12px; color: #C7BCAB; }

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
	.ph-actions { display: flex; align-items: center; gap: 2px; }
	.pane-del { border: 0; background: none; cursor: pointer; color: #C4C4CC; padding: 5px; border-radius: 7px; display: flex; }
	.pane-del:hover { color: var(--danger); background: #FEF2F2; }
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

	.pane-foot { margin-top: auto; position: sticky; bottom: 0; background: #fff; display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid #F3F3F5; }

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

	/* Board settings modal */
	.bcfg { gap: 10px; }
	.cfg-label { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #9A8F7B; }
	.icon-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; }
	.icon-opt { display: flex; align-items: center; justify-content: center; padding: 8px; border: 1px solid #ECECEF; border-radius: 9px; background: #fff; cursor: pointer; color: #52525B; }
	.icon-opt:hover { background: #FAF6EE; }
	.icon-opt.sel { border-color: var(--accent); color: var(--accent); background: #FDF6EC; }
	.bcfg-foot { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
	.bcfg-foot .spacer { flex: 1; }
	.btn.ghost { background: none; border-color: #ECECEF; color: #71717A; }
	.btn.ghost:hover { background: #F4F4F5; color: #18181B; }
	.btn.ghost.danger { color: #B91C1C; }
	.btn.ghost.danger:hover { background: #FEF2F2; color: var(--danger); }

	@media (max-width: 760px) {
		.sidebar { width: 170px; }
		.board-head { padding: 16px; }
		.table-wrap { padding: 0 12px 40px; }
	}
</style>
