import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.ts';

test('concurrent writes preserve every update and reload from disk', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'payproof-store-'));
  try {
    const file = path.join(dir, 'state.json');
    const store = new Store(file);
    const version = (await store.read()).policy.version;
    await Promise.all(Array.from({ length: 8 }, () => store.update(state => { state.policy.version++; })));
    assert.equal((await new Store(file).read()).policy.version, version + 8);
    await assert.rejects(store.update(state => { state.policy.version = -1; throw new Error('abort'); }), /abort/);
    const content = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(content.runs.length, 0);
    const copy = await store.read(); copy.policy.version = -1;
    assert.equal((await store.read()).policy.version, version + 8);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
