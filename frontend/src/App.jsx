import { useEffect, useState } from 'react';

const API_URL = 'http://localhost:3001/tasks';
const POLL_INTERVAL_MS = 3000;

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchTasks() {
      try {
        const res = await fetch(API_URL);
        const data = await res.json();
        if (!cancelled) {
          setTasks(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }

    fetchTasks();
    const id = setInterval(fetchTasks, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div>
      <h1>Today's Tasks</h1>
      {error && <p>Error loading tasks: {error}</p>}
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            {task.title} — {task.status}
          </li>
        ))}
      </ul>
    </div>
  );
}
