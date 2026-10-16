// 入口：装载数据、装配路由与视图。

import { createStorage } from './storage.js';
import { createRouter, ROUTE_TASK } from './router.js';
import { createListView } from './list-view.js';
import {
  newId,
  getTask,
  getGroup,
  sortedGroups,
  addTask,
  deleteTask,
  toggleTaskDone,
  renameGroup,
  deleteGroup,
  moveTask,
  moveGroup,
} from './store.js';

const notice = document.getElementById('notice');
const viewList = document.getElementById('view-list');
const viewDetail = document.getElementById('view-detail');
const detailGroupName = document.getElementById('detail-group-name');
const groupList = document.getElementById('group-list');
const addTaskButton = document.getElementById('add-task-button');

const storage = createStorage();
const loaded = storage.load();

let state = loaded.state;
let warnedAboutSave = false;

/** 顶部提示条。传空字符串就收起。 */
function showNotice(text) {
  notice.textContent = text ?? '';
  notice.hidden = !text;
}

/** 写盘。结构性改动立刻写，不等防抖。 */
function persist() {
  if (loaded.readonly) return;

  const result = storage.save(state);

  if (result.ok) {
    warnedAboutSave = false;
    return;
  }
  if (warnedAboutSave) return;

  warnedAboutSave = true;
  showNotice(
    result.reason === 'quota'
      ? '本地存储已满，这次的改动可能没保存。去右上角 ⋯ 里导出备份。'
      : '保存到本地失败，这次的改动可能没保存。去右上角 ⋯ 里导出备份。',
  );
}

/** 更新状态、写盘、重画。所有动作都走这里。 */
function commit(nextState) {
  if (nextState === state) return;
  state = nextState;
  persist();
  listView.render(state);
}

const listView = createListView({
  root: groupList,
  actions: {
    openTask: (taskId) => router.goToTask(taskId),
    toggleDone: (taskId) => commit(toggleTaskDone(state, taskId)),
    deleteTask: (taskId) => commit(deleteTask(state, taskId)),
    addTask: (groupId, title) => {
      commit(addTask(state, { id: newId('t'), groupId, title }));
    },
    renameGroup: (groupId, name) => commit(renameGroup(state, groupId, name)),
    deleteGroup: (groupId) => commit(deleteGroup(state, groupId)),
    moveTask: (taskId, groupId, index) => {
      commit(moveTask(state, taskId, groupId, index));
    },
    moveGroup: (groupId, index) => {
      commit(moveGroup(state, groupId, index));
    },
  },
});

function applyRoute(route) {
  const onTask = route.name === ROUTE_TASK;

  viewList.hidden = onTask;
  viewDetail.hidden = !onTask;

  if (onTask) {
    const task = getTask(state, route.taskId);
    const group = task ? getGroup(state, task.groupId) : null;
    detailGroupName.textContent = group ? group.name : '任务不存在';
  }
}

const router = createRouter(applyRoute);

addTaskButton.addEventListener('click', () => {
  const groups = sortedGroups(state);
  if (groups.length > 0) listView.startAddInGroup(groups[0].id);
});

listView.render(state);
router.start();

if (loaded.warning) showNotice(loaded.warning);
