import { useEffect, useState } from 'react';
import { getAuditLogs, restoreAuditLog } from '../api.js';
import { describeAuditEntry } from '../describeAuditEntry.js';
import { formatTimestamp } from '../formatTimestamp.js';

export default function Timeline() {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getAuditLogs();
        if (!cancelled) {
          setEntries(data);
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

  async function refreshAfterRestore() {
    try {
      const data = await getAuditLogs();
      setEntries(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRestore(entry) {
    const confirmed = window.confirm(
      `Restore to this point in time?\n\n"${describeAuditEntry(entry)}" (${formatTimestamp(entry.created_at)})\n\nThis replaces all current lists, tasks, tags, and their links with the state captured at that moment. This cannot be undone from here (though the restore itself is logged, so you could restore again to before it).`
    );
    if (!confirmed) return;

    setRestoringId(entry.id);
    setError(null);
    try {
      await restoreAuditLog(entry.id);
      await refreshAfterRestore();
    } catch (err) {
      setError(err.message);
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <section className="tasks-card" aria-label="Timeline">
      <h1 className="tasks-title">Timeline</h1>
      {error && <p className="error-banner">{error}</p>}
      {!loading && entries.length === 0 && <p className="empty-note">No activity recorded yet.</p>}
      <ul className="task-list">
        {entries.map((entry) => (
          <li key={entry.id} className="list-feed-row timeline-row">
            <div className="task-text-wrap">
              <span className="task-title">{describeAuditEntry(entry)}</span>
              <span className="task-meta">{formatTimestamp(entry.created_at)}</span>
            </div>
            <button
              type="button"
              className="timeline-restore-btn"
              onClick={() => handleRestore(entry)}
              disabled={restoringId === entry.id}
              aria-label={`Restore to here: ${describeAuditEntry(entry)}`}
            >
              {restoringId === entry.id ? 'Restoring…' : 'Restore to here'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
