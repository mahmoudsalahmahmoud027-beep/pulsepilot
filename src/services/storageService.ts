import {
  Project,
  OperationalEvent,
  Incident,
  Alert,
  AlertRule,
  WorkspaceSettings,
} from '../types';
import {
  INITIAL_PROJECTS,
  INITIAL_INCIDENTS,
  INITIAL_EVENTS,
  INITIAL_ALERTS,
  INITIAL_ALERT_RULES,
  INITIAL_SETTINGS,
} from '../data/initialData';

const STORAGE_KEY = 'pulsepilot_ops_state_v1';
const CORRUPT_STORAGE_KEY = 'pulsepilot_ops_state_corrupt_backup';

export interface PersistedState {
  version: number;
  projects: Project[];
  incidents: Incident[];
  events: OperationalEvent[];
  alerts: Alert[];
  alertRules: AlertRule[];
  settings: WorkspaceSettings;
  lastSaved: string;
}

export function loadPersistedState(): PersistedState {
  if (typeof window === 'undefined') {
    return getInitialSeedState();
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = getInitialSeedState();
      savePersistedState(seed);
      return seed;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.projects)) {
      console.warn('[PulsePilot Storage] Schema mismatch; backing up the stored value and restoring defaults.');
      localStorage.setItem(CORRUPT_STORAGE_KEY, raw);
      const seed = getInitialSeedState();
      savePersistedState(seed);
      return seed;
    }

    return parsed;
  } catch (err) {
    console.error('[PulsePilot Storage] Error loading local state:', err);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try { localStorage.setItem(CORRUPT_STORAGE_KEY, raw); } catch { /* Storage may be unavailable. */ }
    }
    const seed = getInitialSeedState();
    return seed;
  }
}

export function savePersistedState(state: PersistedState): void {
  if (typeof window === 'undefined') return;
  try {
    const dataToSave = {
      ...state,
      lastSaved: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  } catch (err) {
    console.error('[PulsePilot Storage] Failed to save state to localStorage:', err);
  }
}

export function resetToSeedState(): PersistedState {
  const seed = getInitialSeedState();
  savePersistedState(seed);
  return seed;
}

export function getInitialSeedState(): PersistedState {
  return {
    version: 1,
    projects: [...INITIAL_PROJECTS],
    incidents: [...INITIAL_INCIDENTS],
    events: [...INITIAL_EVENTS],
    alerts: [...INITIAL_ALERTS],
    alertRules: [...INITIAL_ALERT_RULES],
    settings: { ...INITIAL_SETTINGS },
    lastSaved: new Date().toISOString(),
  };
}
