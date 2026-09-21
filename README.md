# Flash Charge Viz · 仿造版（本地可运行）

仿造自 https://www.flashcharge.site ——「比亚迪闪充站数据可视化」个人项目。
深色仪表盘风格：暗底 `#0a0e17` + 琥珀/青色/翠绿三类口径配色，ECharts 全国地图散点/热力图、
省份下钻、长途充电规划（动态规划）、城市/省份排行榜、今日新增站点等模块完整保留；
另追加「比亚迪人力与薪酬」板块（员工总数 / 社保覆盖 / 高管与员工薪酬差距 / 生产岗与研发岗占比）。

## 快速开始

```bash
node server.js
```

浏览器打开 http://localhost:8080

## 目录结构

```
index.html              页面主体（含全部内联 JS 逻辑，与原站一致）
styles.css              Tailwind 编译样式 + 原站自定义组件样式 + 补充工具类
echarts.min.js          图表引擎
china_map.js            ECharts 中国地图注册（含南海诸岛）
byd_stations_full.json  站点全量数据（2026-09-15 快照，8216 站）
prev_day.json           昨日快照（统计卡增减徽章用）
new_today.json          今日新增站点
byd_workforce.json      人力与薪酬板块数据（员工总数/社保/薪酬/岗位结构，人工录入的年报口径）
provinces/              34 个省级 GeoJSON（地图下钻）
qrcode.jpg              赞赏码图片（原站资源，请替换为你自己的）
server.js               本地静态服务器 + 模拟 API
```

## 本地服务器提供的 API

| 接口 | 说明 |
| --- | --- |
| `POST /api/stats` | 访问统计（浏览量/访客），持久化在 `_stats.json` |
| `POST /api/geocode` | 地理编码：优先用站点城市中心，其次内置城市坐标词典 |
| `POST /api/route` | 驾车路线：配置高德 Key 走真实路网，否则本地直线模拟 |

### 使用真实高德路网（可选）

```bash
# Windows (PowerShell)
$env:AMAP_KEY="你的高德Web服务Key"; node server.js
# Linux / macOS
AMAP_KEY=你的高德Web服务Key node server.js
```

不配置时路线为「直线模拟」，页面摘要会如实标注「本地直线模拟」，其余功能不受影响。

## 可配置项

- **留言建议**：`index.html` 内 `const FEEDBACK = { formUrl: '', boardUrl: '' }`
  填入腾讯文档收集表链接即可开放留言板（原站即为此方案）。
- **赞赏码**：替换 `qrcode.jpg` 为你自己的收款码图片。
- **端口**：`PORT=9000 node server.js`
- **人力与薪酬数据**：编辑 `byd_workforce.json`（员工数、岗位与学历构成、社保覆盖、高管薪酬明细、
  说明与来源）。文件缺失时该板块自动降级为「暂不可用」，不影响其它模块。数字来源与口径说明见该文件的
  `notes` / `sources` 字段，会原样渲染到页面上。

## 说明

- 数据来自公开渠道（原站公开数据文件），仅供学习研究。
- 仿造仅用于学习参考，请勿用于商业用途。
