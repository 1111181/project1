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
