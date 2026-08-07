const NAV_ITEMS = [
  { id: 'today', label: 'Today' },
  { id: 'lists', label: 'Lists' },
  { id: 'completed', label: 'Completed' },
  { id: 'timeline', label: 'Timeline' },
];

export default function NavRail({ active, onSelect }) {
  return (
    <nav className="nav-rail" aria-label="Primary">
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
    </nav>
  );
}
