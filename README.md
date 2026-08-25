# PulsePilot

> **Repository:** `mahmoudsalahmahmoud027-beep/pulsepilot`  
> **Status:** Portfolio project · source release

PulsePilot is a local-first operations intelligence workspace for understanding what changed, what is at risk, why it happened, and what to do next. It connects projects, operational events, alert rules, alerts, incidents, risks, and analysis through one persisted source of truth.

The included data is an explicit **Demo Workspace**. It demonstrates product workflows and does not claim to represent a live production monitoring connection.

## Features

- Actionable overview with derived system status, ranked attention queue, risks, change summaries, and next-best action
- Explainable project health calculated from incidents, deployment failures, degradations, alerts, and deadlines
- Searchable event stream with project, severity, type, and time filters
- Incident creation, editing, ownership, status transitions, notes, resolution, reopening, and related events
- Alert acknowledgement, resolution, project navigation, and incident escalation
- Local alert-rule evaluation with condition windows, evidence fingerprints, and duplicate protection
- Unified operational timeline across events, alerts, alert actions, and incident updates
- `Ctrl/Cmd + K` command palette with token matching across all domain entities
- Local deterministic analysis that separates observed facts, derived metrics, and inferred hypotheses
- Optional server-side Gemini analysis with automatic local fallback
- Versioned local persistence, corrupt-state backup, and Demo Workspace reset
- Responsive layouts for desktop, tablet, and mobile

## Architecture

React components consume a shared `PulsePilotContext`. Domain services remain pure where practical:

- `healthEngine` recalculates explainable project health
- `rulesEngine` evaluates rules and fingerprints triggering evidence
- `attentionEngine` ranks actionable work and selects recommendations
- `riskEngine` detects deadline, deployment, incident, and automation risks
- `whatChangedEngine` aggregates time-scoped activity without inventing transitions
- `analysisProvider` supplies deterministic local analysis and optional AI fallback
- `storageService` owns versioned browser persistence

New events flow through the enabled rules, generated alerts influence project health, and all state changes feed the overview, search, analysis, and timeline.

## Tech stack

- React 19 and TypeScript
- Vite 6
- Express server
- Tailwind CSS compiler plus a custom product stylesheet
- Lucide icons
- Node's test runner with Vite SSR compilation
- Optional `@google/genai` server integration

## Local setup

Prerequisites: Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Verification commands:

```bash
npm run lint
npm test
npm run build
npm start
```

## Optional AI integration

Copy `.env.example` to `.env` and set `GEMINI_API_KEY`. The key is read only by the Express server and is never embedded in the browser bundle. When the key is absent, rejected, or unavailable, every analysis workflow continues through the local deterministic provider.

## Persistence

Meaningful workspace changes are saved to a versioned `localStorage` document. Invalid stored data is backed up under a separate recovery key before seed data is restored. Use **Settings → Reset Demo Workspace** to intentionally return to the original seeded state.

## Keyboard shortcuts

- `Ctrl/Cmd + K`: open search and command palette
- `↑` / `↓`: move through results
- `Enter`: open the selected result or command
- `Escape`: close palettes and dialogs

## Project structure

```text
src/
  components/       Product views, command palette, shared UI
  context/          Shared source-of-truth state and actions
  data/             Believable seeded Demo Workspace
  services/         Health, rules, risk, attention, search, persistence, analysis
  types/            Explicit operational domain models
server.ts           Express host and optional AI endpoint
```