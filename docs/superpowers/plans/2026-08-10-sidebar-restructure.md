# Primary Sidebar Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `NavRail` (a floating "card" that doesn't read as app chrome) and `ListsView`'s separate list-picker panel with one true full-height primary sidebar that also contains list search, multi-select, and CRUD — reclaiming the horizontal space the old three-panel layout (nav card + list-picker card + task card) was losing.

**Architecture:** All of `ListsView.jsx`'s state and mutation logic (lists, checked-list selection, task CRUD, list CRUD, the two poll loops) is extracted into a new custom hook, `useListsWorkspace()`, with zero behavior change (Task 1) — this isolates "did the extraction break anything" from "did the restructure break anything." A new `PrimarySidebar.jsx` component is then built as a self-contained leaf piece combining the four nav links with the relocated list-picker UI, plus a new list-name search box (Task 2) — not wired in yet. Finally, `App.jsx` is rewritten to own a single `useListsWorkspace()` instance and hand its pieces to `PrimarySidebar` (picker) and a slimmed-down `ListsView` (task display only), `NavRail.jsx` is deleted, and the CSS is updated so the sidebar spans full height with no card styling (Task 3).

**Tech Stack:** Same as the rest of the project — React, plain CSS (no new dependencies).

## Global Constraints

- The primary sidebar is a true full-height sidebar (flush left, no border-radius/box-shadow/card padding around the whole nav — those visual treatments belong to content panels, not nav chrome), not a top navbar.
- Multi-select (checkbox) list selection is preserved exactly as it works today — only its container moves.
- The new list search box filters the sidebar's list rows by case-insensitive substring match on name. It does not affect `checkedListIds` or the main content area — a checked list stays visible in the task area even if a search temporarily hides its row in the picker.
- No backend changes. No change to `TodayBoard.jsx`, `CompletedView.jsx`, or `Timeline.jsx`'s internals — this plan only touches sidebar/list-picker/nav-shell code.
- No automated frontend tests exist in this project (no test runner configured) — verification is manual throughout, per [Testing](../../testing.md).

---

## File Structure

```
frontend/
  src/
    useListsWorkspace.js       # CREATE: extracted state/logic from ListsView.jsx, unchanged behavior
    App.jsx                     # MODIFY: owns the one useListsWorkspace() instance, renders
                                  # PrimarySidebar + ListsView + the other three sections
    App.css                      # MODIFY across Tasks 2-3: new sidebar/search styles, then
                                   # removal of the old card-style nav/list-picker rules
    components/
      PrimarySidebar.jsx          # CREATE: replaces NavRail.jsx — 4 nav links + relocated
                                    # list picker (search, create, checkboxes, rename, delete)
      NavRail.jsx                  # DELETE (Task 3) — superseded by PrimarySidebar.jsx
      ListsView.jsx                  # MODIFY (Task 1, then again in Task 3) — first consumes
                                       # the new hook with no UI change, then drops its own
                                       # list-picker rendering entirely (moved to PrimarySidebar)
```

---

### Task 1: Extract `useListsWorkspace` — behavior-preserving refactor

**Files:**
- Create: `frontend/src/useListsWorkspace.js`
- Modify: `frontend/src/components/ListsView.jsx`

**Interfaces:**
- Consumes: nothing new — this is a pure relocation of existing state/logic, same imports from `../api.js` (now `./api.js` relative to the hook's location at `frontend/src/`).
- Produces: `useListsWorkspace()` returns `{ lists, checkedListIds, newListName, setNewListName, renamingListId, setRenamingListId, renameValue, setRenameValue, error, visibleLists, listOptions, tasksForList, handleGlobalAdd, handleToggle, handleDelete, handleEditTask, handlePullToToday, handleCheckedListChange, handleCreateList, handleRenameList, handleDeleteList }` — the exact set of state values and handlers `ListsView.jsx` currently defines locally, now available to any component that calls the hook. `ListsView.jsx` in this task still renders exactly what it renders today (including its own `<aside className="lists-sidebar">`) — this task changes *where the state lives*, not what's on screen.

- [ ] **Step 1: Create `frontend/src/useListsWorkspace.js`**

```js
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createList,
  createTask,
  deleteTask as deleteTaskRequest,
  getTasks,
  getUserLists,
  getSystemLists,
  removeList,
  renameList,
  setStatus,
  updateTaskLinkedLists,
  updateTaskTitle,
} from './api.js';

const POLL_INTERVAL_MS = 3000;

export function useListsWorkspace() {
  const [lists, setLists] = useState([]);
  const [checkedListIds, setCheckedListIds] = useState([]);
  const [newListName, setNewListName] = useState('');
  const [renamingListId, setRenamingListId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [allTasks, setAllTasks] = useState([]);
  const [todayListId, setTodayListId] = useState(null);
  const [error, setError] = useState(null);

  const refreshTasks = useCallback(async () => {
    const tasks = await getTasks();
    setAllTasks(tasks);
  }, []);

  const refreshWorkspace = useCallback(async (preferredCheckedListIds = checkedListIds) => {
    try {
      const fetchedLists = await getUserLists();
      setLists(fetchedLists);

      if (fetchedLists.length === 0) {
        setCheckedListIds([]);
        setAllTasks([]);
        setError(null);
        return;
      }

      const fetchedIds = new Set(fetchedLists.map((list) => list.id));
      let effectiveChecked = preferredCheckedListIds.filter((id) => fetchedIds.has(id));
      if (effectiveChecked.length === 0) {
        effectiveChecked = [fetchedLists[0].id];
      }

      setCheckedListIds(effectiveChecked);
      await refreshTasks();
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [checkedListIds, refreshTasks]);

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;

    async function loadTodayListId() {
      try {
        const systemLists = await getSystemLists();
        if (cancelled) return;
        if (systemLists.length > 0) {
          setTodayListId(systemLists[0].id);
          if (intervalId) clearInterval(intervalId);
        }
      } catch {
        // Transient failure — retried on the next interval tick below.
      }
    }

    loadTodayListId();
    intervalId = setInterval(loadTodayListId, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const fetchedLists = await getUserLists();
        if (cancelled) return;

        setLists(fetchedLists);

        if (fetchedLists.length === 0) {
          setCheckedListIds([]);
          setAllTasks([]);
          setError(null);
          return;
        }

        const fetchedIds = new Set(fetchedLists.map((list) => list.id));
        let effectiveChecked = checkedListIds.filter((id) => fetchedIds.has(id));
        if (effectiveChecked.length === 0) {
          effectiveChecked = [fetchedLists[0].id];
          setCheckedListIds(effectiveChecked);
        }

        const tasks = await getTasks();
        if (cancelled) return;
        setAllTasks(tasks);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [checkedListIds]);

  const tasksForList = useCallback(
    (list) =>
      allTasks.filter((task) => {
        const linkedListIds = Array.isArray(task.linked_list_ids) ? task.linked_list_ids : [task.list_id];
        return linkedListIds.includes(list.id);
      }),
    [allTasks]
  );

  const visibleLists = useMemo(
    () => lists.filter((list) => checkedListIds.includes(list.id)),
    [lists, checkedListIds]
  );

  const listOptions = useMemo(() => lists.map((list) => ({ id: list.id, name: list.name })), [lists]);

  async function handleAdd(listId, title, linkedListIds = []) {
    const previous = allTasks;
    const optimisticId = `tmp-${Date.now()}`;
    const optimisticTask = {
      id: optimisticId,
      title,
      status: 'pending',
      list_id: listId,
      linked_list_ids: Array.from(new Set([listId, ...linkedListIds])),
      linked_lists: lists
        .filter((list) => Array.from(new Set([listId, ...linkedListIds])).includes(list.id))
        .map((list) => list.name),
      created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
      updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };

    setError(null);
    setAllTasks((current) => [...current, optimisticTask]);

    try {
      const created = await createTask(title, listId, linkedListIds);
      setAllTasks((current) => current.map((task) => (task.id === optimisticId ? created : task)));

      const requestedLinkedListIds = Array.from(new Set([listId, ...linkedListIds]));
      const returnedLinkedListIds = Array.isArray(created?.linked_list_ids)
        ? created.linked_list_ids
        : [created?.list_id ?? listId];
      const missingLinkedListIds = requestedLinkedListIds.filter((id) => !returnedLinkedListIds.includes(id));

      if (missingLinkedListIds.length > 0 && created?.id) {
        try {
          const synced = await updateTaskLinkedLists(created.id, requestedLinkedListIds);
          setAllTasks((current) => current.map((task) => (task.id === optimisticId ? synced : task)));
        } catch {
          setError('Task was created, but some selected tags were not saved. Please restart backend and try again.');
          await refreshWorkspace(checkedListIds);
        }
      }
    } catch (err) {
      setAllTasks(previous);
      setError(err.message);
      await refreshWorkspace(checkedListIds);
    }
  }

  async function handleGlobalAdd({ title, linkedListIds }) {
    const deduped = Array.from(new Set(linkedListIds));
    const ownerListId = deduped[0] ?? checkedListIds[0] ?? listOptions[0]?.id;
    if (!ownerListId) return;

    await handleAdd(ownerListId, title, deduped);
  }

  async function handleToggle(listId, id, nextStatus) {
    const previous = allTasks;
    setError(null);
    setAllTasks((current) => current.map((task) => (task.id === id ? { ...task, status: nextStatus } : task)));

    try {
      const updated = await setStatus(id, nextStatus);
      setAllTasks((current) => current.map((task) => (task.id === id ? updated : task)));
    } catch (err) {
      setAllTasks(previous);
      setError(err.message);
      await refreshWorkspace(checkedListIds);
    }
  }

  async function handleDelete(listId, id) {
    const previous = allTasks;
    setError(null);
    setAllTasks((current) => current.filter((task) => task.id !== id));

    try {
      await deleteTaskRequest(id);
    } catch (err) {
      setAllTasks(previous);
      setError(err.message);
      await refreshWorkspace(checkedListIds);
    }
  }

  async function handleEditTask(listId, taskId, { title, linkedListIds }) {
    const previous = allTasks;
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

    setError(null);
    setAllTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              title,
              linked_list_ids: linkedListIds,
              linked_lists: lists.filter((list) => linkedListIds.includes(list.id)).map((list) => list.name),
              updated_at: now,
            }
          : task
      )
    );

    try {
      await updateTaskTitle(taskId, title);
      const updated = await updateTaskLinkedLists(taskId, linkedListIds);
      setAllTasks((current) => current.map((task) => (task.id === taskId ? updated : task)));
    } catch (err) {
      setAllTasks(previous);
      setError(err.message);
      await refreshWorkspace(checkedListIds);
    }
  }

  async function handlePullToToday(taskId) {
    if (!todayListId) {
      setError('The Today list is not available yet — try again in a moment.');
      return;
    }

    const previous = allTasks;
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;

    const currentLinkedListIds = Array.isArray(task.linked_list_ids) ? task.linked_list_ids : [task.list_id];
    const nextLinkedListIds = Array.from(new Set([...currentLinkedListIds, todayListId]));

    setError(null);
    setAllTasks((current) =>
      current.map((t) => (t.id === taskId ? { ...t, linked_list_ids: nextLinkedListIds } : t))
    );

    try {
      const updated = await updateTaskLinkedLists(taskId, nextLinkedListIds);
      setAllTasks((current) => current.map((t) => (t.id === taskId ? updated : t)));
    } catch (err) {
      setAllTasks(previous);
      setError(err.message);
      await refreshWorkspace(checkedListIds);
    }
  }

  function handleCheckedListChange(listId, checked) {
    const next = checked
      ? Array.from(new Set([...checkedListIds, listId]))
      : checkedListIds.filter((id) => id !== listId);

    setCheckedListIds(next);
  }

  async function handleCreateList() {
    const name = newListName.trim();
    if (!name) return;

    setError(null);
    try {
      const created = await createList(name);
      setLists((current) => [...current, created]);
      setCheckedListIds((current) => Array.from(new Set([...current, created.id])));
      setNewListName('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRenameList(id) {
    const name = renameValue.trim();
    if (!name) return;

    setError(null);
    try {
      const updated = await renameList(id, name);
      setLists((current) => current.map((list) => (list.id === id ? updated : list)));
      setRenamingListId(null);
      setRenameValue('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteList(id) {
    setError(null);
    try {
      await removeList(id);
      const remaining = lists.filter((list) => list.id !== id);
      setLists(remaining);
      setCheckedListIds((current) => current.filter((listId) => listId !== id));
      setAllTasks((current) => current.filter((task) => task.list_id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  return {
    lists,
    checkedListIds,
    newListName,
    setNewListName,
    renamingListId,
    setRenamingListId,
    renameValue,
    setRenameValue,
    error,
    visibleLists,
    listOptions,
    tasksForList,
    handleGlobalAdd,
    handleToggle,
    handleDelete,
    handleEditTask,
    handlePullToToday,
    handleCheckedListChange,
    handleCreateList,
    handleRenameList,
    handleDeleteList,
  };
}
```

This is the exact code currently inside `ListsView.jsx`'s function body, moved verbatim, with a `return { ... }` object replacing the JSX return.

- [ ] **Step 2: Update `frontend/src/components/ListsView.jsx` to consume the hook**

Replace the entire file content with:

```jsx
import { useListsWorkspace } from '../useListsWorkspace.js';
import AddTaskModal from './AddTaskModal.jsx';
import TaskList from './TaskList.jsx';
import CompletedSection from './CompletedSection.jsx';

export default function ListsView() {
  const {
    lists,
    checkedListIds,
    newListName,
    setNewListName,
    renamingListId,
    setRenamingListId,
    renameValue,
    setRenameValue,
    error,
    visibleLists,
    listOptions,
    tasksForList,
    handleGlobalAdd,
    handleToggle,
    handleDelete,
    handleEditTask,
    handlePullToToday,
    handleCheckedListChange,
    handleCreateList,
    handleRenameList,
    handleDeleteList,
  } = useListsWorkspace();

  return (
    <div className="lists-view-shell">
      <aside className="lists-sidebar" aria-label="Task lists">
        <h2 className="sidebar-title">Lists</h2>
        <div className="list-create-row">
          <input
            className="list-create-input"
            type="text"
            placeholder="New list"
            value={newListName}
            onChange={(event) => setNewListName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleCreateList();
              }
            }}
            aria-label="Create new list"
          />
          <button className="list-action-btn" type="button" onClick={() => void handleCreateList()}>
            Add
          </button>
        </div>
        <ul className="lists-nav">
          {lists.map((list) => {
            const isChecked = checkedListIds.includes(list.id);
            const isRenaming = list.id === renamingListId;

            return (
              <li key={list.id} className={isChecked ? 'list-item list-item-selected' : 'list-item'}>
                {isRenaming ? (
                  <>
                    <input
                      className="list-visibility-check"
                      type="checkbox"
                      checked={isChecked}
                      onChange={(event) => handleCheckedListChange(list.id, event.target.checked)}
                      aria-label={`Show tasks for ${list.name}`}
                    />
                    <input
                      className="list-rename-input"
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void handleRenameList(list.id);
                        }
                      }}
                      aria-label={`Rename ${list.name}`}
                    />
                    <button className="list-mini-btn" type="button" onClick={() => void handleRenameList(list.id)}>
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      className="list-visibility-check"
                      type="checkbox"
                      checked={isChecked}
                      onChange={(event) => handleCheckedListChange(list.id, event.target.checked)}
                      aria-label={`Show tasks for ${list.name}`}
                    />
                    <button
                      className="list-name-btn"
                      type="button"
                      onClick={() => handleCheckedListChange(list.id, !isChecked)}
                    >
                      {list.name}
                    </button>
                    <button
                      className="list-mini-btn"
                      type="button"
                      onClick={() => {
                        setRenamingListId(list.id);
                        setRenameValue(list.name);
                      }}
                    >
                      Rename
                    </button>
                  </>
                )}
                <button className="list-delete-btn" type="button" onClick={() => void handleDeleteList(list.id)}>
                  🗑
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="tasks-card" aria-label="Tasks for checked lists">
        <div className="tasks-header-row">
          <h1 className="tasks-title">Tasks</h1>
          <AddTaskModal
            buttonLabel="+ Add Task"
            dialogTitle="Add task"
            listOptions={listOptions}
            initialSelectedListIds={[]}
            onSubmit={handleGlobalAdd}
          />
        </div>
        {error && <p className="error-banner">{error}</p>}

        {visibleLists.length === 0 && <p className="empty-note">Select one or more list checkboxes to view their tasks.</p>}

        <div className="list-task-grid">
          {visibleLists.map((list) => {
            const listTasks = tasksForList(list);
            const pending = listTasks.filter((task) => task.status === 'pending' || task.status === 'in_progress');
            const completed = listTasks.filter((task) => task.status === 'done');

            return (
              <section key={list.id} className="list-task-group" aria-label={`Tasks for ${list.name}`}>
                <h2 className="list-task-heading">{list.name}</h2>
                <TaskList
                  tasks={pending}
                  onToggle={(id, nextStatus) => handleToggle(list.id, id, nextStatus)}
                  onDelete={(id) => handleDelete(list.id, id)}
                  onEdit={(taskId, payload) => handleEditTask(list.id, taskId, payload)}
                  onPullToToday={handlePullToToday}
                  listOptions={listOptions}
                />
                <CompletedSection
                  tasks={completed}
                  onToggle={(id, nextStatus) => handleToggle(list.id, id, nextStatus)}
                  onDelete={(id) => handleDelete(list.id, id)}
                  onEdit={(taskId, payload) => handleEditTask(list.id, taskId, payload)}
                  listOptions={listOptions}
                />
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
```

This is identical UI/behavior to the current file — only the state/handler definitions moved out into the hook.

- [ ] **Step 3: Manually verify no regression**

Start the backend (`node backend/index.js`) and frontend (`cd frontend && npm run dev`), open the app. Confirm the Lists section looks and behaves exactly as before this task: list picker on the left with checkboxes, create/rename/delete all work, tasks display on the right, "Pull to Today" still works. Confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/useListsWorkspace.js frontend/src/components/ListsView.jsx
git commit -m "refactor: extract useListsWorkspace hook from ListsView (no behavior change)"
```

---

### Task 2: `PrimarySidebar` component — leaf piece with search, not wired in yet

**Files:**
- Create: `frontend/src/components/PrimarySidebar.jsx`
- Modify: `frontend/src/App.css`

**Interfaces:**
- Consumes: nothing new — receives everything as props (defined below).
- Produces: `PrimarySidebar` props: `{ active: string, onSelect: (id: string) => void, lists: Array<{id, name}>, checkedListIds: number[], onCheckedListChange: (id: number, checked: boolean) => void, newListName: string, onNewListNameChange: (value: string) => void, onCreateList: () => void, renamingListId: number | null, renameValue: string, onRenameValueChange: (value: string) => void, onStartRename: (id: number, name: string) => void, onSaveRename: (id: number) => void, onDeleteList: (id: number) => void }`. Not imported/rendered by anything yet in this task (same "build the leaf piece first" pattern used successfully in every prior plan this session) — `App.jsx` still renders the old `NavRail` until Task 3.

- [ ] **Step 1: Create `frontend/src/components/PrimarySidebar.jsx`**

```jsx
import { useState } from 'react';

const NAV_ITEMS = [
  { id: 'today', label: 'Today' },
  { id: 'lists', label: 'Lists' },
  { id: 'completed', label: 'Completed' },
  { id: 'timeline', label: 'Timeline' },
];

export default function PrimarySidebar({
  active,
  onSelect,
  lists,
  checkedListIds,
  onCheckedListChange,
  newListName,
  onNewListNameChange,
  onCreateList,
  renamingListId,
  renameValue,
  onRenameValueChange,
  onStartRename,
  onSaveRename,
  onDeleteList,
}) {
  const [listSearchQuery, setListSearchQuery] = useState('');

  const filteredLists = lists.filter((list) =>
    list.name.toLowerCase().includes(listSearchQuery.toLowerCase())
  );

  return (
    <nav className="primary-sidebar" aria-label="Primary">
      <ul className="nav-rail-list">
        {NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={item.id === active ? 'nav-rail-btn nav-rail-btn-active' : 'nav-rail-btn'}
              onClick={() => onSelect(item.id)}
              aria-current={item.id === active ? 'page' : undefined}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>

      {active === 'lists' && (
        <div className="sidebar-lists-section" aria-label="Task lists">
          <input
            className="list-search-input"
            type="text"
            placeholder="Search lists"
            value={listSearchQuery}
            onChange={(event) => setListSearchQuery(event.target.value)}
            aria-label="Search lists"
          />
          <div className="list-create-row">
            <input
              className="list-create-input"
              type="text"
              placeholder="New list"
              value={newListName}
              onChange={(event) => onNewListNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onCreateList();
                }
              }}
              aria-label="Create new list"
            />
            <button className="list-action-btn" type="button" onClick={() => onCreateList()}>
              Add
            </button>
          </div>
          <ul className="lists-nav">
            {filteredLists.map((list) => {
              const isChecked = checkedListIds.includes(list.id);
              const isRenaming = list.id === renamingListId;

              return (
                <li key={list.id} className={isChecked ? 'list-item list-item-selected' : 'list-item'}>
                  {isRenaming ? (
                    <>
                      <input
                        className="list-visibility-check"
                        type="checkbox"
                        checked={isChecked}
                        onChange={(event) => onCheckedListChange(list.id, event.target.checked)}
                        aria-label={`Show tasks for ${list.name}`}
                      />
                      <input
                        className="list-rename-input"
                        value={renameValue}
                        onChange={(event) => onRenameValueChange(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            onSaveRename(list.id);
                          }
                        }}
                        aria-label={`Rename ${list.name}`}
                      />
                      <button className="list-mini-btn" type="button" onClick={() => onSaveRename(list.id)}>
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        className="list-visibility-check"
                        type="checkbox"
                        checked={isChecked}
                        onChange={(event) => onCheckedListChange(list.id, event.target.checked)}
                        aria-label={`Show tasks for ${list.name}`}
                      />
                      <button
                        className="list-name-btn"
                        type="button"
                        onClick={() => onCheckedListChange(list.id, !isChecked)}
                      >
                        {list.name}
                      </button>
                      <button
                        className="list-mini-btn"
                        type="button"
                        onClick={() => onStartRename(list.id, list.name)}
                      >
                        Rename
                      </button>
                    </>
                  )}
                  <button className="list-delete-btn" type="button" onClick={() => onDeleteList(list.id)}>
                    🗑
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </nav>
  );
}
```

Note: `NAV_ITEMS` here still uses `{ id: 'today', label: 'Today' }` — the rename to "Dashboard" is Section 2's job (a separate future plan), not this one. Reuses the existing `.list-item`, `.list-visibility-check`, `.list-name-btn`, `.list-mini-btn`, `.list-delete-btn`, `.list-create-row`, `.list-create-input`, `.list-action-btn`, `.lists-nav` classes verbatim from the current `ListsView.jsx` markup (Step 2 below adds the two genuinely new classes: `.primary-sidebar`, `.sidebar-lists-section`, `.list-search-input`).

- [ ] **Step 2: Add new CSS classes to `frontend/src/App.css`**

Add these rules after the existing `.placeholder-panel` rule (does not modify any existing rule in this step — purely additive, so the still-rendered old `NavRail`/`.nav-rail` is completely unaffected):

```css
.primary-sidebar {
  background: #fcfdff;
  border-right: 1px solid #e7ebf0;
  min-height: 100vh;
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sidebar-lists-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

.list-search-input {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.9rem;
}

.list-search-input:focus {
  outline: 2px solid #d3e3fd;
  border-color: var(--accent);
}
```

- [ ] **Step 3: Manually verify the file builds**

Run `cd frontend && npm run build` (or confirm `npm run dev` still starts cleanly). `PrimarySidebar.jsx` isn't imported anywhere yet, so this just confirms it has no syntax errors and the CSS addition doesn't break anything.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PrimarySidebar.jsx frontend/src/App.css
git commit -m "feat: add PrimarySidebar component with relocated list picker and search (not wired in yet)"
```

---

### Task 3: Wire it together — delete `NavRail`, assemble `App.jsx`, finalize CSS

**Files:**
- Delete: `frontend/src/components/NavRail.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/ListsView.jsx`
- Modify: `frontend/src/App.css`

**Interfaces:**
- Consumes: `useListsWorkspace` (Task 1), `PrimarySidebar` (Task 2) — both already exist and are already correct; this task wires them together.
- Produces: `ListsView` — no longer calls `useListsWorkspace()` itself; instead takes `{ visibleLists, tasksForList, listOptions, error, handleGlobalAdd, handleToggle, handleDelete, handleEditTask, handlePullToToday }` as props (App.jsx is now the single owner of the one `useListsWorkspace()` instance, avoiding two independent hook instances — which would double the polling and desync state between the sidebar and the task view).

- [ ] **Step 1: Delete `frontend/src/components/NavRail.jsx`**

```bash
rm frontend/src/components/NavRail.jsx
```

- [ ] **Step 2: Rewrite `frontend/src/components/ListsView.jsx` to be purely presentational**

Replace the entire file content with:

```jsx
import AddTaskModal from './AddTaskModal.jsx';
import TaskList from './TaskList.jsx';
import CompletedSection from './CompletedSection.jsx';

export default function ListsView({
  visibleLists,
  tasksForList,
  listOptions,
  error,
  handleGlobalAdd,
  handleToggle,
  handleDelete,
  handleEditTask,
  handlePullToToday,
}) {
  return (
    <section className="tasks-card" aria-label="Tasks for checked lists">
      <div className="tasks-header-row">
        <h1 className="tasks-title">Tasks</h1>
        <AddTaskModal
          buttonLabel="+ Add Task"
          dialogTitle="Add task"
          listOptions={listOptions}
          initialSelectedListIds={[]}
          onSubmit={handleGlobalAdd}
        />
      </div>
      {error && <p className="error-banner">{error}</p>}

      {visibleLists.length === 0 && <p className="empty-note">Select one or more list checkboxes to view their tasks.</p>}

      <div className="list-task-grid">
        {visibleLists.map((list) => {
          const listTasks = tasksForList(list);
          const pending = listTasks.filter((task) => task.status === 'pending' || task.status === 'in_progress');
          const completed = listTasks.filter((task) => task.status === 'done');

          return (
            <section key={list.id} className="list-task-group" aria-label={`Tasks for ${list.name}`}>
              <h2 className="list-task-heading">{list.name}</h2>
              <TaskList
                tasks={pending}
                onToggle={(id, nextStatus) => handleToggle(list.id, id, nextStatus)}
                onDelete={(id) => handleDelete(list.id, id)}
                onEdit={(taskId, payload) => handleEditTask(list.id, taskId, payload)}
                onPullToToday={handlePullToToday}
                listOptions={listOptions}
              />
              <CompletedSection
                tasks={completed}
                onToggle={(id, nextStatus) => handleToggle(list.id, id, nextStatus)}
                onDelete={(id) => handleDelete(list.id, id)}
                onEdit={(taskId, payload) => handleEditTask(list.id, taskId, payload)}
                listOptions={listOptions}
              />
            </section>
          );
        })}
      </div>
    </section>
  );
}
```

Note the outer `<div className="lists-view-shell">` wrapper is gone — there's no sidebar to sit beside anymore, so `ListsView` now returns just the task-display `<section>` directly.

- [ ] **Step 3: Rewrite `frontend/src/App.jsx`**

Replace the entire file content with:

```jsx
import { useState } from 'react';
import { useListsWorkspace } from './useListsWorkspace.js';
import PrimarySidebar from './components/PrimarySidebar.jsx';
import ListsView from './components/ListsView.jsx';
import CompletedView from './components/CompletedView.jsx';
import TodayBoard from './components/TodayBoard.jsx';
import Timeline from './components/Timeline.jsx';

export default function App() {
  const [activeSection, setActiveSection] = useState('lists');
  const workspace = useListsWorkspace();

  function handleStartRename(id, name) {
    workspace.setRenamingListId(id);
    workspace.setRenameValue(name);
  }

  return (
    <div className="app-shell">
      <PrimarySidebar
        active={activeSection}
        onSelect={setActiveSection}
        lists={workspace.lists}
        checkedListIds={workspace.checkedListIds}
        onCheckedListChange={workspace.handleCheckedListChange}
        newListName={workspace.newListName}
        onNewListNameChange={workspace.setNewListName}
        onCreateList={workspace.handleCreateList}
        renamingListId={workspace.renamingListId}
        renameValue={workspace.renameValue}
        onRenameValueChange={workspace.setRenameValue}
        onStartRename={handleStartRename}
        onSaveRename={workspace.handleRenameList}
        onDeleteList={workspace.handleDeleteList}
      />
      <div className="main-panel">
        {activeSection === 'today' && <TodayBoard />}
        <div style={{ display: activeSection === 'lists' ? undefined : 'none' }}>
          <ListsView
            visibleLists={workspace.visibleLists}
            tasksForList={workspace.tasksForList}
            listOptions={workspace.listOptions}
            error={workspace.error}
            handleGlobalAdd={workspace.handleGlobalAdd}
            handleToggle={workspace.handleToggle}
            handleDelete={workspace.handleDelete}
            handleEditTask={workspace.handleEditTask}
            handlePullToToday={workspace.handlePullToToday}
          />
        </div>
        {activeSection === 'completed' && <CompletedView />}
        {activeSection === 'timeline' && <Timeline />}
      </div>
    </div>
  );
}
```

`ListsView` stays wrapped in the `display:none`-toggled div (not a plain conditional render) — this preserves the "stays mounted, don't lose `checkedListIds`/scroll position on section switch" fix from the earlier bug-fix round in this project's history. `TodayBoard`, `CompletedView`, and `Timeline` remain simple conditional renders, unchanged from before.

- [ ] **Step 4: Finalize `frontend/src/App.css`**

Replace the existing `.app-shell` rule:

```css
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 16px;
  width: 100%;
  align-items: start;
  padding: 20px;
}

.main-panel {
  min-width: 0;
}
```

with:

```css
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  width: 100%;
  align-items: stretch;
}

.main-panel {
  min-width: 0;
  padding: 20px;
}
```

Remove the `.lists-view-shell` rule entirely (no longer used — `ListsView` no longer renders that wrapper):

```css
.lists-view-shell {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
```

Remove the old `.nav-rail` card-style rule entirely (superseded by `.primary-sidebar`, added in Task 2):

```css
.nav-rail {
  background: #fcfdff;
  border: 1px solid #e7ebf0;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(60, 64, 67, 0.06);
  padding: 12px;
  height: fit-content;
}
```

Remove the `.lists-sidebar` rule entirely (superseded — the list picker no longer has its own card, it's part of `.primary-sidebar` now):

```css
.lists-sidebar {
  background: #fcfdff;
  border: 1px solid #e7ebf0;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(60, 64, 67, 0.06);
  padding: 16px;
}
```

Finally, update the `@media (max-width: 900px)` block. Find:

```css
@media (max-width: 900px) {
  .app-shell {
    grid-template-columns: 1fr;
    padding: 14px;
  }

  .lists-view-shell {
    grid-template-columns: 1fr;
  }

  .lists-sidebar,
  .tasks-card {
    border-radius: 12px;
  }

  .tasks-card {
    padding: 14px 14px 8px;
  }

  .tasks-header-row {
    flex-wrap: wrap;
  }

  .tasks-title {
    font-size: 1.25rem;
  }

  .kanban-board {
    grid-template-columns: 1fr;
  }
}
```

Replace it with:

```css
@media (max-width: 900px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .primary-sidebar {
    min-height: auto;
    border-right: none;
    border-bottom: 1px solid #e7ebf0;
  }

  .main-panel {
    padding: 14px;
  }

  .tasks-card {
    border-radius: 12px;
    padding: 14px 14px 8px;
  }

  .tasks-header-row {
    flex-wrap: wrap;
  }

  .tasks-title {
    font-size: 1.25rem;
  }

  .kanban-board {
    grid-template-columns: 1fr;
  }
}
```

(This drops the two now-dead selectors — `.lists-view-shell`, `.lists-sidebar` — and adds a rule so the sidebar stacks above the content and loses its full-height/right-border treatment on narrow screens, matching the plan's mobile layout intent.)

- [ ] **Step 5: Manually verify end-to-end**

Start the backend (`node backend/index.js`) and frontend (`cd frontend && npm run dev`), open the app.

1. Confirm the sidebar now spans the full viewport height, flush to the left edge, with no card border/shadow around the whole nav — Dashboard/Lists/Completed/Timeline links at the top.
2. Click "Lists" — confirm a search box, "+ New list" row, and your list rows (with checkboxes) now appear directly in the sidebar below the nav links, and the task area to the right is now full-width (no separate list-picker card competing for space).
3. Type a partial list name into the search box — confirm only matching list rows are hidden/shown, and that a list's checkbox state and visibility in the task area are unaffected by the search filter (check a list, then search for something that hides its row — confirm its tasks are still shown on the right).
4. Confirm checkbox multi-select still works (check two lists, see both side-by-side in the task area), and that create/rename/delete list still work from their new location in the sidebar.
5. Switch to Today, Completed, and Timeline — confirm each still works exactly as before, and that navigating back to Lists preserves your checked-list selection (per the `display:none`-mounted `ListsView`).
6. Resize the browser below ~900px width — confirm the sidebar stacks above the content rather than squeezing it.
7. Confirm no console errors throughout.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ListsView.jsx frontend/src/App.jsx frontend/src/App.css
git rm frontend/src/components/NavRail.jsx
git commit -m "feat: assemble PrimarySidebar into App, retire NavRail and the separate list-picker card"
```

---

## Self-Review Notes

- **Spec coverage:** True full-height sidebar, no card styling ✓ (Task 3 CSS). List picker merged into sidebar ✓ (Task 2 component, Task 3 wiring). Multi-select preserved ✓ (same `checkedListIds`/`handleCheckedListChange` logic, just relocated, unchanged in Task 1). List-name search, client-side, doesn't affect visibility state ✓ (Task 2's `filteredLists` computed separately from `checkedListIds`). State lift required by the restructure ✓ (Task 1's `useListsWorkspace` hook, single instance owned by `App.jsx` per Task 3's Interfaces note — explicitly avoids the double-instance/desync trap).
- **Task independence:** Task 1 is a pure refactor (old UI, new state location) — verifiable in isolation. Task 2 is a new leaf component + additive-only CSS — doesn't affect the still-running old `NavRail`. Task 3 does the only wiring (delete old component, rewire `App.jsx`, remove now-dead CSS) — matches the "leaf pieces before assembly" pattern used successfully in every prior plan this session.
- **Type/signature consistency:** `PrimarySidebar`'s props (Task 2) are supplied with matching names by `App.jsx` in Task 3 (`onCheckedListChange={workspace.handleCheckedListChange}`, etc.) — `onStartRename` specifically is a new combined handler (`handleStartRename` in `App.jsx`) since the hook itself only exposes the two separate setters (`setRenamingListId`, `setRenameValue`) that the old inline `ListsView` code called together — this composition happens at the `App.jsx` call site, not inside the hook, keeping the hook's surface minimal.
- **Placeholder scan:** No TBD/TODO markers; every step contains complete, runnable code.
