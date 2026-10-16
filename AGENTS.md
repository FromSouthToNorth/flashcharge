# AGENTS.md

## 项目定位

flashcharge.site（比亚迪闪充站数据可视化）的本地仿制站。**结构/数据/算法忠实复刻，视觉方向重新设计**：
浅色「电网调度台」仪器面板风（tech-utility 方向）—— 冷调近白底、发丝级分隔线、等宽数字承担全部度量信息、
单一绿色强调色只用于主操作与激活态、三个品类色只用于数据编码。视觉规范见 [docs/brand-spec.md](docs/brand-spec.md)。

**地图与全部图表用 three.js 渲染，已完全移除 ECharts**（原重设计版是 ECharts 的，替换后 `assets/`
里不再有 echarts/china_map/省级分片）。three.js 用 r147 的 UMD 构建（`THREE` 全局 + 经典版
OrbitControls），以便在 `file://` 下也能直接打开。

页面为单页仪表盘，分节导航 01–09：概览 / 全国分布 / 长途规划 / 结构对比 / 城市排行 / 省份排行 /
今日新增 / 站点明细 / 人力薪酬。

- 无构建工具、无 package.json、无测试。改动后刷新 http://localhost:8080 验证。
- 站点数据为 2026-09-15 从原站下载的快照，不会自动更新。

## 运行

```bash
node server.js        # http://localhost:8080（纯 Node 内置模块，零依赖）
```

也可直接双击 `index.html`：数据已打包为脚本模块、省份边界按需注入 `<script>`，`file://` 下同样可用。
环境变量：`PORT`（默认 8080）；`AMAP_KEY`（可选，只影响 `/api/route`，页面本身不依赖该接口）。

## 架构要点（改代码前必读）

- **样式不使用 Tailwind**。全部在设计令牌之上手写：`assets/css/app.css` 顶部 `:root` 是令牌区
  （`--bg/--surface/--fg/--muted/--border/--accent` 六核心 + oklch 派生 + 墨色带 `--ink` 系列）。
  **three.js 材质与 canvas 用色必须用 hex**（three.js 不吃 CSS 变量），hex 换算表在
  `docs/brand-spec.md` 文末，代码里对应 `assets/js/core.js` 的 `PAL`。改色要两处同步。
- **three.js 图表一律走 `assets/js/three-kit.js`**，不要各图自己 `new THREE.WebGLRenderer`：
  它统一了场景/相机/光照/自适应/标签叠层/射线拾取。两条纪律：
  ① 渲染是**按需**的（改完调 `view.requestRender()`），不要自己起 rAF 循环；
  ② 容器尺寸变化用 `view.onResize(fit)` **只重算相机**——若在 resize 回调里重建场景，
  会再次触发 ResizeObserver 造成死循环（本仓库踩过）。
- **3D 上的文字一律用 HTML 叠层**（`.tk-labels` + `.tk-tag`/`.pie-center`，见 three-kit 的 `addLabel`），
  不要用 Sprite/canvas 贴图——HTML 更清晰、能选中、直接吃 CSS 令牌。
- **取景用 `TK.fitDistanceBox`**（透视感知，二分求最小可容纳距离），不要用已废弃的 `fitDistance`：
  后者按正交投影估算，近距离（长路线、多层柱）会明显偏小导致内容被裁。
- **JS 按模块拆分**，加载顺序有约束（`index.html` 里 `defer` 顺序即为依赖顺序）：
  `data/stations.js` → `data/workforce.js` → `data/routes.js` → `geo/provinces/index.js` →
  `core.js` → `map.js` → `workforce.js` → `route.js`。
  `route.js` 末尾的 `boot()` 是唯一入口（它调用 `renderWorkforce()`），**新模块必须排在 `route.js` 之前**，
  否则 `boot()` 立即执行时会找不到函数。
- **数据文件是生成物**：`assets/js/data/*.js` 与 `assets/geo/china.js` 由根目录 JSON/JS 打包而来，
  手改会被覆盖。更新数据的正确姿势：改根目录源文件 → `node tools/build-data.mjs .`。
- **全国边界来自 `china_map.js`**：原站用的是 ECharts 的**压缩 GeoJSON**（坐标是字符串编码），
  打包脚本 `tools/geojson-decode.mjs` 按 `geometry.encodeOffsets` 做 ZigZag + 增量解码后写成
  `window.FC_CHINA`。要点：`Polygon` 的 offsets 是 `[环]`，`MultiPolygon` 是 `[多边形][环]` 两层
  （少取一层会让黑龙江等省解出 `null`，且不报错）。解码正确性可用各省 `properties.cp`
  与解码后包围盒中心交叉验证。
- **地图下钻**：全国那份边界已含 34 省轮廓，下钻只需按该省包围盒取景 + 收窄站点集合
  （`curProv` / `defocusOthers`），**不再需要省级分片文件**（旧版的 `assets/geo/provinces/*` 已删除）。
- **人力与薪酬面板（09）**：数据源 `byd_workforce.json`（人工录入的年报/ESG 口径，与站点数据无关）。
  面板渲染在 `assets/js/workforce.js`，KPI 用 `.kpis/.kpi` 组件、图表用 `PAL` 配色。
  「全员人均」「倍差」是在 JS 里按 `pay.cashPaidToEmployees2025Yuan ÷ 期末员工数` 现算的，
  更新时只改基础数字，**别在 JSON 里手填倍差**；`notes` / `sources` 会原样渲染到页面，改数字时同步改说明。
- **长途规划**：真实驾车走廊离线库在 `assets/js/data/routes.js`；未收录的起终点对退化为直线估算，
  页面会显示琥珀色警示条明确标注 —— 不要伪造路网里程。
- **旧版深色页面**保留在 `index-dark.html`（依赖根目录的 `styles.css` / `echarts.min.js` /
  `china_map.js` / `provinces/*.json`）。这些根目录文件新版不用，但**不要删**，否则旧版会坏 ——
  同时它们也是 `tools/build-data.mjs` 的源（`china_map.js` → `assets/geo/china.js`）。

## 已知注意点

- 全部文本/JSON 为 UTF-8；在 Windows 上编辑勿改存为 GBK，否则中文乱码。
- `server.js` 的三个 API（`/api/stats`、`/api/geocode`、`/api/route`）**当前页面不再调用**，
  仅在接回真实数据时才有用；`_stats.json` 是其运行时产物，可安全删除。
- `qrcode.jpg` 是原站作者的赞赏码（旧版页面用），**重设计版页面已按用户要求移除赞赏入口**。
- 重设计版**没有**欢迎弹窗、没有留言板、没有任何 `<iframe>`；不要「顺手加回来」。

## 参考文档

- [README.md](README.md) — 运行方式、分节结构、更新数据、换肤与品牌。
- [docs/brand-spec.md](docs/brand-spec.md) — 设计令牌、对比度验证表、ECharts 用色换算表。
