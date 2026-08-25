import {useCallback, useState, type ReactNode} from 'react';
import {
  Activity, Bell, BookOpenCheck, Boxes, Clock3, Command, GitPullRequest,
  Menu, Radar, Search, Settings, Sparkles, X,
} from 'lucide-react';
import {CommandPalette} from './components/CommandPalette';
import {ViewRouter, type QuickAction} from './components/Views';
import {usePulsePilot, type ActiveView} from './context/PulsePilotContext';

const navigation: Array<{id: ActiveView; label: string; icon: ReactNode}> = [
  {id: 'overview', label: 'Overview', icon: <Radar size={18}/>},
  {id: 'projects', label: 'Projects', icon: <Boxes size={18}/>},
  {id: 'events', label: 'Events', icon: <Activity size={18}/>},
  {id: 'incidents', label: 'Incidents', icon: <GitPullRequest size={18}/>},
  {id: 'alerts', label: 'Alerts', icon: <Bell size={18}/>},
  {id: 'rules', label: 'Rules', icon: <BookOpenCheck size={18}/>},
  {id: 'timeline', label: 'Timeline', icon: <Clock3 size={18}/>},
  {id: 'assistant', label: 'Analysis', icon: <Sparkles size={18}/>},
];

export default function App() {
  const {activeView, navigateTo, setIsSearchOpen, settings, incidents, alerts} = usePulsePilot();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [quickAction, setQuickAction] = useState<QuickAction>(null);
  const activeIncidents = incidents.filter((incident) => incident.status !== 'Resolved').length;
  const openAlerts = alerts.filter((alert) => alert.status === 'OPEN').length;
  const handleQuickAction = useCallback((action: Exclude<QuickAction, null>) => setQuickAction(action), []);

  const openView = (view: ActiveView) => {
    navigateTo(view);
    setMobileNavOpen(false);
  };

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNavOpen ? 'open' : ''}`}>
      <div className="brand"><span className="brand-mark"><Activity size={20}/></span><span><strong>PulsePilot</strong><small>Operations intelligence</small></span><button className="icon-button mobile-only" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X size={18}/></button></div>
      <div className="workspace-switcher"><span className="workspace-avatar">PP</span><span><strong>{settings.workspaceName}</strong><small>Demo Workspace</small></span></div>
      <nav aria-label="Primary navigation">{navigation.map((item) => <button key={item.id} className={activeView === item.id ? 'active' : ''} onClick={() => openView(item.id)}>{item.icon}<span>{item.label}</span>{item.id === 'incidents' && activeIncidents ? <em>{activeIncidents}</em> : null}{item.id === 'alerts' && openAlerts ? <em>{openAlerts}</em> : null}</button>)}</nav>
      <div className="sidebar-footer"><button className={activeView === 'settings' ? 'active' : ''} onClick={() => openView('settings')}><Settings size={18}/><span>Settings</span></button><div className="environment-note"><span className="status-dot"/><span><strong>Local workspace</strong><small>Seeded operational data</small></span></div></div>
    </aside>
    {mobileNavOpen ? <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}/> : null}
    <div className="app-frame">
      <header className="topbar"><button className="icon-button mobile-only" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={19}/></button><div className="topbar-context"><span>PulsePilot</span><strong>{navigation.find((item) => item.id === activeView)?.label || 'Settings'}</strong></div><div className="topbar-actions"><span className="demo-pill">Demo Workspace</span><button className="search-trigger" onClick={() => setIsSearchOpen(true)}><Search size={16}/><span>Search or run a command</span><kbd><Command size={11}/>K</kbd></button></div></header>
      <main className="main-content"><ViewRouter quickAction={quickAction} clearQuickAction={() => setQuickAction(null)}/></main>
      <nav className="mobile-dock" aria-label="Mobile navigation">{navigation.slice(0, 5).map((item) => <button key={item.id} className={activeView === item.id ? 'active' : ''} onClick={() => openView(item.id)}>{item.icon}<span>{item.label}</span></button>)}</nav>
    </div>
    <CommandPalette onQuickAction={handleQuickAction}/>
  </div>;
}
