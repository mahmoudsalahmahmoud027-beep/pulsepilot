import {
  OperationalEvent,
  Incident,
  Alert,
  Project,
  WhatChangedSummary,
} from '../types';

export function computeWhatChanged(
  timeframe: '1h' | 'today' | '24h' | '7d',
  events: OperationalEvent[],
  incidents: Incident[],
  alerts: Alert[],
  projects: Project[]
): WhatChangedSummary {
  const now = Date.now();
  let timeLimitMs = 60 * 60 * 1000;

  if (timeframe === 'today') {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    timeLimitMs = now - startOfToday.getTime();
  } else if (timeframe === '24h') {
    timeLimitMs = 24 * 60 * 60 * 1000;
  } else if (timeframe === '7d') {
    timeLimitMs = 7 * 24 * 60 * 60 * 1000;
  }

  const cutoff = now - timeLimitMs;

  // Filter events in timeframe
  const periodEvents = events
    .filter((e) => new Date(e.timestamp).getTime() >= cutoff)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Deployments
  const depSucceeded = periodEvents.filter((e) => e.type === 'DEPLOYMENT_SUCCEEDED').length;
  const depFailed = periodEvents.filter((e) => e.type === 'DEPLOYMENT_FAILED').length;

  // Incidents created or resolved in timeframe
  const newIncidents = incidents.filter(
    (i) => new Date(i.createdAt).getTime() >= cutoff
  );
  const resolvedIncidents = incidents.filter(
    (i) => i.resolvedAt && new Date(i.resolvedAt).getTime() >= cutoff
  );

  // Alerts
  const newAlerts = alerts.filter(
    (a) => new Date(a.createdAt).getTime() >= cutoff
  );

  // Health changes are only reported when an event contains explicit before/after evidence.
  const healthChanges: WhatChangedSummary['healthChanges'] = [];
  for (const event of periodEvents) {
    const from = event.metadata.previousHealth;
    const to = event.metadata.currentHealth;
    const project = projects.find((item) => item.id === event.projectId);
    if (project && typeof from === 'string' && typeof to === 'string' && ['HEALTHY','DEGRADED','AT_RISK','CRITICAL'].includes(from) && ['HEALTHY','DEGRADED','AT_RISK','CRITICAL'].includes(to)) {
      healthChanges.push({projectId: project.id, projectName: project.name, from: from as Project['health'], to: to as Project['health']});
    }
  }

  // Narrative summary synthesis
  const timeframeLabel =
    timeframe === '1h'
      ? 'In the past hour'
      : timeframe === 'today'
      ? 'Today'
      : timeframe === '24h'
      ? 'Over the last 24 hours'
      : 'Over the past 7 days';

  const parts: string[] = [];

  if (newIncidents.length > 0) {
    const sev1Count = newIncidents.filter((i) => i.severity === 'SEV-1').length;
    parts.push(
      `${newIncidents.length} new incident(s) were declared${sev1Count > 0 ? ` including ${sev1Count} critical SEV-1` : ''}`
    );
  } else {
    parts.push('no new incidents opened');
  }

  if (depFailed > 0) {
    parts.push(`${depFailed} deployment failure(s) occurred alongside ${depSucceeded} successful deployment(s)`);
  } else if (depSucceeded > 0) {
    parts.push(`${depSucceeded} deployment(s) shipped successfully`);
  }

  if (resolvedIncidents.length > 0) {
    parts.push(`${resolvedIncidents.length} incident(s) were successfully resolved`);
  }

  if (newAlerts.length > 0) {
    parts.push(`${newAlerts.length} alert(s) triggered`);
  }

  const narrativeSummary = `${timeframeLabel}, ${parts.join(', ')}.`;

  return {
    timeframe,
    newIncidentsCount: newIncidents.length,
    resolvedIncidentsCount: resolvedIncidents.length,
    deploymentsCount: {
      succeeded: depSucceeded,
      failed: depFailed,
    },
    newAlertsCount: newAlerts.length,
    healthChanges,
    keyEvents: periodEvents.slice(0, 8),
    narrativeSummary,
  };
}
