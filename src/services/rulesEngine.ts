import {
  AlertRule,
  OperationalEvent,
  Project,
  Incident,
  Alert,
} from '../types';

export function evaluateAlertRules(
  rules: AlertRule[],
  events: OperationalEvent[],
  projects: Project[],
  incidents: Incident[],
  existingAlerts: Alert[]
): { updatedRules: AlertRule[]; newAlerts: Alert[] } {
  const now = Date.now();
  const evaluatedAt = new Date(now).toISOString();
  const newAlerts: Alert[] = [];

  const compare = (actual: number | string, operator: AlertRule['condition']['operator'], expected: number | string) => {
    if (operator === '==') return actual === expected;
    const left = Number(actual);
    const right = Number(expected);
    if (operator === '>=') return left >= right;
    if (operator === '<=') return left <= right;
    if (operator === '>') return left > right;
    return left < right;
  };

  const updatedRules = rules.map((rule) => {
    if (!rule.enabled) {
      return rule;
    }

    const { condition, severity } = rule;
    let triggered = false;

    const windowMs = (condition.timeWindowMinutes || 60) * 60 * 1000;
    const windowStart = now - windowMs;

    // Filter relevant events & projects based on target
    const targetProjects =
      condition.targetProjectId && condition.targetProjectId !== 'ALL'
        ? projects.filter((p) => p.id === condition.targetProjectId)
        : projects;

    for (const proj of targetProjects) {
      let conditionMet = false;
      let triggerReason = '';
      let evidence: string[] = [];
      const projEvents = events.filter(
        (e) => e.projectId === proj.id && new Date(e.timestamp).getTime() >= windowStart
      );

      switch (condition.type) {
        case 'FAILED_DEPLOYMENTS_COUNT': {
          const failedCount = projEvents.filter((e) => e.type === 'DEPLOYMENT_FAILED').length;
          const targetValue = Number(condition.value);

          if (compare(failedCount, condition.operator, targetValue)) {
            conditionMet = true;
            triggerReason = `${failedCount} deployment failures recorded within ${condition.timeWindowMinutes || 60}m (threshold: ${condition.operator} ${targetValue})`;
            evidence = projEvents.filter((e) => e.type === 'DEPLOYMENT_FAILED').map((e) => e.id);
          }
          break;
        }

        case 'API_LATENCY_THRESHOLD': {
          const latencyThreshold = Number(condition.value);
          const degradedEvents = projEvents.filter(
            (e) =>
              (e.type === 'API_DEGRADED' || e.type === 'SERVICE_DEGRADED' || e.metadata.latencyMs !== undefined) &&
              compare(e.metadata.latencyMs || 0, condition.operator, latencyThreshold)
          );

          if (degradedEvents.length > 0) {
            conditionMet = true;
            const maxLatency = Math.max(...degradedEvents.map((e) => e.metadata?.latencyMs || 0));
            triggerReason = `API latency reached ${maxLatency}ms (threshold > ${latencyThreshold}ms)`;
            evidence = degradedEvents.map((e) => e.id);
          }
          break;
        }

        case 'ACTIVE_INCIDENTS_COUNT': {
          const activeCount = incidents.filter(
            (i) => i.projectId === proj.id && i.status !== 'Resolved'
          ).length;
          const targetValue = Number(condition.value);

          if (compare(activeCount, condition.operator, targetValue)) {
            conditionMet = true;
            triggerReason = `${activeCount} active incident(s) open on ${proj.name}`;
            evidence = incidents.filter((i) => i.projectId === proj.id && i.status !== 'Resolved').map((i) => i.id);
          }
          break;
        }

        case 'DEADLINE_PROXIMITY_DAYS': {
          if (proj.upcomingDeadline) {
            const diffDays = Math.ceil(
              (new Date(proj.upcomingDeadline.date).getTime() - now) / (1000 * 60 * 60 * 24)
            );
            const targetDays = Number(condition.value);

            if (compare(diffDays, condition.operator, targetDays) && diffDays >= 0) {
              conditionMet = true;
              triggerReason = `Deadline "${proj.upcomingDeadline.title}" is in ${diffDays} days (threshold <= ${targetDays}d)`;
              evidence = [proj.upcomingDeadline.date];
            }
          }
          break;
        }

        case 'PROJECT_HEALTH_STATE': {
          if (compare(proj.health, condition.operator, condition.value)) {
            conditionMet = true;
            triggerReason = `Project health changed to ${condition.value} (${proj.healthScore}/100)`;
            evidence = [proj.health, String(proj.healthScore)];
          }
          break;
        }

        case 'SPECIFIC_EVENT_TYPE': {
          const matchingEvents = projEvents.filter((event) => event.type === condition.value);
          if (matchingEvents.length > 0) {
            conditionMet = true;
            triggerReason = `${matchingEvents.length} ${String(condition.value).replaceAll('_', ' ').toLowerCase()} event(s) recorded within ${condition.timeWindowMinutes || 60}m`;
            evidence = matchingEvents.map((event) => event.id);
          }
          break;
        }

        default:
          break;
      }

      if (conditionMet) {
        const fingerprint = `${rule.id}:${proj.id}:${evidence.sort().join(',')}`;
        const alreadyGenerated = [...existingAlerts, ...newAlerts].some(
          (alert) => alert.fingerprint === fingerprint ||
            (!alert.fingerprint && alert.ruleId === rule.id && alert.projectId === proj.id && alert.status !== 'RESOLVED')
        );
        if (!alreadyGenerated) {
        const newAlert: Alert = {
          id: `alt-gen-${rule.id}-${proj.id}-${now}`,
          title: `${proj.name}: ${rule.name}`,
          projectId: proj.id,
          projectName: proj.name,
          severity,
          source: 'Alert Rule Engine',
          trigger: triggerReason,
          createdAt: evaluatedAt,
          status: 'OPEN',
          ruleId: rule.id,
          fingerprint,
        };
        newAlerts.push(newAlert);
          triggered = true;
        }
      }
    }

    return {
      ...rule,
      lastEvaluated: evaluatedAt,
      lastTriggered: triggered ? evaluatedAt : rule.lastTriggered,
      triggerCount: (rule.triggerCount || 0) + newAlerts.filter((alert) => alert.ruleId === rule.id).length,
    };
  });

  return { updatedRules, newAlerts };
}
