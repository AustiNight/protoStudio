import { useBacklogStore } from '@/store/backlog-store';
import { useBuildStore } from '@/store/build-store';
import { useSettingsStore } from '@/store/settings-store';
import type { WorkItem } from '@/types/backlog';

type DeployTokenPatch = Partial<
  ReturnType<typeof useSettingsStore.getState>['settings']['deployTokens']
>;

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
  };
}

export {};
