import { useListsWorkspace } from '../useListsWorkspace.js';
import AddTaskModal from './AddTaskModal.jsx';
import TaskList from './TaskList.jsx';
import CompletedSection from './CompletedSection.jsx';

export default function ListsView() {
  const {
    lists,
    checkedListIds,
    newListName,
    setNewListName,
    renamingListId,
    setRenamingListId,
    renameValue,
    setRenameValue,
    error,
    visibleLists,
    listOptions,
    tasksForList,
    handleGlobalAdd,
    handleToggle,
    handleDelete,
    handleEditTask,
    handlePullToToday,
    handleCheckedListChange,
    handleCreateList,
    handleRenameList,
    handleDeleteList,
  } = useListsWorkspace();

  return (
    <div className="lists-view-shell">
      <aside className="lists-sidebar" aria-label="Task lists">
        <h2 className="sidebar-title">Lists</h2>
        <div className="list-create-row">
          <input
            className="list-create-input"
            type="text"
            placeholder="New list"
            value={newListName}
            onChange={(event) => setNewListName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleCreateList();
              }
            }}
            aria-label="Create new list"
          />
          <button className="list-action-btn" type="button" onClick={() => void handleCreateList()}>
            Add
          </button>
        </div>
        <ul className="lists-nav">
          {lists.map((list) => {
            const isChecked = checkedListIds.includes(list.id);
            const isRenaming = list.id === renamingListId;

            return (
              <li key={list.id} className={isChecked ? 'list-item list-item-selected' : 'list-item'}>
                {isRenaming ? (
                  <>
                    <input
                      className="list-visibility-check"
                      type="checkbox"
                      checked={isChecked}
                      onChange={(event) => handleCheckedListChange(list.id, event.target.checked)}
                      aria-label={`Show tasks for ${list.name}`}
                    />
                    <input
                      className="list-rename-input"
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void handleRenameList(list.id);
                        }
                      }}
                      aria-label={`Rename ${list.name}`}
                    />
                    <button className="list-mini-btn" type="button" onClick={() => void handleRenameList(list.id)}>
                      Save
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      className="list-visibility-check"
                      type="checkbox"
                      checked={isChecked}
                      onChange={(event) => handleCheckedListChange(list.id, event.target.checked)}
                      aria-label={`Show tasks for ${list.name}`}
                    />
                    <button
                      className="list-name-btn"
                      type="button"
                      onClick={() => handleCheckedListChange(list.id, !isChecked)}
                    >
                      {list.name}
                    </button>
                    <button
                      className="list-mini-btn"
                      type="button"
                      onClick={() => {
                        setRenamingListId(list.id);
                        setRenameValue(list.name);
                      }}
                    >
                      Rename
                    </button>
                  </>
                )}
                <button className="list-delete-btn" type="button" onClick={() => void handleDeleteList(list.id)}>
                  🗑
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

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
    </div>
  );
}
