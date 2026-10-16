// 通用长按拖拽排序。任务列表和分组列表共用。
//
// 为什么不用 HTML5 的 dragstart/dragover：那套 API 在移动端浏览器上根本不触发。
// 手机上只能用 Pointer Events 自己实现。

const LONG_PRESS_MS = 350;
const MOVE_TOLERANCE = 8;   // 超过这个位移就判定为滚动，取消长按
const EDGE_ZONE = 64;       // 距容器上下边缘多少像素内开始自动滚动
const MAX_SCROLL_STEP = 14; // 每帧最多滚多少像素

/**
 * 指针的 y 落在第几个位置。
 *
 * rects 是一串按视觉顺序排列的矩形（{ top, height }）。
 * 返回 0..rects.length —— 返回 length 表示落在最末。
 * 判定依据是「指针是否在某项的中线之上」，所以恰好压在中线上时算在这一项之后。
 *
 * 单独抽成纯函数是因为：这是全项目最容易写错的一处（差一个下标就会让
 * 拖拽落点整体偏一格），而它的原始形态埋在 DOM 测量里、没法单测。
 */
export function dropIndexFor(rects, y) {
  for (let i = 0; i < rects.length; i += 1) {
    if (y < rects[i].top + rects[i].height / 2) return i;
  }
  return rects.length;
}

export function attachSortable(container, options) {
  const {
    itemSelector,
    handleSelector = null,
    ignoreSelector = 'button, input, textarea, select, a, label',
    draggingClass,
    scrollEl = container,
    containerOf,
    onDrop,
    onStart,
    onEnd,
  } = options;

  let press = null;
  let drag = null;

  function cancelPress() {
    if (press) {
      clearTimeout(press.timer);
      press = null;
    }
  }

  function handlePointerDown(event) {
    if (drag || (event.button !== undefined && event.button !== 0)) return;

    if (event.target.closest(ignoreSelector)) return;

    const item = event.target.closest(itemSelector);
    if (!item || !container.contains(item)) return;

    // 已完成折叠区里的任务不参与拖拽：那里的顺序对用户没有意义
    if (item.closest('.done-section')) return;

    if (handleSelector && !event.target.closest(handleSelector)) return;

    const startX = event.clientX;
    const startY = event.clientY;

    press = {
      item,
      startX,
      startY,
      timer: setTimeout(() => {
        press = null;
        beginDrag(item, startX, startY);
      }, LONG_PRESS_MS),
    };
  }

  function beginDrag(item, startX, startY) {
    const rect = item.getBoundingClientRect();

    // 取消拖拽时要放回**原位**，所以先把原位记下来。
    // 不能靠占位元素的位置——拖拽途中它已经跟着指针跑到别的列表里去了。
    const originParent = item.parentNode;
    const originNext = item.nextSibling;

    const placeholder = document.createElement(item.tagName);
    placeholder.className = 'drag-placeholder';
    placeholder.style.height = `${rect.height}px`;
    placeholder.style.pointerEvents = 'none';
    item.parentNode.insertBefore(placeholder, item);

    document.body.append(item);
    item.classList.add(draggingClass);
    item.style.position = 'fixed';
    item.style.left = `${rect.left}px`;
    item.style.top = `${rect.top}px`;
    item.style.width = `${rect.width}px`;
    item.style.margin = '0';

    drag = {
      item,
      placeholder,
      originParent,
      originNext,
      startX,
      startY,
      lastX: startX,
      lastY: startY,
      target: null,
      rafId: 0,
    };

    // 拖拽期间禁掉文本选择与系统长按菜单
    window.getSelection()?.removeAllRanges();

    if (onStart) onStart(item);
  }

  function scheduleUpdate() {
    if (drag && !drag.rafId) drag.rafId = requestAnimationFrame(update);
  }

  function update() {
    if (!drag) return;
    drag.rafId = 0;

    const { item, placeholder, lastX, lastY } = drag;

    item.style.transform =
      `translate(${lastX - drag.startX}px, ${lastY - drag.startY}px)`;

    // 指针下的元素查所属列表。元素与占位都设了 pointer-events: none，
    // 所以这里拿到的是它们「下面」的真实内容。
    const under = document.elementFromPoint(lastX, lastY);
    const listEl = under ? containerOf(under) : null;

    if (listEl) {
      const items = [...listEl.querySelectorAll(itemSelector)];
      const index = dropIndexFor(items.map((n) => n.getBoundingClientRect()), lastY);

      const reference = items[index] ?? null;
      if (placeholder.parentNode !== listEl || placeholder.nextSibling !== reference) {
        listEl.insertBefore(placeholder, reference);
      }
      drag.target = { listEl, index };
    }

    // 靠近上下边缘时自动滚动，任务多的时候必需
    const bounds = scrollEl.getBoundingClientRect();
    let step = 0;
    if (lastY < bounds.top + EDGE_ZONE) {
      const ratio = (bounds.top + EDGE_ZONE - lastY) / EDGE_ZONE;
      step = -MAX_SCROLL_STEP * Math.min(1, ratio);
    } else if (lastY > bounds.bottom - EDGE_ZONE) {
      const ratio = (lastY - (bounds.bottom - EDGE_ZONE)) / EDGE_ZONE;
      step = MAX_SCROLL_STEP * Math.min(1, ratio);
    }

    if (step !== 0) {
      scrollEl.scrollTop += step;
      scheduleUpdate(); // 手指不动也要继续滚，所以再排一帧
    }
  }

  function handlePointerMove(event) {
    if (press) {
      const moved = Math.hypot(
        event.clientX - press.startX,
        event.clientY - press.startY,
      );
      if (moved > MOVE_TOLERANCE) cancelPress(); // 判定为滚动，放弃长按
      return;
    }

    if (!drag) return;

    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    scheduleUpdate();
  }

  function finish(commitDrop) {
    cancelPress();
    if (!drag) return;

    const { item, placeholder, target, originParent, originNext } = drag;
    if (drag.rafId) cancelAnimationFrame(drag.rafId);

    if (commitDrop) {
      // 落点就是占位元素现在的位置
      if (placeholder.parentNode) {
        placeholder.parentNode.insertBefore(item, placeholder);
        placeholder.remove();
      }
    } else {
      // 取消：放回原位。放回占位元素处会把这一行留在指针最后扫过的那个分组里，
      // 而数据并没有变——界面显示在 A 组、实际还在 B 组，
      // 之后随便一次重渲染它就会「自己跳回去」。必须还原到原位。
      originParent.insertBefore(item, originNext);
      placeholder.remove();
    }

    item.classList.remove(draggingClass);
    item.style.position = '';
    item.style.left = '';
    item.style.top = '';
    item.style.width = '';
    item.style.margin = '';
    item.style.transform = '';

    drag = null;

    if (onEnd) onEnd();
    if (commitDrop && target && onDrop) onDrop(item, target);
  }

  function handlePointerUp() {
    finish(true);
  }

  // 浏览器把这次手势判成滚动了，拖拽必须干净地取消
  function handlePointerCancel() {
    finish(false);
  }

  // 长按之后阻止滚动。只在拖拽真的开始时才拦，平时不碰滚动。
  function handleTouchMove(event) {
    if (drag) event.preventDefault();
  }

  // 安卓长按会弹系统菜单，拖拽期间要拦掉
  function handleContextMenu(event) {
    if (drag) event.preventDefault();
  }

  // 页面被切走时主动取消拖拽。
  // 拖拽中途切 App / 锁屏时，浏览器不一定会补发 pointercancel；补不上的话
  // 用户回来会看到一个悬在半空、位置固定的卡片。这里主动兜一层。
  function handleVisibilityChange() {
    if (drag && document.visibilityState === 'hidden') finish(false);
  }

  container.addEventListener('pointerdown', handlePointerDown);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);
  window.addEventListener('pointercancel', handlePointerCancel);
  window.addEventListener('touchmove', handleTouchMove, { passive: false });
  window.addEventListener('contextmenu', handleContextMenu);
  document.addEventListener('visibilitychange', handleVisibilityChange);
}
