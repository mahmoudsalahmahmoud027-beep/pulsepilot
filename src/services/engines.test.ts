import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateProjectHealth} from './healthEngine';
import {evaluateAlertRules} from './rulesEngine';
import {tokenMatch} from './searchEngine';
import {LocalAnalysisProvider} from './ai/analysisProvider';
import type {AlertRule, Incident, OperationalEvent, Project} from '../types';

const project: Project = {
  id: 'project-api', name: 'Customer API', description: 'Customer endpoints', category: 'Service',
  repository: 'example/customer-api', environment: 'Production', health: 'HEALTHY', healthScore: 100,
  healthFactors: {criticalIncidentsCount: 0, activeIncidentsCount: 0, failedDeployments24h: 0, unresolvedWarningsCount: 0, deadlineProximityDays: null, lastDeploymentStatus: 'NONE', calculationExplanation: []},
  lastUpdated: new Date().toISOString(),
};

const failure = (id: string): OperationalEvent => ({
  id, timestamp: new Date().toISOString(), projectId: project.id, projectName: project.name,
  type: 'DEPLOYMENT_FAILED', severity: 'HIGH', title: `Deployment ${id} failed`,
  description: 'Readiness probe failed.', metadata: {errorReason: 'HTTP 503 from health endpoint'},
});

test('deployment threshold generates one alert for identical evidence', () => {
  const rule: AlertRule = {id: 'rule-failures', name: 'Repeated failures', description: 'Two failures in an hour', enabled: true, severity: 'HIGH', condition: {type: 'FAILED_DEPLOYMENTS_COUNT', operator: '>=', value: 2, timeWindowMinutes: 60, targetProjectId: project.id}, triggerCount: 0};
  const events = [failure('event-2'), failure('event-1')];
  const first = evaluateAlertRules([rule], events, [project], [], []);
  assert.equal(first.newAlerts.length, 1);
  assert.equal(first.updatedRules[0].triggerCount, 1);
  assert.ok(first.updatedRules[0].lastEvaluated);
  assert.ok(first.updatedRules[0].lastTriggered);
  const second = evaluateAlertRules(first.updatedRules, events, [project], [], first.newAlerts);
  assert.equal(second.newAlerts.length, 0);
  assert.equal(second.updatedRules[0].triggerCount, 1);
});

test('new qualifying evidence can trigger again after the prior alert resolves', () => {
  const rule: AlertRule = {id: 'rule-failures', name: 'Repeated failures', description: 'Two failures in an hour', enabled: true, severity: 'HIGH', condition: {type: 'FAILED_DEPLOYMENTS_COUNT', operator: '>=', value: 2, timeWindowMinutes: 60, targetProjectId: project.id}, triggerCount: 0};
  const first = evaluateAlertRules([rule], [failure('event-2'), failure('event-1')], [project], [], []);
  const resolved = first.newAlerts.map((alert) => ({...alert, status: 'RESOLVED' as const}));
  const second = evaluateAlertRules(first.updatedRules, [failure('event-3'), failure('event-2'), failure('event-1')], [project], [], resolved);
  assert.equal(second.newAlerts.length, 1);
  assert.notEqual(second.newAlerts[0].fingerprint, first.newAlerts[0].fingerprint);
});

test('resolving an incident improves deterministic project health', () => {
  const incident: Incident = {id: 'INC-1', title: 'Service unavailable', projectId: project.id, projectName: project.name, severity: 'SEV-1', status: 'Investigating', description: 'Requests fail.', impact: 'Customer requests fail.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), owner: 'On-call', timeline: [], relatedEventIds: [], suggestedActions: []};
  const unhealthy = calculateProjectHealth(project, [incident], [], []);
  const healthy = calculateProjectHealth(project, [{...incident, status: 'Resolved'}], [], []);
  assert.equal(unhealthy.health, 'CRITICAL');
  assert.equal(healthy.health, 'HEALTHY');
  assert.ok(healthy.healthScore > unhealthy.healthScore);
});

test('a newer recovery signal clears the recent degradation penalty', () => {
  const degraded: OperationalEvent = {id: 'degraded', timestamp: new Date(Date.now() - 60_000).toISOString(), projectId: project.id, projectName: project.name, type: 'SERVICE_DEGRADED', severity: 'HIGH', title: 'Service latency increased', description: 'Latency exceeded its threshold.', metadata: {}};
  const recovered: OperationalEvent = {id: 'recovered', timestamp: new Date().toISOString(), projectId: project.id, projectName: project.name, type: 'SERVICE_RECOVERED', severity: 'INFO', title: 'Service recovered', description: 'Latency returned to baseline.', metadata: {}};
  assert.equal(calculateProjectHealth(project, [], [degraded], []).health, 'AT_RISK');
  assert.equal(calculateProjectHealth(project, [], [recovered, degraded], []).health, 'HEALTHY');
});

test('token search finds a failed deployment with “failed deploy”', () => {
  assert.equal(tokenMatch('failed deploy', 'Authentication deployment failed health checks', 'DEPLOYMENT_FAILED'), true);
  assert.equal(tokenMatch('failed deploy', 'Deployment completed successfully'), false);
});

test('local analysis is grounded in supplied workspace state', async () => {
  const event = failure('event-1');
  const result = await new LocalAnalysisProvider().analyze('What needs attention?', {projects: [project], incidents: [], events: [event], alerts: []});
  assert.match(result.summary, /deployment failure/i);
  assert.ok(result.observedFacts.some((fact) => fact.includes(event.title)));
  assert.equal(result.source, 'local-deterministic');
  assert.ok(result.recommendedActions.length > 0);
});
