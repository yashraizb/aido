const STATUS_ORDER = ['pending', 'in_progress', 'done'];

function nextStatusFor(status) {
  const index = STATUS_ORDER.indexOf(status);
  if (index === -1 || index === STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[index + 1];
}

export default function TaskCard({ task, listName, onAdvance, onRemoveFromToday, onDragStart }) {
  const advanceTo = nextStatusFor(task.status);
  const tags = Array.isArray(task.tags) ? task.tags : [];

  return (
    <div
      className="kanban-card"
      draggable="true"
      onDragStart={(event) => onDragStart(event, task.id)}
    >
      <div className="kanban-card-title">{task.title}</div>
      <div className="kanban-card-meta">
        {listName && <span className="task-tag-chip">{listName}</span>}
        {tags.map((tag) => (
          <span key={tag} className="task-tag-chip">
            {tag}
          </span>
        ))}
      </div>
      <div className="kanban-card-actions">
        {advanceTo && (
          <button
            type="button"
            className="kanban-advance-btn"
            onClick={() => onAdvance(task.id, advanceTo)}
            aria-label={`Advance ${task.title} to ${advanceTo.replace('_', ' ')}`}
          >
            →
          </button>
        )}
        <button
          type="button"
          className="kanban-remove-btn"
          onClick={() => onRemoveFromToday(task.id)}
          aria-label={`Remove ${task.title} from Today`}
        >
          ✕ Today
        </button>
      </div>
    </div>
  );
}
