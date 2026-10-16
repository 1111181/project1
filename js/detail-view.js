// 任务详情视图：标题、开关、截止日期、分组、备注、子任务、元信息、删除。

import { getTask, getGroup, sortedGroups } from './store.js';

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function stamp(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function createDetailView({ root, groupNameEl, actions }) {
  const els = {};
  let currentId = null;
  let subtaskKey = '';

  function field(labelText, controlId) {
    const wrap = el('div', 'field');
    const label = el('label', 'field__label');
    label.textContent = labelText;
    if (controlId) label.setAttribute('for', controlId);
    const control = el('div', 'field__control');
    wrap.append(label, control);
    return { wrap, control };
  }

  function metaRow(key, value) {
    const row = el('div', 'detail__meta-row');
    const k = el('dt', 'detail__meta-key');
    k.textContent = key;
    const v = el('dd', 'detail__meta-value');
    v.textContent = value;
    row.append(k, v);
    return row;
  }

  // ---------- 构建（只在任务 id 变化时调用） ----------

  function build(state, task) {
    root.textContent = '';
    subtaskKey = '';

    const form = el('div', 'detail');

    // 标题
    const title = el('input', 'detail__title');
    title.type = 'text';
    title.value = task.title;
    title.placeholder = '任务标题';
    title.autocomplete = 'off';
    title.setAttribute('aria-label', '任务标题');
    title.addEventListener('input', () => actions.setField(task.id, { title: title.value }));
    title.addEventListener('blur', () => actions.flush());
    form.append(title);
    els.title = title;

    // 重要 / 完成
    const toggles = el('div', 'detail__toggles');

    const important = el('button', 'toggle toggle--important');
    important.type = 'button';
    important.setAttribute('role', 'switch');
    const importantDot = el('span', 'toggle__dot');
    const importantText = el('span', 'toggle__text');
    importantText.textContent = '重要';
    important.append(importantDot, importantText);
    important.addEventListener('click', () => actions.toggleImportant(task.id));

    const done = el('button', 'toggle');
    done.type = 'button';
    done.setAttribute('role', 'switch');
    const doneDot = el('span', 'toggle__dot');
    const doneText = el('span', 'toggle__text');
    doneText.textContent = '完成';
    done.append(doneDot, doneText);
    done.addEventListener('click', () => actions.toggleDone(task.id));

    toggles.append(important, done);
    form.append(toggles);
    els.important = important;
    els.done = done;

    // 截止日期
    const dueField = field('截止日期', 'detail-due');
    const dueRow = el('div', 'field__row');
    const due = el('input', 'field__input');
    due.type = 'date';
    due.id = 'detail-due';
    due.addEventListener('change', () => {
      actions.setField(task.id, { due: due.value === '' ? null : due.value }, true);
      actions.flush();
    });
    const dueClear = el('button', 'field__clear');
    dueClear.type = 'button';
    dueClear.textContent = '清除';
    dueClear.addEventListener('click', () => {
      actions.setField(task.id, { due: null }, true);
      actions.flush();
    });
    dueRow.append(due, dueClear);
    dueField.control.append(dueRow);
    form.append(dueField.wrap);
    els.due = due;

    // 分组
    const groupField = field('分组', 'detail-group');
    const select = el('select', 'field__input');
    select.id = 'detail-group';
    select.addEventListener('change', () => {
      actions.setField(task.id, { groupId: select.value }, true);
      actions.flush();
    });
    groupField.control.append(select);
    form.append(groupField.wrap);
    els.group = select;

    // 备注
    const noteField = field('备注', 'detail-note');
    const note = el('textarea', 'field__textarea');
    note.id = 'detail-note';
    note.rows = 3;
    note.placeholder = '写点什么…';
    note.value = task.note;
    note.addEventListener('input', () => {
      els.autoGrow();
      actions.setField(task.id, { note: note.value });
    });
    note.addEventListener('blur', () => actions.flush());
    noteField.control.append(note);
    form.append(noteField.wrap);
    els.note = note;

    els.autoGrow = () => {
      note.style.height = 'auto';
      note.style.height = `${note.scrollHeight}px`;
    };

    // 子任务
    const subtaskField = field('子任务');
    const list = el('ul', 'subtask-list');
    const addInput = el('input', 'subtask-add__input');
    addInput.type = 'text';
    addInput.placeholder = '添加子任务，回车确认';
    addInput.autocomplete = 'off';
    addInput.setAttribute('aria-label', '新子任务');
    addInput.setAttribute('enterkeyhint', 'done');
    addInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const text = addInput.value.trim();
      if (text === '') return;
      addInput.value = '';
      actions.addSubtask(task.id, text);
      addInput.focus();
    });
    subtaskField.control.append(list, addInput);
    form.append(subtaskField.wrap);
    els.subtasks = list;
    els.subtaskAdd = addInput;
    els.subtaskRows = new Map();

    // 元信息
    const meta = el('dl', 'detail__meta');
    form.append(meta);
    els.meta = meta;

    // 删除
    const remove = el('button', 'detail__delete');
    remove.type = 'button';
    remove.textContent = '删除任务';
    remove.addEventListener('click', () => {
      const ok = window.confirm(`确定删除「${task.title}」吗？\n\n这个操作没法撤销。`);
      if (ok) actions.deleteTask(task.id);
    });
    form.append(remove);

    root.append(form);
    els.autoGrow();
  }

  // ---------- 子任务 ----------

  function renderSubtasks(task) {
    els.subtasks.textContent = '';
    els.subtaskRows = new Map();

    for (const sub of task.subtasks) {
      const li = el('li', 'subtask');
      li.dataset.subtaskId = sub.id;

      const check = el('button', 'subtask__check');
      check.type = 'button';
      check.setAttribute('role', 'checkbox');
      check.setAttribute('aria-label', `切换子任务「${sub.text}」`);
      const tick = el('span', 'subtask__tick');
      tick.textContent = '✓';
      tick.setAttribute('aria-hidden', 'true');
      check.append(tick);
      check.addEventListener('click', () => {
        actions.toggleSubtask(task.id, sub.id);
        actions.flush();
      });

      const text = el('input', 'subtask__text');
      text.type = 'text';
      text.value = sub.text;
      text.autocomplete = 'off';
      text.setAttribute('aria-label', '子任务内容');
      text.addEventListener('input', () => {
        actions.setSubtask(task.id, sub.id, { text: text.value });
      });
      text.addEventListener('blur', () => actions.flush());

      const remove = el('button', 'icon-button subtask__delete');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `删除子任务「${sub.text}」`);
      remove.addEventListener('click', () => {
        actions.deleteSubtask(task.id, sub.id);
        actions.flush();
      });

      li.append(check, text, remove);
      els.subtasks.append(li);
      els.subtaskRows.set(sub.id, { li, check, text });
    }
  }

  function syncSubtasks(task) {
    for (const sub of task.subtasks) {
      const row = els.subtaskRows.get(sub.id);
      if (!row) continue;
      row.check.classList.toggle('subtask__check--on', sub.done);
      row.check.setAttribute('aria-checked', String(sub.done));
      row.li.classList.toggle('subtask--done', sub.done);
      if (document.activeElement !== row.text) row.text.value = sub.text;
    }
  }

  // ---------- 同步 ----------

  function syncControls(state, task) {
    const active = document.activeElement;

    // 每个输入框：正被编辑就别去碰它，否则光标会跳、字会丢
    if (active !== els.title) els.title.value = task.title;

    els.important.classList.toggle('toggle--on', task.important);
    els.important.setAttribute('aria-checked', String(task.important));

    els.done.classList.toggle('toggle--on', task.done);
    els.done.setAttribute('aria-checked', String(task.done));

    if (active !== els.due) els.due.value = task.due ?? '';

    const groups = sortedGroups(state);
    const groupKey = groups.map((g) => `${g.id}:${g.name}`).join('|');
    if (els.group.dataset.key !== groupKey) {
      els.group.textContent = '';
      for (const group of groups) {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name === '' ? '未命名分组' : group.name;
        els.group.append(option);
      }
      els.group.dataset.key = groupKey;
    }
    if (active !== els.group) els.group.value = task.groupId;

    if (active !== els.note) {
      els.note.value = task.note;
      els.autoGrow();
    }

    // 子任务 id 序列变了才重建，避免打字时输入框被换掉
    const key = task.subtasks.map((s) => s.id).join('|');
    if (key !== subtaskKey) {
      subtaskKey = key;
      renderSubtasks(task);
    } else {
      syncSubtasks(task);
    }

    els.meta.textContent = '';
    els.meta.append(
      metaRow('创建于', stamp(task.createdAt)),
      metaRow('完成于', stamp(task.completedAt)),
    );

    if (groupNameEl) {
      const group = getGroup(state, task.groupId);
      groupNameEl.textContent = group ? group.name : '';
    }
  }

  // ---------- 渲染入口 ----------

  function render(state, taskId) {
    const task = getTask(state, taskId);

    if (!task) {
      currentId = null;
      root.textContent = '';
      if (groupNameEl) groupNameEl.textContent = '';

      const box = el('div', 'empty-state');
      const title = el('p', 'empty-state__title');
      title.textContent = '这个任务不存在';
      const hint = el('p', 'empty-state__hint');
      hint.textContent = '它可能已经被删掉了';
      box.append(title, hint);
      root.append(box);
      return;
    }

    if (currentId !== taskId) {
      currentId = taskId;
      build(state, task);
    }

    syncControls(state, task);
  }

  return { render };
}
