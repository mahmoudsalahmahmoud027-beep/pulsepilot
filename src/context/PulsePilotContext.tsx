import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Project,
  Incident,
  OperationalEvent,
  Alert,
  AlertRule,
  WorkspaceSettings,
  Risk,
  AttentionItem,
  NextActionRecommendation,
  WhatChangedSummary,
  IncidentStatus,
  Severity,
} from '../types';
import { loadPersistedState, savePersistedState, resetToSeedState, PersistedState } from '../services/storageService';
import { recalculateAllProjectsHealth } from '../services/healthEngine';
import { evaluateAlertRules } from '../services/rulesEngine';
import { detectOperationalRisks } from '../services/riskEngine';
import { computeAttentionItems, computeNextActionRecommendation } from '../services/attentionEngine';
import { computeWhatChanged } from '../services/whatChangedEngine';

export type ActiveView =
  | 'overview'
  | 'projects'
  | 'events'
  | 'incidents'
  | 'alerts'
  | 'timeline'
  | 'rules'
  | 'assistant'
  | 'settings';

interface PulsePilotContextValue {
  // State
  projects: Project[];
  incidents: Incident[];
  events: OperationalEvent[];
  alerts: Alert[];
  alertRules: AlertRule[];
  settings: WorkspaceSettings;
  activeView: ActiveView;
  selectedProjectId: string | null;
  selectedIncidentId: string | null;
  selectedEventId: string | null;
  isSearchOpen: boolean;
  aiStatus: { available: boolean; mode: string };

  // Derived Engines
  risks: Risk[];
  attentionItems: AttentionItem[];
  nextAction: NextActionRecommendation;
  getWhatChanged: (timeframe: '1h' | 'today' | '24h' | '7d') => WhatChangedSummary;

  // Navigation & Modals
  navigateTo: (view: ActiveView, targetId?: string | null) => void;
  setSelectedProjectId: (id: string | null) => void;
  setSelectedIncidentId: (id: string | null) => void;
  setSelectedEventId: (id: string | null) => void;
  setIsSearchOpen: (open: boolean) => void;

  // Incident Actions
  updateIncidentStatus: (id: string, status: IncidentStatus, resolution?: string) => void;
  addIncidentTimelineNote: (id: string, author: string, message: string) => void;
  createIncident: (data: Omit<Incident, 'id' | 'createdAt' | 'updatedAt' | 'timeline'>) => Incident;
  updateIncident: (id: string, updates: Pick<Partial<Incident>, 'title' | 'description' | 'impact' | 'owner' | 'severity'>) => void;
  resolveIncident: (id: string, resolution: string) => void;
  reopenIncident: (id: string) => void;

  // Alert Actions
  acknowledgeAlert: (id: string) => void;
  resolveAlert: (id: string) => void;
  promoteAlertToIncident: (alertId: string, severity?: Severity, owner?: string) => Incident;

  // Rule Engine Actions
  createAlertRule: (data: Omit<AlertRule, 'id' | 'lastEvaluated' | 'triggerCount'>) => void;
  updateAlertRule: (id: string, updates: Partial<AlertRule>) => void;
  toggleAlertRule: (id: string) => void;
  deleteAlertRule: (id: string) => void;
  evaluateRulesNow: () => void;

  // Event Actions
  emitEvent: (event: Omit<OperationalEvent, 'id' | 'timestamp'>) => void;
  resetWorkspace: () => void;
  updateSettings: (newSettings: Partial<WorkspaceSettings>) => void;
}

const PulsePilotContext = createContext<PulsePilotContextValue | null>(null);

export const PulsePilotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [initialState] = useState<PersistedState>(() => loadPersistedState());

  const [projects, setProjects] = useState<Project[]>(initialState.projects);
  const [incidents, setIncidents] = useState<Incident[]>(initialState.incidents);
  const [events, setEvents] = useState<OperationalEvent[]>(initialState.events);
  const [alerts, setAlerts] = useState<Alert[]>(initialState.alerts);
  const [alertRules, setAlertRules] = useState<AlertRule[]>(initialState.alertRules);
  const [settings, setSettings] = useState<WorkspaceSettings>(initialState.settings);

  const [activeView, setActiveView] = useState<ActiveView>('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const [aiStatus, setAiStatus] = useState({ available: false, mode: 'local_deterministic' });

  // Check backend Gemini status on mount
  useEffect(() => {
    fetch('/api/gemini-status')
      .then((res) => res.json())
      .then((data) => {
        setAiStatus({ available: data.available, mode: data.mode });
      })
      .catch(() => {
        setAiStatus({ available: false, mode: 'local_deterministic' });
      });
  }, []);

  // Sync theme to document element
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [settings.theme]);

  // Recalculate project health dynamically whenever incidents, events, or alerts change
  useEffect(() => {
    setProjects((currentProjects) =>
      recalculateAllProjectsHealth(currentProjects, incidents, events, alerts)
    );
  }, [incidents, events, alerts]);

  // Auto-persist state to localStorage
  useEffect(() => {
    savePersistedState({
      version: 1,
      projects,
      incidents,
      events,
      alerts,
      alertRules,
      settings,
      lastSaved: new Date().toISOString(),
    });
  }, [projects, incidents, events, alerts, alertRules, settings]);

  // Navigation helper
  const navigateTo = useCallback((view: ActiveView, targetId: string | null = null) => {
    setActiveView(view);
    if (view === 'projects' && targetId) {
      setSelectedProjectId(targetId);
    } else if (view === 'projects' && !targetId) {
      setSelectedProjectId(null);
    }

    if (view === 'incidents' && targetId) {
      setSelectedIncidentId(targetId);
    } else if (view === 'incidents' && !targetId) {
      setSelectedIncidentId(null);
    }

    if (view === 'events' && targetId) {
      setSelectedEventId(targetId);
    }

    // Scroll to top of view
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Evaluate alert rules against current state
  const evaluateRulesNow = useCallback(() => {
    const { updatedRules, newAlerts } = evaluateAlertRules(
      alertRules,
      events,
      projects,
      incidents,
      alerts
    );
    setAlertRules(updatedRules);
    if (newAlerts.length > 0) {
      setAlerts((prev) => [...newAlerts, ...prev]);
    }
  }, [alertRules, events, projects, incidents, alerts]);

  // Incident Actions
  const updateIncidentStatus = useCallback(
    (id: string, status: IncidentStatus, resolution?: string) => {
      const now = new Date().toISOString();
      setIncidents((prev) =>
        prev.map((inc) => {
          if (inc.id !== id) return inc;
          const statusEntry = {
            id: `t-${Date.now()}`,
            timestamp: now,
            author: 'On-Call Operator',
            message: `Incident status updated from ${inc.status} to ${status}${resolution ? `. Resolution: ${resolution}` : ''}`,
            type: 'STATUS_CHANGE' as const,
          };
          return {
            ...inc,
            status,
            updatedAt: now,
            resolvedAt: status === 'Resolved' ? now : undefined,
            resolution: resolution || inc.resolution,
            timeline: [statusEntry, ...inc.timeline],
          };
        })
      );

      // Emit event
      const targetInc = incidents.find((i) => i.id === id);
      if (targetInc) {
        const newEvent: OperationalEvent = {
          id: `evt-${Date.now()}`,
          timestamp: now,
          projectId: targetInc.projectId,
          projectName: targetInc.projectName,
          type: status === 'Resolved' ? 'INCIDENT_RESOLVED' : 'INCIDENT_UPDATED',
          severity: status === 'Resolved' ? 'INFO' : 'MEDIUM',
          title: `Incident ${id} moved to ${status}`,
          description: resolution || `Status changed by operator to ${status}.`,
          metadata: { relatedIncidentId: id },
        };
        setEvents((prev) => [newEvent, ...prev]);
      }
    },
    [incidents]
  );

  const addIncidentTimelineNote = useCallback((id: string, author: string, message: string) => {
    const now = new Date().toISOString();
    setIncidents((prev) =>
      prev.map((inc) => {
        if (inc.id !== id) return inc;
        const newEntry = {
          id: `t-${Date.now()}`,
          timestamp: now,
          author: author || 'Operator',
          message,
          type: 'NOTE' as const,
        };
        return {
          ...inc,
          updatedAt: now,
          timeline: [newEntry, ...inc.timeline],
        };
      })
    );
  }, []);

  const createIncident = useCallback(
    (data: Omit<Incident, 'id' | 'createdAt' | 'updatedAt' | 'timeline'>): Incident => {
      const now = new Date().toISOString();
      const highestId = incidents.reduce((highest, incident) => {
        const numericId = Number(incident.id.replace(/\D/g, ''));
        return Number.isFinite(numericId) ? Math.max(highest, numericId) : highest;
      }, 200);
      const newId = `INC-${highestId + 1}`;
      const newIncident: Incident = {
        ...data,
        id: newId,
        createdAt: now,
        updatedAt: now,
        timeline: [
          {
            id: `t-${Date.now()}`,
            timestamp: now,
            author: data.owner || 'System',
            message: `Incident declared as ${data.severity} (${data.status}). Initial summary: ${data.description}`,
            type: 'STATUS_CHANGE',
          },
        ],
      };

      setIncidents((prev) => [newIncident, ...prev]);

      // Emit event
      const newEvent: OperationalEvent = {
        id: `evt-${Date.now()}`,
        timestamp: now,
        projectId: data.projectId,
        projectName: data.projectName,
        type: 'INCIDENT_CREATED',
        severity: data.severity === 'SEV-1' ? 'CRITICAL' : 'HIGH',
        title: `Incident ${newId} declared: ${data.title}`,
        description: data.description,
        metadata: { relatedIncidentId: newId },
      };
      setEvents((prev) => [newEvent, ...prev]);

      return newIncident;
    },
    [incidents.length]
  );

  const updateIncident = useCallback(
    (id: string, updates: Pick<Partial<Incident>, 'title' | 'description' | 'impact' | 'owner' | 'severity'>) => {
      const updatedAt = new Date().toISOString();
      setIncidents((current) => current.map((incident) =>
        incident.id === id ? { ...incident, ...updates, updatedAt } : incident
      ));
    },
    []
  );

  const resolveIncident = useCallback(
    (id: string, resolution: string) => {
      updateIncidentStatus(id, 'Resolved', resolution);
    },
    [updateIncidentStatus]
  );

  const reopenIncident = useCallback(
    (id: string) => {
      updateIncidentStatus(id, 'Investigating');
    },
    [updateIncidentStatus]
  );

  // Alert Actions
  const acknowledgeAlert = useCallback((id: string) => {
    const now = new Date().toISOString();
    setAlerts((prev) =>
      prev.map((alt) =>
        alt.id === id
          ? { ...alt, status: 'ACKNOWLEDGED', acknowledgedAt: now }
          : alt
      )
    );
  }, []);

  const resolveAlert = useCallback((id: string) => {
    const now = new Date().toISOString();
    setAlerts((prev) =>
      prev.map((alt) =>
        alt.id === id
          ? { ...alt, status: 'RESOLVED', resolvedAt: now }
          : alt
      )
    );
  }, []);

  const promoteAlertToIncident = useCallback(
    (alertId: string, severity: Severity = 'SEV-2', owner: string = 'On-Call Lead') => {
      const alert = alerts.find((a) => a.id === alertId);
      if (!alert) throw new Error('Alert not found');

      const newInc = createIncident({
        title: alert.title,
        projectId: alert.projectId,
        projectName: alert.projectName,
        severity,
        status: 'Investigating',
        description: `Promoted from Alert ${alert.id}. Trigger condition: ${alert.trigger}`,
        impact: `Active monitoring on ${alert.projectName} after alert escalation.`,
        owner,
        relatedEventIds: [],
        suggestedActions: [
          `Inspect ${alert.source} metrics and telemetry logs`,
          `Verify service health probes on ${alert.projectName}`,
        ],
      });

      // Link alert to incident & acknowledge
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alertId
            ? { ...a, status: 'ACKNOWLEDGED', acknowledgedAt: new Date().toISOString(), relatedIncidentId: newInc.id }
            : a
        )
      );

      return newInc;
    },
    [alerts, createIncident]
  );

  // Rule Actions
  const createAlertRule = useCallback(
    (data: Omit<AlertRule, 'id' | 'lastEvaluated' | 'triggerCount'>) => {
      const newRule: AlertRule = {
        ...data,
        id: `rule-${Date.now()}`,
        lastEvaluated: new Date().toISOString(),
        triggerCount: 0,
      };
      setAlertRules((prev) => [newRule, ...prev]);
    },
    []
  );

  const updateAlertRule = useCallback((id: string, updates: Partial<AlertRule>) => {
    setAlertRules((prev) =>
      prev.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule))
    );
  }, []);

  const toggleAlertRule = useCallback((id: string) => {
    setAlertRules((prev) =>
      prev.map((rule) =>
        rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
      )
    );
  }, []);

  const deleteAlertRule = useCallback((id: string) => {
    setAlertRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // Event Emitter
  const emitEvent = useCallback(
    (eventData: Omit<OperationalEvent, 'id' | 'timestamp'>) => {
      const newEvent: OperationalEvent = {
        ...eventData,
        id: `evt-${Date.now()}`,
        timestamp: new Date().toISOString(),
      };
      const nextEvents = [newEvent, ...events];
      setEvents(nextEvents);
      if (settings.autoEvaluateRules) {
        const evaluation = evaluateAlertRules(
          alertRules,
          nextEvents,
          projects,
          incidents,
          alerts
        );
        setAlertRules(evaluation.updatedRules);
        if (evaluation.newAlerts.length > 0) {
          setAlerts((current) => [...evaluation.newAlerts, ...current]);
        }
      }
    },
    [alertRules, alerts, events, incidents, projects, settings.autoEvaluateRules]
  );

  const resetWorkspace = useCallback(() => {
    const seed = resetToSeedState();
    setProjects(seed.projects);
    setIncidents(seed.incidents);
    setEvents(seed.events);
    setAlerts(seed.alerts);
    setAlertRules(seed.alertRules);
    setSettings(seed.settings);
    setSelectedProjectId(null);
    setSelectedIncidentId(null);
    setSelectedEventId(null);
    setActiveView('overview');
  }, []);

  const updateSettings = useCallback((newSettings: Partial<WorkspaceSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  // Derived calculations
  const risks = useMemo(() => {
    return detectOperationalRisks(projects, incidents, events);
  }, [projects, incidents, events]);

  const attentionItems = useMemo(() => {
    return computeAttentionItems(incidents, alerts, projects, events);
  }, [incidents, alerts, projects, events]);

  const nextAction = useMemo(() => {
    return computeNextActionRecommendation(attentionItems, incidents, projects);
  }, [attentionItems, incidents, projects]);

  const getWhatChanged = useCallback(
    (timeframe: '1h' | 'today' | '24h' | '7d') => {
      return computeWhatChanged(timeframe, events, incidents, alerts, projects);
    },
    [events, incidents, alerts, projects]
  );

  const contextValue: PulsePilotContextValue = {
    projects,
    incidents,
    events,
    alerts,
    alertRules,
    settings,
    activeView,
    selectedProjectId,
    selectedIncidentId,
    selectedEventId,
    isSearchOpen,
    aiStatus,
    risks,
    attentionItems,
    nextAction,
    getWhatChanged,
    navigateTo,
    setSelectedProjectId,
    setSelectedIncidentId,
    setSelectedEventId,
    setIsSearchOpen,
    updateIncidentStatus,
    addIncidentTimelineNote,
    createIncident,
    updateIncident,
    resolveIncident,
    reopenIncident,
    acknowledgeAlert,
    resolveAlert,
    promoteAlertToIncident,
    createAlertRule,
    updateAlertRule,
    toggleAlertRule,
    deleteAlertRule,
    evaluateRulesNow,
    emitEvent,
    resetWorkspace,
    updateSettings,
  };

  return (
    <PulsePilotContext.Provider value={contextValue}>
      {children}
    </PulsePilotContext.Provider>
  );
};

export function usePulsePilot(): PulsePilotContextValue {
  const ctx = useContext(PulsePilotContext);
  if (!ctx) {
    throw new Error('usePulsePilot must be used within a PulsePilotProvider');
  }
  return ctx;
}
