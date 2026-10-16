import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SCHEMA_VERSION,
  DEFAULT_GROUP_NAME,
  newId,
  createInitialState,
  getGroup,
  getTask,
  sortedGroups,
  tasksInGroup,
  activeTasksInGroup,
  doneTasksInGroup,
  subtaskProgress,
} from '../js/store.js';

// ---- 测试夹具：手工构造合法 state，不依赖任何写入函数 ----

function mkTask(over = {}) {
  return {
    id: 't_x',
    groupId: 'g1',
    title: '',
    note: '',
    done: false,
    important: false,
    due: null,
    subtasks: [],
    createdAt: 0,
    completedAt: null,
    order: 0,
    ...over,
  };
}

function fixture() {
  return {
    version: SCHEMA_VERSION,
    groups: [
      { id: 'g1', name: '工作', order: 0 },
      { id: 'g2', name: '生活', order: 1 },
    ],
    tasks: [
      mkTask({ id: 't1', groupId: 'g1', title: '写周报', order: 0 }),
      mkTask({ id: 't2', groupId: 'g1', title: '交房租', order: 1, important: true }),
      mkTask({ id: 't3', groupId: 'g2', title: '买牛奶', order: 0 }),
      mkTask({
        id: 't4', groupId: 'g1', title: '回邮件', order: 2,
        done: true, completedAt: 5000,
      }),
    ],
  };
}

// ---- Task 1 的测试 ----

test('createInitialState 给出一个默认分组和零个任务', () => {
  const s = createInitialState();
  assert.equal(s.version, SCHEMA_VERSION);
  assert.deepEqual(s.tasks, []);
  assert.equal(s.groups.length, 1);
  assert.equal(s.groups[0].name, DEFAULT_GROUP_NAME);
  assert.equal(s.groups[0].order, 0);
  assert.equal(typeof s.groups[0].id, 'string');
});

test('newId 带前缀、格式固定、一千次不重复', () => {
  const ids = new Set();
  for (let i = 0; i < 1000; i += 1) ids.add(newId('t'));
  assert.equal(ids.size, 1000);
  for (const id of ids) assert.match(id, /^t_[a-z0-9]{10}$/);
});

test('getGroup / getTask 找得到就返回对象，找不到返回 null', () => {
  const s = fixture();
  assert.equal(getGroup(s, 'g1').name, '工作');
  assert.equal(getGroup(s, 'nope'), null);
  assert.equal(getTask(s, 't2').title, '交房租');
  assert.equal(getTask(s, 'nope'), null);
});

test('sortedGroups 按 order 升序，且不改动原数组', () => {
  const s = fixture();
  s.groups = [
    { id: 'g2', name: '生活', order: 1 },
    { id: 'g1', name: '工作', order: 0 },
  ];
  const before = s.groups.map((g) => g.id);
  assert.deepEqual(sortedGroups(s).map((g) => g.id), ['g1', 'g2']);
  assert.deepEqual(s.groups.map((g) => g.id), before, '原数组不应被排序改动');
});

test('tasksInGroup 只含本组任务，按 order 升序，含已完成', () => {
  const s = fixture();
  assert.deepEqual(tasksInGroup(s, 'g1').map((t) => t.id), ['t1', 't2', 't4']);
  assert.deepEqual(tasksInGroup(s, 'g2').map((t) => t.id), ['t3']);
  assert.deepEqual(tasksInGroup(s, 'nope'), []);
});

test('tasksInGroup 在 order 相同或缺失时仍给出稳定顺序', () => {
  const s = {
    version: SCHEMA_VERSION,
    groups: [{ id: 'g1', name: '工作', order: 0 }],
    tasks: [
      mkTask({ id: 't_b', groupId: 'g1', order: 0, createdAt: 200 }),
      mkTask({ id: 't_a', groupId: 'g1', order: 0, createdAt: 100 }),
    ],
  };
  assert.deepEqual(tasksInGroup(s, 'g1').map((t) => t.id), ['t_a', 't_b'],
    'order 相同时按 createdAt 升序兜底');
});

test('activeTasksInGroup 排除已完成，doneTasksInGroup 只留已完成', () => {
  const s = fixture();
  assert.deepEqual(activeTasksInGroup(s, 'g1').map((t) => t.id), ['t1', 't2']);
  assert.deepEqual(doneTasksInGroup(s, 'g1').map((t) => t.id), ['t4']);
});

test('subtaskProgress 无子任务返回 null，有则返回已完成数与总数', () => {
  assert.equal(subtaskProgress(mkTask()), null);
  const t = mkTask({
    subtasks: [
      { id: 's1', text: 'a', done: true },
      { id: 's2', text: 'b', done: false },
      { id: 's3', text: 'c', done: true },
    ],
  });
  assert.deepEqual(subtaskProgress(t), { done: 2, total: 3 });
});
