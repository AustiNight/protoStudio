import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';

import {
  getStudioDb,
  resetStudioDbForTests,
  STUDIO_DB_NAME,
} from '../../../src/persistence/db';

describe('persistence db', () => {
  beforeEach(async () => {
    resetStudioDbForTests();
    await deleteDB(STUDIO_DB_NAME);
  });

  it('should initialize IndexedDB with required object stores', async () => {
    const result = await getStudioDb();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const db = result.value;
    expect(db.objectStoreNames.contains('vfs')).toBe(true);
    expect(db.objectStoreNames.contains('conversation')).toBe(true);
    expect(db.objectStoreNames.contains('checkpoints')).toBe(true);
    expect(db.objectStoreNames.contains('telemetry')).toBe(true);

    const tx = db.transaction('telemetry', 'readonly');
    expect(tx.store.indexNames.contains('by-session')).toBe(true);
    await tx.done;
    db.close();
  });
});
