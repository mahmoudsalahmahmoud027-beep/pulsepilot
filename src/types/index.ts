export type HealthState = 'HEALTHY' | 'DEGRADED' | 'AT_RISK' | 'CRITICAL';

export type Severity = 'SEV-1' | 'SEV-2' | 'SEV-3' | 'SEV-4';

export type EventSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type IncidentStatus = 'Investigating' | 'Identified' | 'Monitoring' | 'Resolved';

export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export type EventType =
  | 'DEPLOYMENT_STARTED'
  | 'DEPLOYMENT_SUCCEEDED'
  | 'DEPLOYMENT_FAILED'
  | 'API_DEGRADED'
  | 'API_RECOVERED'
  | 'SERVICE_DEGRADED'
  | 'SERVICE_RECOVERED'
  | 'INCIDENT_CREATED'
  | 'INCIDENT_UPDATED'
  | 'INCIDENT_RESOLVED'
  | 'DEADLINE_APPROACHING'
  | 'TASK_OVERDUE'
  | 'AUTOMATION_FAILED'
  | 'AUTOMATION_SUCCEEDED'
  | 'CONFIG_CHANGED'
  | 'SECURITY_SCAN_ALERT';

export interface EventMetadata {
  environment?: 'Production' | 'Staging' | 'Canary';
  commitHash?: string;
  commitMessage?: string;
  author?: string;
  latencyMs?: number;
  statusCode?: number;
  errorReason?: string;
  relatedIncidentId?: string;
  durationMs?: number;
  serviceName?: string;
  changeDetails?: string;
  daysRemaining?: number;
  [key: string]: unknown;
}

export interface OperationalEvent {
  id: string;
  timestamp: string;
  projectId: string;
  projectName: string;
  type: EventType;
  severity: EventSeverity;
  title: string;
  description: string;
  metadata: EventMetadata;
}

export interface IncidentTimelineEntry {
  id: string;
  timestamp: string;
  author: string;
  message: string;
  type: 'STATUS_CHANGE' | 'NOTE' | 'EVENT_LINK' | 'ACTION_TAKEN';
  metadata?: Record<string, unknown>;
}

export interface Incident {
  id: string; // e.g. "INC-204"
  title: string;
  projectId: string;
  projectName: string;
  severity: Severity;
  status: IncidentStatus;
  description: string;
  impact: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  owner: string;
  timeline: IncidentTimelineEntry[];
  relatedEventIds: string[];
  resolution?: string;
  suggestedActions: string[];
}

export interface Alert {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  source: string;
  trigger: string;
  createdAt: string;
  status: AlertStatus;
  ruleId?: string;
  relatedIncidentId?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  fingerprint?: string;
}

export type AlertRuleConditionType =
  | 'FAILED_DEPLOYMENTS_COUNT'
  | 'API_LATENCY_THRESHOLD'
  | 'ACTIVE_INCIDENTS_COUNT'
  | 'DEADLINE_PROXIMITY_DAYS'
  | 'SPECIFIC_EVENT_TYPE'
  | 'PROJECT_HEALTH_STATE';

export interface AlertRuleCondition {
  type: AlertRuleConditionType;
  operator: '>=' | '<=' | '==' | '>' | '<';
  value: number | string;
  timeWindowMinutes?: number;
  targetProjectId?: string; // 'ALL' or specific projectId
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  condition: AlertRuleCondition;
  lastEvaluated?: string;
  lastTriggered?: string;
  triggerCount: number;
}

export interface HealthFactors {
  criticalIncidentsCount: number;
  activeIncidentsCount: number;
  failedDeployments24h: number;
  unresolvedWarningsCount: number;
  deadlineProximityDays: number | null;
  lastDeploymentStatus: 'SUCCEEDED' | 'FAILED' | 'NONE';
  calculationExplanation: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  category: string;
  repository: string;
  environment: 'Production' | 'Staging';
  health: HealthState;
  healthScore: number; // 0-100
  healthFactors: HealthFactors;
  upcomingDeadline?: {
    title: string;
    date: string;
    criticality: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  lastUpdated: string;
}

export interface Risk {
  id: string;
  projectId: string;
  projectName: string;
  type: 'DEADLINE_RISK' | 'DEPLOYMENT_INSTABILITY' | 'INCIDENT_ACCUMULATION' | 'REPEATED_FAILURE' | 'SERVICE_DEGRADATION';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  title: string;
  reasons: string[];
  suggestedRemediation: string;
}

export interface AttentionItem {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  urgencyScore: number; // Higher is more urgent
  category: 'INCIDENT' | 'FAILED_DEPLOYMENT' | 'ALERT' | 'DEADLINE' | 'DEGRADED_SERVICE';
  reason: string;
  timestamp: string;
  targetView: 'incidents' | 'projects' | 'alerts' | 'events';
  targetId: string;
}

export interface NextActionRecommendation {
  primary: {
    title: string;
    reason: string;
    actionType: 'OPEN_INCIDENT' | 'VIEW_DEPLOYMENT' | 'ACKNOWLEDGE_ALERT' | 'CHECK_PROJECT_DEADLINE';
    targetId: string;
    targetView: 'incidents' | 'projects' | 'alerts' | 'events';
    badgeText: string;
  };
  alternatives: Array<{
    title: string;
    reason: string;
    actionType: string;
    targetId: string;
    targetView: 'incidents' | 'projects' | 'alerts' | 'events';
  }>;
}

export interface AnalysisResult {
  summary: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceReason: string;
  observedFacts: string[];
  derivedMetrics: string[];
  inferredCauses: string[];
  likelyRootCause: string;
  recommendedActions: Array<{
    priority: 'P1' | 'P2' | 'P3';
    title: string;
    description: string;
    targetEntity?: string;
  }>;
  source: 'gemini-3.7-flash' | 'local-deterministic';
  generatedAt: string;
}

export interface WhatChangedSummary {
  timeframe: '1h' | 'today' | '24h' | '7d';
  newIncidentsCount: number;
  resolvedIncidentsCount: number;
  deploymentsCount: {
    succeeded: number;
    failed: number;
  };
  newAlertsCount: number;
  healthChanges: Array<{
    projectId: string;
    projectName: string;
    from: HealthState;
    to: HealthState;
  }>;
  keyEvents: OperationalEvent[];
  narrativeSummary: string;
}

export interface WorkspaceSettings {
  workspaceName: string;
  theme: 'dark' | 'light';
  aiProvider: 'auto' | 'local_only' | 'gemini_preferred';
  autoEvaluateRules: boolean;
  notificationsEnabled: boolean;
  version: number;
}
