import AddTaskModal from './AddTaskModal.jsx';
import { formatTimestamp } from '../formatTimestamp.js';

export default function TaskRow({ task, onToggle, onDelete, onEdit, listOptions, onPullToToday }) {
  const isDone = task.status === 'done';
  const nextStatus = isDone ? 'pending' : 'done';
  const updatedLabel = formatTimestamp(task.updated_at);
  const linkedLists = Array.isArray(task.linked_lists) ? task.linked_lists : [];
  const linkedListIds = Array.isArray(task.linked_list_ids) ? task.linked_list_ids : [task.list_id];

  return (
    <li className="task-row">
      <label className="task-check-wrap">
        <input
          className="task-check"
          type="checkbox"
          checked={isDone}
          onChange={() => {
            void onToggle(task.id, nextStatus);
          }}
          aria-label={isDone ? `Mark ${task.title} as pending` : `Mark ${task.title} as done`}
        />
        <span className="task-check-mark" aria-hidden="true" />
      </label>
      <div className="task-text-wrap">
        <span className={isDone ? 'task-title task-title-done' : 'task-title'}>{task.title}</span>
        {linkedLists.length > 0 && (
          <span className="task-tags" aria-label="Task tags">
            {linkedLists.map((linkedList) => (
              <span key={linkedList} className="task-tag-chip">
                {linkedList}
              </span>
            ))}
          </span>
        )}
        <span className="task-meta">Last modified: {updatedLabel}</span>
      </div>
      <AddTaskModal
        buttonLabel="Edit"
        buttonClassName="task-edit-inline-btn"
        dialogTitle="Edit task"
        listOptions={listOptions}
        initialTitle={task.title}
        initialSelectedListIds={linkedListIds}
        submitLabel="Save changes"
        onSubmit={({ title, linkedListIds: nextLinkedListIds }) => onEdit(task.id, { title, linkedListIds: nextLinkedListIds })}
      />
      {onPullToToday && (
        <button
          className="task-pull-today-btn"
          type="button"
          onClick={() => {
            void onPullToToday(task.id);
          }}
          aria-label={`Pull ${task.title} into Today`}
        >
          → Today
        </button>
      )}
      <button
        className="task-delete"
        type="button"
        onClick={() => {
          void onDelete(task.id);
        }}
        aria-label={`Delete ${task.title}`}
      >
        🗑
      </button>
    </li>
  );
}