import TaskRow from './TaskRow.jsx';

export default function TaskList({ tasks, onToggle, onDelete, onEdit, listOptions }) {
  if (tasks.length === 0) {
    return null;
  }

  return (
    <ul className="task-list" aria-label="Pending tasks">
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
  );
}