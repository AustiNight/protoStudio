import { create } from 'zustand';

import type { Session } from '../types/session';
import { useBacklogStore } from './backlog-store';
import { useBuildStore } from './build-store';
import { useChatStore } from './chat-store';
import { useTelemetryStore } from './telemetry-store';

export interface SessionStoreState {
  session: Session | null;
  archivedSessions: Session[];
  createSession: (session: Session) => void;
  setSession: (session: Session | null) => void;
  archiveSession: (sessionId: string) => void;
  resetSession: () => void;
  resetStore: () => void;
}

const initialState: Pick<SessionStoreState, 'session' | 'archivedSessions'> = {
  session: null,
  archivedSessions: [],
};

export const createSessionStore = () =>
  create<SessionStoreState>((set, get) => ({
    ...initialState,
    createSession: (session) => {
      const existing = get().session;
      if (existing) {
        set(() => ({
          archivedSessions: [],
        }));
        return;
      }
      const activeSession: Session = {
        ...session,
        status: 'active',
      };
      set(() => ({
        session: activeSession,
        archivedSessions: [],
      }));
      const telemetryStore = useTelemetryStore.getState();
      void telemetryStore.startSession({
        sessionId: session.id,
        path: session.path,
        templateId: session.templateId,
        startedAt: session.createdAt,
      });
      if (session.path === 'template' && session.templateId) {
        void telemetryStore.recordTemplateSelected({
          sessionId: session.id,
          templateId: session.templateId,
          path: session.path,
          timestamp: session.createdAt,
        });
      }
    },
    setSession: (session) =>
      set(() => ({
        session,
      })),
    archiveSession: (sessionId) => {
      const state = get();
      if (!state.session || state.session.id !== sessionId) {
        return;
      }
      const telemetryStore = useTelemetryStore.getState();
      void telemetryStore.endSession();
      set(() => ({
        session: null,
        archivedSessions: [],
      }));
    },
    resetSession: () => {
      const chatStore = useChatStore.getState();
      const backlogStore = useBacklogStore.getState();
      const buildStore = useBuildStore.getState();
      const telemetryStore = useTelemetryStore.getState();

      void telemetryStore.endSession();
      chatStore.clearMessages();
      backlogStore.clearBacklog();
      buildStore.resetBuild();
      telemetryStore.resetStore();

      set(() => ({
        session: null,
        archivedSessions: [],
      }));
    },
    resetStore: () =>
      set(() => ({
        session: null,
        archivedSessions: [],
      })),
  }));

export const useSessionStore = createSessionStore();

export const selectActiveSession = (state: SessionStoreState) => state.session;
export const selectSessionId = (state: SessionStoreState) => state.session?.id ?? null;
export const selectIsSessionActive = (state: SessionStoreState) =>
  state.session?.status === 'active';
export const selectArchivedSessions = (state: SessionStoreState) =>
  state.archivedSessions;
