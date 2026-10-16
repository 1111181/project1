# 手机待办应用（project1）

## ⚠️ 当前进度：设计已批准，实施计划已写好，等待执行

- **2026-10-15**：设计阶段完成，用户关机中断在设计评审门
- **2026-10-16**：用户复核设计提出加 PWA，已采纳轻量版方案；随后**确认设计通过**
- **2026-10-16**：实施计划已写好 → [docs/superpowers/plans/2026-10-16-todo-app.md](docs/superpowers/plans/2026-10-16-todo-app.md)（15 个任务）

**下一步**：用户评审实施计划 → 选择执行方式（subagent-driven 或 native）→ 才开始写代码。
**不要跳过计划评审直接动手。**

完整背景见 [docs/会话记录与待恢复项.md](docs/会话记录与待恢复项.md)。

### 用户的工作方式偏好（务必遵守）

- **先计划、再追问、用户同意后才动手**。不要跳过确认直接写代码。
- 用户明确说过"可以不断追问我"——不确定就一次问一个，别猜。
- 做完要如实报告，不要含糊。

---

## 项目简介

手机浏览器上的个人待办清单。纯静态、零依赖、零构建。数据存浏览器 `localStorage`，不上传服务器。

**部署**：推送到 `github.com/1111181/project1`，开 GitHub Pages。
**推送是对外发布动作，执行前必须先征得用户确认。**

## 关键文档

- 设计文档（已提交）：[docs/superpowers/specs/2026-10-15-todo-app-design.md](docs/superpowers/specs/2026-10-15-todo-app-design.md)
- 会话记录与待恢复项：[docs/会话记录与待恢复项.md](docs/会话记录与待恢复项.md)

## 已确认的需求（用户逐条选过，不要再问一遍）

| 维度 | 决定 |
|---|---|
| 使用场景 | 手机浏览器，个人日常用，不做协作/分享 |
| 技术栈 | 原生 HTML/CSS/JS + ES modules，无构建、无依赖 |
| 数据层级 | 任务 + 分组两层 |
| 详情页内容 | 标题、备注、子任务、截止日期、分组、创建/完成时间、删除 |
| 重要事项样式 | **整行淡红底**，文字保持常规深色（不加粗、不变红字、不加左条） |
| 完成后 | 从活动列表移除，收进该组末尾的"已完成 N 项"折叠行 |
| 首页布局 | 所有分组同一页向下排，不在标签页里切换 |
| 主题 | 亮/暗双主题，CSS 变量，自动跟随系统 |
| 页面跳转 | 单页 + hash 路由（`#/task/<id>`） |
| 部署 | GitHub Pages |
| PWA | **轻量版**：manifest + 图标 + iOS meta，全屏无地址栏。**不做 Service Worker**（2026-10-16 修订） |

## 开发环境注意事项

- **本地预览不能双击 `index.html`**。ES modules 在 `file://` 下会被浏览器 CORS 拦截，必须起静态服务器（`node tools/serve.mjs 8000`）。GitHub Pages 上无此问题。
- 本机 git 已设置 `git config --global http.schannelCheckRevoke false`。这是 2026-10-15 为修复国内网络下 `npx skills add` 无法 clone GitHub 而设的（schannel 证书吊销检查超时）。改动是全局的，若以后 git 出现证书问题可回退此项。
- 本机未安装 `gh` CLI，推送用原生 git。

## 已安装的 skill

只保留一个：`.claude/skills/mobile-app-ui-design/`（8 点栅格、60/30/10 配色、拇指区、44pt 触控目标）。设计文档 §6.4 的视觉系统就是按它写的。

另外两个（`design-mobile-apps`、`design-taste-frontend`）经审查对本项目无用，已于 2026-10-15 删除。踩坑经过见 [docs/会话记录与待恢复项.md](docs/会话记录与待恢复项.md) §4——**核心教训：`npx skills add` 之后必须读 `SKILL.md`，安装量高不代表符合用途。**

## 开发流程

本项目走 Superpowers 流程：brainstorming（已完成）→ writing-plans（已完成）→ 实施（已完成 15 个任务）→ 最终审查（已完成）。

**每改动一处，至少跑这两样**：

```bash
node --test                      # 单元测试：数据层、存储层、路由、拖拽落点计算
node tools/run-browser-tests.mjs # 浏览器回归：界面层（需要先跑着 node tools/serve.mjs 8000）
```

浏览器回归测试在 `tests/browser/`，说明见那里的 README。**它们是必要的**——实施期间抓到两个单测结构上抓不到的缺陷（一个是重渲染丢光标，一个是提示条把顶栏 `⋯` 盖住）。

## 这个项目上踩过的坑（别再踩）

- **`window.prompt` / `window.confirm` 在无头浏览器里会永久阻塞**，任何自动化里都要先替换掉。
- **无头模式下页面不产生新帧，`requestAnimationFrame` 不回调**。拖拽的落点计算靠它调度，写自动化时要装替身，且 `location.reload()` 之后要**重装**（新窗口的原生 rAF 会把它冲掉）。
- **给页面种数据必须在 iframe 首次加载之前**从父页面写。用「先加载再 `setItem` + `reload`」会被应用的 `pagehide` 兜底覆盖——那是正确行为，不是 bug。
- **验证「某个按钮还能不能点」必须用真实坐标命中测试**（`elementFromPoint` + 在该坐标派发 click）。程序化 `.click()` 绕过命中判定，发现不了遮挡。
- **「存储写满」不能用「塞满无关键」来测**。应用写的是自己的键，属于等量覆盖，配额满了通常仍然成功。必须让那个键的写入真的抛 `QuotaExceededError`。
- **Edge 无头模式在 Windows 下有最小窗口宽度约 492 CSS px**，`--window-size=390` 会被钳到 492 但截图仍按 390 裁切，右侧内容被切掉。要看 390px 手机视口，用 `tests/browser/` 里那种 iframe 包一层。
