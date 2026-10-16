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
  addTask,
  updateTask,
  deleteTask,
  toggleTaskDone,
  toggleTaskImportant,
  addGroup,
  renameGroup,
  deleteGroup,
  moveGroup,
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

// ---- Task 2 的测试 ----

test('addTask 追加到分组末尾，并写入默认字段', () => {
  let s = createInitialState();
  const g = s.groups[0].id;

  s = addTask(s, { id: 't_a', groupId: g, title: '买牛奶' }, 1000);
  s = addTask(s, { id: 't_b', groupId: g, title: '交房租' }, 2000);

  const list = tasksInGroup(s, g);
  assert.deepEqual(list.map((t) => t.id), ['t_a', 't_b']);
  assert.deepEqual(list.map((t) => t.order), [0, 1]);

  const t = getTask(s, 't_a');
  assert.equal(t.title, '买牛奶');
  assert.equal(t.note, '');
  assert.equal(t.done, false);
  assert.equal(t.important, false);
  assert.equal(t.due, null);
  assert.deepEqual(t.subtasks, []);
  assert.equal(t.createdAt, 1000);
  assert.equal(t.completedAt, null);
});

test('addTask 遇到不存在的分组时原样返回，不写入半截数据', () => {
  const s = createInitialState();
  const after = addTask(s, { id: 't_a', groupId: 'nope', title: 'X' }, 1000);
  assert.equal(after, s);
  assert.deepEqual(after.tasks, []);
});

test('addTask 不改动原 state（纯函数）', () => {
  const s = createInitialState();
  const g = s.groups[0].id;
  const after = addTask(s, { id: 't_a', groupId: g, title: 'X' }, 1000);
  assert.equal(s.tasks.length, 0, '原 state 不应被修改');
  assert.equal(after.tasks.length, 1);
});

test('updateTask 只改 patch 里出现的键', () => {
  let s = createInitialState();
  const g = s.groups[0].id;
  s = addTask(s, { id: 't_a', groupId: g, title: '原标题' }, 1000);
  s = updateTask(s, 't_a', { note: '一些备注' }, 2000);

  const t = getTask(s, 't_a');
  assert.equal(t.title, '原标题', '未出现在 patch 里的标题不应被动');
  assert.equal(t.note, '一些备注');
  assert.equal(t.createdAt, 1000, 'createdAt 不应被改动');
});

test('updateTask 允许把标题设成空串', () => {
  let s = createInitialState();
  const g = s.groups[0].id;
  s = addTask(s, { id: 't_a', groupId: g, title: '有内容' }, 1000);
  s = updateTask(s, 't_a', { title: '' });
  assert.equal(getTask(s, 't_a').title, '');
});

test('updateTask 改 done 时同步 completedAt', () => {
  let s = createInitialState();
  const g = s.groups[0].id;
  s = addTask(s, { id: 't_a', groupId: g, title: 'X' }, 1000);

  s = updateTask(s, 't_a', { done: true }, 5000);
  assert.equal(getTask(s, 't_a').done, true);
  assert.equal(getTask(s, 't_a').completedAt, 5000);

  s = updateTask(s, 't_a', { done: false }, 9000);
  assert.equal(getTask(s, 't_a').done, false);
  assert.equal(getTask(s, 't_a').completedAt, null, '取消完成要清掉完成时间');
});

test('updateTask 在 done 值没变时不刷新 completedAt', () => {
  let s = createInitialState();
  const g = s.groups[0].id;
  s = addTask(s, { id: 't_a', groupId: g, title: 'X' }, 1000);
  s = updateTask(s, 't_a', { done: true }, 5000);
  s = updateTask(s, 't_a', { done: true }, 8000);
  assert.equal(getTask(s, 't_a').completedAt, 5000, '重复置为 true 不应刷新完成时间');
});

test('updateTask 改 groupId 时移到目标组末尾并压紧源组', () => {
  const s0 = fixture();
  const s = updateTask(s0, 't3', { groupId: 'g1' });

  assert.equal(getTask(s, 't3').groupId, 'g1');
  assert.deepEqual(tasksInGroup(s, 'g1').map((t) => t.id), ['t1', 't2', 't4', 't3']);
  assert.deepEqual(tasksInGroup(s, 'g1').map((t) => t.order), [0, 1, 2, 3]);
  assert.deepEqual(tasksInGroup(s, 'g2'), [], '源组应只剩空');
});

test('updateTask 遇到不存在的任务或分组时原样返回', () => {
  const s = fixture();
  assert.equal(updateTask(s, 'nope', { title: 'X' }), s);
  assert.equal(updateTask(s, 't1', { groupId: 'nope' }), s);
});

test('deleteTask 删掉任务并把该组 order 压紧', () => {
  const s = fixture();
  const after = deleteTask(s, 't2');

  assert.equal(getTask(after, 't2'), null);
  assert.deepEqual(tasksInGroup(after, 'g1').map((t) => t.id), ['t1', 't4']);
  assert.deepEqual(tasksInGroup(after, 'g1').map((t) => t.order), [0, 1]);
  assert.deepEqual(tasksInGroup(after, 'g2').map((t) => t.id), ['t3'], '别的分组不受影响');
});

test('deleteTask 遇到不存在的任务时原样返回', () => {
  const s = fixture();
  assert.equal(deleteTask(s, 'nope'), s);
});

test('toggleTaskDone 在完成与未完成之间来回切换', () => {
  let s = createInitialState();
  const g = s.groups[0].id;
  s = addTask(s, { id: 't_a', groupId: g, title: 'X' }, 1000);

  s = toggleTaskDone(s, 't_a', 4000);
  assert.equal(getTask(s, 't_a').done, true);
  assert.equal(getTask(s, 't_a').completedAt, 4000);

  s = toggleTaskDone(s, 't_a', 6000);
  assert.equal(getTask(s, 't_a').done, false);
  assert.equal(getTask(s, 't_a').completedAt, null);
});

test('toggleTaskImportant 来回切换，且不影响其他字段', () => {
  let s = createInitialState();
  const g = s.groups[0].id;
  s = addTask(s, { id: 't_a', groupId: g, title: 'X' }, 1000);

  s = toggleTaskImportant(s, 't_a');
  assert.equal(getTask(s, 't_a').important, true);
  assert.equal(getTask(s, 't_a').title, 'X');

  s = toggleTaskImportant(s, 't_a');
  assert.equal(getTask(s, 't_a').important, false);
});

// ---- Task 3 的测试 ----

test('addGroup 追加到分组列表末尾并给出正确的 order', () => {
  let s = createInitialState();
  s = addGroup(s, { id: 'g2', name: '工作' });
  s = addGroup(s, { id: 'g3', name: '生活' });

  assert.deepEqual(sortedGroups(s).map((g) => g.name), [DEFAULT_GROUP_NAME, '工作', '生活']);
  assert.deepEqual(sortedGroups(s).map((g) => g.order), [0, 1, 2]);
});

test('renameGroup 只改名字', () => {
  let s = createInitialState();
  const g = s.groups[0].id;
  s = renameGroup(s, g, '家里的事');

  assert.equal(getGroup(s, g).name, '家里的事');
  assert.equal(getGroup(s, g).order, 0);
});

test('renameGroup 允许改成空串（界面决定怎么显示占位）', () => {
  let s = createInitialState();
  const g = s.groups[0].id;
  s = renameGroup(s, g, '');
  assert.equal(getGroup(s, g).name, '');
});

test('renameGroup 遇到不存在的分组时原样返回', () => {
  const s = createInitialState();
  assert.equal(renameGroup(s, 'nope', 'X'), s);
});

test('deleteGroup 连带删除组内任务，其他分组的任务不动', () => {
  const s = fixture();
  const after = deleteGroup(s, 'g1');

  assert.equal(getGroup(after, 'g1'), null);
  assert.deepEqual(after.tasks.map((t) => t.id), ['t3'], 'g1 下的 t1/t2/t4 应一并删除');
  assert.deepEqual(tasksInGroup(after, 'g2').map((t) => t.id), ['t3']);
  assert.deepEqual(tasksInGroup(after, 'g2').map((t) => t.order), [0], 'order 应压紧');
});

test('deleteGroup 删掉最后一个分组时自动补一个默认分组', () => {
  let s = createInitialState();
  const only = s.groups[0].id;
  s = deleteGroup(s, only);

  assert.equal(s.groups.length, 1);
  assert.equal(s.groups[0].name, DEFAULT_GROUP_NAME);
  assert.equal(s.groups[0].order, 0);
  assert.deepEqual(s.tasks, []);
});

test('deleteGroup 之后分组 order 连续', () => {
  let s = createInitialState();
  s = addGroup(s, { id: 'g2', name: '工作' });
  s = addGroup(s, { id: 'g3', name: '生活' });
  s = deleteGroup(s, 'g2');

  assert.deepEqual(sortedGroups(s).map((g) => g.order), [0, 1]);
  assert.deepEqual(sortedGroups(s).map((g) => g.name), [DEFAULT_GROUP_NAME, '生活']);
});

test('deleteGroup 遇到不存在的分组时原样返回', () => {
  const s = fixture();
  assert.equal(deleteGroup(s, 'nope'), s);
});

test('moveGroup 把分组移到指定位置并重排 order', () => {
  let s = createInitialState();
  s = addGroup(s, { id: 'g2', name: '工作' });
  s = addGroup(s, { id: 'g3', name: '生活' });
  const first = s.groups[0].id; // g_default

  s = moveGroup(s, 'g3', 0);
  assert.deepEqual(sortedGroups(s).map((g) => g.id), ['g3', 'g_default', 'g2']);
  assert.deepEqual(sortedGroups(s).map((g) => g.order), [0, 1, 2]);
  assert.equal(first, 'g_default');
});

test('moveGroup 目标位置越界时收敛到边界，位置不变时原样返回', () => {
  let s = createInitialState();
  s = addGroup(s, { id: 'g2', name: '工作' });

  const same = moveGroup(s, s.groups[0].id, 0);
  assert.equal(same, s, '位置没变应原样返回');

  const clamped = moveGroup(s, s.groups[0].id, 99);
  assert.deepEqual(sortedGroups(clamped).map((g) => g.id), ['g2', 'g_default']);
});

test('moveGroup 遇到不存在的分组时原样返回', () => {
  const s = fixture();
  assert.equal(moveGroup(s, 'nope', 0), s);
});
