// 数据层：全部是纯函数。
// 不碰 DOM、不碰 localStorage、不读全局时间、不自己生成 id。
// 状态进，新状态出。时间和 id 由调用方传入，单测因此完全确定。

export const SCHEMA_VERSION = 1;
export const DEFAULT_GROUP_NAME = '未分组';

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 10;

/**
 * 生成一个 id，形如 `t_a1b2c3d4e5`。
 * 非加密用途，只要碰撞概率足够低即可。
 */
export function newId(prefix) {
  let out = '';
  for (let i = 0; i < ID_LENGTH; i += 1) {
    out += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return `${prefix}_${out}`;
}

/** 全新状态：一个默认分组，零任务。 */
export function createInitialState() {
  return {
    version: SCHEMA_VERSION,
    groups: [{ id: 'g_default', name: DEFAULT_GROUP_NAME, order: 0 }],
    tasks: [],
  };
}

export function getGroup(state, groupId) {
  return state.groups.find((g) => g.id === groupId) ?? null;
}

export function getTask(state, taskId) {
  return state.tasks.find((t) => t.id === taskId) ?? null;
}

/** 分组按 order 升序。order 相同或非法时按 id 兜底，保证顺序稳定。 */
export function sortedGroups(state) {
  return [...state.groups].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );
}

/**
 * 某分组内的任务，按 order 升序。
 * order 相同或非法时依次按 createdAt、id 兜底，保证顺序稳定且可复现。
 */
export function tasksInGroup(state, groupId) {
  return state.tasks
    .filter((t) => t.groupId === groupId)
    .sort(
      (a, b) =>
        a.order - b.order
        || a.createdAt - b.createdAt
        || a.id.localeCompare(b.id),
    );
}

export function activeTasksInGroup(state, groupId) {
  return tasksInGroup(state, groupId).filter((t) => !t.done);
}

export function doneTasksInGroup(state, groupId) {
  return tasksInGroup(state, groupId).filter((t) => t.done);
}

/** 子任务进度。没有子任务时返回 null，让界面决定不显示这个标记。 */
export function subtaskProgress(task) {
  const total = task.subtasks.length;
  if (total === 0) return null;
  const done = task.subtasks.filter((s) => s.done).length;
  return { done, total };
}

// ---------- 内部辅助 ----------

/** 把某个分组的任务按现有顺序重新编号为 0..n-1，消除删除留下的空洞。 */
function renumberGroup(state, groupId) {
  const ordered = tasksInGroup(state, groupId);
  const orderById = new Map(ordered.map((t, i) => [t.id, i]));
  return {
    ...state,
    tasks: state.tasks.map((t) =>
      (t.groupId === groupId ? { ...t, order: orderById.get(t.id) } : t)),
  };
}

/** 追加任务时用的下一个 order。 */
function nextOrderInGroup(state, groupId) {
  const list = tasksInGroup(state, groupId);
  return list.length === 0 ? 0 : list[list.length - 1].order + 1;
}

function replaceTask(state, taskId, updater) {
  return {
    ...state,
    tasks: state.tasks.map((t) => (t.id === taskId ? updater(t) : t)),
  };
}

// ---------- 任务 ----------

/** 新建任务，追加到该分组末尾。分组不存在时原样返回。 */
export function addTask(state, { id, groupId, title }, now = Date.now()) {
  if (!getGroup(state, groupId)) return state;

  const task = {
    id,
    groupId,
    title,
    note: '',
    done: false,
    important: false,
    due: null,
    subtasks: [],
    createdAt: now,
    completedAt: null,
    order: nextOrderInGroup(state, groupId),
  };

  return { ...state, tasks: [...state.tasks, task] };
}

/**
 * 修改任务。只有出现在 patch 里的键会被改。
 * `done` 与 `completedAt` 保持同步：变 true 时写 now，变 false 时置 null，
 * 值没变则不动 completedAt。
 */
export function updateTask(state, taskId, patch, now = Date.now()) {
  const task = getTask(state, taskId);
  if (!task) return state;

  const next = { ...task };

  if ('title' in patch) next.title = patch.title;
  if ('note' in patch) next.note = patch.note;
  if ('due' in patch) next.due = patch.due;
  if ('important' in patch) next.important = Boolean(patch.important);

  if ('done' in patch) {
    const done = Boolean(patch.done);
    if (done !== task.done) {
      next.done = done;
      next.completedAt = done ? now : null;
    }
  }

  // 换组：从原位置摘掉，追加到目标组末尾，再压紧源组
  if ('groupId' in patch && patch.groupId !== task.groupId) {
    if (!getGroup(state, patch.groupId)) return state;

    const without = { ...state, tasks: state.tasks.filter((t) => t.id !== taskId) };
    next.groupId = patch.groupId;
    next.order = nextOrderInGroup(without, patch.groupId);

    return renumberGroup(
      { ...without, tasks: [...without.tasks, next] },
      task.groupId,
    );
  }

  return replaceTask(state, taskId, () => next);
}

export function deleteTask(state, taskId) {
  const task = getTask(state, taskId);
  if (!task) return state;

  const without = { ...state, tasks: state.tasks.filter((t) => t.id !== taskId) };
  return renumberGroup(without, task.groupId);
}

export function toggleTaskDone(state, taskId, now = Date.now()) {
  const task = getTask(state, taskId);
  if (!task) return state;
  return updateTask(state, taskId, { done: !task.done }, now);
}

export function toggleTaskImportant(state, taskId) {
  const task = getTask(state, taskId);
  if (!task) return state;
  return updateTask(state, taskId, { important: !task.important });
}

// ---------- 分组 ----------

/** 把分组按现有顺序重新编号为 0..n-1。 */
function renumberGroups(state) {
  const ordered = sortedGroups(state);
  const orderById = new Map(ordered.map((g, i) => [g.id, i]));
  return {
    ...state,
    groups: state.groups.map((g) => ({ ...g, order: orderById.get(g.id) })),
  };
}

export function addGroup(state, { id, name }) {
  const order = state.groups.length === 0
    ? 0
    : Math.max(...state.groups.map((g) => g.order)) + 1;
  return { ...state, groups: [...state.groups, { id, name, order }] };
}

export function renameGroup(state, groupId, name) {
  if (!getGroup(state, groupId)) return state;
  return {
    ...state,
    groups: state.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
  };
}

/**
 * 删除分组，连带删除组内任务。
 * 删掉最后一个分组时自动补一个默认分组——否则界面没有容器可放任务。
 */
export function deleteGroup(state, groupId) {
  if (!getGroup(state, groupId)) return state;

  let next = {
    ...state,
    groups: state.groups.filter((g) => g.id !== groupId),
    tasks: state.tasks.filter((t) => t.groupId !== groupId),
  };

  if (next.groups.length === 0) {
    next = {
      ...next,
      groups: [{ id: 'g_default', name: DEFAULT_GROUP_NAME, order: 0 }],
    };
  }

  return renumberGroups(next);
}

export function moveGroup(state, groupId, toIndex) {
  const ordered = sortedGroups(state);
  const from = ordered.findIndex((g) => g.id === groupId);
  if (from === -1) return state;

  const to = Math.max(0, Math.min(toIndex, ordered.length - 1));
  if (from === to) return state;

  const reordered = ordered.slice();
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);

  const orderById = new Map(reordered.map((g, i) => [g.id, i]));
  return {
    ...state,
    groups: state.groups.map((g) => ({ ...g, order: orderById.get(g.id) })),
  };
}

// ---------- 排序 ----------

/**
 * 把任务移动到目标分组的指定位置。
 *
 * toIndex 是「目标分组未完成列表」中的可视化落点下标，范围 0..active.length。
 * 界面看到并拖拽的是活跃列表，已完成任务收在折叠行里，
 * 所以接口用视觉下标，界面层不需要知道已完成任务在数组里的位置。
 */
export function moveTask(state, taskId, toGroupId, toIndex) {
  const task = getTask(state, taskId);
  if (!task) return state;
  if (!getGroup(state, toGroupId)) return state;

  const fromGroupId = task.groupId;

  // 目标组内除去被移动任务后的完整有序列表
  const full = tasksInGroup(state, toGroupId).filter((t) => t.id !== taskId);
  const active = full.filter((t) => !t.done);

  let insertAt;
  const anchor = active[toIndex];
  if (anchor) {
    insertAt = full.indexOf(anchor);
  } else if (active.length > 0) {
    insertAt = full.indexOf(active[active.length - 1]) + 1;
  } else {
    insertAt = 0;
  }

  const reordered = full.slice();
  reordered.splice(insertAt, 0, { ...task, groupId: toGroupId });

  const orderById = new Map(reordered.map((t, i) => [t.id, i]));

  let next = {
    ...state,
    tasks: state.tasks.map((t) => {
      if (t.id === taskId) {
        return { ...t, groupId: toGroupId, order: orderById.get(t.id) };
      }
      if (orderById.has(t.id)) return { ...t, order: orderById.get(t.id) };
      return t;
    }),
  };

  // 换组时源组要压紧
  if (fromGroupId !== toGroupId) next = renumberGroup(next, fromGroupId);

  return next;
}
