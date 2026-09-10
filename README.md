# PulsePilot

PulsePilot is an operations intelligence workspace for understanding what changed, what is at risk, why it happened, and what should happen next.

It connects projects, operational events, alert rules, alerts, incidents, risks, and analysis through one persisted source of truth.

## Highlights

- Actionable overview with derived system status, ranked attention queue, risks, change summaries, and next actions
- Explainable project health calculated from incidents, failures, degradations, alerts, and deadlines
- Searchable event stream with project, severity, type, and time filters
- Incident lifecycle management with ownership, notes, escalation, resolution, reopening, and related events
- Alert acknowledgement, resolution, project navigation, and incident escalation
- Rule evaluation with time windows, evidence fingerprints, and duplicate protection
- Unified operational timeline across events, alerts, actions, and incident updates
- Deterministic risk, attention, and change-analysis engines
- Optional provider boundary for model-assisted analysis with local fallback
- Versioned persistence with corrupt-state recovery
- Responsive desktop, tablet, and mobile layouts

## Architecture

The UI consumes a shared application context while domain services stay isolated and pure where practical.

```text
healthEngine       explainable project health
rulesEngine        alert-rule evaluation and evidence fingerprinting
attentionEngine    actionable work ranking
riskEngine         deadline, deployment, incident, and automation risk detection
whatChangedEngine  time-scoped operational change analysis
analysisProvider   deterministic and remote analysis boundary
storageService     versioned persistence and recovery
```

New events flow through enabled rules, generated alerts influence project health, and meaningful state transitions feed the timeline, overview, search, and analysis surfaces.

## Tech Stack

- React 19
- TypeScript
- Vite
- Node.js / Express
- Tailwind CSS
- Lucide Icons
- Node test runner

## Local Development

```bash
npm install
npm run dev
```

Verification:

```bash
npm run lint
npm test
npm run build
```

## Reliability

The analysis layer is deliberately separated from core operational logic. If a remote intelligence provider is unavailable, PulsePilot continues to compute health, risk, attention, and change summaries through deterministic domain services.

## Engineering Focus

PulsePilot demonstrates explainable operational state, resilient provider boundaries, event-driven domain modeling, deduplicated alert generation, traceable incident workflows, and failure-tolerant analysis.
