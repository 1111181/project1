// 入口：装载数据、装配路由与视图、统一处理写盘。

import { createStorage } from './storage.js';
import { createRouter, ROUTE_TASK } from './router.js';
import { createListView } from './list-view.js';
import { createDetailView } from './detail-view.js';
import {
  newId,
  getTask,
  sortedGroups,
  addTask,
  deleteTask,
  toggleTaskDone,
  toggleTaskImportant,
  updateTask,
  renameGroup,
  deleteGroup,
  moveTask,
  moveGroup,
  addSubtask,
  updateSubtask,
  deleteSubtask,
} from './store.js';

const notice = document.getElementById('notice');
const viewList = document.getElementById('view-list');
const viewDetail = document.getElementById('view-detail');
const groupList = document.getElementById('group-list');
const detailScroll = document.getElementById('detail-scroll');
const detailBack = document.getElementById('detail-back');
const detailGroupName = document.getElementById('detail-group-name');
const addTaskButton = document.getElementById('add-task-button');

const storage = createStorage();
const loaded = storage.load();

let state = loaded.state;
let warnedAboutSave = false;
let saveTimer = 0;

/** 顶部提示条。传空字符串就收起。 */
function showNotice(text) {
  notice.textContent = text ?? '';
  notice.hidden = !text;
}

/** 真正写盘。 */
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

/** 200ms 防抖写盘，给文本输入用。 */
function schedulePersist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = 0;
    persist();
  }, 200);
}

/** 立刻把还没落盘的改动写下去。切 App、锁屏、失焦时都靠它。 */
function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = 0;
  }
  persist();
}

/**
 * 更新状态并安排写盘。
 * immediate 为真时立刻写；否则防抖 200ms。
 * 列表隐藏时不重画列表，省掉打字过程中的无谓开销——
 * 回到列表时 applyRoute 会补一次渲染。
 */
function apply(nextState, immediate) {
  if (nextState === state) return;
  state = nextState;

  if (immediate) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = 0;
    }
    persist();
  } else {
    schedulePersist();
  }

  if (!viewList.hidden) listView.render(state);
}

const listView = createListView({
  root: groupList,
  actions: {
    openTask: (taskId) => router.goToTask(taskId),
    toggleDone: (taskId) => apply(toggleTaskDone(state, taskId), true),
    deleteTask: (taskId) => apply(deleteTask(state, taskId), true),
    addTask: (groupId, title) => {
      apply(addTask(state, { id: newId('t'), groupId, title }), true);
    },
    renameGroup: (groupId, name) => apply(renameGroup(state, groupId, name), true),
    deleteGroup: (groupId) => apply(deleteGroup(state, groupId), true),
    moveTask: (taskId, groupId, index) => {
      apply(moveTask(state, taskId, groupId, index), true);
    },
    moveGroup: (groupId, index) => apply(moveGroup(state, groupId, index), true),
  },
});

const detailView = createDetailView({
  root: detailScroll,
  groupNameEl: detailGroupName,
  actions: {
    setField: (taskId, patch, immediate = false) => {
      apply(updateTask(state, taskId, patch), immediate);
      detailView.render(state, taskId);
    },
    toggleImportant: (taskId) => {
      apply(toggleTaskImportant(state, taskId), true);
      detailView.render(state, taskId);
    },
    toggleDone: (taskId) => {
      apply(toggleTaskDone(state, taskId), true);
      detailView.render(state, taskId);
    },
    addSubtask: (taskId, text) => {
      apply(addSubtask(state, taskId, { id: newId('s'), text }), true);
      detailView.render(state, taskId);
    },
    toggleSubtask: (taskId, subtaskId) => {
      const task = getTask(state, taskId);
      const sub = task?.subtasks.find((s) => s.id === subtaskId);
      if (!sub) return;
      apply(updateSubtask(state, taskId, subtaskId, { done: !sub.done }), true);
      detailView.render(state, taskId);
    },
    setSubtask: (taskId, subtaskId, patch, immediate = false) => {
      apply(updateSubtask(state, taskId, subtaskId, patch), immediate);
      detailView.render(state, taskId);
    },
    deleteSubtask: (taskId, subtaskId) => {
      apply(deleteSubtask(state, taskId, subtaskId), true);
      detailView.render(state, taskId);
    },
    deleteTask: (taskId) => {
      apply(deleteTask(state, taskId), true);
      router.goToList();
    },
    flush: flushSave,
  },
});

function applyRoute(route) {
  const onTask = route.name === ROUTE_TASK;

  viewList.hidden = onTask;
  viewDetail.hidden = !onTask;

  if (onTask) {
    detailView.render(state, route.taskId);
  } else {
    detailGroupName.textContent = '';
    listView.render(state);
  }
}

const router = createRouter(applyRoute);

detailBack.addEventListener('click', () => router.goToList());

addTaskButton.addEventListener('click', () => {
  const groups = sortedGroups(state);
  if (groups.length > 0) listView.startAddInGroup(groups[0].id);
});

// 三重兜底：控件的 blur、切走页面、窗口失焦，都要把没写完的字落盘
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushSave();
});
window.addEventListener('pagehide', flushSave);
window.addEventListener('blur', flushSave);

listView.render(state);
router.start();

if (loaded.warning) showNotice(loaded.warning);
