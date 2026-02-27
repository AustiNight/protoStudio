import { create } from 'zustand';

import {
  clearTelemetrySessionId,
  readTelemetrySessionId,
  writeTelemetrySessionId,
} from '../persistence/telemetry-session';
import { TelemetryLog } from '../persistence/telemetry-log';
import type { TelemetryEvent } from '../types/telemetry';

export interface TelemetryTotals {
  total: number;
  byEvent: Record<string, number>;
}

export interface TelemetryStoreState {
  sessionId: string | null;
  events: TelemetryEvent[];
  setSessionId: (sessionId: string | null) => void;
  appendEvent: (event: TelemetryEvent) => Promise<boolean>;
  loadEvents: (sessionId: string) => Promise<boolean>;
  exportEvents: (sessionId?: string) => Promise<string | null>;
  clearEvents: () => Promise<boolean>;
  getTotals: () => TelemetryTotals;
  resetStore: () => void;
}

const telemetryLog = new TelemetryLog();

export const createTelemetryStore = () => {
  const storedSessionId = readTelemetrySessionId();

  return create<TelemetryStoreState>((set, get) => {
    if (storedSessionId) {
      void (async () => {
        const result = await telemetryLog.getEvents(storedSessionId);
        if (result.ok) {
          set({ sessionId: storedSessionId, events: result.value });
        }
      })();
    }

    return {
      sessionId: storedSessionId,
      events: [],
      setSessionId: (sessionId) => {
        if (sessionId) {
          writeTelemetrySessionId(sessionId);
        } else {
          clearTelemetrySessionId();
        }
        set(() => ({
          sessionId,
        }));
      },
    appendEvent: async (event) => {
      const result = await telemetryLog.append(event);
      if (!result.ok) {
        return false;
      }
      set((state) => ({
        events: [...state.events, event],
      }));
      return true;
    },
    loadEvents: async (sessionId) => {
      const result = await telemetryLog.getEvents(sessionId);
      if (!result.ok) {
        return false;
      }
      set(() => ({
        sessionId,
        events: result.value,
      }));
      return true;
    },
    exportEvents: async (sessionId) => {
      const activeSessionId = sessionId ?? get().sessionId;
      if (!activeSessionId) {
        return null;
      }
      const result = await telemetryLog.exportAsJSON(activeSessionId);
      return result.ok ? result.value : null;
    },
    clearEvents: async () => {
      const activeSessionId = get().sessionId;
      if (activeSessionId) {
        const result = await telemetryLog.clear(activeSessionId);
        if (!result.ok) {
          return false;
        }
      }
      set(() => ({
        events: [],
      }));
      return true;
    },
    getTotals: () => buildTotals(get().events),
    resetStore: () => {
      clearTelemetrySessionId();
      set(() => ({
        sessionId: null,
        events: [],
      }));
    },
    };
  });
};

export const useTelemetryStore = createTelemetryStore();

export const selectTelemetryEvents = (state: TelemetryStoreState) => state.events;
export const selectTelemetryCount = (state: TelemetryStoreState) => state.events.length;
export const selectTelemetryTotals = (state: TelemetryStoreState) =>
  buildTotals(state.events);

function buildTotals(events: TelemetryEvent[]): TelemetryTotals {
  const byEvent: Record<string, number> = {};
  for (const event of events) {
    byEvent[event.event] = (byEvent[event.event] ?? 0) + 1;
  }
  return {
    total: events.length,
    byEvent,
  };
}
