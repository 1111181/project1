# 浏览器端回归测试

这些不是普通的 HTML 页面，是**测试**。每个文件会把真实的应用装进一个 390×700 的 iframe，用合成的 DOM / PointerEvent 驱动它，然后把断言结果打印在页面顶部。

## 怎么跑

```bash
# 1. 起本地服务器（另开一个终端，保持运行）
node tools/serve.mjs 8000

# 2. 跑全部探针并打印汇总
node tools/run-browser-tests.mjs

# 也可以只跑一个，直接在浏览器里看结果
#   http://localhost:8000/tests/browser/list-probe.html
```

`run-browser-tests.mjs` 需要本机装了 Edge 或 Chrome。它会自动找，找不到会告诉你怎么用环境变量指定。

## 这些测试为什么存在

单元测试（`node --test`）覆盖的是纯逻辑：数据层、存储层、路由、落点计算。**界面层的东西它们碰不到**。这些探针补的就是那一块，而且已经证明能抓到单元测试结构上抓不到的缺陷——实施期间抓到两个：

1. **回车加完一条任务后输入行消失**，没法连续录入。原因是重渲染时移除持有焦点的输入框会同步触发 `blur`，被当成「用户失焦」。
2. **顶部提示条永久盖住顶栏 `⋯`**。提示条的文案正是「存储已满，去右上角 `⋯` 里导出备份」，却把那个按钮自己挡死了——设计里唯一的数据救援入口不可达。

第 2 条尤其值得记：最初的探针用 `$('#menu-button').click()` 验证「菜单还能打开」，**程序化点击绕过命中判定，结构上不可能发现遮挡**。所以现在所有涉及「某个按钮还能不能点」的断言，一律用**真实坐标**做命中测试：

```js
const r = button.getBoundingClientRect();
const hit = doc.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
// hit 必须是按钮本身（或它的后代）；在该坐标派发真实 click 才算数
```

## 各探针覆盖什么

| 文件 | 覆盖 |
|---|---|
| `router-probe.html` | hash 路由的各种取值、后退、前进 |
| `list-probe.html` | 空状态、内联添加与连续录入、勾完成、已完成折叠、分组折叠与菜单、HTML 字符、超长文本、持久化 |
| `drag-probe.html` | 长按拖拽：组内重排、跨组移动、拖入空组、占位元素、松手清理、误触防护、分组重排、边缘自动滚动、`pointercancel` 与页面切走时的取消路径 |
| `detail-probe.html` | 详情页全部字段、**快速连续输入不丢字**、备注防抖与兜底落盘、子任务、元信息、删除 |
| `backup-probe.html` | 顶栏菜单、新建分组、导出内容、导入的四种结果（成功/取消/非 JSON/结构非法） |
| `quota-probe.html` | 存储写满时的提示与降级行为、**提示条出现时顶栏 `⋯` 仍能被真实点击命中** |
| `pwa-probe.html` | manifest 字段、图标文件头字节、页面接线、iOS meta、确认没有 Service Worker |
| `resilience-probe.html` | 损坏的存储内容（半截 JSON、重复 id、类型错、来自未来版本）、只读保护、各处 HTML 特殊字符、超长备注、返回时滚动位置保留、删光分组 |
| `roundtrip-probe.html` | 导出 → 清空 → 导入的完整往返，逐字段比对 |

## 已知的环境限制

- **`requestAnimationFrame` 在无头截图模式下不回调**（`drag-probe` 第 0 项专门把这件事断言出来，它就是那条唯一显示为 ✗ 的项）。拖拽的落点计算靠 rAF 调度，所以 `drag-probe` 会用一个契约相同的替身（`setTimeout(cb, 0)`）顶上。**注意 `location.reload()` 之后新窗口没有替身，必须重装**，否则会得到一批假失败。
- **种数据必须在 iframe 首次加载之前**从父页面写（同源共享 `localStorage`）。用「先加载 iframe 再 `setItem` + `reload`」会被应用的 `pagehide` 兜底覆盖掉——那是应用的正确行为（离开页面前存盘），不是缺陷。
- **真实的 `window.prompt` / `window.confirm` 在无头模式里会永久阻塞**，必须在任何点击之前替换掉。
- **导出备份必须在探针里拦掉真实的下载**（`a.click()` 换掉），否则无头模式会一直等下载完成。

## 仍然需要真机的

探针跑得再全，也替代不了三件事：长按的真实手感与「快速滑动绝不误触拖拽」、加到主屏幕后的全屏打开与刘海遮挡、断网刷新的实际表现。这三条写在 [验收结果](../../docs/superpowers/plans/2026-10-16-todo-app-验收结果.md) 的 §3、§4。
