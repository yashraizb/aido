import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import AddTaskModal from './AddTaskModal.jsx';
import { formatTimestamp } from '../formatTimestamp.js';

export default function TaskRow({ task, onToggle, onDelete, onEdit, listOptions, onPullToToday }) {
  const isDone = task.status === 'done';
  const nextStatus = isDone ? 'pending' : 'done';
  const updatedLabel = formatTimestamp(task.updated_at);
  const linkedLists = Array.isArray(task.linked_lists) ? task.linked_lists : [];
  const linkedListIds = Array.isArray(task.linked_list_ids) ? task.linked_list_ids : [task.list_id];

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuOpensUpward, setMenuOpensUpward] = useState(false);
  const menuRef = useRef(null);
  const menuDropdownRef = useRef(null);
  const editModalRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handleOutsideClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuOpensUpward(false);
      return;
    }
    const dropdown = menuDropdownRef.current;
    if (!dropdown) return;
    setMenuOpensUpward(dropdown.getBoundingClientRect().bottom > window.innerHeight);
  }, [menuOpen]);

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
        ref={editModalRef}
        hideTrigger
        dialogTitle="Edit task"
        listOptions={listOptions}
        initialTitle={task.title}
        initialSelectedListIds={linkedListIds}
        submitLabel="Save changes"
        onSubmit={({ title, linkedListIds: nextLinkedListIds }) => onEdit(task.id, { title, linkedListIds: nextLinkedListIds })}
      />
      <div className="task-menu-wrap" ref={menuOpen ? menuRef : null}>
        <button
          type="button"
          className="task-menu-trigger"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-label={`Options for ${task.title}`}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span aria-hidden="true">⋮</span>
        </button>
        {menuOpen && (
          <div
            className={menuOpensUpward ? 'task-menu-dropdown task-menu-dropdown-up' : 'task-menu-dropdown'}
            role="menu"
            ref={menuDropdownRef}
          >
            <button
              type="button"
              className="task-menu-item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                editModalRef.current?.open();
              }}
            >
              Edit
              <span aria-hidden="true">✏️</span>
            </button>
            {onPullToToday && (
              <button
                type="button"
                className="task-menu-item"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void onPullToToday(task.id);
                }}
              >
                Pull into Today
                <span aria-hidden="true">→</span>
              </button>
            )}
            <button
              type="button"
              className="task-menu-item task-menu-item-danger"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                void onDelete(task.id);
              }}
            >
              Delete
              <span aria-hidden="true">🗑</span>
            </button>
          </div>
        )}
      </div>
    </li>
  );
}
