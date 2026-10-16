// hash 路由：#/ 走列表，#/task/<id> 走详情。
// 用 hash 而不是 History API：hash 变更在 GitHub Pages 上不需要服务端配合，
// 而且手机浏览器的返回键天然就能用。

export const ROUTE_LIST = 'list';
export const ROUTE_TASK = 'task';

/**
 * 把 location.hash 解析成路由对象。
 * 任何认不出来的输入都退化成列表——用户永远不该看到一片空白。
 */
export function parseHash(hash) {
  const raw = typeof hash === 'string' ? hash : '';
  const path = raw.replace(/^#/, '').replace(/^\/+/, '');

  if (path === '') return { name: ROUTE_LIST, taskId: null };

  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'task' && parts.length === 2) {
    return { name: ROUTE_TASK, taskId: decodeURIComponent(parts[1]) };
  }

  return { name: ROUTE_LIST, taskId: null };
}

export function taskHash(taskId) {
  return `#/task/${encodeURIComponent(taskId)}`;
}

export function listHash() {
  return '#/';
}

export function createRouter(onChange) {
  const handle = () => onChange(parseHash(window.location.hash));

  window.addEventListener('hashchange', handle);

  return {
    /** 立刻按当前地址派发一次，让首屏也走同一条路径。 */
    start() {
      handle();
    },
    goToList() {
      window.location.hash = listHash();
    },
    goToTask(taskId) {
      window.location.hash = taskHash(taskId);
    },
    stop() {
      window.removeEventListener('hashchange', handle);
    },
  };
}
