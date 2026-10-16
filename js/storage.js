// 唯一接触 localStorage 的模块。
// 其余模块一律通过 createStorage 返回的接口读写，方便测试与替换。

import { parseStored, createInitialState, SCHEMA_VERSION } from './store.js';

export const STORAGE_KEY = 'todo.v1';
export const CORRUPT_KEY_PREFIX = 'todo.v1.corrupt.';

/**
 * 拿一个真的能用的 localStorage；拿不到就返回 null。
 * 隐私模式、被策略禁用、设了只读都会让 setItem 抛异常。
 */
export function getBackend() {
  try {
    const backend = globalThis.localStorage;
    if (!backend) return null;
    const probe = '__todo_probe__';
    backend.setItem(probe, '1');
    backend.removeItem(probe);
    return backend;
  } catch {
    return null;
  }
}

/** 写盘与导出共用的载荷。 */
export function toPayload(state, now = Date.now()) {
  return {
    version: SCHEMA_VERSION,
    savedAt: now,
    groups: state.groups,
    tasks: state.tasks,
  };
}

/** 把异常翻译成一个短标识，界面据此决定提示文案。 */
function classify(err) {
  if (err && (err.name === 'QuotaExceededError' || err.code === 22)) return 'quota';
  return 'unknown';
}

export function createStorage(backend = getBackend()) {
  const available = backend !== null && backend !== undefined;

  return {
    available,

    /**
     * 读盘。返回 { state, status, warning, readonly }。
     * status 可能是 empty / ok / migrated / corrupt / readonly / unavailable。
     * status 为 corrupt 时，先把原始字符串备份到另一个键再返回——宁可留一份
     * 看不懂的垃圾，也不能把用户数据静默丢掉。
     */
    load(now = Date.now()) {
      if (!available) {
        return {
          state: createInitialState(),
          status: 'unavailable',
          warning: '这个浏览器不允许保存本地数据（可能是隐私模式）。现在可以正常使用，但关掉页面后内容会丢失。',
          readonly: true,
        };
      }

      let raw = null;
      try {
        raw = backend.getItem(STORAGE_KEY);
      } catch {
        return {
          state: createInitialState(),
          status: 'unavailable',
          warning: '读取本地数据失败。现在可以正常使用，但关掉页面后内容会丢失。',
          readonly: true,
        };
      }

      const result = parseStored(raw);

      if (result.status === 'corrupt' && raw !== null && raw !== undefined) {
        try {
          backend.setItem(`${CORRUPT_KEY_PREFIX}${now}`, raw);
        } catch {
          // 备份失败也不能丢原数据，更不能在这里崩掉
        }
      }

      return result;
    },

    /** 写盘。返回 { ok: true } 或 { ok: false, reason }。 */
    save(state, now = Date.now()) {
      if (!available) return { ok: false, reason: 'unavailable' };
      try {
        backend.setItem(STORAGE_KEY, JSON.stringify(toPayload(state, now)));
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: classify(err) };
      }
    },

    /** 清空主数据。corrupt 备份故意保留，不跟着一起删。 */
    clear() {
      if (!available) return false;
      try {
        backend.removeItem(STORAGE_KEY);
        return true;
      } catch {
        return false;
      }
    },
  };
}
