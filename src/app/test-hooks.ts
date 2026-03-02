import { useBacklogStore } from '@/store/backlog-store';
import { useBuildStore } from '@/store/build-store';
import { useChatStore } from '@/store/chat-store';
import { useSettingsStore } from '@/store/settings-store';
import { useTelemetryStore } from '@/store/telemetry-store';
import type { ChatMessage } from '@/types/chat';
import type { WorkItem } from '@/types/backlog';
import type { TelemetryEvent } from '@/types/telemetry';

type DeployTokenPatch = Partial<
  ReturnType<typeof useSettingsStore.getState>['settings']['deployTokens']
>;
type SettingsSnapshot = ReturnType<typeof useSettingsStore.getState>['settings'];

type BacklogSeedOptions = {
  onDeckId?: string | null;
  focusedItemId?: string | null;
  paused?: boolean;
};

declare global {
  interface Window {
    __protoStudioTest?: {
      setDeployTokens: (tokens: DeployTokenPatch) => void;
      seedBacklog: (items: WorkItem[], options?: BacklogSeedOptions) => void;
      getChatMessages: () => ChatMessage[];
      getSettingsSnapshot: () => SettingsSnapshot;
      getActiveTelemetrySessionId: () => string | null;
      getTelemetryEvents: () => TelemetryEvent[];
      appendTelemetryEvent: (event: TelemetryEvent) => Promise<boolean>;
      exportTelemetryEvents: (sessionId: string) => Promise<TelemetryEvent[]>;
    };
  }
}

if (typeof window !== 'undefined' && import.meta.env.MODE === 'e2e') {
  window.__protoStudioTest = {
    setDeployTokens: (tokens) => {
      useSettingsStore.setState((state) => ({
        settings: {
          ...state.settings,
          deployTokens: { ...state.settings.deployTokens, ...tokens },
        },
      }));
    },
    seedBacklog: (items, options = {}) => {
      const backlogStore = useBacklogStore.getState();
      backlogStore.resetStore();
      backlogStore.setItems(items);
      if (options.onDeckId) {
        backlogStore.setOnDeck(options.onDeckId);
      }
      if (options.focusedItemId !== undefined) {
        backlogStore.focusItem(options.focusedItemId);
      }

      const buildStore = useBuildStore.getState();
      buildStore.resetBuild();
      if (options.paused) {
        buildStore.pauseBuild();
      }
    },
    getChatMessages: () => useChatStore.getState().messages,
    getSettingsSnapshot: () => useSettingsStore.getState().settings,
    getActiveTelemetrySessionId: () => useTelemetryStore.getState().sessionId,
    getTelemetryEvents: () => useTelemetryStore.getState().events,
    appendTelemetryEvent: async (event) => useTelemetryStore.getState().appendEvent(event),
    exportTelemetryEvents: async (sessionId) => {
      const payload = await useTelemetryStore.getState().exportEvents(sessionId);
      if (!payload) {
        return [];
      }
      try {
        const parsed = JSON.parse(payload);
        return Array.isArray(parsed) ? (parsed as TelemetryEvent[]) : [];
      } catch {
        return [];
      }
    },
  };
}

export {};
