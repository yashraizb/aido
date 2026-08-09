import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function OptionsMenu({ ariaLabel, items }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handleOutsideClick(event) {
      const insideTrigger = triggerRef.current && triggerRef.current.contains(event.target);
      const insideDropdown = dropdownRef.current && dropdownRef.current.contains(event.target);
      if (!insideTrigger && !insideDropdown) {
        setOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const trigger = triggerRef.current;
    const dropdown = dropdownRef.current;
    if (!trigger || !dropdown) return;

    const triggerRect = trigger.getBoundingClientRect();
    const dropdownHeight = dropdown.offsetHeight;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    const openUpward = spaceBelow < dropdownHeight + 8 && spaceAbove > spaceBelow;

    const top = openUpward
      ? Math.max(4, triggerRect.top - dropdownHeight - 4)
      : Math.min(triggerRect.bottom + 4, window.innerHeight - dropdownHeight - 4);
    const right = window.innerWidth - triggerRect.right;

    setPosition({ top, right });
  }, [open]);

  return (
    <div className="options-menu-wrap">
      <button
        type="button"
        ref={triggerRef}
        className="options-menu-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="options-menu-dropdown"
            role="menu"
            style={{
              position: 'fixed',
              top: position ? position.top : -9999,
              right: position ? position.right : -9999,
              visibility: position ? 'visible' : 'hidden',
            }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                className={item.danger ? 'options-menu-item options-menu-item-danger' : 'options-menu-item'}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
                <span aria-hidden="true">{item.icon}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
