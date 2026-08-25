import { Project, Incident, OperationalEvent, Risk } from '../types';

export function detectOperationalRisks(
  projects: Project[],
  incidents: Incident[],
  events: OperationalEvent[]
): Risk[] {
  const risks: Risk[] = [];
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

  for (const project of projects) {
    const projIncidents = incidents.filter(
      (i) => i.projectId === project.id && i.status !== 'Resolved'
    );
    const projEvents = events.filter((e) => e.projectId === project.id);
    const recentEvents = projEvents.filter((e) => new Date(e.timestamp).getTime() > oneDayAgo);
    const failedDeployments24h = recentEvents.filter((e) => e.type === 'DEPLOYMENT_FAILED');
    const failedAutomations = projEvents.filter(
      (e) => e.type === 'AUTOMATION_FAILED' && new Date(e.timestamp).getTime() > threeDaysAgo
    );

    // 1. Deadline Risk
    if (project.upcomingDeadline) {
      const deadlineDate = new Date(project.upcomingDeadline.date).getTime();
      const daysRemaining = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));

      if (daysRemaining <= 4 && daysRemaining >= 0) {
        const reasons: string[] = [
          `Target deadline "${project.upcomingDeadline.title}" is in ${daysRemaining} day(s).`,
        ];

        if (projIncidents.length > 0) {
          reasons.push(
            `${projIncidents.length} active unresolved incident(s) currently ongoing on this project.`
          );
        }

        if (failedDeployments24h.length > 0) {
          reasons.push(
            `${failedDeployments24h.length} failed deployment(s) in the last 24 hours.`
          );
        }

        if (reasons.length > 1 || daysRemaining <= 2) {
          risks.push({
            id: `risk-deadline-${project.id}`,
            projectId: project.id,
            projectName: project.name,
            type: 'DEADLINE_RISK',
            severity: daysRemaining <= 2 || projIncidents.some((i) => i.severity === 'SEV-1') ? 'CRITICAL' : 'HIGH',
            title: `${project.name}: Imminent Deadline with Open Issues`,
            reasons,
            suggestedRemediation:
              'Prioritize incident resolution before pushing further non-critical feature changes.',
          });
        }
      }
    }

    // 2. Deployment Instability
    if (failedDeployments24h.length > 0) {
      const reasons: string[] = [
        `${failedDeployments24h.length} deployment failure(s) recorded in the last 24 hours.`,
      ];

      const lastFailed = failedDeployments24h[0];
      if (lastFailed.metadata?.errorReason) {
        reasons.push(`Latest failure reason: "${lastFailed.metadata.errorReason}"`);
      }
      if (lastFailed.metadata?.commitHash) {
        reasons.push(`Target commit: ${lastFailed.metadata.commitHash}`);
      }

      risks.push({
        id: `risk-deploy-${project.id}`,
        projectId: project.id,
        projectName: project.name,
        type: 'DEPLOYMENT_INSTABILITY',
        severity: failedDeployments24h.length >= 2 ? 'CRITICAL' : 'HIGH',
        title: `${project.name}: Deployment Pipeline Instability`,
        reasons,
        suggestedRemediation:
          'Audit readiness probes and rollback candidate images before attempting next deployment rollout.',
      });
    }

    // 3. Incident Accumulation / Unresolved SEV-1
    if (projIncidents.length > 0) {
      const sev1s = projIncidents.filter((i) => i.severity === 'SEV-1');
      if (sev1s.length > 0 || projIncidents.length >= 2) {
        const reasons: string[] = [
          sev1s.length > 0
            ? `Critical SEV-1 incident open: ${sev1s.map((i) => `${i.id} (${i.title})`).join(', ')}`
            : `${projIncidents.length} active incidents accumulating without complete resolution.`,
        ];

        for (const inc of projIncidents) {
          const ageMinutes = Math.round(
            (now - new Date(inc.createdAt).getTime()) / (60 * 1000)
          );
          reasons.push(`${inc.id} (${inc.severity}) has been in ${inc.status} state for ${ageMinutes}m.`);
        }

        risks.push({
          id: `risk-incident-${project.id}`,
          projectId: project.id,
          projectName: project.name,
          type: 'INCIDENT_ACCUMULATION',
          severity: sev1s.length > 0 ? 'CRITICAL' : 'HIGH',
          title: `${project.name}: High Incident Load`,
          reasons,
          suggestedRemediation:
            'Assign dedicated on-call incident commander to triage and drive root cause mitigation.',
        });
      }
    }

    // 4. Repeated Automation / Batch Failures
    if (failedAutomations.length >= 1) {
      risks.push({
        id: `risk-auto-${project.id}`,
        projectId: project.id,
        projectName: project.name,
        type: 'REPEATED_FAILURE',
        severity: 'MEDIUM',
        title: `${project.name}: Automation & Worker Contention`,
        reasons: [
          `${failedAutomations.length} background job / compaction failure(s) in last 72h.`,
          'Potential disk I/O contention during peak cron rollups.',
        ],
        suggestedRemediation:
          'Review background scheduler worker memory quotas and off-peak execution windows.',
      });
    }
  }

  return risks;
}
