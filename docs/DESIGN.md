# 设计令牌（Design Tokens）

所有颜色、圆角、字号只能使用本文件列出的值。引入新值必须先更新本文件，再改代码。视觉一致性靠这张表，不靠"看起来差不多"。

## 颜色

优先使用 `src/styles.css` `:root` 里的 CSS 变量；不能走变量的场景（如 React Flow 节点样式）使用变量对应的 hex 值，禁止自造近似值。

| 语义 | 变量 | 值 | 用途 |
|---|---|---|---|
| primary | `--primary` | `#695095` | 主按钮、激活态、链接 |
| primary-dark | `--primary-dark` | `#4e357a` | 主按钮 hover |
| primary-container | `--primary-container` | `#e9ddfb` | 选中背景、强调容器 |
| surface | `--surface` | `#fffcff` | 卡片/面板背景 |
| surface-low | `--surface-low` | `#f4eff9` | 凹陷区域、次要背景 |
| app-background | — | `#f8f5fc` | 页面大背景 |
| outline | `--outline` | `#ded7e7` | 边框 |
| outline-soft | — | `#e9e0f2` | 弱边框、分割线 |
| text | — | `#282331` | 正文主色 |
| text-muted | `--muted` | `#776c81` | 次要文字 |
| focus-ring | — | `#a183cb` | 焦点环（3px solid + offset 3px） |
| success / success-container | `--success` | `#317158` / `#e2f0e7` | 成功状态（文字色必须配对容器色） |
| danger / danger-container | `--danger` | `#ae455a` / `#fbe4e8` | 失败/危险状态 |
| warning / warning-container | `--warning` | `#936422` / `#fbefd8` | 警告状态 |

禁止事项：不引入新 hex；不出现第二套状态色（历史上出现过 `#659679` 绿、`#b3261e` 红等，一律用上行 token）；状态徽章统一用 `Status` 组件的配对色。

## 圆角

| 级别 | 值 | 用途 |
|---|---|---|
| sm | 8px | badge、小标签 |
| md | 12px | 输入框、notice、表格元素 |
| lg | 20px | 面板、卡片 |
| full | 24px | 按钮、胶囊 |

## 字号

| 级别 | 值 | 用途 |
|---|---|---|
| xs | 10-11px | 辅助信息、eyebrow |
| sm | 12px | 正文密集区、表格 |
| md | 13px | 正文 |
| lg | 15-16px | 小标题（h3） |
| xl | 19px | 区块标题（h2） |
| xxl | 25-28px | 页面标题（h1） |

## 间距与阴影

- 间距以 4 的倍数为基准：4 / 8 / 12 / 16 / 24 / 32。
- 阴影最多两级：卡片悬浮（如 `0 2px 7px #4c316015`）和模态（如 `0 24px 80px #34223d35`）。

## 验收

改了视觉后：对照 `qa/` 里对应基准截图检查；有明显偏移时在 PR 里说明原因并更新基准图。
