# AGENTS.md — 给 Coding Agent 的工作指南

这份文件告诉每个进来的 Coding Agent：这个项目是什么、不能做什么、做完怎么验证。先读完再动手。

## 这是什么

Agent Studio Web：一个**个人使用的智能体工作台 UI 原型**。用来设计智能体（要件、脚手架、编排），并用**模拟数据**体验运行、Trace、评估、版本比较的完整闭环。

技术栈：React 19 + TypeScript + React Flow + Vite。**纯前端，没有后端。**

## 红线（不要做的事）

- **不要把模拟伪装成真实。** 所有运行结果、Trace、评分、指标都是演示数据。未接入真实执行引擎前，这类 UI 必须带"模拟/演示"标识。详见 `docs/PRODUCT_BOUNDARIES.md`。
- **不要引入后端。** 不装数据库、不加 API 服务、不接模型调用、不放任何密钥。除非用户明确要求。
- **不要碰 Sites 交接文件。** `.openai/hosting.json`、`worker/index.js`、`scripts/prepare-sites-build.mjs`、`tests/sites-worker.test.mjs` 是给 Sites 部署预留的，改动前先问。

## 结构指引

- `src/` — 全部应用代码。三大核心模块：编排画布（`Canvas.tsx`）、成员脚手架等配置页（`ConfigPages.tsx`）、试运行/Trace/评估等观察页（`ObservePages.tsx`）。
- `src/domain.ts` — 领域模型与逻辑，配套测试 `src/domain.test.ts`。
- `src/data/demo-data.json` — 贯穿"研究员→核验员→撰稿员"案例的演示数据。改 UI 需要数据时优先改这里，不要在组件里硬编码假数据。
- `qa/` — 关键界面的截图证据，做视觉改动后更新对应截图。
- `README.md` — 给人看的项目说明；`ROADMAP.md` — 方向与 use case；`docs/PRODUCT_BOUNDARIES.md` — 模拟 vs 真实的判定规则。

## 认领机制（多智能体怎么分工）

认领规则只在本文档维护，其它文件只引用不重复。

- **先认领，再动工。** 任何非微小改动前，先在 GitHub 开一个 issue：标题写对应的 UC 编号和条目（如 "UC3：自定义输入的完整模拟轨迹"），正文说明打算改哪些**页面组件**（不是文件）。这避免两个 Agent 撞同一组件。
- **认领 = issue + assign/标注。** 开 issue 后把自己 assign 上去，或在正文明确写"认领"。已有他人 assign 的 issue 不要重复动工。
- **改动走 issue → PR 流程。** 每个改动先开 issue，再开分支、提 PR 并关联 issue（PR 正文 `Closes #N`），合并后才算完成。不要直接提交到 main。
- **任务按页面组件拆分。** 认领时说清改哪个组件；跨页面共享的状态形状必须走 `src/types.ts` + `src/domain.ts`。

## 技术约定（多 Agent 并行时最容易各自发明的部分）

- **任务按页面组件拆分，不按文件拆分。** `Canvas.tsx` / `ConfigPages.tsx` / `ObservePages.tsx` 各含多个页面组件，两个任务撞同一文件是常态（认领方式见上文"认领机制"）。
- **状态只有一个入口。** `App.tsx` 集中持有全部状态，通过 `StudioApi` prop 传递；`setDraft` 是改草稿的唯一入口；localStorage 持久化只允许在 `App.tsx`。UI 局部状态（面板开关、撤销栈等）留在组件内部，不要塞进 draft（会污染快照和 dirty 判断）。
- **样式按页面文件放。** 类名前缀跟随页面（`canvas-` / `config-` / `obs-`），颜色、圆角、字号只能用 `docs/DESIGN.md` 令牌表里的值。
- **组件分级。** `src/ui.tsx` 是共享原语（Icon/Badge/Button/Field/Modal/Status/Empty）；页面内的局部辅助组件留在页面文件里；一个组件被第二个页面使用时才提升到 `ui.tsx`。
- **禁区（改动前先问）。** `App.tsx` 的集中状态结构（不要拆成 Context/reducer）、`domain.ts` 的 `validateState`（与存量 localStorage 数据兼容，收紧校验会让旧备份读不出）、`demo-data.json` 的 fixture id（`team-v1`、`run-baseline`、`agent-researcher` 等被测试和 UI 硬编码引用）。

## 数据兼容约定

配置、快照、备份都存在浏览器 localStorage。改 `src/domain.ts` 的数据模型时：

- 新增字段必须有默认值，旧数据缺该字段时仍能恢复。
- 不删除、不改名已有字段；确实要改，在 `validateState` 里做迁移（读旧字段写新字段），并在 PR 里说明。
- 每条 `validateState` 覆盖的字段变更，都要在 `src/domain.test.ts` 加对应测试。

## 做完怎么验证

```sh
npm run typecheck   # 必须通过
npm test            # 必须通过
npm run build       # 必须通过
```

改了视觉：颜色/圆角/字号只能用 `docs/DESIGN.md` 令牌表中的值；完成后用截图与 `qa/` 中对应基准图对比（截图方式：本地启动应用后在浏览器手动截取，命名与 `qa/` 现有文件风格一致），有明显偏移时在 PR 里说明原因并更新基准图。改了 `domain.ts`：加对应测试。改了 Sites 相关文件：加跑 `npm run test:sites`。

## 模拟边界的技术落点

新代码产生运行/评分/指标类 UI 时：数据必须来自 `src/data/demo-data.json` 或 `domain.ts` 的 synthetic 生成路径；界面必须带模拟标识；`synthetic: true`、`model_called: false` 字段不可绕过（`validateState` 会硬性检查，绕过会直接被拒）。

## 提交流程

- 分支 + PR，不要直接推 main。分支名建议 `feat/<主题>` 或 `fix/<主题>`；PR 标题一句话说清改了什么。
- PR 按 `.github/PULL_REQUEST_TEMPLATE.md` 填写。
- 改了行为或边界：同步更新 `README.md` / `ROADMAP.md` / `docs/PRODUCT_BOUNDARIES.md` 中受影响的文档。
