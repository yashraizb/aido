import { useCallback, useEffect, useState } from 'react';
import { getTodayTasks, getCompletedTasks, getUserLists, getSystemLists, setStatus, updateTaskLinkedLists } from '../api.js';
import TaskCard from './TaskCard.jsx';
import ActivityCalendar from './ActivityCalendar.jsx';

const POLL_INTERVAL_MS = 3000;

const COLUMNS = [
  { status: 'pending', heading: 'To Do' },
  { status: 'in_progress', heading: 'In Progress' },
  { status: 'done', heading: 'Done' },
];

export default function TodayBoard() {
  const [tasks, setTasks] = useState([]);
  const [completedTasks, setCompletedTasks] = useState([]);
  const [listNameById, setListNameById] = useState({});
  const [todayListId, setTodayListId] = useState(null);
  const [error, setError] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [today, userLists, completed] = await Promise.all([getTodayTasks(), getUserLists(), getCompletedTasks()]);
      setTasks(today);
      setListNameById(Object.fromEntries(userLists.map((list) => [list.id, list.name])));
      setCompletedTasks(completed);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTodayListId() {
      try {
        const systemLists = await getSystemLists();
        if (!cancelled && systemLists.length > 0) {
          setTodayListId(systemLists[0].id);
        }
      } catch {
        // Non-fatal: "Remove from Today" simply won't work if this fails; the board still displays.
      }
    }

    loadTodayListId();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;
      await refresh();
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refresh]);

  async function handleStatusChange(taskId, nextStatus) {
    const previous = tasks;
    setError(null);
    setTasks((current) => current.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)));

    try {
      const updated = await setStatus(taskId, nextStatus);
      setTasks((current) => current.map((t) => (t.id === taskId ? updated : t)));
    } catch (err) {
      setTasks(previous);
      setError(err.message);
      await refresh();
    }
  }

  async function handleRemoveFromToday(taskId) {
    if (!todayListId) {
      setError('The Today list is not available yet — try again in a moment.');
      return;
    }

    const previous = tasks;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const currentLinkedListIds = Array.isArray(task.linked_list_ids) ? task.linked_list_ids : [task.list_id];
    const nextLinkedListIds = currentLinkedListIds.filter((id) => id !== todayListId);

    setError(null);
    setTasks((current) => current.filter((t) => t.id !== taskId));

    try {
      await updateTaskLinkedLists(taskId, nextLinkedListIds);
    } catch (err) {
      setTasks(previous);
      setError(err.message);
      await refresh();
    }
  }

  function handleDragStart(event, taskId) {
    event.dataTransfer.setData('text/plain', String(taskId));
    event.dataTransfer.effectAllowed = 'move';
  }

  function handleDrop(event, columnStatus) {
    event.preventDefault();
    setDragOverStatus(null);
    const taskId = Number(event.dataTransfer.getData('text/plain'));
    if (!taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === columnStatus) return;
    void handleStatusChange(taskId, columnStatus);
  }

  return (
    <section className="tasks-card" aria-label="Dashboard">
      <h1 className="tasks-title">Dashboard</h1>
      {error && <p className="error-banner">{error}</p>}
      <ActivityCalendar completedTasks={completedTasks} />
      {tasks.length === 0 && (
        <p className="empty-note">
          Nothing here yet — pull a task into Today from the Lists view to see it on this board.
        </p>
      )}
      <div className="kanban-board">
        {COLUMNS.map((column) => {
          const columnTasks = tasks.filter((t) => t.status === column.status);
          const isOver = dragOverStatus === column.status;

          return (
            <div key={column.status} className="kanban-column">
              <h2 className="kanban-column-heading">
                <span>{column.heading}</span>
                <span className="kanban-column-count">{columnTasks.length}</span>
              </h2>
              <div
                className={isOver ? 'kanban-column-dropzone kanban-column-dropzone-over' : 'kanban-column-dropzone'}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverStatus(column.status);
                }}
                onDragLeave={() => setDragOverStatus((current) => (current === column.status ? null : current))}
                onDrop={(event) => handleDrop(event, column.status)}
              >
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    listName={listNameById[task.list_id]}
                    onAdvance={handleStatusChange}
                    onRemoveFromToday={handleRemoveFromToday}
                    onDragStart={handleDragStart}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
