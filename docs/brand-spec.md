# Flash Charge Viz · 重设计视觉规范（brand-spec）

> 复刻对象：`https://www.flashcharge.site`（比亚迪闪充站数据可视化，个人项目）
> 本次任务：**结构/数据/功能忠实复刻，视觉方向重新设计**。

## 一句话系统

以「电网调度台」为隐喻的浅色仪器面板：冷调近白底、发丝级分隔线、等宽数字承担全部度量信息，
单一绿色强调色只出现在主操作与激活态，三个品类色只用于数据编码。

## 方向来源

运行时方向库 `tech-utility`（Datadog / GitHub / Cloudflare dashboard），按其 `:root` 令牌**逐字绑定**，
其余颜色一律用 `oklch()` 派生。ECharts 的 zrender 不解析 `oklch()`，
故图表用色由 `RECON/tools/contrast.mjs` 从同一批 OKLch 值换算为等价 hex 后注入（换算表见文末）。

### 六个核心令牌（原样照抄方向库）

```css
--bg:      oklch(98% 0.005 250);
--surface: oklch(100% 0 0);
--fg:      oklch(22% 0.02 240);
--muted:   oklch(50% 0.018 240);
--border:  oklch(90% 0.008 240);
--accent:  oklch(58% 0.16 145);
```

### 派生令牌（oklch 生成，非臆造）

| 令牌 | 值 | 用途 |
|---|---|---|
| `--surface-2` | `oklch(96.5% 0.006 250)` | 表头、内嵌面板、hover 底色 |
| `--surface-3` | `oklch(94% 0.008 250)` | 行 hover、更强的嵌入层 |
| `--grid` | `oklch(95% 0.006 250)` | 表格行分隔线、图表分隔线 |
| `--border-strong` | `oklch(83% 0.01 240)` | 控件描边、表头下沿 |
| `--accent-deep` | `oklch(46% 0.13 148)` | 实心主按钮底色（白字 6.72:1） |
| `--accent-tint` | `oklch(96% 0.03 148)` | 激活态底纹 |
| `--c-highway` | `oklch(52% 0.15 250)` | 数据色：高速站 |
| `--c-brand` | `oklch(52% 0.17 305)` | 数据色：品牌站 |
| `--c-instation` | `oklch(55% 0.11 195)` | 数据色：站中站 |
| `--c-*-ink` | `oklch(40~42% …)` | 品类色在浅底上的文字版本（≥8.3:1） |
| `--warn` / `--warn-ink` | `oklch(66% 0.15 70)` / `oklch(45% 0.11 65)` | 需下高速、空闲为 0 |
| `--danger` / `--danger-ink` | `oklch(55% 0.19 25)` / `oklch(45% 0.18 25)` | 起终点图钉、下线 |
| `--offline` / `--road` | `oklch(66% 0.012 240)` / `oklch(62% 0.012 240)` | 下线站点、普通道路段 |

### 墨色带令牌（页首唯一的深色区）

| 令牌 | 值 | 对比度 |
|---|---|---|
| `--ink` | `oklch(20% 0.045 264)` `#0b152a` | 深蓝墨底；与原站平涂的 `#0a0e17` **刻意在蓝通道上拉开 19 级** |
| `--ink-2` | `oklch(32% 0.035 262)` | 墨带内分隔线 / hover 底 |
| `--ink-fg` | `oklch(98% 0.004 250)` | 墨带主文字 · 17.14:1 |
| `--ink-muted` | `oklch(72% 0.015 250)` | 墨带次要文字 · 7.33:1 |
| `--accent-soft` | `oklch(78% 0.15 148)` | 墨带上的强调绿 · 9.59:1 |
| `--c-*-on-ink` | `oklch(72~76% …)` | 品类图标在墨底上 · 7.36 / 7.51 / 8.81:1 |
| `--danger-soft` | `oklch(72% 0.15 25)` | 墨带上的危险色 · 6.86:1 |
| `--chip-up-bg` / `--chip-down-bg` | `oklch(29% 0.07 150)` / `oklch(29% 0.08 25)` | 增减徽章底 · 7.26 / 5.50:1 |

> 为什么需要这一组：深色底不能直接复用浅底上的品类色与状态色——
> `--c-highway` 在 `--ink` 上只有 3.52:1，`--danger` 只有 3.63:1，都够不上正文要求。
> 所以每个在墨带上出现的颜色都有对应的提亮版本，并逐一验过。

## 字体

```
--font-display: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif;
--font-body:    -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif;
--font-mono:    'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace;
```

- 方向库允许「sans 显示 + sans 正文」同族（工具型界面优先级高于编辑感）；中文在其后追加
  `'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC'`，不改变原栈顺序。
- **等宽字体自托管**：`assets/fonts/` 内含 JetBrains Mono 400/500/600/700 的拉丁 + 拉丁扩展 woff2
  （OFL-1.1），`fonts.css` 由 `RECON/tools/fetch-fonts.mjs` 生成。所有数字、里程、编号、ID 一律走等宽，
  并开启 `font-variant-numeric: tabular-nums`。
- 原站本身**没有任何 webfont**（recon：`fontFaces: 0`，`fonts: []`），所以「字体必须自托管真字体」这一条
  在原站侧无可搬运对象；本次自托管的是**重设计新增**的数字字体。

## 视觉语言规则（观察得出，构造时遵守）

0. **一条墨色带压住页首**（整页唯一的深色区）：`顶栏 + 分节导航 + 度量条` 三块共用 `--ink`，
   顶栏底边收一道 2px `--accent` 基线。这是全页唯一的「视觉锚点」——
   2026-09-15 复核发现：只有发丝线与浅灰的版本**整页 93% 是近白、强调色只占 0.06%**，
   在屏幕上读起来像「没做过设计」。加上墨色带后同一张图的像素构成变成
   **浅色 79.6% / 深色 12.3% / 强调绿 0.38%**，页首终于有了分量。
   墨色带**只出现在页首**，正文区一律回到纸白，不做条纹化处理。
1. **发丝线优先**：所有分隔、分区、表头一律 1px 实线（`--border` / `--grid` / `--border-strong` 三档）。
   **圆角只有三档**：面板与控件 `--r-md` 6px / `--r-lg` 8px；徽章、缩略色块 `--r-sm` 4px 与 2px；
   胶囊类（增减徽章、走廊快捷条）999px。**除模态框外不使用阴影。**
   **面板底色一律纯色**（`--surface`）；渐变只允许承担功能——`.tick-scale` 的刻度线、
   `.tick-scale` 的遮罩淡出——不得用于背景铺底。
2. **数字即信息**：度量条主数字 **34px** / 600 等宽（窄屏降到 27–30px）；
   面板标题 15px / 640；表格数字等宽右对齐；单位以 11px 跟随，不换行错位。
3. **一色一职**：绿色强调色只用于主操作与激活态；三个品类色只出现在数据标记、图例、品类标签上。
   页面级实心主按钮同一视口内至多一个。墨带上出现的颜色一律用 `*-on-ink` 提亮版本。
4. **无 emoji 图标**：原站的 🛣️🏢🏛️⚡📍 全部替换为同一套 1.6px 描边线性图标（内联 SVG sprite）。
5. **面板有头**：每个功能面板都有 48px 高的 `.panel-head`，左侧一枚**墨色等宽序号方块**（`--ink` 底 + `--ink-fg` 字）
   + 标题，右侧放该面板的控件。
   序号跟着分节导航走：当前为 **`01`–`08`**（`09 关于` 一节按用户要求整节删除后，页面收在 `08 站点明细`）。
   标题下方不再重复说明文字，口径说明统一放到 `.note` 或可折叠的 `details.spec` 里。
6. **表格密集**：行高约 30px，表头吸顶，`--grid` 行线，不隔行变色；行 hover 用 `--surface-3`（L −6），
   文字颜色保持 `--fg` 不变。

## 对比度验证

由 `RECON/tools/contrast.mjs` 计算并断言（详表见运行输出）：

| 配对 | 比值 | 要求 |
|---|---|---|
| 白字 / `--accent-deep`（主按钮） | 6.72 | ≥4.5 ✅ |
| `--fg` / `--bg` | 16.32 | ≥4.5 ✅ |
| `--muted` / `--bg` | 5.65 | ≥4.5 ✅ |
| `--c-highway-ink` / 白 | 9.08 | ≥4.5 ✅ |
| `--c-brand-ink` / 白 | 9.18 | ≥4.5 ✅ |
| `--c-instation-ink` / 白 | 8.39 | ≥4.5 ✅ |
| `--warn-ink` / 白 | 7.65 | ≥4.5 ✅ |
| `--danger-ink` / 白 | 8.18 | ≥4.5 ✅ |

`--accent`（58%）本身对白字仅 4.01:1，因此**只用于图形标记、激活点、焦点环**，不作为文字底色。

## 实现符合度自查（每次改动后重跑）

| 检查 | 方法 | 结果 |
|---|---|---|
| 核心令牌已绑定 | 浏览器读 `:root` 计算值 | `--bg` `oklch(98% 0.005 250)`、`--accent` `oklch(58% 0.16 145)`、`--ink` `oklch(20% 0.045 264)` ✅ |
| 样式表实际生效 | 计算样式：`body` 底色、`.metric-value` 字体、`.btn-primary` 底色 | 全部命中令牌 ✅ |
| 墨色带生效 | 顶栏 / 分节导航 / 度量条的计算底色 | 三处同为 `--ink` ✅ |
| 顶栏强调基线 | `border-bottom-width` | 2px `--accent` ✅ |
| 等宽数字 | `document.fonts.check('12px "JetBrains Mono"')` | `true` ✅ |
| 无渐变铺底 / 无额外阴影 | 全表扫描 `linear-gradient` / `box-shadow` | 仅刻度尺・遮罩・模态框 ✅ |
| 主数字 34px / 600 | 计算样式 | 34px / 600 ✅ |
| 无 emoji 图标 | 页面文本扫描 | 0 ✅ |
| 文字对比度 | `RECON/tools/verify-clone.mjs` 抽样 901×2 处 | 全部 ≥4.5 / ≥3 ✅ |
| 断点无溢出裁切 | `RECON/tools/audit-widths.mjs`（320→1920） | 8/8 通过 ✅ |

**这 10 条不是文档条款，是 `verify-clone.mjs` 里的可执行断言**——每次跑验证都会重查，改坏了会红。

复跑命令：`node RECON/tools/probe-style.mjs . <url>`（计算样式）、
`node RECON/tools/analyze-render.mjs . <png>`（渲染产物的像素构成）、
`node RECON/tools/compare-render.mjs . <a.png> <b.png>`（两条渲染路径逐带对比）。

> **2026-09-15 修订 A**：面板头去掉 `linear-gradient` 底纹、分段控件激活态去掉 `box-shadow`、
> 度量条主数字 28px → 30px、删除未使用的 `.tbl-fade`（含一处渐变）。
>
> **2026-09-15 修订 B（视觉锚点）**：复核发现整页 93% 近白、强调色仅占 0.06%，**在屏幕上像没做过设计**。
> 于是把「顶栏 + 分节导航 + 度量条」合成一条 `--ink` 墨色带（顶栏底边加 2px `--accent` 基线），
> 主数字 30 → 34px、面板标题 13.5 → 15px 并给序号加墨色方块、度量条内边距与外层度量整体放松。
> 墨色取 `oklch(20% 0.045 264)`，与原站平涂的 `#0a0e17` 在蓝通道上刻意拉开 19 级，避免看起来像回到原站。
> 渲染产物像素构成从「浅色 93.3% / 深色 0% / 强调 0.06%」变为「浅色 79.6% / 深色 12.3% / 强调 0.38%」。

## ECharts 换算表（由 OKLch 换算，非目测）

```json
{"ink":"#121c23","muted":"#5a656d","grid":"#ebeff2","border":"#d9dfe3","surface":"#ffffff",
 "surface2":"#f0f4f7","surface3":"#e7ecf0","highway":"#006bbb","brand":"#8048b6",
 "instation":"#008585","accent":"#299236","accentDeep":"#076b29","danger":"#c92f33",
 "warn":"#cb7f00","offline":"#8c9399","road":"#80878d",
 "heat1":"#e5f0fc","heat2":"#b1d6f6","heat3":"#5eade2","heat4":"#007ac5","heat5":"#00488f"}
```
