import { useState } from 'react';
import TaskRow from './TaskRow.jsx';

export default function CompletedSection({ tasks, onToggle, onDelete, onEdit, listOptions }) {
  const [open, setOpen] = useState(false);

  if (tasks.length === 0) {
    return null;
  }

  return (
    <section className="completed-section" aria-label="Completed tasks">
      <button
        className="completed-toggle"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>Completed ({tasks.length})</span>
      </button>
      {open && (
        <ul className="task-list task-list-completed">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={onToggle}
              onDelete={onDelete}
              onEdit={onEdit}
              listOptions={listOptions}
            />
          ))}
        </ul>
      )}
    </section>
  );
}