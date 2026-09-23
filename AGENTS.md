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

## 做完怎么验证

```sh
npm run typecheck   # 必须通过
npm test            # 必须通过
npm run build       # 必须通过
```

改了视觉：对照 M3E（Material 3 Expressive）风格检查，并更新 `qa/` 截图。改了 Sites 相关文件：加跑 `npm run test:sites`。

## 提交流程

- 分支 + PR，不要直接推 main。
- PR 按 `.github/PULL_REQUEST_TEMPLATE.md` 填写。
- 改了行为或边界：同步更新 `README.md` / `ROADMAP.md` / `docs/PRODUCT_BOUNDARIES.md` 中受影响的文档。
