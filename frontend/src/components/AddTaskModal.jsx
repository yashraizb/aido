import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

const AddTaskModal = forwardRef(function AddTaskModal({
  buttonLabel,
  buttonClassName = 'add-task-open-btn',
  hideTrigger = false,
  dialogTitle,
  listOptions = [],
  initialTitle = '',
  initialSelectedListIds = [],
  submitLabel = 'Save task',
  onSubmit,
}, ref) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [selectedLinkedListIds, setSelectedLinkedListIds] = useState(initialSelectedListIds);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const uniqueOptions = useMemo(
    () => Array.from(new Map(listOptions.map((option) => [option.id, option])).values()),
    [listOptions]
  );

  useEffect(() => {
    if (!dropdownOpen) return undefined;

    function handlePointerDown(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [dropdownOpen]);

  function openModal() {
    setTitle(initialTitle);
    setSelectedLinkedListIds(initialSelectedListIds);
    setDropdownOpen(false);
    setIsOpen(true);
  }

  useImperativeHandle(ref, () => ({ open: openModal }));

  function toggleLinkedList(listId) {
    setSelectedLinkedListIds((current) => {
      if (current.includes(listId)) {
        return current.filter((item) => item !== listId);
      }
      return [...current, listId];
    });
  }

  const selectedLabels = uniqueOptions
    .filter((option) => selectedLinkedListIds.includes(option.id))
    .map((option) => option.name);

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed) return;

    await onSubmit({ title: trimmed, linkedListIds: selectedLinkedListIds });
    setTitle(initialTitle);
    setSelectedLinkedListIds([]);
    setDropdownOpen(false);
    setIsOpen(false);
  }

  return (
    <>
      {!hideTrigger && (
        <button className={buttonClassName} type="button" onClick={openModal}>
          {buttonLabel}
        </button>
      )}

      {isOpen && (
        <div className="task-modal-overlay" role="presentation" onClick={() => setIsOpen(false)}>
          <div
            className="task-modal"
            role="dialog"
            aria-modal="true"
            aria-label={dialogTitle}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="task-modal-title">{dialogTitle}</h3>

            <label className="task-modal-label" htmlFor="task-title-input">
              Task title
            </label>
            <input
              id="task-title-input"
              className="task-modal-input"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs to be done?"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
            />

            <div className="task-tag-picker" ref={dropdownRef}>
              <button
                className="task-tag-dropdown-btn"
                type="button"
                onClick={() => setDropdownOpen((open) => !open)}
                aria-expanded={dropdownOpen}
              >
                {selectedLabels.length > 0 ? `Selected lists (${selectedLabels.length})` : 'Select lists'}
              </button>

              {dropdownOpen && (
                <div className="task-tag-dropdown" role="listbox" aria-label="Tag options">
                  {uniqueOptions.map((option) => (
                    <label key={option.id} className="task-tag-option">
                      <input
                        type="checkbox"
                        checked={selectedLinkedListIds.includes(option.id)}
                        onChange={() => toggleLinkedList(option.id)}
                      />
                      <span>{option.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {selectedLabels.length > 0 && (
              <div className="task-modal-tag-capsules" aria-label="Selected tags">
                {selectedLabels.map((label) => (
                  <span key={label} className="task-tag-chip">
                    {label}
                  </span>
                ))}
              </div>
            )}

            <div className="task-modal-actions">
              <button className="task-modal-cancel" type="button" onClick={() => setIsOpen(false)}>
                Cancel
              </button>
              <button className="task-modal-save" type="button" onClick={() => void handleSubmit()}>
                {submitLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default AddTaskModal;
