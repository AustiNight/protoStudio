import { create } from 'zustand';

import type { ImageryAssetRecord } from '@/types/imagery';

interface MediaStoreState {
  assets: ImageryAssetRecord[];
  addAsset: (asset: ImageryAssetRecord) => void;
  addAssets: (assets: ImageryAssetRecord[]) => void;
  clearAssets: () => void;
  resetStore: () => void;
}

export const createMediaStore = () =>
  create<MediaStoreState>((set) => ({
    assets: [],
    addAsset: (asset) =>
      set((state) => ({
        assets: dedupeBySource([...state.assets, asset]),
      })),
    addAssets: (assets) =>
      set((state) => ({
        assets: dedupeBySource([...state.assets, ...assets]),
      })),
    clearAssets: () =>
      set(() => ({
        assets: [],
      })),
    resetStore: () =>
      set(() => ({
        assets: [],
      })),
  }));

export const useMediaStore = createMediaStore();

function dedupeBySource(items: ImageryAssetRecord[]): ImageryAssetRecord[] {
  const map = new Map<string, ImageryAssetRecord>();
  for (const item of items) {
    const key = `${item.workItemId ?? 'none'}::${item.source}`;
    map.set(key, item);
  }
  return Array.from(map.values()).sort((left, right) => right.createdAt - left.createdAt);
}
