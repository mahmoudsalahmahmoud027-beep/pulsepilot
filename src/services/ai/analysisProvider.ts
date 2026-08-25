import type {Alert, AnalysisResult, Incident, OperationalEvent, Project} from '../../types';

export interface OperationsContext {
  projects: Project[];
  incidents: Incident[];
  events: OperationalEvent[];
  alerts: Alert[];
}

export interface AnalysisProvider {
  analyze(query: string, context: OperationsContext, targetType?: string, targetId?: string): Promise<AnalysisResult>;
}

function projectMatchesQuery(project: Project, query: string) {
  const words = project.name.toLowerCase().split(/\s+/).filter((word) => word.length > 3);
  return words.some((word) => query.includes(word));
}

function severityRank(severity: Incident['severity']) {
  return {'SEV-1': 4, 'SEV-2': 3, 'SEV-3': 2, 'SEV-4': 1}[severity];
}

export class LocalAnalysisProvider implements AnalysisProvider {
  async analyze(query: string, context: OperationsContext, targetType = 'WORKSPACE', targetId = 'ALL'): Promise<AnalysisResult> {
    const normalizedQuery = query.toLowerCase().trim();
    const mentionedProject = context.projects.find((project) => projectMatchesQuery(project, normalizedQuery));
    const selectedProjectIds = new Set(
      targetType === 'PROJECT' && targetId !== 'ALL' ? [targetId] : mentionedProject ? [mentionedProject.id] : context.projects.map((project) => project.id)
    );
    const projects = context.projects.filter((project) => selectedProjectIds.has(project.id));
    const incidents = context.incidents
      .filter((incident) => incident.status !== 'Resolved' && selectedProjectIds.has(incident.projectId))
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const alerts = context.alerts.filter((alert) => alert.status === 'OPEN' && selectedProjectIds.has(alert.projectId));
    const dayAgo = Date.now() - 86_400_000;
    const events = context.events
      .filter((event) => selectedProjectIds.has(event.projectId) && new Date(event.timestamp).getTime() >= dayAgo)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const failedDeployments = events.filter((event) => event.type === 'DEPLOYMENT_FAILED');
    const degradations = events.filter((event) => event.type === 'API_DEGRADED' || event.type === 'SERVICE_DEGRADED');
    const affectedProjects = projects.filter((project) => project.health !== 'HEALTHY');
    const observedFacts: string[] = [];
    const derivedMetrics: string[] = [];
    const inferredCauses: string[] = [];

    incidents.slice(0, 3).forEach((incident) => observedFacts.push(
      `${incident.id} is ${incident.severity}, ${incident.status.toLowerCase()}, owned by ${incident.owner}: ${incident.title}.`
    ));
    failedDeployments.slice(0, 3).forEach((event) => observedFacts.push(
      `${event.projectName} recorded a deployment failure: ${event.title}${event.metadata.errorReason ? ` (${event.metadata.errorReason})` : ''}.`
    ));
    if (alerts.length) observedFacts.push(`${alerts.length} open alert${alerts.length === 1 ? '' : 's'} currently require acknowledgement or resolution.`);
    if (!observedFacts.length) observedFacts.push('No active incidents, open alerts, or deployment failures were recorded in the selected scope during the last 24 hours.');

    derivedMetrics.push(`${affectedProjects.length} of ${projects.length} selected project${projects.length === 1 ? '' : 's'} are not healthy.`);
    derivedMetrics.push(`${failedDeployments.length} failed and ${events.filter((event) => event.type === 'DEPLOYMENT_SUCCEEDED').length} successful deployments were recorded in the last 24 hours.`);
    for (const project of projects) {
      if (!project.upcomingDeadline) continue;
      const days = Math.ceil((new Date(project.upcomingDeadline.date).getTime() - Date.now()) / 86_400_000);
      if (days >= 0 && days <= 7) derivedMetrics.push(`${project.name} has “${project.upcomingDeadline.title}” due in ${days} day${days === 1 ? '' : 's'}.`);
    }

    for (const project of projects) {
      const failure = failedDeployments.find((event) => event.projectId === project.id);
      const degradation = degradations.find((event) => event.projectId === project.id);
      if (failure && degradation && Math.abs(new Date(failure.timestamp).getTime() - new Date(degradation.timestamp).getTime()) <= 7_200_000) {
        inferredCauses.push(`${project.name}'s deployment failure and degradation occurred within two hours; the change may be related, but the event sequence alone does not establish causation.`);
      }
    }

    const recommendations: AnalysisResult['recommendedActions'] = [];
    for (const incident of incidents.slice(0, 2)) {
      recommendations.push({priority: recommendations.length ? 'P2' : 'P1', title: `Advance ${incident.id}`, description: incident.suggestedActions[0] || `Review ${incident.title} with ${incident.owner}.`, targetEntity: incident.id});
    }
    if (recommendations.length < 3 && failedDeployments[0]) recommendations.push({priority: recommendations.length ? 'P2' : 'P1', title: `Review failed ${failedDeployments[0].projectName} deployment`, description: failedDeployments[0].metadata.errorReason ? String(failedDeployments[0].metadata.errorReason) : failedDeployments[0].description, targetEntity: failedDeployments[0].projectId});
    if (recommendations.length < 3 && alerts[0]) recommendations.push({priority: recommendations.length ? 'P3' : 'P1', title: `Triage ${alerts[0].title}`, description: `Acknowledge ownership or resolve the condition: ${alerts[0].trigger}`, targetEntity: 'alerts'});
    if (!recommendations.length) recommendations.push({priority: 'P3', title: 'Review the next change window', description: 'No urgent operational work is derived; verify upcoming deadlines before the next deployment.', targetEntity: 'projects'});

    const leading = incidents[0];
    const summary = leading
      ? `${leading.projectName} is the highest-priority area because ${leading.id} is an active ${leading.severity} incident. The selected scope also has ${alerts.length} open alert${alerts.length === 1 ? '' : 's'} and ${failedDeployments.length} deployment failure${failedDeployments.length === 1 ? '' : 's'} in the last 24 hours.`
      : failedDeployments.length
        ? `${failedDeployments.length} deployment failure${failedDeployments.length === 1 ? '' : 's'} occurred in the selected scope during the last 24 hours and should be reviewed before the next rollout.`
      : affectedProjects.length
        ? `${affectedProjects.length} project${affectedProjects.length === 1 ? '' : 's'} have elevated health risk, with ${alerts.length} open alert${alerts.length === 1 ? '' : 's'} in the selected scope.`
        : 'No urgent incident or alert work is present in the selected scope. Current project health is nominal.';

    return {
      summary,
      confidence: observedFacts.length >= 3 ? 'HIGH' : observedFacts.length >= 1 ? 'MEDIUM' : 'LOW',
      confidenceReason: 'Confidence reflects the amount of current incident, alert, event, and deadline evidence available in this workspace.',
      observedFacts,
      derivedMetrics,
      inferredCauses,
      likelyRootCause: inferredCauses[0] || 'No root cause is established by the available operational evidence.',
      recommendedActions: recommendations.slice(0, 3),
      source: 'local-deterministic',
      generatedAt: new Date().toISOString(),
    };
  }
}

interface ServerAnalysisResponse {
  success?: boolean;
  data?: Omit<AnalysisResult, 'source' | 'generatedAt'>;
}

export class GeminiAnalysisProvider implements AnalysisProvider {
  private fallback = new LocalAnalysisProvider();

  async analyze(query: string, context: OperationsContext, targetType = 'WORKSPACE', targetId = 'ALL'): Promise<AnalysisResult> {
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          query,
          targetType,
          targetId,
          contextData: {
            projects: context.projects.map(({id, name, health, healthScore, healthFactors, upcomingDeadline}) => ({id, name, health, healthScore, healthFactors, upcomingDeadline})),
            activeIncidents: context.incidents.filter((incident) => incident.status !== 'Resolved'),
            recentEvents: context.events.slice(0, 30),
            openAlerts: context.alerts.filter((alert) => alert.status === 'OPEN'),
          },
        }),
      });
      if (!response.ok) return this.fallback.analyze(query, context, targetType, targetId);
      const result = await response.json() as ServerAnalysisResponse;
      if (!result.success || !result.data) return this.fallback.analyze(query, context, targetType, targetId);
      return {...result.data, source: 'gemini-3.7-flash', generatedAt: new Date().toISOString()};
    } catch {
      return this.fallback.analyze(query, context, targetType, targetId);
    }
  }
}
