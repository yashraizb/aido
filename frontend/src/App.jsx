import { useState } from 'react';
import NavRail from './components/NavRail.jsx';
import ListsView from './components/ListsView.jsx';
import CompletedView from './components/CompletedView.jsx';
import TodayBoard from './components/TodayBoard.jsx';
import Timeline from './components/Timeline.jsx';

export default function App() {
  const [activeSection, setActiveSection] = useState('lists');

  return (
    <div className="app-shell">
      <NavRail active={activeSection} onSelect={setActiveSection} />
      <div className="main-panel">
        {activeSection === 'today' && <TodayBoard />}
        <div style={{ display: activeSection === 'lists' ? undefined : 'none' }}>
          <ListsView />
        </div>
        {activeSection === 'completed' && <CompletedView />}
        {activeSection === 'timeline' && <Timeline />}
      </div>
    </div>
  );
}
