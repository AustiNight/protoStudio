import { useSettingsStore } from '@/store/settings-store';

type DeployTokenPatch = Partial<
  ReturnType<typeof useSettingsStore.getState>['settings']['deployTokens']
>;

declare global {
  interface Window {
    __protoStudioTest?: {
      setDeployTokens: (tokens: DeployTokenPatch) => void;
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
  };
}

export {};
