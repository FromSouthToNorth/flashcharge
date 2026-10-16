/* ============================================================================
   数据打包：把根目录的真实数据 JSON 生成页面直接可加载的数据模块
   用法: node tools/build-data.mjs [projectRoot]

   输入（根目录，覆盖这些文件即可更新数据）
     byd_stations_full.json   站点主数据（约 3 MB、8000+ 站）
     prev_day.json            昨日快照（统计卡增减徽章）
     new_today.json           今日新增站点
     byd_workforce.json       人力与薪酬（人工录入，与站点数据无关，可选）
     provinces/*.json          34 个省级 GeoJSON（ECharts 压缩格式，本脚本自动解码）
     china_map.js              全国边界（同样自动解码出 assets/geo/china.js）

   输出
     assets/js/data/stations.js   站点 + 昨日快照 + 今日新增
     assets/js/data/workforce.js  人力与薪酬（可选，缺失时不影响页面）
     assets/geo/china.js          全国 34 省边界（three.js 地图用）
     assets/geo/provinces/*.js    省级边界（按需 <script> 注入，免 fetch）
     assets/geo/provinces/index.js 省份简称 -> 文件名映射
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { decodeGeoJSON } from './geojson-decode.mjs';

const ROOT = path.resolve(process.argv[2] || '.');
const OUT_JS = path.join(ROOT, 'assets', 'js', 'data');
const OUT_GEO = path.join(ROOT, 'assets', 'geo');
fs.mkdirSync(OUT_JS, { recursive: true });
fs.mkdirSync(OUT_GEO, { recursive: true });

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const has = (p) => fs.existsSync(p);
const r5 = (v) => Math.round(v * 1e5) / 1e5;
const kb = (n) => (n / 1024).toFixed(0) + ' KB';

/* ------------------------------------------------------------ 1. 站点主数据 */
const src = read(path.join(ROOT, 'byd_stations_full.json'));
const stations = src.map((s) => ({
  n: s.name,
  lat: r5(s.lat), lng: r5(s.lng),
  a: s.address || '',
  p: s.province, c: s.city,
  g: s.superNum || 0,
  i: s.idleSuperNum || 0,
  k: s.category,
  t: s.highwayTag || s.brandTag || null,
  s: s.status === 'offline' ? 1 : 0,
  seen: s.lastSeen || '',
  rc: s.recheckDate || '',
}));

const prevDay = has(path.join(ROOT, 'prev_day.json')) ? read(path.join(ROOT, 'prev_day.json')) : null;
const newToday = has(path.join(ROOT, 'new_today.json')) ? read(path.join(ROOT, 'new_today.json')) : null;

let out = '/* 站点主数据 · 原站公开数据（https://www.flashcharge.site/byd_stations_full.json）\n';
out += '   字段压缩: n=名称 a=地址 p=省 c=市 g=闪充枪 i=空闲枪 k=分类 t=子标签 s=下线 seen=最后在线 rc=复核日 */\n';
out += 'window.FC_DATA = window.FC_DATA || {};\n';
out += 'window.FC_DATA.stations = ' + JSON.stringify(stations) + ';\n';
out += 'window.FC_DATA.prevDay = ' + JSON.stringify(prevDay) + ';\n';
out += 'window.FC_DATA.newToday = ' + JSON.stringify(newToday) + ';\n';
fs.writeFileSync(path.join(OUT_JS, 'stations.js'), out);
console.log('  stations.js    ' + stations.length + ' 站   ' + kb(Buffer.byteLength(out)));

/* ------------------------------------------------------------ 2. 人力与薪酬 */
if (has(path.join(ROOT, 'byd_workforce.json'))) {
  const wf = read(path.join(ROOT, 'byd_workforce.json'));
  let wfOut = '/* 比亚迪人力与薪酬 · 年报 / ESG 口径（人工录入，与站点数据无关）\n';
  wfOut += '   源文件: byd_workforce.json（改数字请改该 JSON，再跑 tools/build-data.mjs） */\n';
  wfOut += 'window.FC_WORKFORCE = ' + JSON.stringify(wf) + ';\n';
  fs.writeFileSync(path.join(OUT_JS, 'workforce.js'), wfOut);
  console.log('  workforce.js   ' + (wf.pay && wf.pay.people ? wf.pay.people.length : 0) + ' 名董监高   ' + kb(Buffer.byteLength(wfOut)));
} else {
  console.log('  workforce.js   跳过（根目录没有 byd_workforce.json）');
}

/* --------------------------------------------------- 3. 全国边界（three.js 地图） */
/* china_map.js 里内嵌了 echarts.registerMap('china', {...})，坐标是 ECharts 压缩格式；
   这里用括号配平取出对象、解码成普通经纬度，写成页面直接可用的数据模块。
   全国这份已含 34 个省级行政区的完整轮廓，下钻只需按省包围盒取景，无需分片文件。 */
function extractChinaGeo() {
  const file = path.join(ROOT, 'china_map.js');
  if (!has(file)) return null;
  const s = fs.readFileSync(file, 'utf8');
  const key = s.indexOf("registerMap('china'");
  if (key < 0) return null;
  const start = s.indexOf('{', key);
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let k = start; k < s.length; k++) {
    const c = s[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  if (end < 0) return null;
  return decodeGeoJSON(JSON.parse(s.slice(start, end)));
}

const china = extractChinaGeo();
if (china) {
  const out = '/* 全国 34 个省级行政区边界（由 china_map.js 解码，three.js 地图用）\n'
    + '   源: china_map.js · 更新边界请替换该文件后重跑 tools/build-data.mjs */\n'
    + 'window.FC_CHINA = ' + JSON.stringify(china) + ';\n';
  fs.writeFileSync(path.join(ROOT, 'assets', 'geo', 'china.js'), out);
  console.log('  china.js       全国 ' + china.features.length + ' 省   ' + kb(Buffer.byteLength(out)));
} else {
  console.warn('  china.js       跳过（未能在 china_map.js 中找到全国边界）');
}
console.log('完成。');
