import { create } from 'zustand';

import type { BuildPhase, BuildState } from '../types/build';
import type { WorkItem } from '../types/backlog';

export interface BuildStoreState {
  buildState: BuildState;
  isPaused: boolean;
  startBuild: (atom: WorkItem | null, phase?: BuildPhase) => void;
  setPhase: (phase: BuildPhase) => void;
  setCurrentAtom: (atom: WorkItem | null) => void;
  setLastError: (error: string | null) => void;
  incrementRetry: () => void;
  resetRetry: () => void;
  pauseBuild: () => void;
  resumeBuild: () => void;
  togglePause: () => void;
  resetBuild: () => void;
  resetStore: () => void;
}

const initialBuildState: BuildState = {
  phase: 'idle',
  currentAtom: null,
  startedAt: 0,
  phaseStartedAt: 0,
  retryCount: 0,
  lastError: null,
};

const initialState: Pick<BuildStoreState, 'buildState' | 'isPaused'> = {
  buildState: initialBuildState,
  isPaused: false,
};

export const createBuildStore = () =>
  create<BuildStoreState>((set) => ({
    ...initialState,
    startBuild: (atom, phase = 'assembling_context') => {
      const now = Date.now();
      set(() => ({
        buildState: {
          phase,
          currentAtom: atom,
          startedAt: now,
          phaseStartedAt: now,
          retryCount: 0,
          lastError: null,
        },
      }));
    },
    setPhase: (phase) => {
      const now = Date.now();
      set((state) => ({
        buildState: {
          ...state.buildState,
          phase,
          phaseStartedAt: now,
        },
      }));
    },
    setCurrentAtom: (atom) =>
      set((state) => ({
        buildState: {
          ...state.buildState,
          currentAtom: atom,
        },
      })),
    setLastError: (error) =>
      set((state) => ({
        buildState: {
          ...state.buildState,
          lastError: error,
        },
      })),
    incrementRetry: () =>
      set((state) => ({
        buildState: {
          ...state.buildState,
          retryCount: state.buildState.retryCount + 1,
        },
      })),
    resetRetry: () =>
      set((state) => ({
        buildState: {
          ...state.buildState,
          retryCount: 0,
        },
      })),
    pauseBuild: () =>
      set(() => ({
        isPaused: true,
      })),
    resumeBuild: () =>
      set(() => ({
        isPaused: false,
      })),
    togglePause: () =>
      set((state) => ({
        isPaused: !state.isPaused,
      })),
    resetBuild: () =>
      set(() => ({
        buildState: { ...initialBuildState },
        isPaused: false,
      })),
    resetStore: () =>
      set(() => ({
        buildState: { ...initialBuildState },
        isPaused: false,
      })),
  }));

export const useBuildStore = createBuildStore();

export const selectBuildPhase = (state: BuildStoreState) => state.buildState.phase;
export const selectIsPaused = (state: BuildStoreState) => state.isPaused;
export const selectCurrentAtom = (state: BuildStoreState) => state.buildState.currentAtom;
export const selectIsBuilding = (state: BuildStoreState) => state.buildState.phase !== 'idle';
