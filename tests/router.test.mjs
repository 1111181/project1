import test from 'node:test';
import assert from 'node:assert/strict';

import { parseHash, taskHash, listHash, ROUTE_LIST, ROUTE_TASK } from '../js/router.js';

test('空 hash、井号、井号加斜杠都解析成列表', () => {
  for (const raw of ['', '#', '#/', '/', undefined, null]) {
    const r = parseHash(raw);
    assert.equal(r.name, ROUTE_LIST, `输入 ${JSON.stringify(raw)} 应解析成列表`);
    assert.equal(r.taskId, null);
  }
});

test('多余斜杠不影响列表解析', () => {
  for (const raw of ['#//', '###', '#///']) {
    assert.equal(parseHash(raw).name, ROUTE_LIST, `输入 ${raw} 应解析成列表`);
  }
});

test('#/task/<id> 解析成详情并取出 id', () => {
  const r = parseHash('#/task/t_abc123');
  assert.equal(r.name, ROUTE_TASK);
  assert.equal(r.taskId, 't_abc123');
});

test('任务 id 里的特殊字符能正确编码解码', () => {
  const weird = 't_中文 空格/#';
  const r = parseHash(taskHash(weird));
  assert.equal(r.name, ROUTE_TASK);
  assert.equal(r.taskId, weird, '经过 hash 往返后应还原成原值');
});

test('#/task/ 缺少 id 时退化成列表，而不是给出 taskId 为 null 的详情路由', () => {
  const r = parseHash('#/task/');
  assert.equal(r.name, ROUTE_LIST);
  assert.equal(r.taskId, null);
});

test('未知路径退化成列表', () => {
  for (const raw of ['#/nope', '#/task/a/b', '#/settings']) {
    const r = parseHash(raw);
    assert.equal(r.name, ROUTE_LIST, `输入 ${raw} 应退化成列表`);
    assert.equal(r.taskId, null);
  }
});

test('listHash 能被 parseHash 解析回列表', () => {
  assert.equal(parseHash(listHash()).name, ROUTE_LIST);
});
