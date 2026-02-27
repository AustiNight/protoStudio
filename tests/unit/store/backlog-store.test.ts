import { beforeEach, describe, expect, it } from 'vitest';

import { useBacklogStore } from '../../../src/store/backlog-store';
import type { WorkItem } from '../../../src/types/backlog';

function buildItem(id: string, status: WorkItem['status']): WorkItem {
  return {
    id,
    sessionId: 'session-1',
    title: `Item ${id}`,
    description: 'Do the thing',
    effort: 'S',
    status,
    order: 99,
    dependencies: [],
    rationale: 'Testing',
    createdAt: Date.now(),
    atomType: 'content',
    filesTouch: ['index.html'],
    estimatedLines: 10,
    visibleChange: 'Updated content',
  };
}

describe('backlog-store', () => {
  beforeEach(() => {
    useBacklogStore.getState().resetStore();
  });

  it('should add work items to backlog with correct ordering', () => {
    const first = buildItem('item-1', 'backlog');
    const second = buildItem('item-2', 'backlog');

    useBacklogStore.getState().addItem(first);
    useBacklogStore.getState().addItem(second);

    const items = useBacklogStore.getState().items;
    expect(items).toHaveLength(2);
    expect(items[0]?.id).toBe('item-1');
    expect(items[1]?.id).toBe('item-2');
    expect(items[0]?.order).toBe(1);
    expect(items[1]?.order).toBe(2);
  });

  it('should prevent reordering the On Deck item', () => {
    const first = buildItem('item-1', 'backlog');
    const second = buildItem('item-2', 'backlog');
    const third = buildItem('item-3', 'backlog');

    useBacklogStore.getState().addItems([first, second, third]);
    useBacklogStore.getState().setOnDeck('item-1');

    useBacklogStore.getState().reorderItems(0, 2);

    const items = useBacklogStore.getState().items;
    expect(items.map((item) => item.id)).toEqual(['item-1', 'item-2', 'item-3']);
  });

  it('should promote next backlog item to On Deck', () => {
    const doneItem = buildItem('item-1', 'done');
    const backlogItem = buildItem('item-2', 'backlog');
    const backlogItemTwo = buildItem('item-3', 'backlog');

    useBacklogStore.getState().addItems([doneItem, backlogItem, backlogItemTwo]);
    useBacklogStore.getState().setOnDeck('item-1');

    useBacklogStore.getState().promoteNext();

    const { onDeckId, items } = useBacklogStore.getState();
    expect(onDeckId).toBe('item-2');
    const promoted = items.find((item) => item.id === 'item-2');
    expect(promoted?.status).toBe('on_deck');
  });

  it('should update item fields and set completedAt when done', () => {
    const item = buildItem('item-1', 'backlog');
    useBacklogStore.getState().addItem(item);

    useBacklogStore.getState().updateItem('item-1', {
      status: 'done',
      title: 'Updated Item',
    });

    const updated = useBacklogStore.getState().items.find((entry) => entry.id === 'item-1');
    expect(updated?.status).toBe('done');
    expect(updated?.title).toBe('Updated Item');
    expect(updated?.completedAt).toBeDefined();
  });

  it('should move item to the end of the backlog', () => {
    const first = buildItem('item-1', 'backlog');
    const second = buildItem('item-2', 'backlog');
    const third = buildItem('item-3', 'backlog');

    useBacklogStore.getState().addItems([first, second, third]);
    useBacklogStore.getState().moveToEnd('item-1');

    const items = useBacklogStore.getState().items;
    expect(items.map((item) => item.id)).toEqual(['item-2', 'item-3', 'item-1']);
    expect(items.map((item) => item.order)).toEqual([1, 2, 3]);
  });
});
