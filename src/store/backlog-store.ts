import { create } from 'zustand';

import type { WorkItem, WorkItemStatus } from '../types/backlog';
import { useTelemetryStore } from './telemetry-store';

export interface BacklogStoreState {
  items: WorkItem[];
  onDeckId: string | null;
  focusedItemId: string | null;
  addItem: (item: WorkItem) => void;
  addItems: (items: WorkItem[]) => void;
  setItems: (items: WorkItem[]) => void;
  reorderItems: (fromIndex: number, toIndex: number) => void;
  setOnDeck: (itemId: string | null) => void;
  promoteNext: () => void;
  updateItemStatus: (itemId: string, status: WorkItemStatus) => void;
  updateItem: (itemId: string, update: Partial<WorkItem>) => void;
  moveToEnd: (itemId: string) => void;
  focusItem: (itemId: string | null) => void;
  clearBacklog: () => void;
  resetStore: () => void;
}

const initialState: Pick<BacklogStoreState, 'items' | 'onDeckId' | 'focusedItemId'> =
  {
    items: [],
    onDeckId: null,
    focusedItemId: null,
  };

export const createBacklogStore = () =>
  create<BacklogStoreState>((set) => ({
    ...initialState,
    addItem: (item) => {
      set((state) => {
        const nextOrder = getNextOrder(state.items);
        const nextItem: WorkItem = {
          ...item,
          order: nextOrder,
        };
        const ordered = sortByOrder([...state.items, nextItem]);
        return {
          items: normalizeOrder(ordered),
        };
      });
      const telemetry = useTelemetryStore.getState();
      void telemetry.recordBacklogAdded({
        sessionId: item.sessionId,
        count: 1,
        timestamp: item.createdAt,
      });
    },
    addItems: (items) => {
      set((state) => {
        let nextItems = [...state.items];
        for (const item of items) {
          const nextOrder = getNextOrder(nextItems);
          nextItems = [...nextItems, { ...item, order: nextOrder }];
        }
        const ordered = sortByOrder(nextItems);
        return {
          items: normalizeOrder(ordered),
        };
      });
      const telemetry = useTelemetryStore.getState();
      if (items.length > 0) {
        void telemetry.recordBacklogAdded({
          sessionId: items[0]?.sessionId,
          count: items.length,
          timestamp: Date.now(),
        });
      }
    },
    setItems: (items) => {
      set(() => ({
        items: normalizeOrder(sortByOrder(items)),
      }));
      if (items.length > 0) {
        const telemetry = useTelemetryStore.getState();
        void telemetry.recordBacklogCount({
          sessionId: items[0]?.sessionId,
          count: items.length,
          timestamp: Date.now(),
        });
      }
    },
    reorderItems: (fromIndex, toIndex) =>
      set((state) => {
        const count = state.items.length;
        if (fromIndex < 0 || toIndex < 0 || fromIndex >= count || toIndex >= count) {
          return {};
        }

        const onDeckIndex = state.onDeckId
          ? state.items.findIndex((item) => item.id === state.onDeckId)
          : -1;
        if (onDeckIndex === fromIndex || onDeckIndex === toIndex) {
          return {};
        }

        const nextItems = moveItem(state.items, fromIndex, toIndex);
        return {
          items: normalizeOrder(nextItems),
        };
      }),
    setOnDeck: (itemId) =>
      set((state) => {
        const nextItems = state.items.map((item): WorkItem => {
          if (item.id === itemId) {
            return { ...item, status: 'on_deck' };
          }
          if (item.id === state.onDeckId && item.status === 'on_deck') {
            return { ...item, status: 'backlog' };
          }
          return item;
        });
        return {
          items: nextItems,
          onDeckId: itemId,
        };
      }),
    promoteNext: () =>
      set((state) => {
        const backlogItems = state.items.filter((item) => item.status === 'backlog');
        const sorted = sortByOrder(backlogItems);
        const nextItem = sorted[0];
        if (!nextItem) {
          const resetItems = state.items.map((item): WorkItem => {
            if (item.id === state.onDeckId && item.status === 'on_deck') {
              return { ...item, status: 'backlog' };
            }
            return item;
          });
          return {
            items: resetItems,
            onDeckId: null,
          };
        }

        const nextItems = state.items.map((item): WorkItem => {
          if (item.id === nextItem.id) {
            return { ...item, status: 'on_deck' };
          }
          if (item.id === state.onDeckId && item.status === 'on_deck') {
            return { ...item, status: 'backlog' };
          }
          return item;
        });

        return {
          items: nextItems,
          onDeckId: nextItem.id,
        };
      }),
    updateItemStatus: (itemId, status) =>
      set((state) => ({
        items: state.items.map((item) => {
          if (item.id !== itemId) {
            return item;
          }
          return {
            ...item,
            status,
            completedAt: status === 'done' ? Date.now() : undefined,
          };
        }),
      })),
    updateItem: (itemId, update) =>
      set((state) => ({
        items: state.items.map((item) => {
          if (item.id !== itemId) {
            return item;
          }
          const next = { ...item, ...update };
          if (Object.prototype.hasOwnProperty.call(update, 'status')) {
            next.completedAt = update.status === 'done' ? Date.now() : undefined;
          }
          return next;
        }),
      })),
    moveToEnd: (itemId) =>
      set((state) => {
        const index = state.items.findIndex((item) => item.id === itemId);
        if (index < 0) {
          return {};
        }
        const nextItems = [...state.items];
        const [moved] = nextItems.splice(index, 1);
        if (!moved) {
          return {};
        }
        nextItems.push(moved);
        return {
          items: normalizeOrder(nextItems),
        };
      }),
    focusItem: (itemId) =>
      set(() => ({
        focusedItemId: itemId,
      })),
    clearBacklog: () =>
      set(() => ({
        items: [],
        onDeckId: null,
        focusedItemId: null,
      })),
    resetStore: () =>
      set(() => ({
        items: [],
        onDeckId: null,
        focusedItemId: null,
      })),
  }));

export const useBacklogStore = createBacklogStore();

export const selectBacklogItems = (state: BacklogStoreState) => state.items;
export const selectOnDeckItem = (state: BacklogStoreState) =>
  state.onDeckId ? state.items.find((item) => item.id === state.onDeckId) ?? null : null;
export const selectFocusedItem = (state: BacklogStoreState) =>
  state.focusedItemId
    ? state.items.find((item) => item.id === state.focusedItemId) ?? null
    : null;
export const selectBacklogCount = (state: BacklogStoreState) => state.items.length;

function getNextOrder(items: WorkItem[]): number {
  if (items.length === 0) {
    return 1;
  }
  const maxOrder = items.reduce(
    (max, item) => (item.order > max ? item.order : max),
    0,
  );
  return maxOrder + 1;
}

function normalizeOrder(items: WorkItem[]): WorkItem[] {
  return items.map((item, index) => ({
    ...item,
    order: index + 1,
  }));
}

function sortByOrder(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => a.order - b.order);
}

function moveItem(items: WorkItem[], fromIndex: number, toIndex: number): WorkItem[] {
  const nextItems = [...items];
  const [moved] = nextItems.splice(fromIndex, 1);
  if (!moved) {
    return nextItems;
  }
  nextItems.splice(toIndex, 0, moved);
  return nextItems;
}
