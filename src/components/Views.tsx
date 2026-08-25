import {useEffect, useMemo, useState, type FormEvent, type ReactNode} from 'react';
import {
  Activity, ArrowLeft, ArrowRight, Bell, BookOpenCheck,
  Check, CheckCircle2, ChevronRight, CircleDot, Clock3,
  GitCommitHorizontal, Info, Lightbulb, ListFilter, MessageSquarePlus,
  Plus, RefreshCw, Search, Settings2, ShieldAlert, Sparkles, Trash2,
} from 'lucide-react';
import {usePulsePilot} from '../context/PulsePilotContext';
import type {
  AlertRule, AlertRuleConditionType, EventSeverity, EventType, Incident, IncidentStatus,
  OperationalEvent, Project, Severity,
} from '../types';
import {LocalAnalysisProvider, GeminiAnalysisProvider} from '../services/ai/analysisProvider';
import {StatusBadge} from './common/StatusBadge';
import {Modal} from './common/Modal';

export type QuickAction = 'create-incident' | 'create-rule' | 'add-event' | null;

interface ViewProps {
  quickAction: QuickAction;
  clearQuickAction: () => void;
}

const EVENT_TYPES: EventType[] = [
  'DEPLOYMENT_STARTED', 'DEPLOYMENT_SUCCEEDED', 'DEPLOYMENT_FAILED', 'SERVICE_DEGRADED',
  'SERVICE_RECOVERED', 'AUTOMATION_FAILED', 'AUTOMATION_SUCCEEDED', 'DEADLINE_APPROACHING',
  'TASK_OVERDUE', 'CONFIG_CHANGED', 'SECURITY_SCAN_ALERT',
];
const EVENT_SEVERITIES: EventSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
const INCIDENT_STATUSES: IncidentStatus[] = ['Investigating', 'Identified', 'Monitoring', 'Resolved'];
const INCIDENT_SEVERITIES: Severity[] = ['SEV-1', 'SEV-2', 'SEV-3', 'SEV-4'];

function relativeTime(timestamp: string) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function dateTime(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(timestamp));
}

function labelize(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function severityClass(severity: string) {
  if (severity === 'CRITICAL' || severity === 'SEV-1') return 'critical';
  if (severity === 'HIGH' || severity === 'SEV-2') return 'high';
  if (severity === 'MEDIUM' || severity === 'SEV-3') return 'medium';
  if (severity === 'LOW' || severity === 'SEV-4') return 'low';
  return 'info';
}

function PageHeader({eyebrow, title, description, actions}: {eyebrow: string; title: string; description: string; actions?: ReactNode}) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions ? <div className="page-actions">{actions}</div> : null}</header>;
}

function EmptyState({icon, title, description, action}: {icon: ReactNode; title: string; description: string; action?: ReactNode}) {
  return <div className="empty-state">{icon}<strong>{title}</strong><p>{description}</p>{action}</div>;
}

function Stat({label, value, tone = 'neutral', detail}: {label: string; value: string | number; tone?: string; detail: string}) {
  return <div className={`stat ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

export function ViewRouter(props: ViewProps) {
  const {activeView} = usePulsePilot();
  if (activeView === 'overview') return <OverviewView/>;
  if (activeView === 'projects') return <ProjectsView/>;
  if (activeView === 'events') return <EventsView {...props}/>;
  if (activeView === 'incidents') return <IncidentsView {...props}/>;
  if (activeView === 'alerts') return <AlertsView/>;
  if (activeView === 'rules') return <RulesView {...props}/>;
  if (activeView === 'timeline') return <TimelineView/>;
  if (activeView === 'assistant') return <AnalysisView/>;
  return <SettingsView/>;
}

function OverviewView() {
  const {projects, incidents, alerts, risks, attentionItems, nextAction, getWhatChanged, navigateTo} = usePulsePilot();
  const [timeframe, setTimeframe] = useState<'1h' | 'today' | '24h' | '7d'>('24h');
  const changed = useMemo(() => getWhatChanged(timeframe), [getWhatChanged, timeframe]);
  const activeIncidents = incidents.filter((incident) => incident.status !== 'Resolved');
  const degraded = projects.filter((project) => project.health !== 'HEALTHY');
  const openAlerts = alerts.filter((alert) => alert.status === 'OPEN');
  const systemState = projects.some((p) => p.health === 'CRITICAL') ? 'Critical attention required' : degraded.length ? 'Degraded' : 'Operational';

  return <>
    <PageHeader eyebrow="Operations overview" title="What needs attention?" description="Prioritized from current incidents, alerts, recent failures, deadlines, and derived project health." actions={<button className="button primary" onClick={() => navigateTo(nextAction.primary.targetView, nextAction.primary.targetId)}>Open primary action <ArrowRight size={16}/></button>}/>
    <section className="system-strip" aria-label="Current system status">
      <div><Activity size={18}/><span>System status</span><strong>{systemState}</strong></div>
      <Stat label="Active incidents" value={activeIncidents.length} tone={activeIncidents.some((i) => i.severity === 'SEV-1') ? 'critical' : 'neutral'} detail={`${activeIncidents.filter((i) => i.severity === 'SEV-1').length} SEV-1`}/>
      <Stat label="Projects at risk" value={degraded.length} tone="high" detail={`of ${projects.length} services`}/>
      <Stat label="Open alerts" value={openAlerts.length} tone="medium" detail={`${openAlerts.filter((a) => a.severity === 'CRITICAL').length} critical`}/>
    </section>

    <div className="overview-grid">
      <section className="panel attention-panel">
        <div className="section-heading"><div><span className="eyebrow">Ranked queue</span><h2>Needs attention</h2></div><span className="muted">Top {attentionItems.length}</span></div>
        {attentionItems.length ? <div className="attention-list">{attentionItems.map((item, index) => <button className="attention-row" key={item.id} onClick={() => navigateTo(item.targetView, item.targetId)}><span className={`rank ${severityClass(item.severity)}`}>{index + 1}</span><span className="attention-copy"><strong>{item.title}</strong><small>{item.projectName} · {item.reason}</small></span><span className="row-time">{relativeTime(item.timestamp)}</span><ChevronRight size={16}/></button>)}</div> : <EmptyState icon={<CheckCircle2/>} title="No urgent work" description="All current incidents and alerts are resolved. Review upcoming maintenance before the next change window."/>}
      </section>

      <section className="panel action-panel">
        <div className="section-heading"><div><span className="eyebrow">Decision support</span><h2>Next best action</h2></div><span className="action-badge">{nextAction.primary.badgeText}</span></div>
        <h3>{nextAction.primary.title}</h3><p>{nextAction.primary.reason}</p>
        <button className="button primary full" onClick={() => navigateTo(nextAction.primary.targetView, nextAction.primary.targetId)}>Investigate now <ArrowRight size={16}/></button>
        {nextAction.alternatives.length ? <div className="alternatives"><span>Alternatives</span>{nextAction.alternatives.map((action) => <button key={`${action.targetView}-${action.targetId}`} onClick={() => navigateTo(action.targetView, action.targetId)}><strong>{action.title}</strong><small>{action.reason}</small></button>)}</div> : null}
      </section>
    </div>

    <div className="overview-grid lower">
      <section className="panel">
        <div className="section-heading"><div><span className="eyebrow">Deterministic summary</span><h2>What changed?</h2></div><div className="segmented">{(['1h','today','24h','7d'] as const).map((value) => <button className={timeframe === value ? 'active' : ''} key={value} onClick={() => setTimeframe(value)}>{value === '7d' ? 'Week' : value}</button>)}</div></div>
        <p className="summary-text">{changed.narrativeSummary}</p>
        <div className="change-metrics"><span><strong>{changed.newIncidentsCount}</strong> New incidents</span><span><strong>{changed.resolvedIncidentsCount}</strong> Resolved</span><span><strong>{changed.deploymentsCount.failed}</strong> Failed deploys</span><span><strong>{changed.newAlertsCount}</strong> Alerts</span></div>
        <div className="mini-feed">{changed.keyEvents.slice(0, 4).map((event) => <button key={event.id} onClick={() => navigateTo('events', event.id)}><span className={`event-mark ${severityClass(event.severity)}`}/><span><strong>{event.title}</strong><small>{event.projectName} · {relativeTime(event.timestamp)}</small></span></button>)}</div>
      </section>
      <section className="panel">
        <div className="section-heading"><div><span className="eyebrow">Explainable signals</span><h2>Upcoming risks</h2></div><button className="text-button" onClick={() => navigateTo('assistant')}>Analyze <ArrowRight size={14}/></button></div>
        {risks.length ? <div className="risk-list">{risks.slice(0, 4).map((risk) => <button key={risk.id} onClick={() => navigateTo('projects', risk.projectId)}><span className={`severity-icon ${severityClass(risk.severity)}`}><ShieldAlert size={17}/></span><span><strong>{risk.title}</strong><small>{risk.reasons[0]}</small></span></button>)}</div> : <EmptyState icon={<Check/>} title="No elevated risks" description="Current deadlines and failure patterns are within nominal thresholds."/>}
      </section>
    </div>
  </>;
}

function ProjectsView() {
  const {projects, incidents, alerts, events, selectedProjectId, setSelectedProjectId, navigateTo} = usePulsePilot();
  const project = projects.find((item) => item.id === selectedProjectId);
  if (project) {
    const projectIncidents = incidents.filter((item) => item.projectId === project.id);
    const projectAlerts = alerts.filter((item) => item.projectId === project.id);
    const projectEvents = events.filter((item) => item.projectId === project.id).slice(0, 6);
    return <>
      <button className="back-button" onClick={() => setSelectedProjectId(null)}><ArrowLeft size={16}/> All projects</button>
      <PageHeader eyebrow={`${project.category} · ${project.environment}`} title={project.name} description={project.description} actions={<StatusBadge status={project.health}/>}/>
      <div className="detail-grid">
        <section className="panel health-explain"><div className="section-heading"><div><span className="eyebrow">Calculated health</span><h2>{project.healthScore}/100</h2></div><Activity size={26}/></div><h3>Why {labelize(project.health)}?</h3><ul>{project.healthFactors.calculationExplanation.map((reason) => <li key={reason}>{reason}</li>)}</ul><p className="explain-note"><Info size={15}/> Derived deterministically from incidents, events, alerts, and deadlines.</p></section>
        <section className="panel detail-facts"><h2>Service context</h2><dl><div><dt>Repository</dt><dd>{project.repository}</dd></div><div><dt>Environment</dt><dd>{project.environment}</dd></div><div><dt>Active incidents</dt><dd>{projectIncidents.filter((i) => i.status !== 'Resolved').length}</dd></div><div><dt>Open alerts</dt><dd>{projectAlerts.filter((a) => a.status === 'OPEN').length}</dd></div><div><dt>Last deployment</dt><dd>{project.healthFactors.lastDeploymentStatus}</dd></div>{project.upcomingDeadline ? <div><dt>Upcoming deadline</dt><dd>{project.upcomingDeadline.title} · {dateTime(project.upcomingDeadline.date)}</dd></div> : null}</dl></section>
      </div>
      <section className="panel"><div className="section-heading"><h2>Recent operational activity</h2><button className="text-button" onClick={() => navigateTo('events')}>All events <ArrowRight size={14}/></button></div><div className="data-list">{projectEvents.map((event) => <button className="data-row" key={event.id} onClick={() => navigateTo('events', event.id)}><span className={`severity-icon ${severityClass(event.severity)}`}><CircleDot size={15}/></span><span className="grow"><strong>{event.title}</strong><small>{labelize(event.type)} · {event.description}</small></span><span className="row-time">{relativeTime(event.timestamp)}</span></button>)}</div></section>
    </>;
  }
  return <>
    <PageHeader eyebrow="Service ownership" title="Projects" description="Health is calculated from the same incidents, alerts, events, and deadlines used throughout the workspace."/>
    <section className="project-list">{projects.map((item) => <button className="project-row" key={item.id} onClick={() => setSelectedProjectId(item.id)}><span className={`health-rail ${severityClass(item.health === 'CRITICAL' ? 'CRITICAL' : item.health === 'HEALTHY' ? 'INFO' : 'HIGH')}`}/><span className="project-main"><span><strong>{item.name}</strong><StatusBadge status={item.health} size="sm"/></span><small>{item.description}</small></span><span className="project-score"><strong>{item.healthScore}</strong><small>health</small></span><span className="project-signals"><span>{item.healthFactors.activeIncidentsCount} incidents</span><span>{item.healthFactors.failedDeployments24h} failed deploys</span><span>{item.healthFactors.unresolvedWarningsCount} open alerts</span></span><ChevronRight size={18}/></button>)}</section>
  </>;
}

function EventsView({quickAction, clearQuickAction}: ViewProps) {
  const {events, projects, selectedEventId, setSelectedEventId, emitEvent} = usePulsePilot();
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [timeFilter, setTimeFilter] = useState('24h');
  const [showCreate, setShowCreate] = useState(false);
  useEffect(() => { if (quickAction === 'add-event') { setShowCreate(true); clearQuickAction(); } }, [quickAction, clearQuickAction]);
  const selected = events.find((event) => event.id === selectedEventId);
  const filtered = useMemo(() => {
    const cutoff = timeFilter === 'ALL' ? 0 : Date.now() - (timeFilter === '1h' ? 3600000 : timeFilter === '7d' ? 604800000 : 86400000);
    const tokens = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return events.filter((event) => {
      const haystack = `${event.title} ${event.description} ${event.type} ${event.projectName}`.toLowerCase();
      return (!tokens.length || tokens.every((token) => haystack.includes(token))) &&
        (projectFilter === 'ALL' || event.projectId === projectFilter) &&
        (severityFilter === 'ALL' || event.severity === severityFilter) &&
        (typeFilter === 'ALL' || event.type === typeFilter) && new Date(event.timestamp).getTime() >= cutoff;
    });
  }, [events, projectFilter, search, severityFilter, timeFilter, typeFilter]);
  return <>
    <PageHeader eyebrow="Immutable activity stream" title="Events" description="Deployments, service changes, automation outcomes, and incident activity in one searchable stream." actions={<button className="button primary" onClick={() => setShowCreate(true)}><Plus size={16}/> Add event</button>}/>
    <section className="filter-bar"><label className="search-field"><Search size={16}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events" aria-label="Search events"/></label><select aria-label="Filter by project" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}><option value="ALL">All projects</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select aria-label="Filter by severity" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}><option value="ALL">All severities</option>{EVENT_SEVERITIES.map((s) => <option key={s}>{s}</option>)}</select><select aria-label="Filter by type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="ALL">All event types</option>{EVENT_TYPES.map((t) => <option key={t}>{labelize(t)}</option>)}</select><select aria-label="Filter by time" value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}><option value="1h">Last hour</option><option value="24h">24 hours</option><option value="7d">This week</option><option value="ALL">All time</option></select></section>
    {filtered.length ? <section className="event-table" aria-label="Operational events"><div className="table-head"><span>Severity</span><span>Event</span><span>Project</span><span>Type</span><span>Time</span></div>{filtered.map((event) => <button className="event-row" key={event.id} onClick={() => setSelectedEventId(event.id)}><span><span className={`severity-label ${severityClass(event.severity)}`}>{event.severity}</span></span><span className="event-copy"><strong>{event.title}</strong><small>{event.description}</small></span><span>{event.projectName}</span><span>{labelize(event.type)}</span><span className="row-time">{relativeTime(event.timestamp)}</span></button>)}</section> : <EmptyState icon={<ListFilter/>} title="No events match these filters" description="Broaden the time range or clear a project, severity, or type filter."/>}
    {selected ? <Modal title={selected.title} description={`${selected.projectName} · ${dateTime(selected.timestamp)}`} onClose={() => setSelectedEventId(null)}><div className="event-detail"><StatusBadge status={selected.severity}/><p>{selected.description}</p><dl><div><dt>Type</dt><dd>{labelize(selected.type)}</dd></div><div><dt>Event ID</dt><dd>{selected.id}</dd></div>{Object.entries(selected.metadata).map(([key,value]) => <div key={key}><dt>{labelize(key)}</dt><dd>{String(value)}</dd></div>)}</dl></div></Modal> : null}
    {showCreate ? <EventForm projects={projects} onClose={() => setShowCreate(false)} onSubmit={(event) => {emitEvent(event); setShowCreate(false);}}/> : null}
  </>;
}

function EventForm({projects, onClose, onSubmit}: {projects: Project[]; onClose: () => void; onSubmit: (event: Omit<OperationalEvent,'id'|'timestamp'>) => void}) {
  const [projectId, setProjectId] = useState(projects[0]?.id || '');
  const [type, setType] = useState<EventType>('DEPLOYMENT_FAILED');
  const [severity, setSeverity] = useState<EventSeverity>('HIGH');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errorReason, setErrorReason] = useState('');
  const submit = (event: FormEvent) => {event.preventDefault(); const project = projects.find((item) => item.id === projectId); if (!project || !title.trim() || !description.trim()) return; onSubmit({projectId, projectName: project.name, type, severity, title: title.trim(), description: description.trim(), metadata: errorReason ? {errorReason: errorReason.trim(), environment: project.environment} : {environment: project.environment}});};
  return <Modal title="Add operational event" description="The event is persisted, evaluated against enabled rules, and reflected in health and the timeline." onClose={onClose}><form className="form-grid" onSubmit={submit}><label>Project<select value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Event type<select value={type} onChange={(e) => setType(e.target.value as EventType)}>{EVENT_TYPES.map((item) => <option key={item} value={item}>{labelize(item)}</option>)}</select></label><label>Severity<select value={severity} onChange={(e) => setSeverity(e.target.value as EventSeverity)}>{EVENT_SEVERITIES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="span-2">Title<input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Authentication deployment failed health checks"/></label><label className="span-2">Description<textarea required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the observed operational change."/></label><label className="span-2">Failure reason (optional)<input value={errorReason} onChange={(e) => setErrorReason(e.target.value)} placeholder="Readiness probe returned HTTP 503"/></label><div className="form-actions span-2"><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button primary">Record event</button></div></form></Modal>;
}

function IncidentsView({quickAction, clearQuickAction}: ViewProps) {
  const {incidents, projects, events, selectedIncidentId, setSelectedIncidentId, createIncident, updateIncident, updateIncidentStatus, addIncidentTimelineNote, reopenIncident} = usePulsePilot();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [showResolve, setShowResolve] = useState(false);
  const [resolution, setResolution] = useState('');
  const incident = incidents.find((item) => item.id === selectedIncidentId);
  useEffect(() => {if (quickAction === 'create-incident') {setShowCreate(true); clearQuickAction();}}, [quickAction, clearQuickAction]);
  if (incident) {
    const related = events.filter((event) => incident.relatedEventIds.includes(event.id) || event.metadata.relatedIncidentId === incident.id);
    return <>
      <button className="back-button" onClick={() => setSelectedIncidentId(null)}><ArrowLeft size={16}/> All incidents</button>
      <PageHeader eyebrow={`${incident.id} · ${incident.projectName}`} title={incident.title} description={incident.impact} actions={<><StatusBadge status={incident.status}/><button className="button" onClick={() => setEditing(true)}>Edit incident</button></>}/>
      <div className="incident-layout"><div className="incident-primary"><section className="panel"><div className="section-heading"><h2>Summary</h2><span className={`severity-label ${severityClass(incident.severity)}`}>{incident.severity}</span></div><p>{incident.description}</p><h3>Suggested actions</h3><ol className="action-list">{incident.suggestedActions.map((action) => <li key={action}>{action}</li>)}</ol></section>
      <section className="panel"><div className="section-heading"><h2>Incident timeline</h2><span className="muted">{incident.timeline.length} entries</span></div><form className="note-form" onSubmit={(e) => {e.preventDefault(); if (!note.trim()) return; addIncidentTimelineNote(incident.id, 'On-Call Operator', note.trim()); setNote('');}}><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an observed update or action taken" aria-label="Timeline note"/><button className="button"><MessageSquarePlus size={15}/> Add note</button></form><div className="timeline-list">{[...incident.timeline].sort((a,b) => new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime()).map((entry) => <div className="timeline-entry" key={entry.id}><span className="timeline-dot"/><div><span>{entry.type.replaceAll('_',' ')}</span><strong>{entry.message}</strong><small>{entry.author} · {dateTime(entry.timestamp)}</small></div></div>)}</div></section>
      <section className="panel"><div className="section-heading"><h2>Related events</h2><span className="muted">{related.length}</span></div>{related.length ? <div className="data-list">{related.map((event) => <div className="data-row" key={event.id}><span className={`event-mark ${severityClass(event.severity)}`}/><span className="grow"><strong>{event.title}</strong><small>{labelize(event.type)} · {relativeTime(event.timestamp)}</small></span></div>)}</div> : <EmptyState icon={<GitCommitHorizontal/>} title="No related events linked" description="Link event IDs when declaring the incident or add an incident update event."/>}</section></div>
      <aside className="incident-aside"><section className="panel detail-facts"><h2>Response details</h2><dl><div><dt>Status</dt><dd>{incident.status}</dd></div><div><dt>Owner</dt><dd>{incident.owner}</dd></div><div><dt>Created</dt><dd>{dateTime(incident.createdAt)}</dd></div><div><dt>Last updated</dt><dd>{dateTime(incident.updatedAt)}</dd></div>{incident.resolution ? <div><dt>Resolution</dt><dd>{incident.resolution}</dd></div> : null}</dl><label className="control-label">Change status<select value={incident.status} onChange={(e) => {const next = e.target.value as IncidentStatus; if (next === 'Resolved') setShowResolve(true); else updateIncidentStatus(incident.id, next);}}>{INCIDENT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>{incident.status === 'Resolved' ? <button className="button full" onClick={() => reopenIncident(incident.id)}><RefreshCw size={15}/> Reopen incident</button> : null}</section></aside></div>
      {editing ? <IncidentForm projects={projects} existing={incident} onClose={() => setEditing(false)} onSubmit={(values) => {updateIncident(incident.id, values); setEditing(false);}}/> : null}
      {showResolve ? <Modal title={`Resolve ${incident.id}`} description="Record the observed mitigation or confirmed resolution. This entry becomes part of the incident timeline." onClose={() => {setShowResolve(false); setResolution('');}}><form className="form-grid" onSubmit={(event) => {event.preventDefault(); if (!resolution.trim()) return; updateIncidentStatus(incident.id, 'Resolved', resolution.trim()); setShowResolve(false); setResolution('');}}><label className="span-2" htmlFor="resolution-summary">Resolution summary<textarea id="resolution-summary" required autoFocus value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="Describe the mitigation and verification evidence."/></label><div className="form-actions span-2"><button type="button" className="button" onClick={() => setShowResolve(false)}>Cancel</button><button className="button primary">Resolve incident</button></div></form></Modal> : null}
    </>;
  }
  const active = incidents.filter((item) => item.status !== 'Resolved');
  return <>
    <PageHeader eyebrow="Response workflow" title="Incidents" description="Declare, assign, investigate, monitor, resolve, and reopen incidents with a persisted audit trail." actions={<button className="button primary" onClick={() => setShowCreate(true)}><Plus size={16}/> Create incident</button>}/>
    <div className="status-summary"><span><strong>{active.length}</strong> active</span><span><strong>{active.filter((i) => i.severity === 'SEV-1').length}</strong> SEV-1</span><span><strong>{incidents.filter((i) => i.status === 'Resolved').length}</strong> resolved</span></div>
    {incidents.length ? <section className="incident-list">{incidents.map((item) => <button className="incident-row" key={item.id} onClick={() => setSelectedIncidentId(item.id)}><span className={`severity-block ${severityClass(item.severity)}`}>{item.severity}</span><span className="grow"><span className="incident-title"><strong>{item.title}</strong><StatusBadge status={item.status} size="sm"/></span><small>{item.id} · {item.projectName} · Owner: {item.owner}</small><p>{item.impact}</p></span><span className="row-time">Updated {relativeTime(item.updatedAt)}</span><ChevronRight size={17}/></button>)}</section> : <EmptyState icon={<CheckCircle2/>} title="No incidents declared" description="The workspace has no incident history. Create one when an operational issue needs coordinated response." action={<button className="button primary" onClick={() => setShowCreate(true)}>Create incident</button>}/>} 
    {showCreate ? <IncidentForm projects={projects} onClose={() => setShowCreate(false)} onSubmit={(values) => {const project = projects.find((p) => p.id === values.projectId)!; const created = createIncident({...values, projectName: project.name, status: 'Investigating', relatedEventIds: [], suggestedActions: ['Review recent events and deployment changes', 'Confirm impact and assign an incident commander']}); setShowCreate(false); setSelectedIncidentId(created.id);}}/> : null}
  </>;
}

type IncidentFormValues = Pick<Incident,'title'|'projectId'|'projectName'|'severity'|'description'|'impact'|'owner'>;
function IncidentForm({projects, existing, onClose, onSubmit}: {projects: Project[]; existing?: Incident; onClose: () => void; onSubmit: (values: IncidentFormValues) => void}) {
  const [projectId, setProjectId] = useState(existing?.projectId || projects[0]?.id || '');
  const [title, setTitle] = useState(existing?.title || '');
  const [severity, setSeverity] = useState<Severity>(existing?.severity || 'SEV-2');
  const [description, setDescription] = useState(existing?.description || '');
  const [impact, setImpact] = useState(existing?.impact || '');
  const [owner, setOwner] = useState(existing?.owner || 'On-Call Lead');
  const submit = (event: FormEvent) => {event.preventDefault(); const project = projects.find((p) => p.id === projectId); if (!project) return; onSubmit({title: title.trim(), projectId, projectName: project.name, severity, description: description.trim(), impact: impact.trim(), owner: owner.trim()});};
  return <Modal title={existing ? `Edit ${existing.id}` : 'Create incident'} description="Use observed impact and concrete response ownership. Changes persist in this demo workspace." onClose={onClose} wide><form className="form-grid" onSubmit={submit}><label>Project<select disabled={Boolean(existing)} value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Severity<select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>{INCIDENT_SEVERITIES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="span-2">Title<input required value={title} onChange={(e) => setTitle(e.target.value)}/></label><label className="span-2">Summary<textarea required value={description} onChange={(e) => setDescription(e.target.value)}/></label><label className="span-2">Impact<textarea required value={impact} onChange={(e) => setImpact(e.target.value)}/></label><label className="span-2">Owner<input required value={owner} onChange={(e) => setOwner(e.target.value)}/></label><div className="form-actions span-2"><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button primary">{existing ? 'Save changes' : 'Declare incident'}</button></div></form></Modal>;
}

function AlertsView() {
  const {alerts, acknowledgeAlert, resolveAlert, promoteAlertToIncident, navigateTo} = usePulsePilot();
  const [status, setStatus] = useState('ACTIVE');
  const filtered = alerts.filter((alert) => status === 'ALL' || (status === 'ACTIVE' ? alert.status !== 'RESOLVED' : alert.status === status));
  return <>
    <PageHeader eyebrow="Signal triage" title="Alerts" description="Actionable rule and monitor signals. Acknowledge ownership, resolve cleared conditions, or escalate to an incident."/>
    <div className="tabs">{['ACTIVE','OPEN','ACKNOWLEDGED','RESOLVED','ALL'].map((item) => <button key={item} className={status === item ? 'active' : ''} onClick={() => setStatus(item)}>{item}</button>)}</div>
    {filtered.length ? <section className="alert-list">{filtered.map((alert) => <article className="alert-row" key={alert.id}><span className={`severity-icon ${severityClass(alert.severity)}`}><Bell size={17}/></span><div className="grow"><div className="alert-title"><strong>{alert.title}</strong><StatusBadge status={alert.status} size="sm"/></div><p>{alert.trigger}</p><small>{alert.source} · {alert.projectName} · {dateTime(alert.createdAt)}</small><div className="inline-actions">{alert.status === 'OPEN' ? <button className="button small" onClick={() => acknowledgeAlert(alert.id)}>Acknowledge</button> : null}{alert.status !== 'RESOLVED' ? <button className="button small" onClick={() => resolveAlert(alert.id)}>Resolve</button> : null}<button className="button small" onClick={() => navigateTo('projects', alert.projectId)}>Open project</button>{!alert.relatedIncidentId && alert.status !== 'RESOLVED' ? <button className="button small primary" onClick={() => {const incident = promoteAlertToIncident(alert.id); navigateTo('incidents', incident.id);}}>Create incident</button> : alert.relatedIncidentId ? <button className="button small" onClick={() => navigateTo('incidents', alert.relatedIncidentId)}>Open {alert.relatedIncidentId}</button> : null}</div></div></article>)}</section> : <EmptyState icon={<Bell/>} title="No alerts in this state" description={status === 'ACTIVE' ? 'There are no open or acknowledged signals requiring action.' : 'Choose another status to review alert history.'}/>} 
  </>;
}

function RulesView({quickAction, clearQuickAction}: ViewProps) {
  const {alertRules, projects, createAlertRule, updateAlertRule, toggleAlertRule, deleteAlertRule, evaluateRulesNow} = usePulsePilot();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AlertRule | undefined>();
  useEffect(() => {if (quickAction === 'create-rule') {setShowForm(true); clearQuickAction();}}, [quickAction, clearQuickAction]);
  return <>
    <PageHeader eyebrow="Deterministic automation" title="Alert rules" description="Enabled rules evaluate real workspace state and deduplicate alerts against the exact evidence that triggered them." actions={<><button className="button" onClick={evaluateRulesNow}><RefreshCw size={15}/> Evaluate now</button><button className="button primary" onClick={() => setShowForm(true)}><Plus size={16}/> Create rule</button></>}/>
    {alertRules.length ? <section className="rule-list">{alertRules.map((rule) => <article className="rule-row" key={rule.id}><button className={`toggle ${rule.enabled ? 'on' : ''}`} type="button" role="switch" aria-checked={rule.enabled} aria-label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.name}`} onClick={() => toggleAlertRule(rule.id)}><span/></button><div className="grow"><div className="rule-title"><strong>{rule.name}</strong><span className={`severity-label ${severityClass(rule.severity)}`}>{rule.severity}</span></div><p>{rule.description}</p><code>IF {labelize(rule.condition.type)} {rule.condition.operator} {String(rule.condition.value)}{rule.condition.timeWindowMinutes ? ` within ${rule.condition.timeWindowMinutes}m` : ''} · THEN create {rule.severity} alert</code><div className="rule-meta"><span>Last evaluated: {rule.lastEvaluated ? relativeTime(rule.lastEvaluated) : 'Never'}</span><span>Last triggered: {rule.lastTriggered ? relativeTime(rule.lastTriggered) : 'Never'}</span><span>{rule.triggerCount} triggers</span></div></div><div className="row-actions"><button className="icon-button" onClick={() => setEditing(rule)} aria-label={`Edit ${rule.name}`}><Settings2 size={16}/></button><button className="icon-button danger" onClick={() => {if (window.confirm(`Delete “${rule.name}”?`)) deleteAlertRule(rule.id);}} aria-label={`Delete ${rule.name}`}><Trash2 size={16}/></button></div></article>)}</section> : <EmptyState icon={<BookOpenCheck/>} title="No alert rules configured" description="Create a rule to convert qualifying operational state into a deduplicated alert." action={<button className="button primary" onClick={() => setShowForm(true)}>Create first rule</button>}/>} 
    {showForm || editing ? <RuleForm projects={projects} existing={editing} onClose={() => {setShowForm(false); setEditing(undefined);}} onSubmit={(values) => {if (editing) updateAlertRule(editing.id, values); else createAlertRule({...values, enabled: true}); setShowForm(false); setEditing(undefined);}}/> : null}
  </>;
}

type RuleValues = Pick<AlertRule,'name'|'description'|'severity'|'condition'>;
function RuleForm({projects, existing, onClose, onSubmit}: {projects: Project[]; existing?: AlertRule; onClose: () => void; onSubmit: (values: RuleValues) => void}) {
  const [name, setName] = useState(existing?.name || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [severity, setSeverity] = useState<AlertRule['severity']>(existing?.severity || 'HIGH');
  const [type, setType] = useState<AlertRuleConditionType>(existing?.condition.type || 'FAILED_DEPLOYMENTS_COUNT');
  const [operator, setOperator] = useState<AlertRule['condition']['operator']>(existing?.condition.operator || '>=');
  const [value, setValue] = useState(String(existing?.condition.value ?? 2));
  const [windowMinutes, setWindowMinutes] = useState(existing?.condition.timeWindowMinutes || 60);
  const [projectId, setProjectId] = useState(existing?.condition.targetProjectId || 'ALL');
  const submit = (event: FormEvent) => {event.preventDefault(); const numeric = ['FAILED_DEPLOYMENTS_COUNT','API_LATENCY_THRESHOLD','ACTIVE_INCIDENTS_COUNT','DEADLINE_PROXIMITY_DAYS'].includes(type); onSubmit({name: name.trim(), description: description.trim(), severity, condition: {type, operator, value: numeric ? Number(value) : value, timeWindowMinutes: ['DEADLINE_PROXIMITY_DAYS','PROJECT_HEALTH_STATE'].includes(type) ? undefined : windowMinutes, targetProjectId: projectId}});};
  return <Modal title={existing ? 'Edit alert rule' : 'Create alert rule'} description="Rules are evaluated locally. Evaluation timestamps only change when the engine actually runs." onClose={onClose} wide><form className="form-grid" onSubmit={submit}><label className="span-2">Name<input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Repeated deployment failures"/></label><label className="span-2">Description<input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Alert when a project has repeated rollout failures."/></label><label>Condition<select value={type} onChange={(e) => setType(e.target.value as AlertRuleConditionType)}>{(['FAILED_DEPLOYMENTS_COUNT','API_LATENCY_THRESHOLD','ACTIVE_INCIDENTS_COUNT','DEADLINE_PROXIMITY_DAYS','SPECIFIC_EVENT_TYPE','PROJECT_HEALTH_STATE'] as const).map((item) => <option key={item} value={item}>{labelize(item)}</option>)}</select></label><label>Project<select value={projectId} onChange={(e) => setProjectId(e.target.value)}><option value="ALL">Any project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Operator<select value={operator} onChange={(e) => setOperator(e.target.value as AlertRule['condition']['operator'])}>{['>=','>','==','<=','<'].map((item) => <option key={item}>{item}</option>)}</select></label><label>Value{type === 'SPECIFIC_EVENT_TYPE' ? <select value={value} onChange={(e) => setValue(e.target.value)}>{EVENT_TYPES.map((item) => <option key={item} value={item}>{labelize(item)}</option>)}</select> : type === 'PROJECT_HEALTH_STATE' ? <select value={value} onChange={(e) => setValue(e.target.value)}>{['HEALTHY','DEGRADED','AT_RISK','CRITICAL'].map((item) => <option key={item}>{item}</option>)}</select> : <input required type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)}/>}</label>{!['DEADLINE_PROXIMITY_DAYS','PROJECT_HEALTH_STATE'].includes(type) ? <label>Time window (minutes)<input type="number" min="1" value={windowMinutes} onChange={(e) => setWindowMinutes(Number(e.target.value))}/></label> : null}<label>Alert severity<select value={severity} onChange={(e) => setSeverity(e.target.value as AlertRule['severity'])}>{['CRITICAL','HIGH','MEDIUM','LOW'].map((item) => <option key={item}>{item}</option>)}</select></label><div className="form-actions span-2"><button type="button" className="button" onClick={onClose}>Cancel</button><button className="button primary">{existing ? 'Save rule' : 'Create rule'}</button></div></form></Modal>;
}

function TimelineView() {
  const {events, alerts, incidents, projects, navigateTo} = usePulsePilot();
  const [projectId, setProjectId] = useState('ALL');
  const [kind, setKind] = useState('ALL');
  const entries = useMemo(() => {
    const eventEntries = events.map((event) => ({id: event.id, timestamp: event.timestamp, kind: 'EVENT', projectId: event.projectId, title: event.title, detail: labelize(event.type), severity: event.severity, action: () => navigateTo('events', event.id)}));
    const alertEntries = alerts.flatMap((alert) => [{id: alert.id, timestamp: alert.createdAt, kind: 'ALERT', projectId: alert.projectId, title: alert.title, detail: `Alert opened · ${alert.source}`, severity: alert.severity, action: () => navigateTo('alerts')}, ...(alert.acknowledgedAt ? [{id: `${alert.id}-ack`, timestamp: alert.acknowledgedAt, kind: 'ACTION', projectId: alert.projectId, title: `Alert acknowledged: ${alert.title}`, detail: 'Operational action', severity: 'INFO', action: () => navigateTo('alerts')}] : []), ...(alert.resolvedAt ? [{id: `${alert.id}-resolved`, timestamp: alert.resolvedAt, kind: 'ACTION', projectId: alert.projectId, title: `Alert resolved: ${alert.title}`, detail: 'Operational action', severity: 'INFO', action: () => navigateTo('alerts')}] : [])]);
    const incidentEntries = incidents.flatMap((incident) => incident.timeline.map((entry) => ({id: `${incident.id}-${entry.id}`, timestamp: entry.timestamp, kind: 'INCIDENT', projectId: incident.projectId, title: `${incident.id}: ${entry.message}`, detail: `${entry.type.replaceAll('_',' ')} · ${entry.author}`, severity: incident.severity, action: () => navigateTo('incidents', incident.id)})));
    return [...eventEntries, ...alertEntries, ...incidentEntries].filter((entry) => (projectId === 'ALL' || entry.projectId === projectId) && (kind === 'ALL' || entry.kind === kind)).sort((a,b) => new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime());
  }, [alerts, events, incidents, kind, navigateTo, projectId]);
  const groups: Record<string, typeof entries> = {};
  for (const entry of entries) {
    const day = new Intl.DateTimeFormat(undefined, {dateStyle:'full'}).format(new Date(entry.timestamp));
    (groups[day] ||= []).push(entry);
  }
  return <>
    <PageHeader eyebrow="Unified chronology" title="Timeline" description="Events, alert state, incident updates, and important operator actions ordered by timestamp."/>
    <section className="filter-bar compact"><select value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Timeline project"><option value="ALL">All projects</option>{projects.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select><select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Timeline entry type"><option value="ALL">All activity</option><option>EVENT</option><option>ALERT</option><option>INCIDENT</option><option>ACTION</option></select></section>
    {entries.length ? <div className="timeline-groups">{Object.keys(groups).map((day) => <section key={day}><h2>{day}</h2><div className="timeline-stream">{groups[day].map((entry) => <button key={entry.id} onClick={entry.action}><time>{new Intl.DateTimeFormat(undefined,{hour:'numeric',minute:'2-digit'}).format(new Date(entry.timestamp))}</time><span className={`timeline-symbol ${severityClass(entry.severity)}`}/><span><strong>{entry.title}</strong><small>{entry.kind} · {entry.detail}</small></span></button>)}</div></section>)}</div> : <EmptyState icon={<Clock3/>} title="No timeline activity" description="No entries match the selected project and activity filters."/>}
  </>;
}

function AnalysisView() {
  const {projects, incidents, events, alerts, settings, aiStatus, navigateTo} = usePulsePilot();
  const [query, setQuery] = useState('What needs attention?');
  const [result, setResult] = useState<Awaited<ReturnType<LocalAnalysisProvider['analyze']>> | null>(null);
  const [loading, setLoading] = useState(false);
  const analyze = async (event?: FormEvent) => {event?.preventDefault(); setLoading(true); const useAi = settings.aiProvider !== 'local_only' && aiStatus.available; const provider = useAi ? new GeminiAnalysisProvider() : new LocalAnalysisProvider(); const next = await provider.analyze(query, {projects, incidents, events, alerts}); setResult(next); setLoading(false);};
  return <>
    <PageHeader eyebrow="Grounded operational analysis" title="Ask PulsePilot" description="Local deterministic analysis always works. Optional AI is server-side and receives only the operational context shown here." actions={<span className="provider-status"><CircleDot size={14}/>{aiStatus.available && settings.aiProvider !== 'local_only' ? 'AI-assisted with local fallback' : 'Local deterministic'}</span>}/>
    <section className="analysis-query panel"><form onSubmit={analyze}><label htmlFor="analysis-question">Operational question</label><div><input id="analysis-question" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What needs attention?"/><button className="button primary" disabled={loading}>{loading ? <RefreshCw className="spin" size={16}/> : <Sparkles size={16}/>} Analyze</button></div></form><div className="suggested-queries">{['What needs attention?','Why is Customer API at risk?','What changed today?','Summarize the Authentication incident'].map((item) => <button key={item} onClick={() => setQuery(item)}>{item}</button>)}</div></section>
    {result ? <div className="analysis-results"><section className="panel analysis-summary"><div className="section-heading"><div><span className="eyebrow">Assessment</span><h2>{result.summary}</h2></div><span className="confidence">{result.confidence} confidence</span></div><p>{result.confidenceReason}</p><div className="analysis-actions"><h3>Recommended actions</h3>{result.recommendedActions.map((action) => <button key={`${action.priority}-${action.title}`} onClick={() => {if (action.targetEntity?.startsWith('INC-')) navigateTo('incidents', action.targetEntity); else if (action.targetEntity?.startsWith('proj-')) navigateTo('projects', action.targetEntity);}}><span>{action.priority}</span><span><strong>{action.title}</strong><small>{action.description}</small></span><ArrowRight size={15}/></button>)}</div></section><div className="evidence-grid"><section className="panel evidence observed"><h3><CircleDot size={16}/> Observed</h3>{result.observedFacts.length ? <ul>{result.observedFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul> : <p>No direct facts matched the question.</p>}</section><section className="panel evidence derived"><h3><Activity size={16}/> Derived</h3>{result.derivedMetrics.length ? <ul>{result.derivedMetrics.map((fact) => <li key={fact}>{fact}</li>)}</ul> : <p>No additional metrics were derived.</p>}</section><section className="panel evidence inferred"><h3><Lightbulb size={16}/> Inferred</h3>{result.inferredCauses.length ? <ul>{result.inferredCauses.map((fact) => <li key={fact}>{fact}</li>)}</ul> : <p>No causal inference was required.</p>}<small>Hypotheses are not presented as observed fact.</small></section></div></div> : <EmptyState icon={<Sparkles/>} title="Ask an operational question" description="Analysis is generated from current projects, events, incidents, alerts, deadlines, and health factors." action={<button className="button primary" onClick={() => void analyze()}>Analyze current attention queue</button>}/>} 
  </>;
}

function SettingsView() {
  const {settings, updateSettings, resetWorkspace, aiStatus} = usePulsePilot();
  return <>
    <PageHeader eyebrow="Workspace configuration" title="Settings" description="Control local behavior, analysis preference, theme, and the seeded demo workspace."/>
    <div className="settings-grid"><section className="panel settings-section"><h2>Workspace</h2><label>Workspace name<input value={settings.workspaceName} onChange={(e) => updateSettings({workspaceName:e.target.value})}/></label><label>Theme<select value={settings.theme} onChange={(e) => updateSettings({theme:e.target.value as 'dark'|'light'})}><option value="dark">Dark</option><option value="light">Light</option></select></label><label>Analysis provider<select value={settings.aiProvider} onChange={(e) => updateSettings({aiProvider:e.target.value as typeof settings.aiProvider})}><option value="auto">Automatic</option><option value="local_only">Local only</option><option value="gemini_preferred">Gemini preferred</option></select></label><p className="setting-note"><CircleDot size={14}/> Optional provider: {aiStatus.available ? 'server key available' : 'not configured; local analysis remains active'}.</p></section><section className="panel settings-section"><h2>Automation</h2><label className="setting-toggle"><span><strong>Evaluate rules on new events</strong><small>New events immediately pass through enabled alert rules.</small></span><input type="checkbox" checked={settings.autoEvaluateRules} onChange={(e) => updateSettings({autoEvaluateRules:e.target.checked})}/></label><label className="setting-toggle"><span><strong>Workspace notifications</strong><small>Reserved for connected notification integrations.</small></span><input type="checkbox" checked={settings.notificationsEnabled} onChange={(e) => updateSettings({notificationsEnabled:e.target.checked})}/></label></section><section className="panel settings-section danger-zone"><h2>Demo data</h2><p>PulsePilot is running a local Demo Workspace. Reset restores believable seeded projects, events, alerts, incidents, rules, and settings.</p><button className="button danger" onClick={() => {if (window.confirm('Reset the Demo Workspace? All local changes will be replaced by seed data.')) resetWorkspace();}}><RefreshCw size={15}/> Reset Demo Workspace</button></section></div>
  </>;
}
