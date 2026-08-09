import { useState } from 'react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'completed', label: 'Completed' },
  { id: 'timeline', label: 'Timeline' },
];

export default function PrimarySidebar({
  active,
  onSelect,
  lists,
  checkedListIds,
  onCheckedListChange,
  newListName,
  onNewListNameChange,
  onCreateList,
  renamingListId,
  renameValue,
  onRenameValueChange,
  onStartRename,
  onSaveRename,
  onDeleteList,
}) {
  const [listSearchQuery, setListSearchQuery] = useState('');
  const [listsExpanded, setListsExpanded] = useState(active === 'lists');

  const filteredLists = lists.filter((list) =>
    list.name.toLowerCase().includes(listSearchQuery.toLowerCase())
  );

  function handleSelectList(listId, checked) {
    onSelect('lists');
    onCheckedListChange(listId, checked);
  }

  return (
    <nav className="primary-sidebar" aria-label="Primary">
      <ul className="nav-rail-list">
        {NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={item.id === active ? 'nav-rail-btn nav-rail-btn-active' : 'nav-rail-btn'}
              onClick={() => onSelect(item.id)}
              aria-current={item.id === active ? 'page' : undefined}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>

      <div className="sidebar-lists-toggle-wrap">
        <div className={active === 'lists' ? 'sidebar-lists-toggle sidebar-lists-toggle-active' : 'sidebar-lists-toggle'}>
          <button type="button" className="sidebar-lists-nav-btn" onClick={() => onSelect('lists')}>
            Lists
          </button>
          <button
            type="button"
            className="sidebar-lists-expand-btn"
            onClick={() => setListsExpanded((current) => !current)}
            aria-expanded={listsExpanded}
            aria-label={listsExpanded ? 'Collapse lists' : 'Expand lists'}
          >
            <span aria-hidden="true">{listsExpanded ? '▲' : '▼'}</span>
          </button>
        </div>

        {listsExpanded && (
        <div className="sidebar-lists-section" aria-label="Task lists">
          <input
            className="list-search-input"
            type="text"
            placeholder="Search lists"
            value={listSearchQuery}
            onChange={(event) => setListSearchQuery(event.target.value)}
            aria-label="Search lists"
          />
          <div className="list-create-row">
            <div className="list-create-input-wrap">
              <input
                className="list-create-input"
                type="text"
                placeholder="New list"
                value={newListName}
                onChange={(event) => onNewListNameChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onCreateList();
                  }
                }}
                aria-label="Create new list"
              />
              <button className="list-create-inline-btn" type="button" onClick={() => onCreateList()}>
                Add
              </button>
            </div>
          </div>
          <ul className="lists-nav">
            {filteredLists.map((list) => {
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
                        onChange={(event) => handleSelectList(list.id, event.target.checked)}
                        aria-label={`Show tasks for ${list.name}`}
                      />
                      <input
                        className="list-rename-input"
                        value={renameValue}
                        onChange={(event) => onRenameValueChange(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            onSaveRename(list.id);
                          }
                        }}
                        aria-label={`Rename ${list.name}`}
                      />
                      <button className="list-mini-btn" type="button" onClick={() => onSaveRename(list.id)}>
                        Save
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        className="list-visibility-check"
                        type="checkbox"
                        checked={isChecked}
                        onChange={(event) => handleSelectList(list.id, event.target.checked)}
                        aria-label={`Show tasks for ${list.name}`}
                      />
                      <button
                        className="list-name-btn"
                        type="button"
                        onClick={() => handleSelectList(list.id, !isChecked)}
                      >
                        {list.name}
                      </button>
                      <button
                        className="list-mini-btn"
                        type="button"
                        onClick={() => onStartRename(list.id, list.name)}
                      >
                        Rename
                      </button>
                    </>
                  )}
                  <button className="list-delete-btn" type="button" onClick={() => onDeleteList(list.id)}>
                    🗑
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        )}
      </div>
    </nav>
  );
}
