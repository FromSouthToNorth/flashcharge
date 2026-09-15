# AGENTS.md

## 项目定位

flashcharge.site（比亚迪闪充站数据可视化）的本地仿制站：单页深色仪表盘，含统计卡片、ECharts 全国地图（散点/热力图 + 省份下钻）、长途充电规划（动态规划算法）、城市/省份排行榜、今日新增站点等模块。

- 无构建工具、无 package.json、无测试、非 git 仓库。改动后直接在浏览器打开 http://localhost:8080 验证。
- 站点数据为 2026-09-15 从原站下载的快照，不会自动更新。

## 运行

```bash
node server.js        # http://localhost:8080（纯 Node 内置模块，零依赖）
```

环境变量：`PORT`（默认 8080）；`AMAP_KEY`（可选，设置后 `/api/route` 走真实高德驾车路网；不设置则返回直线模拟路线，页面摘要会标注「本地直线模拟」）。

## 架构要点（改代码前必读）

- **index.html 单文件承载全部逻辑**：页面结构 + 内联 JS（统计、地图、排行榜、路线规划 DP）都在这一个文件里。改行为只改 index.html。
- **styles.css**：编译版 Tailwind v3.4.17 + 原站自定义组件类，文件末尾有手写的「补充工具类」块。HTML 中新增的 Tailwind 类若不在编译结果里，必须手动追加到该块，否则样式静默失效。
- **静态数据文件**（客户端 fetch，可独立替换）：
  - `byd_stations_full.json` — 权威站点数据（约 3MB、8000+ 站），由 `<head>` 中 `window.__dataFetch` 预取，勿内联进 HTML；
  - `prev_day.json`（昨日快照，驱动增减徽章）、`new_today.json`（今日新增）— 均可选，缺失时代码静默降级。
- **provinces/*.json**：34 个省级 GeoJSON，供地图下钻。`PROV_FILE` 映射的键**不带「省」后缀**（如 `'云南'` 而非 `'云南省'`；陕西对应文件 `shanxi1`）。用错名称会静默无效（无报错）。
- **server.js**：静态文件服务 + 三个 API——`/api/stats`（浏览量计数，持久化到 `_stats.json`）、`/api/geocode`（站点城市中心 + 内置城市词典）、`/api/route`（高德或直线模拟）。

## 已知注意点

- 全部文本/JSON 为 UTF-8；在 Windows 上编辑勿改存为 GBK，否则中文乱码。
- `qrcode.jpg` 是原站作者的赞赏码图片，部署前应替换；留言板由 index.html 中 `FEEDBACK.formUrl/boardUrl` 控制（为空 = 禁用，填入腾讯文档表单链接即启用）。
- 更新数据 = 从原站重新下载 `byd_stations_full.json`、`prev_day.json`、`new_today.json` 覆盖即可，无需改代码。
- `_stats.json` 是运行时生成的访问统计，可安全删除。

## 参考文档

- [README.md](README.md) — 运行方式、目录结构、API 与可配置项说明。
