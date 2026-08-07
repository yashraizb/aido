import { useEffect, useState } from 'react';
import { getCompletedTasks } from '../api.js';
import { formatTimestamp } from '../formatTimestamp.js';

export default function CompletedView() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getCompletedTasks();
        if (!cancelled) {
          setTasks(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="tasks-card" aria-label="Completed tasks">
      <h1 className="tasks-title">Completed</h1>
      {error && <p className="error-banner">{error}</p>}
      {!loading && tasks.length === 0 && <p className="empty-note">No completed tasks yet.</p>}
      <ul className="task-list">
        {tasks.map((task) => {
          const linkedLists = Array.isArray(task.linked_lists) ? task.linked_lists : [];
          return (
            <li key={task.id} className="task-row">
              <div className="task-text-wrap">
                <span className="task-title task-title-done">{task.title}</span>
                {linkedLists.length > 0 && (
                  <span className="task-tags" aria-label="Task lists">
                    {linkedLists.map((listName) => (
                      <span key={listName} className="task-tag-chip">
                        {listName}
                      </span>
                    ))}
                  </span>
                )}
                <span className="task-meta">Completed: {formatTimestamp(task.updated_at)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
