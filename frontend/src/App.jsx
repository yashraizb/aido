import { useState } from 'react';
import NavRail from './components/NavRail.jsx';
import ListsView from './components/ListsView.jsx';
import CompletedView from './components/CompletedView.jsx';

export default function App() {
  const [activeSection, setActiveSection] = useState('lists');

  return (
    <div className="app-shell">
      <NavRail active={activeSection} onSelect={setActiveSection} />
      <div className="main-panel">
        {activeSection === 'today' && (
          <section className="placeholder-panel" aria-label="Today">
            <h1 className="tasks-title">Today</h1>
            <p className="empty-note">The Today board is coming soon.</p>
          </section>
        )}
        <div style={{ display: activeSection === 'lists' ? undefined : 'none' }}>
          <ListsView />
        </div>
        {activeSection === 'completed' && <CompletedView />}
        {activeSection === 'timeline' && (
          <section className="placeholder-panel" aria-label="Timeline">
            <h1 className="tasks-title">Timeline</h1>
            <p className="empty-note">The Timeline is coming soon.</p>
          </section>
        )}
      </div>
    </div>
  );
}
