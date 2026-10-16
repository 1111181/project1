// 首页：分组与任务的渲染和交互。

import {
  sortedGroups,
  activeTasksInGroup,
  doneTasksInGroup,
  tasksInGroup,
  subtaskProgress,
} from './store.js';
import { attachSortable } from './drag.js';

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** '2026-10-20' -> '10-20'；不是今年的带上年份，避免误读。 */
export function formatDue(due, today = new Date()) {
  const [year, month, day] = due.split('-');
  if (Number(year) === today.getFullYear()) {
    return `${Number(month)}-${Number(day)}`;
  }
  return `${year}-${month}-${day}`;
}

export function createListView({ root, actions }) {
  // 只属于界面、不进数据模型的临时状态
  const ui = {
    collapsed: new Set(),
    expandedDone: new Set(),
    addingGroupId: null,
    renamingGroupId: null,
    focusAdd: false,
    focusRename: false,
    closingAdd: false,
    dragging: false,
  };

  let state = null;
  let openMenu = null;
  let painting = false;

  // ---------- 弹出菜单 ----------

  function closeMenu() {
    if (openMenu) {
      openMenu.remove();
      openMenu = null;
    }
  }

  document.addEventListener('click', closeMenu);

  function showMenu(anchor, items) {
    closeMenu();

    const menu = el('div', 'menu');
    menu.setAttribute('role', 'menu');

    for (const item of items) {
      const button = el('button', 'menu__item');
      button.type = 'button';
      if (item.danger) button.classList.add('menu__item--danger');
      button.textContent = item.label;
      button.addEventListener('click', () => {
        closeMenu();
        item.run();
      });
      menu.append(button);
    }

    document.body.append(menu);

    // 贴住锚点右下角，并保证不超出视口
    const rect = anchor.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const left = Math.min(
      Math.max(8, rect.right - width),
      Math.max(8, window.innerWidth - width - 8),
    );
    const below = rect.bottom + 4;
    const top = below + height > window.innerHeight - 8
      ? Math.max(8, rect.top - height - 4)
      : below;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    openMenu = menu;
  }

  // ---------- 空状态 ----------

  function renderEmptyState() {
    const box = el('div', 'empty-state');

    const title = el('p', 'empty-state__title');
    title.textContent = '还没有任务';

    const hint = el('p', 'empty-state__hint');
    hint.textContent = '点下面的按钮加一个';

    box.append(title, hint);
    return box;
  }

  // ---------- 任务行 ----------

  function renderTask(task) {
    const li = el('li', 'task');
    li.dataset.taskId = task.id;
    if (task.important) li.classList.add('task--important');

    const check = el('button', 'task__check');
    check.type = 'button';
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', 'false');
    check.setAttribute('aria-label', `完成「${task.title}」`);
    check.append(el('span', 'task__check-dot'));
    check.addEventListener('click', (event) => {
      event.stopPropagation();
      actions.toggleDone(task.id);
    });

    const body = el('div', 'task__body');

    const title = el('span', 'task__title');
    // textContent：用户内容绝不走 innerHTML
    title.textContent = task.title;
    body.append(title);

    const meta = el('div', 'task__meta');

    if (task.due) {
      const due = el('span', 'task__meta-item');
      due.textContent = formatDue(task.due);
      meta.append(due);
    }

    const progress = subtaskProgress(task);
    if (progress) {
      const item = el('span', 'task__meta-item');
      item.textContent = `${progress.done}/${progress.total}`;
      meta.append(item);
    }

    if (task.note.trim() !== '') {
      const mark = el('span', 'task__meta-item');
      mark.textContent = '≡';
      mark.title = '有备注';
      meta.append(mark);
    }

    if (meta.childElementCount > 0) body.append(meta);

    li.append(check, body);
    li.addEventListener('click', () => actions.openTask(task.id));

    return li;
  }

  function renderDoneTask(task) {
    const li = el('li', 'task task--done');
    li.dataset.taskId = task.id;

    const check = el('button', 'task__check');
    check.type = 'button';
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', 'true');
    check.setAttribute('aria-label', `取消完成「${task.title}」`);

    const tick = el('span', 'task__check-tick');
    tick.textContent = '✓';
    tick.setAttribute('aria-hidden', 'true');
    check.append(tick);

    check.addEventListener('click', (event) => {
      event.stopPropagation();
      actions.toggleDone(task.id);
    });

    const body = el('div', 'task__body');
    const title = el('span', 'task__title');
    title.textContent = task.title;
    body.append(title);

    const remove = el('button', 'icon-button task__delete');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `删除「${task.title}」`);
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      actions.deleteTask(task.id);
    });

    li.append(check, body, remove);
    li.addEventListener('click', () => actions.openTask(task.id));

    return li;
  }

  // ---------- 内联添加 ----------

  function renderAddRow(groupId) {
    const row = el('div', 'add-row');

    const input = el('input', 'add-row__input');
    input.type = 'text';
    input.placeholder = '写点什么，回车确认';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', '新任务标题');
    input.setAttribute('enterkeyhint', 'done');

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        const title = input.value.trim();
        if (title === '') {
          closeAddRow();
          return;
        }
        input.value = '';
        ui.focusAdd = true; // 下一次重渲染后把焦点还回来，方便连续录入
        actions.addTask(groupId, title);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeAddRow();
      }
    });

    input.addEventListener('blur', () => {
      // 两种情况下的 blur 都不是用户失焦，不能当成交互：
      //   1. 输入行正在被主动关闭（移除持有焦点的元素会同步触发 blur）
      //   2. 正在整体重渲染——render() 开头会清空 root，同样同步触发 blur。
      //      漏掉这一条的话，回车加完一条任务后输入行会消失，没法连续录入。
      if (ui.closingAdd || painting) return;
      const title = input.value.trim();
      if (title !== '') actions.addTask(groupId, title);
      closeAddRow();
    });

    row.append(input);
    return row;
  }

  function closeAddRow() {
    if (ui.closingAdd) return;
    ui.closingAdd = true;
    ui.addingGroupId = null;
    ui.focusAdd = false;
    queueMicrotask(() => {
      ui.closingAdd = false;
      render();
    });
  }

  // ---------- 已完成折叠区 ----------

  function renderDoneSection(group, done) {
    const box = el('div', 'done-section');
    const expanded = ui.expandedDone.has(group.id);

    const toggle = el('button', 'done-section__toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = `已完成 ${done.length} 项`;
    toggle.addEventListener('click', () => {
      if (expanded) ui.expandedDone.delete(group.id);
      else ui.expandedDone.add(group.id);
      render();
    });
    box.append(toggle);

    if (expanded) {
      const list = el('ul', 'task-list');
      for (const task of done) list.append(renderDoneTask(task));
      box.append(list);
    }

    return box;
  }

  // ---------- 分组 ----------

  function renderGroup(group) {
    const section = el('section', 'group');
    section.dataset.groupId = group.id;

    const isCollapsed = ui.collapsed.has(group.id);
    const active = activeTasksInGroup(state, group.id);
    const done = doneTasksInGroup(state, group.id);

    const header = el('header', 'group__header');

    if (ui.renamingGroupId === group.id) {
      const input = el('input', 'group__rename');
      input.type = 'text';
      input.value = group.name;
      input.autocomplete = 'off';
      input.setAttribute('aria-label', '分组名称');

      const finish = (save) => {
        if (ui.renamingGroupId !== group.id) return;
        const name = input.value.trim();
        ui.renamingGroupId = null;
        if (save && name !== '' && name !== group.name) {
          actions.renameGroup(group.id, name);
        } else {
          render();
        }
      };

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        }
      });
      // 同内联添加：重渲染移除输入框触发的 blur 不是用户失焦，不能拿来结束重命名
      input.addEventListener('blur', () => {
        if (painting) return;
        finish(true);
      });

      header.append(input);
    } else {
      const toggle = el('button', 'group__toggle');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', String(!isCollapsed));

      const caret = el('span', 'group__caret');
      caret.textContent = isCollapsed ? '▸' : '▾';
      caret.setAttribute('aria-hidden', 'true');

      const name = el('span', 'group__name');
      if (group.name === '') {
        name.textContent = '未命名分组';
        name.classList.add('group__name--placeholder');
      } else {
        name.textContent = group.name;
      }

      const count = el('span', 'group__count');
      if (active.length > 0) count.textContent = String(active.length);

      toggle.append(caret, name, count);
      toggle.addEventListener('click', () => {
        if (ui.collapsed.has(group.id)) ui.collapsed.delete(group.id);
        else ui.collapsed.add(group.id);
        render();
      });

      const more = el('button', 'icon-button group__more');
      more.type = 'button';
      more.textContent = '⋯';
      more.setAttribute('aria-label', `「${group.name}」的更多操作`);
      more.addEventListener('click', (event) => {
        event.stopPropagation();
        showMenu(more, [
          {
            label: '重命名分组',
            run: () => {
              ui.renamingGroupId = group.id;
              ui.focusRename = true;
              render();
            },
          },
          {
            label: '删除分组',
            danger: true,
            run: () => confirmDeleteGroup(group),
          },
        ]);
      });

      const add = el('button', 'icon-button group__add');
      add.type = 'button';
      add.textContent = '＋';
      add.setAttribute('aria-label', `在「${group.name}」添加任务`);
      add.addEventListener('click', (event) => {
        event.stopPropagation();
        startAddInGroup(group.id);
      });

      header.append(toggle, more, add);
    }

    section.append(header);

    if (!isCollapsed) {
      const list = el('ul', 'task-list');
      list.dataset.groupId = group.id;

      for (const task of active) list.append(renderTask(task));

      if (active.length === 0 && ui.addingGroupId !== group.id) {
        const blank = el('li', 'task-list__blank');
        blank.textContent = '这个分组还没有任务';
        list.append(blank);
      }

      section.append(list);

      if (ui.addingGroupId === group.id) section.append(renderAddRow(group.id));

      if (done.length > 0) section.append(renderDoneSection(group, done));
    }

    return section;
  }

  function confirmDeleteGroup(group) {
    const count = tasksInGroup(state, group.id).length;
    const extra = count > 0 ? `，组内的 ${count} 个任务也会一起删掉` : '';
    const ok = window.confirm(`确定删除分组「${group.name}」吗？${extra}。\n\n这个操作没法撤销。`);
    if (ok) actions.deleteGroup(group.id);
  }

  // ---------- 渲染入口 ----------

  function render(next) {
    if (next) state = next;
    // 拖拽过程中绝不重画，否则正在拖的那个元素会被换掉
    if (!state || painting || ui.dragging) return;

    painting = true;
    try {
      root.textContent = '';

      const groups = sortedGroups(state);
      const allEmpty = groups.every((g) => tasksInGroup(state, g.id).length === 0);
      if (allEmpty) root.append(renderEmptyState());

      for (const group of groups) root.append(renderGroup(group));

      if (ui.focusAdd && ui.addingGroupId) {
        ui.focusAdd = false;
        const input = root.querySelector('.add-row__input');
        if (input) {
          input.focus();
          const end = input.value.length;
          input.setSelectionRange(end, end);
        }
      }

      if (ui.focusRename && ui.renamingGroupId) {
        ui.focusRename = false;
        const input = root.querySelector('.group__rename');
        if (input) {
          input.focus();
          input.select();
        }
      }
    } finally {
      painting = false;
    }
  }

  function startAddInGroup(groupId) {
    ui.addingGroupId = groupId;
    ui.focusAdd = true;
    ui.collapsed.delete(groupId); // 折叠着也能加
    render();

    const input = root.querySelector('.add-row__input');
    if (input) input.scrollIntoView({ block: 'center' });
  }

  // ---------- 拖拽 ----------
  // 任务：可以在分组之间移动，所以 containerOf 返回指针下面的那个 task-list
  attachSortable(root, {
    itemSelector: '.task',
    draggingClass: 'task--dragging',
    scrollEl: root.closest('.scroll') ?? root,
    containerOf: (node) => node.closest('.task-list[data-group-id]'),
    onStart: () => { ui.dragging = true; closeMenu(); },
    onEnd: () => { ui.dragging = false; },
    onDrop: (item, target) => {
      actions.moveTask(
        item.dataset.taskId,
        target.listEl.dataset.groupId,
        target.index,
      );
    },
  });

  // 分组：整个 group-list 就是一个列表；只有按在标题行上才算（按在任务行上不该拖分组）
  attachSortable(root, {
    itemSelector: '.group',
    handleSelector: '.group__header',
    ignoreSelector: 'input, textarea, select, a, label, .group__more, .group__add',
    draggingClass: 'group--dragging',
    scrollEl: root.closest('.scroll') ?? root,
    containerOf: (node) => node.closest('.group-list'),
    onStart: () => { ui.dragging = true; closeMenu(); },
    onEnd: () => { ui.dragging = false; },
    onDrop: (item) => {
      const index = [...root.querySelectorAll('.group')].indexOf(item);
      actions.moveGroup(item.dataset.groupId, index);
    },
  });

  return { render, startAddInGroup };
}
