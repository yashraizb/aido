import { useState } from 'react';
import { useListsWorkspace } from './useListsWorkspace.js';
import PrimarySidebar from './components/PrimarySidebar.jsx';
import ListsView from './components/ListsView.jsx';
import CompletedView from './components/CompletedView.jsx';
import TodayBoard from './components/TodayBoard.jsx';
import Timeline from './components/Timeline.jsx';

export default function App() {
  const [activeSection, setActiveSection] = useState('lists');
  const workspace = useListsWorkspace();

  function handleStartRename(id, name) {
    workspace.setRenamingListId(id);
    workspace.setRenameValue(name);
  }

  return (
    <div className="app-shell">
      <PrimarySidebar
        active={activeSection}
        onSelect={setActiveSection}
        lists={workspace.lists}
        checkedListIds={workspace.checkedListIds}
        onCheckedListChange={workspace.handleCheckedListChange}
        newListName={workspace.newListName}
        onNewListNameChange={workspace.setNewListName}
        onCreateList={workspace.handleCreateList}
        renamingListId={workspace.renamingListId}
        renameValue={workspace.renameValue}
        onRenameValueChange={workspace.setRenameValue}
        onStartRename={handleStartRename}
        onSaveRename={workspace.handleRenameList}
        onDeleteList={workspace.handleDeleteList}
      />
      <div className="main-panel">
        {activeSection === 'dashboard' && <TodayBoard />}
        <div style={{ display: activeSection === 'lists' ? undefined : 'none' }}>
          <ListsView
            visibleLists={workspace.visibleLists}
            tasksForList={workspace.tasksForList}
            listOptions={workspace.listOptions}
            error={workspace.error}
            handleGlobalAdd={workspace.handleGlobalAdd}
            handleToggle={workspace.handleToggle}
            handleDelete={workspace.handleDelete}
            handleEditTask={workspace.handleEditTask}
            handlePullToToday={workspace.handlePullToToday}
          />
        </div>
        {activeSection === 'completed' && <CompletedView />}
        {activeSection === 'timeline' && <Timeline />}
      </div>
    </div>
  );
}
