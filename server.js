/*
 * Flash Charge Viz · 本地服务器
 * 静态资源 + 三个轻量 API（访问统计 / 地理编码 / 驾车路线规划）
 *
 * 用法：
 *   node server.js                    # http://localhost:8080
 *   AMAP_KEY=你的高德Key node server.js   # 路线规划走真实高德路网（可选）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const AMAP_KEY = process.env.AMAP_KEY || '';

/* ---------- MIME ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

/* ---------- 访问统计（本地文件持久化） ---------- */
const STATS_FILE = path.join(ROOT, '_stats.json');
function readStats() {
  try {
    const j = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
    return { views: j.views || 0, visitors: j.visitors || 0, vids: Array.isArray(j.vids) ? j.vids : [] };
  } catch (e) {
    return { views: 0, visitors: 0, vids: [] };
  }
}
function writeStats(s) {
  try { fs.writeFileSync(STATS_FILE, JSON.stringify(s)); } catch (e) { /* 只读环境忽略 */ }
}

/* ---------- 地理编码：城市坐标词典（省会 + 主要城市） ---------- */
const CITY_COORDS = {
  '北京': [116.407, 39.904], '天津': [117.201, 39.084], '上海': [121.474, 31.230], '重庆': [106.551, 29.563],
  '石家庄': [114.515, 38.042], '太原': [112.549, 37.857], '呼和浩特': [111.749, 40.842], '沈阳': [123.432, 41.806],
  '长春': [125.324, 43.887], '哈尔滨': [126.535, 45.804], '南京': [118.797, 32.060], '杭州': [120.155, 30.274],
  '合肥': [117.227, 31.820], '福州': [119.296, 26.074], '南昌': [115.858, 28.683], '济南': [117.120, 36.651],
  '郑州': [113.625, 34.746], '武汉': [114.305, 30.593], '长沙': [112.939, 28.228], '广州': [113.264, 23.129],
  '南宁': [108.366, 22.817], '海口': [110.199, 20.044], '成都': [104.066, 30.572], '贵阳': [106.630, 26.647],
  '昆明': [102.833, 24.880], '拉萨': [91.117, 29.647], '西安': [108.940, 34.341], '兰州': [103.834, 36.061],
  '西宁': [101.778, 36.617], '银川': [106.231, 38.487], '乌鲁木齐': [87.617, 43.792], '香港': [114.169, 22.319],
  '澳门': [113.543, 22.187], '台北': [121.565, 25.033],
  '深圳': [114.058, 22.543], '苏州': [120.585, 31.299], '无锡': [120.312, 31.491], '常州': [119.974, 31.811],
  '徐州': [117.284, 34.205], '南通': [120.894, 31.980], '扬州': [119.412, 32.394], '镇江': [119.425, 32.187],
  '泰州': [119.923, 32.455], '盐城': [120.163, 33.348], '淮安': [119.015, 33.610], '连云港': [119.222, 34.597],
  '宿迁': [118.275, 33.963], '宁波': [121.550, 29.875], '温州': [120.699, 27.994], '嘉兴': [120.756, 30.746],
  '湖州': [120.087, 30.894], '绍兴': [120.580, 30.030], '金华': [119.647, 29.079], '衢州': [118.859, 28.936],
  '舟山': [122.207, 29.985], '台州': [121.421, 28.656], '丽水': [119.923, 28.467], '厦门': [118.089, 24.480],
  '福州': [119.296, 26.074], '泉州': [118.676, 24.874], '漳州': [117.647, 24.513], '莆田': [119.008, 25.454],
  '青岛': [120.383, 36.067], '大连': [121.615, 38.914], '烟台': [121.448, 37.464], '威海': [122.120, 37.513],
  '潍坊': [119.162, 36.707], '淄博': [118.055, 36.813], '临沂': [118.356, 35.104], '济宁': [116.587, 35.415],
  '东莞': [113.752, 23.021], '佛山': [113.122, 23.022], '珠海': [113.577, 22.271], '惠州': [114.416, 23.111],
  '中山': [113.393, 22.516], '汕头': [116.682, 23.354], '湛江': [110.359, 21.271], '三亚': [109.512, 18.253],
  '桂林': [110.290, 25.274], '柳州': [109.428, 24.326], '北海': [109.120, 21.481], '遵义': [106.927, 27.725],
  '大理': [100.267, 25.606], '丽江': [100.227, 26.855], '景洪': [100.797, 22.009], '西双版纳': [100.797, 22.009],
  '曲靖': [103.796, 25.490], '玉溪': [102.547, 24.352], '攀枝花': [101.718, 26.582], '绵阳': [104.679, 31.468],
  '宜宾': [104.643, 28.752], '乐山': [103.766, 29.552], '南充': [106.111, 30.837], '泸州': [105.442, 28.871],
  '洛阳': [112.454, 34.619], '开封': [114.307, 34.797], '南阳': [112.528, 32.991], '襄阳': [112.122, 32.010],
  '宜昌': [111.286, 30.692], '荆州': [112.240, 30.335], '黄冈': [114.872, 30.454], '十堰': [110.798, 32.629],
  '衡阳': [112.572, 26.893], '株洲': [113.134, 27.828], '湘潭': [112.944, 27.830], '岳阳': [113.129, 29.357],
  '常德': [111.699, 29.032], '郴州': [113.015, 25.771], '怀化': [110.002, 27.550], '赣州': [114.935, 25.831],
  '九江': [116.002, 29.705], '上饶': [117.943, 28.455], '芜湖': [118.433, 31.352], '蚌埠': [117.389, 32.916],
  '安庆': [117.063, 30.543], '唐山': [118.180, 39.631], '秦皇岛': [119.600, 39.935], '保定': [115.465, 38.874],
  '张家口': [114.886, 40.768], '沧州': [116.839, 38.304], '邯郸': [114.539, 36.626], '大同': [113.300, 40.077],
  '包头': [109.840, 40.657], '鄂尔多斯': [109.781, 39.608], '大庆': [125.104, 46.589], '吉林': [126.549, 43.838],
  '鞍山': [122.994, 41.108], '丹东': [124.354, 40.000], '营口': [122.219, 40.667], '延吉': [129.509, 42.891],
  '南宁': [108.366, 22.817], '梧州': [111.279, 23.477], '钦州': [108.654, 21.981], '防城港': [108.354, 21.687],
};

/* 从站点数据构建「城市 → 平均坐标」，优先用真实站点中心 */
let CITY_FROM_STATIONS = {};
try {
  const stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'byd_stations_full.json'), 'utf8'));
  const acc = {};
  stations.forEach(s => {
    if (!s.city || typeof s.lat !== 'number' || typeof s.lng !== 'number') return;
    const k = String(s.city).replace(/市$/, '');
    (acc[k] = acc[k] || []).push([s.lng, s.lat]);
  });
  Object.keys(acc).forEach(k => {
    const sum = acc[k].reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
    CITY_FROM_STATIONS[k] = [sum[0] / acc[k].length, sum[1] / acc[k].length];
  });
} catch (e) { console.warn('未读取到站点数据，地理编码仅用内置词典'); }

function geocode(text) {
  const t = String(text || '').trim();
  if (!t) return { error: 'empty' };
  const norm = t.replace(/市$/, '');
  // 1) 站点城市中心
  const stationMatch = Object.keys(CITY_FROM_STATIONS).find(c => t.includes(c) || norm === c);
  if (stationMatch) {
    const c = CITY_FROM_STATIONS[stationMatch];
    return { lng: c[0], lat: c[1], name: t, city: stationMatch + '市', level: 'city' };
  }
  // 2) 内置词典
  const dictMatch = Object.keys(CITY_COORDS).find(c => t.includes(c) || norm === c);
  if (dictMatch) {
    const c = CITY_COORDS[dictMatch];
    return { lng: c[0], lat: c[1], name: t, city: dictMatch + '市', level: 'city' };
  }
  return { error: '未找到「' + t + '」，请尝试填写城市名或精确地址' };
}

/* ---------- 路线规划 ---------- */
function haversine(a, b) {
  const R = 6371;
  const dLat = (b[1] - a[1]) * Math.PI / 180, dLng = (b[0] - a[0]) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, s)));
}

/* 本地直线模拟路线 */
function mockRoute(origin, destination) {
  const [lngA, latA] = origin, [lngB, latB] = destination;
  const distKm = haversine(origin, destination);
  const duration = Math.round(distKm / 80 * 3600); // 按 80km/h 估算
  const n = Math.max(8, Math.min(300, Math.ceil(distKm / 1.5)));
  const polyline = [], hw = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    polyline.push([lngA + (lngB - lngA) * t, latA + (latB - latA) * t]);
    hw.push(0);
  }
  return {
    polyline, hw,
    distance: Math.round(distKm * 1000),
    duration,
    highwayMeters: 0,
    highwayRatio: 0,
    mock: true,
  };
}

/* 真实高德路网（需 AMAP_KEY 环境变量） */
function amapRoute(origin, destination) {
  const url = 'https://restapi.amap.com/v3/direction/driving'
    + '?origin=' + encodeURIComponent(origin.join(','))
    + '&destination=' + encodeURIComponent(destination.join(','))
    + '&strategy=10&extensions=base&key=' + encodeURIComponent(AMAP_KEY);
  return new Promise(resolve => {
    const req = http.get(url, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          const p = j.route && j.route.paths && j.route.paths[0];
          if (!p || !p.steps) return resolve(null);
          const polyline = [], hw = [];
          let highwayMeters = 0, meters = 0;
          p.steps.forEach(st => {
            const seg = String(st.polyline || '').split(';').map(xy => {
              const a = xy.split(',').map(Number);
              return [a[0], a[1]];
            }).filter(a => a.length === 2 && a.every(Number.isFinite));
            if (!seg.length) return;
            const isHw = /高速|大桥|快速路/.test(st.road || '');
            seg.forEach((pt, i) => {
              if (i > 0) {
                const d = haversine(seg[i - 1], pt);
                meters += d;
                if (isHw) highwayMeters += d;
              }
              polyline.push(pt);
              hw.push(isHw ? 1 : 0);
            });
          });
          if (polyline.length < 2) return resolve(null);
          resolve({
            polyline, hw,
            distance: Math.round(meters * 1000),
            duration: Number(p.duration) || 0,
            highwayMeters: Math.round(highwayMeters * 1000),
            highwayRatio: Math.round(highwayMeters * 1000) / Math.round(meters * 1000),
            mock: false,
          });
        } catch (e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
  });
}

/* ---------- 请求体解析 ---------- */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

/* ---------- 静态文件 ---------- */
function serveStatic(res, pathname) {
  let file = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 Not Found'); return; }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

/* ---------- 主服务 ---------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;

  if (p === '/api/stats') {
    const s = readStats();
    if (req.method === 'POST') {
      try {
        const b = await readBody(req);
        s.views++;
        if (b.vid && !s.vids.includes(b.vid)) { s.vids.push(b.vid); s.visitors = s.vids.length; }
        writeStats(s);
      } catch (e) { /* 忽略坏请求 */ }
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ views: s.views, visitors: s.visitors }));
    return;
  }

  if (p === '/api/geocode' && req.method === 'POST') {
    let b = {};
    try { b = await readBody(req); } catch (e) { /* 忽略 */ }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(geocode(b.address)));
    return;
  }

  if (p === '/api/route' && req.method === 'POST') {
    let b = {};
    try { b = await readBody(req); } catch (e) { /* 忽略 */ }
    const parse = v => {
      const a = String(v || '').split(',').map(Number);
      return a.length === 2 && a.every(Number.isFinite) ? a : null;
    };
    const origin = parse(b.origin), destination = parse(b.destination);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    if (!origin || !destination) { res.end(JSON.stringify({ error: '参数不完整' })); return; }
    let route = null;
    if (AMAP_KEY) route = await amapRoute(origin, destination);
    if (!route) route = mockRoute(origin, destination);
    res.end(JSON.stringify(route));
    return;
  }

  if (p === '/') { serveStatic(res, '/index.html'); return; }
  serveStatic(res, p);
});

server.listen(PORT, () => {
  console.log('⚡ Flash Charge Viz 本地版已启动');
  console.log('   http://localhost:' + PORT);
  console.log(AMAP_KEY
    ? '   路线规划：高德真实路网（AMAP_KEY 已配置）'
    : '   路线规划：本地直线模拟（设置 AMAP_KEY 环境变量可走真实高德路网）');
});
