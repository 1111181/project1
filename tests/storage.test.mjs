import test from 'node:test';
import assert from 'node:assert/strict';

import { createStorage, toPayload, STORAGE_KEY, CORRUPT_KEY_PREFIX } from '../js/storage.js';
import { SCHEMA_VERSION, createInitialState, addTask, parseStored } from '../js/store.js';

// ---- 假后端 ----

function memoryBackend(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function quotaBackend() {
  return {
    getItem: () => null,
    setItem: () => {
      const err = new Error('存储空间已满');
      err.name = 'QuotaExceededError';
      throw err;
    },
    removeItem: () => {},
  };
}

function throwingBackend() {
  return {
    getItem: () => { throw new Error('读不了'); },
    setItem: () => { throw new Error('写不了'); },
    removeItem: () => { throw new Error('删不了'); },
  };
}

function sampleState() {
  let s = createInitialState();
  s = addTask(s, { id: 't1', groupId: s.groups[0].id, title: '买牛奶' }, 1000);
  return s;
}

// ---- 测试 ----

test('toPayload 带上 version、savedAt、groups、tasks', () => {
  const s = sampleState();
  const p = toPayload(s, 5000);
  assert.equal(p.version, SCHEMA_VERSION);
  assert.equal(p.savedAt, 5000);
  assert.deepEqual(p.groups, s.groups);
  assert.deepEqual(p.tasks, s.tasks);
});

test('save 之后再 load 拿回等价的数据', () => {
  const backend = memoryBackend();
  const storage = createStorage(backend);
  const before = sampleState();

  assert.deepEqual(storage.save(before, 2000), { ok: true });

  const after = storage.load(3000);
  assert.equal(after.status, 'ok');
  assert.equal(after.readonly, false);
  assert.equal(after.state.tasks.length, 1);
  assert.equal(after.state.tasks[0].title, '买牛奶');
  assert.equal(after.state.tasks[0].createdAt, 1000);
});

test('load 在没有任何数据时返回空状态', () => {
  const storage = createStorage(memoryBackend());
  const r = storage.load(1000);
  assert.equal(r.status, 'empty');
  assert.deepEqual(r.state.tasks, []);
});

test('save 遇到 QuotaExceededError 时返回 quota 而不是抛异常', () => {
  const storage = createStorage(quotaBackend());
  const r = storage.save(sampleState(), 1000);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'quota');
});

test('save 遇到其他异常时返回 unknown', () => {
  const storage = createStorage(throwingBackend());
  assert.deepEqual(storage.save(sampleState(), 1000), { ok: false, reason: 'unknown' });
});

test('load 后端读不动时返回 unavailable 且 readonly', () => {
  const storage = createStorage(throwingBackend());
  const r = storage.load(1000);
  assert.equal(r.status, 'unavailable');
  assert.equal(r.readonly, true);
  assert.deepEqual(r.state.tasks, []);
});

test('load 遇到损坏内容时把原始字符串备份到 corrupt 键', () => {
  const broken = '{"version":1,"groups":[';
  const backend = memoryBackend({ [STORAGE_KEY]: broken });
  const storage = createStorage(backend);

  const r = storage.load(777000);
  assert.equal(r.status, 'corrupt');

  const backupKey = `${CORRUPT_KEY_PREFIX}777000`;
  assert.equal(backend.map.get(backupKey), broken, '原始内容必须原样留着');
  assert.equal(backend.map.get(STORAGE_KEY), broken, '损坏的原键此时也不应被清掉');
});

test('load 遇到损坏内容但备份也写不进去时，不抛异常', () => {
  const backend = {
    getItem: () => '{"version":1,',
    setItem: () => { throw new Error('满'); },
    removeItem: () => {},
  };
  const storage = createStorage(backend);
  const r = storage.load(1000);
  assert.equal(r.status, 'corrupt');
  assert.match(r.warning, /备份/);
});

test('clear 把主键删掉但留下 corrupt 备份', () => {
  const backend = memoryBackend({ [STORAGE_KEY]: 'x', [`${CORRUPT_KEY_PREFIX}1`]: 'y' });
  const storage = createStorage(backend);

  assert.equal(storage.clear(), true);
  assert.equal(backend.map.has(STORAGE_KEY), false);
  assert.equal(backend.map.has(`${CORRUPT_KEY_PREFIX}1`), true, '备份不该被清空操作带走');
});

test('clear 后端删不动时返回 false', () => {
  assert.equal(createStorage(throwingBackend()).clear(), false);
});

test('没有可用后端时 available 为 false，load 返回 unavailable', () => {
  const storage = createStorage(null);
  assert.equal(storage.available, false);
  const r = storage.load(1000);
  assert.equal(r.status, 'unavailable');
  assert.equal(r.readonly, true);
});

test('保存的内容能被 parseStored 原样读回', () => {
  const backend = memoryBackend();
  const storage = createStorage(backend);
  storage.save(sampleState(), 4000);

  const roundTrip = parseStored(backend.map.get(STORAGE_KEY));
  assert.equal(roundTrip.status, 'ok');
  assert.equal(roundTrip.state.tasks[0].title, '买牛奶');
});
