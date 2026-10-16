// 弹出菜单。分组标题的 ⋯ 和顶栏的 ⋯ 共用。
//
// 原本是 list-view.js 里的私有函数，顶栏 ⋯ 成了第二个使用者之后才提出来——
// 两个使用者出现时才抽象。

export function createPopupMenu() {
  let open = null;

  function close() {
    if (!open) return;
    open.element.remove();
    const { onClose } = open;
    open = null;
    if (onClose) onClose();
  }

  document.addEventListener('click', close);
  window.addEventListener('scroll', close, true); // 捕获阶段，内层容器滚动也算
  window.addEventListener('resize', close);

  function show(anchor, items, onClose) {
    close();

    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.setAttribute('role', 'menu');

    for (const item of items) {
      const button = document.createElement('button');
      button.className = 'menu__item';
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      if (item.danger) button.classList.add('menu__item--danger');
      button.textContent = item.label;
      button.addEventListener('click', () => {
        close();
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

    open = { element: menu, onClose };
  }

  return { show, close };
}
