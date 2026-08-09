import AddTaskModal from './AddTaskModal.jsx';
import TaskList from './TaskList.jsx';
import CompletedSection from './CompletedSection.jsx';

export default function ListsView({
  visibleLists,
  tasksForList,
  listOptions,
  error,
  handleGlobalAdd,
  handleToggle,
  handleDelete,
  handleEditTask,
  handlePullToToday,
}) {
  return (
    <section className="tasks-card" aria-label="Tasks for checked lists">
      <div className="tasks-header-row">
        <h1 className="tasks-title">Tasks</h1>
        <AddTaskModal
          buttonLabel="+ Add Task"
          dialogTitle="Add task"
          listOptions={listOptions}
          initialSelectedListIds={[]}
          onSubmit={handleGlobalAdd}
        />
      </div>
      {error && <p className="error-banner">{error}</p>}

      {visibleLists.length === 0 && <p className="empty-note">Select one or more list checkboxes to view their tasks.</p>}

      <div className="list-task-grid">
        {visibleLists.map((list) => {
          const listTasks = tasksForList(list);
          const pending = listTasks.filter((task) => task.status === 'pending' || task.status === 'in_progress');
          const completed = listTasks.filter((task) => task.status === 'done');

          return (
            <section key={list.id} className="list-task-group" aria-label={`Tasks for ${list.name}`}>
              <h2 className="list-task-heading">{list.name}</h2>
              <TaskList
                tasks={pending}
                onToggle={(id, nextStatus) => handleToggle(list.id, id, nextStatus)}
                onDelete={(id) => handleDelete(list.id, id)}
                onEdit={(taskId, payload) => handleEditTask(list.id, taskId, payload)}
                onPullToToday={handlePullToToday}
                listOptions={listOptions}
              />
              <CompletedSection
                tasks={completed}
                onToggle={(id, nextStatus) => handleToggle(list.id, id, nextStatus)}
                onDelete={(id) => handleDelete(list.id, id)}
                onEdit={(taskId, payload) => handleEditTask(list.id, taskId, payload)}
                listOptions={listOptions}
              />
            </section>
          );
        })}
      </div>
    </section>
  );
}
