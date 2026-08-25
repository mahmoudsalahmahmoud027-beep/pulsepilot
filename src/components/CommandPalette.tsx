import {useCallback, useEffect, useMemo, useState, type ReactNode} from 'react';
import {AlertTriangle, Bell, BookOpenCheck, Boxes, Command, GitPullRequest, Search} from 'lucide-react';
import {usePulsePilot, type ActiveView} from '../context/PulsePilotContext';
import {tokenMatch} from '../services/searchEngine';

interface CommandPaletteProps {
  onQuickAction: (action: 'create-incident' | 'create-rule' | 'add-event') => void;
}

interface PaletteItem {
  id: string;
  label: string;
  detail: string;
  keywords: string;
  icon: ReactNode;
  run: () => void;
}

function matchesTokens(query: string, item: PaletteItem) {
  return tokenMatch(query, item.label, item.detail, item.keywords);
}

export function CommandPalette({onQuickAction}: CommandPaletteProps) {
  const {projects, events, incidents, alerts, alertRules, isSearchOpen, setIsSearchOpen, navigateTo} = usePulsePilot();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const close = useCallback(() => {
    setIsSearchOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, [setIsSearchOpen]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsSearchOpen(!isSearchOpen);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isSearchOpen, setIsSearchOpen]);

  const items = useMemo<PaletteItem[]>(() => {
    const open = (view: ActiveView, id?: string) => () => { navigateTo(view, id); close(); };
    const commands: PaletteItem[] = [
      {id: 'cmd-create-inc', label: 'Create Incident', detail: 'Declare a new operational incident', keywords: 'new incident command', icon: <GitPullRequest size={17}/>, run: () => {navigateTo('incidents'); onQuickAction('create-incident'); close();}},
      {id: 'cmd-create-rule', label: 'Create Rule', detail: 'Add a deterministic alert rule', keywords: 'new alert threshold command', icon: <BookOpenCheck size={17}/>, run: () => {navigateTo('rules'); onQuickAction('create-rule'); close();}},
      {id: 'cmd-add-event', label: 'Add Operational Event', detail: 'Record a deployment or service event', keywords: 'deployment failure generate event', icon: <Command size={17}/>, run: () => {navigateTo('events'); onQuickAction('add-event'); close();}},
      {id: 'cmd-critical', label: 'Open Critical Incidents', detail: 'View active high-severity incidents', keywords: 'sev 1 emergency', icon: <AlertTriangle size={17}/>, run: open('incidents')},
      {id: 'cmd-failed', label: 'Show Failed Deployments', detail: 'Filter the event stream for failures', keywords: 'failed deploy deployment failure', icon: <Command size={17}/>, run: open('events')},
      {id: 'cmd-timeline', label: 'Open Timeline', detail: 'View unified operational history', keywords: 'history chronology', icon: <Command size={17}/>, run: open('timeline')},
      {id: 'cmd-ask', label: 'Ask PulsePilot', detail: 'Run grounded operational analysis', keywords: 'analysis question why attention', icon: <Search size={17}/>, run: open('assistant')},
    ];
    const projectItems = projects.map((project) => ({id: project.id, label: project.name, detail: `${project.health} · ${project.description}`, keywords: `project ${project.category}`, icon: <Boxes size={17}/>, run: open('projects', project.id)}));
    const incidentItems = incidents.map((incident) => ({id: incident.id, label: `${incident.id} · ${incident.title}`, detail: `${incident.severity} · ${incident.status} · ${incident.projectName}`, keywords: 'incident outage failure', icon: <AlertTriangle size={17}/>, run: open('incidents', incident.id)}));
    const eventItems = events.map((event) => ({id: event.id, label: event.title, detail: `${event.type.replaceAll('_', ' ')} · ${event.projectName}`, keywords: `event ${event.description}`, icon: <Command size={17}/>, run: open('events', event.id)}));
    const alertItems = alerts.map((alert) => ({id: alert.id, label: alert.title, detail: `${alert.status} · ${alert.projectName}`, keywords: `alert ${alert.trigger}`, icon: <Bell size={17}/>, run: open('alerts')}));
    const ruleItems = alertRules.map((rule) => ({id: rule.id, label: rule.name, detail: `${rule.enabled ? 'Enabled' : 'Disabled'} · ${rule.description}`, keywords: 'rule threshold automation', icon: <BookOpenCheck size={17}/>, run: open('rules')}));
    return [...commands, ...projectItems, ...incidentItems, ...eventItems, ...alertItems, ...ruleItems];
  }, [projects, events, incidents, alerts, alertRules, close, navigateTo, onQuickAction]);

  const filtered = useMemo(() => (query ? items.filter((item) => matchesTokens(query, item)) : items.slice(0, 10)).slice(0, 30), [items, query]);

  useEffect(() => setActiveIndex(0), [query]);

  if (!isSearchOpen) return null;

  return (
    <div className="palette-backdrop" role="presentation" onMouseDown={close}>
      <section className="palette" role="dialog" aria-modal="true" aria-label="Search and command palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-input-wrap">
          <Search size={19}/>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects, incidents, failed deploys…"
            aria-label="Search workspace"
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, filtered.length - 1)); }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
              if (event.key === 'Enter' && filtered[activeIndex]) filtered[activeIndex].run();
              if (event.key === 'Escape') close();
            }}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="palette-results">
          {filtered.length ? filtered.map((item, index) => (
            <button key={`${item.id}-${index}`} type="button" className={`palette-result ${index === activeIndex ? 'active' : ''}`} onMouseEnter={() => setActiveIndex(index)} onClick={item.run}>
              <span className="palette-icon">{item.icon}</span>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            </button>
          )) : <div className="empty-state compact"><Search size={22}/><strong>No matching results</strong><p>Try a project name, incident ID, or “failed deploy”.</p></div>}
        </div>
        <footer className="palette-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span><span><kbd>esc</kbd> Close</span></footer>
      </section>
    </div>
  );
}
