import {
  Incident,
  Alert,
  Project,
  OperationalEvent,
  AttentionItem,
  NextActionRecommendation,
} from '../types';

export function computeAttentionItems(
  incidents: Incident[],
  alerts: Alert[],
  projects: Project[],
  events: OperationalEvent[]
): AttentionItem[] {
  const items: AttentionItem[] = [];
  const now = Date.now();

  // 1. Active Incidents (Highest Urgency)
  const activeIncidents = incidents.filter((i) => i.status !== 'Resolved');
  for (const inc of activeIncidents) {
    const ageMinutes = (now - new Date(inc.createdAt).getTime()) / (60 * 1000);
    let baseScore = 100;
    if (inc.severity === 'SEV-1') baseScore = 200;
    if (inc.severity === 'SEV-2') baseScore = 150;
    if (inc.severity === 'SEV-3') baseScore = 110;
    if (inc.severity === 'SEV-4') baseScore = 80;

    // Age bonus: older unresolved incidents bubble up
    const urgencyScore = baseScore + Math.min(50, ageMinutes / 10);

    items.push({
      id: `attn-inc-${inc.id}`,
      title: `${inc.severity}: ${inc.title}`,
      projectId: inc.projectId,
      projectName: inc.projectName,
      severity: inc.severity === 'SEV-1' ? 'CRITICAL' : inc.severity === 'SEV-2' ? 'HIGH' : 'MEDIUM',
      urgencyScore,
      category: 'INCIDENT',
      reason: `${inc.status} state for ${Math.round(ageMinutes)}m · Impact: ${inc.impact.slice(0, 70)}...`,
      timestamp: inc.createdAt,
      targetView: 'incidents',
      targetId: inc.id,
    });
  }

  // 2. Recent Failed Deployments
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const recentFailedDeployments = events.filter(
    (e) => e.type === 'DEPLOYMENT_FAILED' && new Date(e.timestamp).getTime() > oneDayAgo
  );
  for (const dep of recentFailedDeployments) {
    const ageMinutes = (now - new Date(dep.timestamp).getTime()) / (60 * 1000);
    items.push({
      id: `attn-dep-${dep.id}`,
      title: `Deployment Failed: ${dep.title}`,
      projectId: dep.projectId,
      projectName: dep.projectName,
      severity: 'HIGH',
      urgencyScore: 130 + Math.min(30, ageMinutes / 15),
      category: 'FAILED_DEPLOYMENT',
      reason: dep.metadata?.errorReason || 'Health checks failed after rollout.',
      timestamp: dep.timestamp,
      targetView: 'events',
      targetId: dep.id,
    });
  }

  // 3. Open Unacknowledged Critical/High Alerts
  const openAlerts = alerts.filter((a) => a.status === 'OPEN');
  for (const alt of openAlerts) {
    const ageMinutes = (now - new Date(alt.createdAt).getTime()) / (60 * 1000);
    const isCritical = alt.severity === 'CRITICAL';
    items.push({
      id: `attn-alt-${alt.id}`,
      title: `Alert: ${alt.title}`,
      projectId: alt.projectId,
      projectName: alt.projectName,
      severity: alt.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      urgencyScore: (isCritical ? 140 : 90) + Math.min(25, ageMinutes / 20),
      category: 'ALERT',
      reason: `Trigger: ${alt.trigger}`,
      timestamp: alt.createdAt,
      targetView: 'alerts',
      targetId: alt.id,
    });
  }

  // 4. Imminent Deadlines on At-Risk projects
  for (const proj of projects) {
    if (proj.upcomingDeadline && (proj.health === 'CRITICAL' || proj.health === 'DEGRADED' || proj.health === 'AT_RISK')) {
      const days = Math.ceil(
        (new Date(proj.upcomingDeadline.date).getTime() - now) / (1000 * 60 * 60 * 24)
      );
      if (days <= 3 && days >= 0) {
        items.push({
          id: `attn-dead-${proj.id}`,
          title: `Approaching Deadline: ${proj.upcomingDeadline.title}`,
          projectId: proj.id,
          projectName: proj.name,
          severity: days <= 1 ? 'CRITICAL' : 'HIGH',
          urgencyScore: 120 + (3 - days) * 15,
          category: 'DEADLINE',
          reason: `Target freeze in ${days}d while project is in ${proj.health} health state.`,
          timestamp: proj.upcomingDeadline.date,
          targetView: 'projects',
          targetId: proj.id,
        });
      }
    }
  }

  // Deduplicate items pointing to same target/incident
  const seenTargets = new Set<string>();
  const uniqueItems = items.filter((item) => {
    const key = `${item.category}-${item.targetId}`;
    if (seenTargets.has(key)) return false;
    seenTargets.add(key);
    return true;
  });

  // Sort by urgency descending
  return uniqueItems.sort((a, b) => b.urgencyScore - a.urgencyScore).slice(0, 6);
}

export function computeNextActionRecommendation(
  attentionItems: AttentionItem[],
  _incidents: Incident[],
  projects: Project[]
): NextActionRecommendation {
  if (attentionItems.length === 0) {
    return {
      primary: {
        title: 'Review System Health & Scheduled Maintenance',
        reason: 'All active incidents resolved and systems reporting nominal metrics.',
        actionType: 'OPEN_INCIDENT',
        targetId: projects[0]?.id || 'proj-cust-api',
        targetView: 'projects',
        badgeText: 'NOMINAL',
      },
      alternatives: [],
    };
  }

  const primaryItem = attentionItems[0];
  let primaryBadge = 'CRITICAL P1';
  let primaryActionType: 'OPEN_INCIDENT' | 'VIEW_DEPLOYMENT' | 'ACKNOWLEDGE_ALERT' | 'CHECK_PROJECT_DEADLINE' = 'OPEN_INCIDENT';

  if (primaryItem.category === 'INCIDENT') {
    primaryActionType = 'OPEN_INCIDENT';
    primaryBadge = primaryItem.severity === 'CRITICAL' ? 'SEV-1 ACTIVE' : 'SEV-2 ACTIVE';
  } else if (primaryItem.category === 'FAILED_DEPLOYMENT') {
    primaryActionType = 'VIEW_DEPLOYMENT';
    primaryBadge = 'DEPLOYMENT FAILURE';
  } else if (primaryItem.category === 'ALERT') {
    primaryActionType = 'ACKNOWLEDGE_ALERT';
    primaryBadge = 'UNACKNOWLEDGED';
  } else {
    primaryActionType = 'CHECK_PROJECT_DEADLINE';
    primaryBadge = 'DEADLINE RISK';
  }

  const primary = {
    title: `Resolve ${primaryItem.title}`,
    reason: primaryItem.reason,
    actionType: primaryActionType,
    targetId: primaryItem.targetId,
    targetView: primaryItem.targetView,
    badgeText: primaryBadge,
  };

  const alternatives = attentionItems.slice(1, 3).map((item) => ({
    title: item.title,
    reason: item.reason,
    actionType: item.category,
    targetId: item.targetId,
    targetView: item.targetView,
  }));

  return { primary, alternatives };
}
