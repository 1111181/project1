// 入口：装载数据、装配路由与视图、统一处理写盘。

import { createStorage, toPayload } from './storage.js';
import { createPopupMenu } from './menu.js';
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
  validateImport,
  createInitialState,
  addGroup,
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

/**
 * 顶部提示条。
 *
 * 必须能自己消失：它是一条常驻的浮层，如果不消失就会一直占着位置。
 * 传空字符串立即收起；否则 6 秒后自动收起，也可以点 × 手动关。
 */
const noticeText = document.getElementById('notice-text');
const noticeClose = document.getElementById('notice-close');
let noticeTimer = 0;

function hideNotice() {
  if (noticeTimer) {
    clearTimeout(noticeTimer);
    noticeTimer = 0;
  }
  notice.hidden = true;
  noticeText.textContent = '';
  document.body.classList.remove('has-notice');
  document.documentElement.style.setProperty('--notice-height', '0px');
}

function showNotice(text) {
  if (!text) {
    hideNotice();
    return;
  }
  noticeText.textContent = text;
  notice.hidden = false;

  // 让下面的内容让开同样多的高度。
  // 不让的话提示条会盖住分组标题行的 ⋯ 和 ＋——而那正是用户看到提示后想去点的地方。
  document.body.classList.add('has-notice');
  document.documentElement.style.setProperty('--notice-height', `${notice.offsetHeight}px`);

  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(hideNotice, 6000);
}

noticeClose.addEventListener('click', hideNotice);

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

// ---------- 顶栏菜单：新建分组 / 导出 / 导入 / 清空 ----------

const menuButton = document.getElementById('menu-button');
const importInput = document.getElementById('import-input');
const topMenu = createPopupMenu();

function pad2(n) {
  return String(n).padStart(2, '0');
}

function createGroup() {
  const name = window.prompt('新分组叫什么？');
  if (name === null) return;

  const trimmed = name.trim();
  apply(addGroup(state, { id: newId('g'), name: trimmed }), true);
}

function exportBackup() {
  const text = JSON.stringify(toPayload(state), null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const today = new Date();
  const link = document.createElement('a');
  link.href = url;
  link.download = `todo-backup-${today.getFullYear()}-`
    + `${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}.json`;

  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  showNotice('备份已导出。');
}

async function importBackup(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    showNotice('读不到这个文件，换一个试试。');
    return;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    showNotice('这个文件不是合法的 JSON，可能选错了文件。');
    return;
  }

  const result = validateImport(data);
  if (!result.ok) {
    showNotice(`导入失败：${result.reason}`);
    return;
  }

  const lines = [
    '导入会覆盖当前全部数据，现在的任务和分组都会被替换掉。',
    '',
    `导入后有 ${result.state.groups.length} 个分组、${result.state.tasks.length} 个任务。`,
  ];
  if (result.repaired.length > 0) {
    lines.push(
      '',
      `有 ${result.repaired.length} 处自动修复：`,
      ...result.repaired.map((note) => `· ${note}`),
    );
  }
  lines.push('', '确定继续吗？');

  if (!window.confirm(lines.join('\n'))) return;

  state = result.state;
  // 导入换了整套数据，界面的折叠状态等临时状态要跟着丢掉
  listView.resetUiState();
  flushSave();
  router.goToList();
  listView.render(state);
  showNotice('导入完成。');
}

function clearEverything() {
  if (!window.confirm('这会删掉全部任务和分组，没法撤销。\n\n确定吗？')) return;
  if (!window.confirm('真的确定吗？建议先导出备份。')) return;

  storage.clear();
  state = createInitialState();
  // 补回来的默认分组 id 与原来那个一样，不重置的话它会继承折叠状态
  listView.resetUiState();
  flushSave();
  router.goToList();
  listView.render(state);
  showNotice('已清空。');
}

menuButton.addEventListener('click', (event) => {
  event.stopPropagation();
  menuButton.setAttribute('aria-expanded', 'true');
  topMenu.show(
    menuButton,
    [
      { label: '新建分组', run: createGroup },
      { label: '导出备份', run: exportBackup },
      { label: '导入备份', run: () => importInput.click() },
      { label: '清空全部数据', danger: true, run: clearEverything },
    ],
    () => menuButton.setAttribute('aria-expanded', 'false'),
  );
});

importInput.addEventListener('change', () => {
  const file = importInput.files?.[0];
  importInput.value = ''; // 清掉，方便连续导入同一个文件
  if (file) importBackup(file);
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
