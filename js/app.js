// 入口：装载数据、装配路由与视图。

import { createStorage } from './storage.js';
import { createRouter, ROUTE_TASK } from './router.js';

const notice = document.getElementById('notice');
const viewList = document.getElementById('view-list');
const viewDetail = document.getElementById('view-detail');
const detailGroupName = document.getElementById('detail-group-name');

const storage = createStorage();
const loaded = storage.load();

/** 顶部的提示条。传空字符串就收起。 */
function showNotice(text) {
  notice.textContent = text ?? '';
  notice.hidden = !text;
}

/** 按路由切换两个视图。 */
function applyRoute(route) {
  const onTask = route.name === ROUTE_TASK;

  viewList.hidden = onTask;
  viewDetail.hidden = !onTask;

  // Task 12 会把这里换成真实的分组名和详情内容，
  // 现在先显示任务 id，用来确认路由确实通了。
  detailGroupName.textContent = onTask ? route.taskId : '';
}

const router = createRouter(applyRoute);
router.start();

if (loaded.warning) showNotice(loaded.warning);
