# Flash Charge Viz · 本地仿制站（重设计版 · three.js）

仿造自 https://www.flashcharge.site ——「比亚迪闪充站数据可视化」个人项目。
**结构与数据忠实复刻，视觉方向重新设计**：浅色「电网调度台」仪器面板 —— 冷调近白底、发丝级分隔线、
等宽数字承担全部度量信息、单一绿色强制色只用于主操作与激活态，三个品类色只用于数据编码。

**地图与全部图表由 three.js 渲染**（无 ECharts）：全国地图是 3D 拉伸的省份薄板 + 站点实例化标记
（高速▲ / 品牌■ / 站中站● 三种形状），可拖拽旋转、滚轮缩放、点击下钻；构成环形、省份堆叠、
长途路线、人力四图同样是 3D 场景。文字用 HTML 叠层呈现（清晰、可选中、跟随设计令牌）。

- **交付入口**：`index.html`（`file://` 直开与 http 服务两种形态都可用）
- **数据快照**：2026-09-15（8,216 站 / 341 城市 / 32 省）
- **视觉规范**：`docs/brand-spec.md`（令牌、对比度验证表、ECharts 用色换算表）

## 快速开始

```bash
node server.js          # http://localhost:8080
```

或直接双击 `index.html`（数据已打包为脚本模块，`file://` 下同样可加载）。

## 页面结构（分节导航 01–09）

| # | 分节 | 内容 |
| --- | --- | --- |
| 01 | 概览 | 六格墨色度量条：累计站点 / 累计枪数 / 高速 / 品牌 / 站中站 / 覆盖城市（含较昨日增减徽章） |
| 02 | 全国分布 | three.js 3D 全国地图（散点 · 热力 · 三类筛选）+ 省份下钻，可旋转缩放 |
| 03 | 长途规划 | 动态规划选站、可达性分级（服务区／高速出口／需下高速／顺路）、3D 路线图、27 条真实驾车走廊离线库 |
| 04 | 结构对比 | 三大类构成 3D 环形 + 各省份三分类 3D 堆叠条（前 20 省） |
| 05 | 城市排行 | 341 城按总枪数排序，点击任意数字打开该城站点明细弹窗（按区县分组） |
| 06 | 省份排行 | 32 省三类口径排行 |
| 07 | 今日新增 | 本次更新新增 107 站，按三类筛选 + 关键词搜索 |
| 08 | 站点明细 | 高速 / 品牌 / 站中站三个页签的完整站点表（含下线标注） |
| 09 | 人力薪酬 | 比亚迪人力与薪酬：员工总数 / 社保覆盖 / 岗位与学历结构 / 薪酬梯度 / 董监高薪酬明细 |

## 目录结构

```
index.html                  交付入口（重设计版）
index-dark.html             旧版深色页面备份（保留可对比；入口不在导航里，直接访问该文件即可）
assets/css/app.css          设计令牌 + 全部组件样式 + three.js 叠层样式（无 Tailwind）
assets/js/three-kit.js      three.js 图表工具层：场景/相机/光照/取景/标签叠层/射线拾取
assets/js/core.js           数据归一化 / 统计 / 排行 / 明细 / 弹窗 / 分节导航
assets/js/map.js            3D 全国地图（省板 + 站点实例）+ 构成与省份堆叠 3D 图 + 3D 路线专图
assets/js/route.js          长途充电规划（投影 / 可达性 / 动态规划 / 顺路补点）
assets/js/workforce.js      人力与薪酬面板（第 09 节，四张 3D 图）
assets/js/data/*.js         打包后的数据模块（由根目录 JSON 生成，勿手改）
assets/geo/china.js         全国 34 省边界（由 china_map.js 解码；地图与下钻都用它）
assets/fonts/               自托管 JetBrains Mono（OFL-1.1），全部数字走等宽
assets/vendor/three/        three.min.js（r147，UMD）· OrbitControls.js

byd_stations_full.json      站点主数据（权威源，更新数据改这里）
prev_day.json / new_today.json   昨日快照 / 今日新增
byd_workforce.json          人力与薪酬数据（人工录入的年报口径）
provinces/*.json            省级 GeoJSON 源文件

tools/build-data.mjs        数据打包：根目录 JSON -> assets/js/data/*.js
server.js                   本地静态服务器（另含可选 API，见下）
```

## 更新数据

1. 用新数据覆盖根目录的 `byd_stations_full.json` / `prev_day.json` / `new_today.json`
   （人力薪酬改 `byd_workforce.json`；省份边界改 `provinces/*.json`）。
2. 重新打包：

```bash
node tools/build-data.mjs .
```

3. 刷新页面。**不要手改 `assets/js/data/` 与 `assets/geo/` 下的文件**，它们每次打包都会被覆盖。

> 全国边界由 `china_map.js` 解码而来（原站用的 ECharts 压缩 GeoJSON，打包脚本会按 `encodeOffsets`
> 做 ZigZag + 增量解码）。换地图数据就替换 `china_map.js` 再重跑打包。

## 长途规划：离线走廊库

原站的路线来自后端高德接口。本站在 `assets/js/data/routes.js` 内置 **27 条真实驾车走廊**
（北京→上海、昆明→成都、兰州→乌鲁木齐 等，采自原站 `/api/route`），规划面板下方有
「已收录真实走廊」快捷条可一键填入。未收录的起终点对退化为**直线估算**，页面会显示琥珀色警示条
明确标注「按直线路径估算、里程不是行驶里程、无法区分高速」——不伪造路网里程。

## 本地服务器（可选）

`node server.js` 提供静态服务，并附带三个 API（重设计页面本身不依赖它们，接回真实数据时才用得上）：

| 接口 | 说明 |
| --- | --- |
| `POST /api/stats` | 访问统计（浏览量/访客），持久化在 `_stats.json` |
| `POST /api/geocode` | 地理编码：优先用站点城市中心，其次内置城市坐标词典 |
| `POST /api/route` | 驾车路线：配置高德 Key 走真实路网，否则本地直线模拟 |

```bash
# 让 /api/route 走真实高德路网（可选）
AMAP_KEY=你的高德Web服务Key node server.js      # Windows PowerShell: $env:AMAP_KEY="..."; node server.js
```

端口用 `PORT` 覆盖（默认 8080）。

## 换肤与品牌

- **设计令牌**：颜色/字体集中在 `assets/css/app.css` 顶部 `:root`，改一处即可换肤。
  three.js 与 canvas 用色需同步改 `assets/js/core.js` 的 `PAL`（three.js 材质不吃 CSS 变量，
  故保留一份 hex 换算表，见 `docs/brand-spec.md` 文末）。
- **站点名/副标题**：`index.html` 顶栏与 `<title>`；页脚在 `.pagefoot`。
- **足迹追踪**：页面不含任何统计或追踪脚本。

## 说明与许可

- 原站未声明 LICENSE（默认保留所有权利）。本副本**仅用于本地学习、研究与设计重做演示**，
  未经原作者许可不得公开重新部署。页脚保留了原站的数据来源与免责声明。
- 站点数据来自公开渠道，仅供参考。
- 第三方组件与许可见 `THIRD-PARTY-NOTICES.txt`（ECharts Apache-2.0、china_map 边界数据、
  JetBrains Mono OFL-1.1）。
