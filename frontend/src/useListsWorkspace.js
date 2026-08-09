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
