import { Project, Incident, OperationalEvent, Alert, HealthState, HealthFactors } from '../types';

export function calculateProjectHealth(
  project: Project,
  allIncidents: Incident[],
  allEvents: OperationalEvent[],
  allAlerts: Alert[]
): { health: HealthState; healthScore: number; healthFactors: HealthFactors } {
  let score = 100;
  const explanations: string[] = [];

  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const twoHoursAgo = now - 2 * 60 * 60 * 1000;

  // 1. Incidents
  const projectIncidents = allIncidents.filter(
    (inc) => inc.projectId === project.id && inc.status !== 'Resolved'
  );
  const criticalIncidents = projectIncidents.filter((inc) => inc.severity === 'SEV-1');
  const highIncidents = projectIncidents.filter((inc) => inc.severity === 'SEV-2');
  const mediumIncidents = projectIncidents.filter((inc) => inc.severity === 'SEV-3');
  const lowIncidents = projectIncidents.filter((inc) => inc.severity === 'SEV-4');

  if (criticalIncidents.length > 0) {
    const penalty = criticalIncidents.length * 40;
    score -= penalty;
    explanations.push(
      `Active SEV-1 incident (${criticalIncidents.map((i) => i.id).join(', ')}) deducts ${penalty} pts`
    );
  }

  if (highIncidents.length > 0) {
    const penalty = highIncidents.length * 20;
    score -= penalty;
    explanations.push(
      `Active SEV-2 incident (${highIncidents.map((i) => i.id).join(', ')}) deducts ${penalty} pts`
    );
  }

  if (mediumIncidents.length > 0) {
    const penalty = mediumIncidents.length * 10;
    score -= penalty;
    explanations.push(
      `Active SEV-3 incident (${mediumIncidents.map((i) => i.id).join(', ')}) deducts ${penalty} pts`
    );
  }

  if (lowIncidents.length > 0) {
    const penalty = lowIncidents.length * 5;
    score -= penalty;
    explanations.push(
      `Active SEV-4 incident (${lowIncidents.map((i) => i.id).join(', ')}) deducts ${penalty} pts`
    );
  }

  // 2. Recent Events / Deployments
  const projectEvents = allEvents.filter((e) => e.projectId === project.id);
  const recentEvents = projectEvents.filter((e) => new Date(e.timestamp).getTime() > oneDayAgo);
  const failedDeployments = recentEvents.filter((e) => e.type === 'DEPLOYMENT_FAILED');
  const recentServiceSignals = projectEvents
    .filter((event) => ['API_DEGRADED', 'SERVICE_DEGRADED', 'API_RECOVERED', 'SERVICE_RECOVERED'].includes(event.type) && new Date(event.timestamp).getTime() > twoHoursAgo)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const apiDegradations = recentServiceSignals[0] && ['API_DEGRADED', 'SERVICE_DEGRADED'].includes(recentServiceSignals[0].type)
    ? [recentServiceSignals[0]]
    : [];

  if (failedDeployments.length > 0) {
    const penalty = Math.min(30, failedDeployments.length * 15);
    score -= penalty;
    explanations.push(
      `${failedDeployments.length} deployment failure(s) in last 24h deducts ${penalty} pts`
    );
  }

  if (apiDegradations.length > 0) {
    const penalty = 15;
    score -= penalty;
    explanations.push(`Recent API degradation event in past 2h deducts ${penalty} pts`);
  }

  // Last deployment status
  const deployments = projectEvents
    .filter((e) => e.type === 'DEPLOYMENT_SUCCEEDED' || e.type === 'DEPLOYMENT_FAILED')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  let lastDeploymentStatus: 'SUCCEEDED' | 'FAILED' | 'NONE' = 'NONE';
  if (deployments.length > 0) {
    lastDeploymentStatus = deployments[0].type === 'DEPLOYMENT_SUCCEEDED' ? 'SUCCEEDED' : 'FAILED';
  }

  // 3. Open Alerts
  const openAlerts = allAlerts.filter(
    (a) => a.projectId === project.id && a.status === 'OPEN'
  );
  if (openAlerts.length > 0) {
    const penalty = Math.min(15, openAlerts.length * 2);
    score -= penalty;
    explanations.push(
      `${openAlerts.length} unresolved alert(s) deducts ${penalty} pts`
    );
  }

  // 4. Upcoming Deadlines with active issues
  let deadlineProximityDays: number | null = null;
  if (project.upcomingDeadline) {
    const deadlineTime = new Date(project.upcomingDeadline.date).getTime();
    const diffDays = Math.ceil((deadlineTime - now) / (1000 * 60 * 60 * 24));
    deadlineProximityDays = diffDays;

    if (diffDays <= 3 && diffDays >= 0) {
      if (projectIncidents.length > 0 || failedDeployments.length > 0 || openAlerts.length > 0) {
        const penalty = 12;
        score -= penalty;
        explanations.push(
          `Imminent deadline "${project.upcomingDeadline.title}" in ${diffDays}d with active operational risk deducts ${penalty} pts`
        );
      }
    }
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine state
  let health: HealthState = 'HEALTHY';
  if (criticalIncidents.length > 0 || score < 50) {
    health = 'CRITICAL';
  } else if (score < 70 || highIncidents.length > 0) {
    health = 'DEGRADED';
  } else if (score < 90 || deadlineProximityDays !== null && deadlineProximityDays <= 2 && projectIncidents.length > 0) {
    health = 'AT_RISK';
  }

  if (explanations.length === 0) {
    explanations.push('Zero active incidents, all health checks passing at 100% nominal');
  }

  const healthFactors: HealthFactors = {
    criticalIncidentsCount: criticalIncidents.length,
    activeIncidentsCount: projectIncidents.length,
    failedDeployments24h: failedDeployments.length,
    unresolvedWarningsCount: openAlerts.length,
    deadlineProximityDays,
    lastDeploymentStatus,
    calculationExplanation: explanations,
  };

  return { health, healthScore: score, healthFactors };
}

export function recalculateAllProjectsHealth(
  projects: Project[],
  incidents: Incident[],
  events: OperationalEvent[],
  alerts: Alert[]
): Project[] {
  return projects.map((project) => {
    const { health, healthScore, healthFactors } = calculateProjectHealth(
      project,
      incidents,
      events,
      alerts
    );
    return {
      ...project,
      health,
      healthScore,
      healthFactors,
      lastUpdated: new Date().toISOString(),
    };
  });
}
