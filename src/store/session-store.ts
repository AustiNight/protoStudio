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
  create<SessionStoreState>((set) => ({
    ...initialState,
    createSession: (session) =>
      set((state) => {
        const activeSession: Session = {
          ...session,
          status: 'active',
        };
        const archivedSessions = state.session
          ? archiveInto(state.archivedSessions, {
              ...state.session,
              status: 'archived',
            })
          : state.archivedSessions;
        return {
          session: activeSession,
          archivedSessions,
        };
      }),
    setSession: (session) =>
      set(() => ({
        session,
      })),
    archiveSession: (sessionId) =>
      set((state) => {
        if (!state.session || state.session.id !== sessionId) {
          return {};
        }
        const archivedSessions = archiveInto(state.archivedSessions, {
          ...state.session,
          status: 'archived',
        });
        return {
          session: null,
          archivedSessions,
        };
      }),
    resetSession: () => {
      const chatStore = useChatStore.getState();
      const backlogStore = useBacklogStore.getState();
      const buildStore = useBuildStore.getState();
      const telemetryStore = useTelemetryStore.getState();

      chatStore.clearMessages();
      backlogStore.clearBacklog();
      buildStore.resetBuild();
      telemetryStore.resetStore();

      set((state) => ({
        session: null,
        archivedSessions: state.archivedSessions,
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

function archiveInto(sessions: Session[], session: Session): Session[] {
  const filtered = sessions.filter((entry) => entry.id !== session.id);
  return [...filtered, session];
}
