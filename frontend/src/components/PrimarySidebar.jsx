import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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
  const [openMenuListId, setOpenMenuListId] = useState(null);
  const [menuOpensUpward, setMenuOpensUpward] = useState(false);
  const openMenuRef = useRef(null);
  const menuDropdownRef = useRef(null);
  const sectionRef = useRef(null);

  const filteredLists = lists.filter((list) =>
    list.name.toLowerCase().includes(listSearchQuery.toLowerCase())
  );

  useEffect(() => {
    if (openMenuListId === null) return undefined;

    function handleOutsideClick(event) {
      if (openMenuRef.current && !openMenuRef.current.contains(event.target)) {
        setOpenMenuListId(null);
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setOpenMenuListId(null);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openMenuListId]);

  useLayoutEffect(() => {
    if (openMenuListId === null) {
      setMenuOpensUpward(false);
      return;
    }
    const dropdown = menuDropdownRef.current;
    if (!dropdown) return;
    const dropdownRect = dropdown.getBoundingClientRect();
    const sectionBottom = sectionRef.current
      ? sectionRef.current.getBoundingClientRect().bottom
      : window.innerHeight;
    const availableBottom = Math.min(sectionBottom, window.innerHeight);
    setMenuOpensUpward(dropdownRect.bottom > availableBottom);
  }, [openMenuListId]);

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
        <div className="sidebar-lists-section" aria-label="Task lists" ref={sectionRef}>
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
                      <div
                        className="list-menu-wrap"
                        ref={list.id === openMenuListId ? openMenuRef : null}
                      >
                        <button
                          type="button"
                          className="list-menu-trigger"
                          aria-haspopup="true"
                          aria-expanded={openMenuListId === list.id}
                          aria-label={`Options for ${list.name}`}
                          onClick={() =>
                            setOpenMenuListId((current) => (current === list.id ? null : list.id))
                          }
                        >
                          <span aria-hidden="true">⋮</span>
                        </button>
                        {openMenuListId === list.id && (
                          <div
                            className={menuOpensUpward ? 'list-menu-dropdown list-menu-dropdown-up' : 'list-menu-dropdown'}
                            role="menu"
                            ref={menuDropdownRef}
                          >
                            <button
                              type="button"
                              className="list-menu-item"
                              role="menuitem"
                              onClick={() => {
                                setOpenMenuListId(null);
                                onStartRename(list.id, list.name);
                              }}
                            >
                              Rename
                              <span aria-hidden="true">✏️</span>
                            </button>
                            <button
                              type="button"
                              className="list-menu-item list-menu-item-danger"
                              role="menuitem"
                              onClick={() => {
                                setOpenMenuListId(null);
                                onDeleteList(list.id);
                              }}
                            >
                              Delete
                              <span aria-hidden="true">🗑</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
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
