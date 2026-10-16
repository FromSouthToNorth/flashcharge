/* ============================================================================
   route.js · 长途充电规划
   算法（投影 / 可达性分级 / 动态规划 / 顺路补点）沿用原站实现，展示层重写。
   路径来源：本地离线走廊库（真实高德驾车路线，采自原站 /api/route）；
   未收录的起终点对退化为「直线估算」并明确标注，不伪造路网里程。
   ========================================================================== */
'use strict';

let routeChart = null;   /* 兼容占位：实际由 three.js 渲染 */
let lastRoutePlan = null;   /* 缓存上一次路线，改续航/走廊时不重复匹配 */
let routeProjCache = null;  /* 站点到路线的投影结果缓存（最贵的一段） */

/* ------------------------------------------------------------ 基础几何 */
function haversine(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const t = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, t)));
}

function cityCenter(name) {
  const n = normCity(name);
  const list = STATIONS.filter(function (s) { return normCity(s.city) === n; });
  if (!list.length) return null;
  return {
    lat: list.reduce(function (a, s) { return a + s.lat; }, 0) / list.length,
    lng: list.reduce(function (a, s) { return a + s.lng; }, 0) / list.length,
    n: list.length,
  };
}

/* 区县索引：由真实站点地址解析出的区县质心，替代原站的高德地理编码 */
const DISTRICT_INDEX = (function () {
  const m = {};
  STATIONS.forEach(function (s) {
    const d = districtOf(s);
    if (!d || d === '其他') return;
    const k = normCity(s.city) + d;
    if (!m[k]) m[k] = { lat: 0, lng: 0, n: 0 };
    m[k].lat += s.lat; m[k].lng += s.lng; m[k].n++;
  });
  return m;
})();

function resolvePoint(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const c = cityCenter(t);
  if (c) return { lng: c.lng, lat: c.lat, label: t, detail: normCity(t) + ' · ' + c.n + ' 座站的中心', precise: false };

  const key = normCity(t);
  let hit = DISTRICT_INDEX[key];
  if (!hit) {
    Object.keys(DISTRICT_INDEX).some(function (k) {
      if (k.length > key.length && k.slice(-key.length) === key) { hit = DISTRICT_INDEX[k]; return true; }
      return false;
    });
  }
  if (hit) {
    return {
      lng: hit.lng / hit.n, lat: hit.lat / hit.n, label: t,
      detail: t + ' · ' + hit.n + ' 座站的中心', precise: false,
    };
  }
  return null;
}

/* --------------------------------------------------- 离线走廊库匹配 */
function reverseRoute(r) {
  return {
    distance: r.distance, duration: r.duration,
    highwayMeters: r.highwayMeters, highwayRatio: r.highwayRatio,
    polyline: r.polyline.slice().reverse(),
    hw: r.hw.slice().reverse(),
    source: 'corridor', capturedAt: r.capturedAt,
  };
}

function findCorridor(A, B) {
  const R = window.FC_ROUTES || {};
  let best = null, bestScore = Infinity, rev = false;
  Object.keys(R).forEach(function (k) {
    const r = R[k];
    if (!r.fromCenter || !r.toCenter) return;
    const d1 = haversine(A, r.fromCenter) + haversine(B, r.toCenter);
    const d2 = haversine(A, r.toCenter) + haversine(B, r.fromCenter);
    if (d1 < bestScore) { bestScore = d1; best = r; rev = false; }
    if (d2 < bestScore) { bestScore = d2; best = r; rev = true; }
  });
  if (!best || bestScore > 120) return null;   /* 每端容差约 60 km */
  return rev ? reverseRoute(best) : Object.assign({ source: 'corridor' }, best);
}

/* 未收录走廊：直线估算（明确标注，不冒充路网里程） */
function estimateRoute(A, B) {
  const d = haversine(A, B);
  const N = 240;
  const pts = [], hw = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push([+(A.lng + (B.lng - A.lng) * t).toFixed(5), +(A.lat + (B.lat - A.lat) * t).toFixed(5)]);
    hw.push(0);
  }
  return { distance: d * 1000, duration: 0, polyline: pts, hw: hw, highwayMeters: 0, highwayRatio: 0, source: 'estimate' };
}

/* ----------------------------------------------------- 站点可达性分级 */
const ACCESS = {
  svc:  { label: '高速服务区', short: '服务区', color: PAL.accentDeep, note: '就在高速上，不用下高速' },
  exit: { label: '高速出口',   short: '出口',   color: PAL.warn,       note: '需下高速，出站即到' },
  city: { label: '需下高速',   short: '需下高速', color: PAL.danger,   note: '在高速外的城区，要下高速绕进去' },
  road: { label: '顺路可达',   short: '顺路',   color: PAL.road,       note: '在普通道路沿线，直接拐进去' },
};

/* 判定时同时看站名和地址：全国有数百座站地址里直接写着高速编号，站名却不带「服务区」 */
function accessOf(s) {
  const txt = String(s.name || '') + ' ' + String(s.address || '');
  if (/服务区/.test(txt)) return 'svc';
  if (/收费站|高速出口|高速入口|高速出入口/.test(txt)) return 'exit';
  if (/高速/.test(txt)) return 'exit';
  if (s.category === 'highway') return 'exit';
  return 'city';
}

/* 几何修正阈值（km）：名带「高速」只说明语义上属于高速系统，
   只有投影落在高速路段且直线偏离 ≤ NEAR_HW，才算真正顺路。 */
const NEAR_HW = 8;
const PENALTY_EXIT = 6;    /* 下高速→出站→再上高速的往返额外成本 */
const PENALTY_CITY = 16;   /* 下高速→进城→出城→上高速 */
const CITY_STOP_COST = 1000; /* 「少下高速」策略下一次下高速折算的代价，使其成为绝对优先目标 */

function detourCost(c) {
  if (!c.hw) return 2 * c.off;
  if (c.acc === 'svc') return 2 * c.off;
  if (c.acc === 'exit') return 2 * c.off + PENALTY_EXIT;
  return 2 * c.off + PENALTY_CITY;
}

/* 把折线按「高速 / 普通」切成连续段，用于地图分色 */
function splitByHw(poly, hw) {
  if (!hw || !hw.length) return [{ pts: poly, hw: 0 }];
  const segs = [];
  let cur = [poly[0]], curHw = hw[0] ? 1 : 0;
  for (let i = 1; i < poly.length; i++) {
    const h = hw[i] ? 1 : 0;
    cur.push(poly[i]);
    if (h !== curHw) { segs.push({ pts: cur, hw: curHw }); cur = [poly[i]]; curHw = h; }
  }
  if (cur.length > 1) segs.push({ pts: cur, hw: curHw });
  return segs.length ? segs : [{ pts: poly, hw: 0 }];
}

/* --------------------------------------------------------- 路线投影 */
function buildRouteIndex(poly, hw) {
  const cum = [0];
  for (let i = 1; i < poly.length; i++) {
    const kx = 111.32 * Math.cos(((poly[i - 1][1] + poly[i][1]) / 2) * Math.PI / 180);
    cum.push(cum[i - 1] + Math.sqrt(
      Math.pow((poly[i][0] - poly[i - 1][0]) * kx, 2) + Math.pow((poly[i][1] - poly[i - 1][1]) * 110.57, 2)
    ));
  }
  const total = cum[cum.length - 1];
  const step = Math.max(total / 1100, 0.4);
  const pts = [], cs = [], hs = [];
  let last = 0;
  for (let i = 0; i < poly.length; i++) {
    if (!pts.length || cum[i] - cs[cs.length - 1] >= step || i === poly.length - 1) {
      pts.push(poly[i]); cs.push(cum[i]);
      let ones = 0, zeros = 0;
      if (hw) for (let k = last; k <= i; k++) { if (hw[k]) ones++; else zeros++; }
      hs.push(hw ? (ones >= zeros ? 1 : 0) : 0);
      last = i;
    }
  }
  return { pts: pts, cum: cs, hw: hs, total: total };
}

function projectToRoute(idx, s) {
  let bestD = Infinity, bestS = 0, bestI = 1;
  for (let i = 1; i < idx.pts.length; i++) {
    const x0 = idx.pts[i - 1][0], y0 = idx.pts[i - 1][1], x1 = idx.pts[i][0], y1 = idx.pts[i][1];
    const kx = 111.32 * Math.cos(y0 * Math.PI / 180), ky = 110.57;
    const ax = x0 * kx, ay = y0 * ky, bx = x1 * kx, by = y1 * ky;
    const px = s.lng * kx, py = s.lat * ky;
    const vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
    const len2 = vx * vx + vy * vy;
    let t = len2 ? (wx * vx + wy * vy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.sqrt(Math.pow(px - (ax + t * vx), 2) + Math.pow(py - (ay + t * vy), 2));
    if (d < bestD) { bestD = d; bestS = idx.cum[i - 1] + t * (idx.cum[i] - idx.cum[i - 1]); bestI = i; }
  }
  return { d: bestD, s: bestS, hw: idx.hw[bestI] ? 1 : 0 };
}

function getProjected(route) {
  const key = Math.round(route.distance) + ':' + route.polyline.length;
  if (routeProjCache && routeProjCache.key === key) return routeProjCache.list;
  const idx = buildRouteIndex(route.polyline, route.hw);
  const list = [];
  for (let n = 0; n < STATIONS.length; n++) {
    const s = STATIONS[n];
    const p = projectToRoute(idx, s);
    const acc = accessOf(s);
    const item = { s: s, along: p.s, off: p.d, hw: p.hw, acc: acc };
    let kind = p.hw ? acc : 'road';
    const farHw = (acc === 'svc' || acc === 'exit') && !(p.hw && p.d <= NEAR_HW);
    if (farHw) kind = 'city';
    item.kind = kind;
    item.farHw = farHw;
    item.cost = detourCost(item);
    list.push(item);
  }
  list.sort(function (a, b) { return a.along - b.along; });
  routeProjCache = { key: key, list: list, idx: idx };
  return list;
}

/* --------------------------------------------------------- 动态规划 */
function planByDP(all, totalKm, eff, maxDetour, mode) {
  if (totalKm <= eff) return { list: [], blocked: false };
  const stops = all.filter(function (c) { return c.cost <= maxDetour && c.along > 0 && c.along < totalKm; });
  const n = stops.length;
  const BIG = Infinity;
  const stepCost = function (c) {
    return (mode === 'highway' && c.kind === 'city' ? CITY_STOP_COST : 0) + 1 + c.cost / 1000;
  };

  const cost = new Array(n).fill(BIG);
  const par = new Array(n).fill(-2);
  let bestCost = BIG, bestEnd = -1;

  for (let j = 0; j < n; j++) {
    const cj = stops[j];
    if (cj.along + cj.cost <= eff) { cost[j] = stepCost(cj); par[j] = -1; }
    for (let i = j - 1; i >= 0; i--) {
      if (cj.along - stops[i].along + cj.cost > eff) break;
      if (cost[i] === BIG) continue;
      const nc = cost[i] + stepCost(cj);
      if (nc < cost[j]) { cost[j] = nc; par[j] = i; }
    }
    if (cost[j] < BIG && totalKm - cj.along <= eff && cost[j] < bestCost) { bestCost = cost[j]; bestEnd = j; }
  }

  const build = function (end) {
    const seq = [];
    for (let k = end; k >= 0; k = par[k]) seq.push(k);
    seq.reverse();
    return seq.map(function (i) {
      const pi = par[i];
      return { c: stops[i], advance: stops[i].along - (pi >= 0 ? stops[pi].along : 0), detour: stops[i].cost };
    });
  };
  if (bestEnd !== -1) return { list: build(bestEnd), blocked: false };

  /* 整条路走不通：给出「最远能覆盖到哪里」的方案并明确标注走不通 */
  let far = -1;
  for (let j = 0; j < n; j++) {
    if (cost[j] < BIG && (far === -1 || stops[j].along > stops[far].along)) far = j;
  }
  return { list: far === -1 ? [] : build(far), blocked: true };
}

/* 「少下高速」模式的顺路补点：每个较大充电间隔内最多补一个真正贴主线的服务区/出口 */
function refineWithExits(plan, all, totalKm, eff, maxDetour, gapThresh) {
  if (!plan.length) return plan;
  const anchors = [0].concat(plan.map(function (p) { return p.c.along; })).concat([totalKm]);
  const chosen = {};
  plan.forEach(function (p) { chosen[p.c.s.name] = 1; });
  const extra = [];
  for (let g = 0; g < anchors.length - 1; g++) {
    const a = anchors[g], b = anchors[g + 1];
    if (b - a < gapThresh) continue;
    const cands = all.filter(function (c) {
      return c.along > a + 1 && c.along < b - 1 && c.cost <= maxDetour && !chosen[c.s.name]
        && (c.acc === 'svc' || c.acc === 'exit') && !c.farHw && c.off <= 2;
    });
    if (!cands.length) continue;
    cands.sort(function (x, y) {
      return Math.abs(x.along - (a + b) / 2) - Math.abs(y.along - (a + b) / 2) || (x.cost - y.cost);
    });
    const best = cands[0];
    const okPrev = (best.along - a + best.cost) <= eff;
    const nextStop = plan.filter(function (p) { return p.c.along > b - 1e-6; })[0] || null;
    const nextAlong = nextStop ? nextStop.c.along : totalKm;
    const okNext = (nextAlong - best.along + (nextStop ? nextStop.detour : 0)) <= eff;
    if (okPrev && okNext) {
      extra.push({ c: best, advance: best.along - a, detour: best.cost, inserted: true });
      chosen[best.s.name] = 1;
    }
  }
  const merged = plan.concat(extra).sort(function (p, q) { return p.c.along - q.c.along; });
  let prevA = 0;
  merged.forEach(function (p) { p.advance = p.c.along - prevA; prevA = p.c.along; });
  return merged;
}

/* ------------------------------------------------------------ 走廊快捷选 */
function renderCorridors() {
  const box = $('corridors');
  if (!box) return;
  const R = window.FC_ROUTES || {};
  const keys = Object.keys(R);
  if (!keys.length) { box.hidden = true; return; }
  box.insertAdjacentHTML('beforeend', keys.map(function (k) {
    const parts = k.split('|');
    const km = Math.round(R[k].distance / 1000);
    return '<button class="chip" type="button" data-corridor="' + esc(k) + '">' +
      esc(normCity(parts[0])) + '<span class="arrow">→</span>' + esc(normCity(parts[1])) +
      '<span class="dim mono" style="font-size:10.5px">' + km + 'km</span></button>';
  }).join(''));

  box.addEventListener('click', function (e) {
    const src = e.target instanceof Element ? e.target : e.target.parentElement;
    if (!src) return;
    const b = src.closest('[data-corridor]');
    if (!b) return;
    const parts = b.dataset.corridor.split('|');
    $('routeFrom').value = normCity(parts[0]);
    $('routeTo').value = normCity(parts[1]);
    planRoute();
  });
}

/* -------------------------------------------------------------- 主流程 */
function planRoute() {
  const sumEl = $('routeSummary');
  const mapEl = $('routeMap');
  const wrapEl = $('routeTableWrap');
  const tb = $('routeTbody');
  const from = $('routeFrom').value.trim();
  const to = $('routeTo').value.trim();
  const range = Math.min(800, Math.max(80, Number($('routeRange').value) || 300));
  const safety = Number($('routeSafety').value) || 0.85;
  const corridor = Number($('routeCorridor').value) || 10;
  const maxDetour = Number($('routeMaxDetour').value) || 25;
  const mode = $('routeMode').value || 'highway';
  const eff = range * safety;

  const fail = function (msg) {
    sumEl.hidden = false;
    sumEl.innerHTML = '<div class="banner" data-tone="danger">' +
      '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><use href="#i-alert"/></svg>' +
      '<span>' + msg + '</span></div>';
    mapEl.style.display = 'none';
    wrapEl.style.display = 'none';
  };

  if (!from || !to) return fail('请填写起点和终点。');

  sumEl.hidden = false;
  sumEl.innerHTML = '<div class="banner" data-tone="info"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><use href="#i-info"/></svg><span>正在定位起终点…</span></div>';

  const A = resolvePoint(from);
  const B = resolvePoint(to);
  if (!A) return fail('定位不到起点「' + esc(from) + '」。可以填城市（昆明），也可以精确到区县（昆明五华区）——本站按站点数据反推城市/区县中心。');
  if (!B) return fail('定位不到终点「' + esc(to) + '」。可以填城市（上海），也可以精确到区县（上海浦东新区）——本站按站点数据反推城市/区县中心。');
  if (Math.abs(A.lat - B.lat) < 0.02 && Math.abs(A.lng - B.lng) < 0.02) return fail('起点和终点太近了，不用规划。');

  let route = null;
  if (lastRoutePlan && lastRoutePlan.from === from && lastRoutePlan.to === to) route = lastRoutePlan.route;
  if (!route) {
    route = findCorridor(A, B) || estimateRoute(A, B);
    lastRoutePlan = { from: from, to: to, route: route };
  }

  const totalKm = route.distance / 1000;
  const cached = routeProjCache && routeProjCache.key === (Math.round(route.distance) + ':' + route.polyline.length);
  if (!cached) {
    sumEl.innerHTML = '<div class="banner" data-tone="info"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><use href="#i-info"/></svg><span>正在匹配沿途 ' + fmt(STATIONS.length) + ' 座站点…</span></div>';
  }

  const all = getProjected(route);
  const cand = all.filter(function (c) { return c.off <= corridor; });

  const dp = planByDP(all, totalKm, eff, maxDetour, mode);
  const blocked = dp.blocked;
  const refined = (mode === 'highway' && !blocked)
    ? refineWithExits(dp.list, all, totalKm, eff, maxDetour, Math.round(eff * 0.7))
    : dp.list;

  const plan = refined.map(function (p) {
    return {
      s: p.c.s, along: p.c.along, off: p.c.off, leg: p.advance,
      detour: p.detour, hw: p.c.hw, kind: p.c.kind, acc: p.c.acc, farHw: p.c.farHw,
      inserted: !!p.inserted,
    };
  });
  const cur = plan.length ? plan[plan.length - 1].along : 0;
  const finalLeg = totalKm - cur;
  const planSet = {};
  plan.forEach(function (p) { planSet[p.s.name] = 1; });
  const maxCost = plan.length ? Math.max.apply(null, plan.map(function (p) { return p.detour; })) : 0;
  const kindCount = { svc: 0, exit: 0, city: 0, road: 0 };
  plan.forEach(function (p) { kindCount[p.kind]++; });

  /* ---------------- 摘要 ---------------- */
  const est = route.source === 'estimate';
  const kpis = [];
  kpis.push('<div class="kpi"><div class="k">' + (est ? '直线距离' : '全程里程') + '</div><div class="v">' +
    totalKm.toFixed(est ? 0 : 1) + '<span class="u">km</span></div></div>');
  if (!est) {
    const hrs = Math.floor(route.duration / 3600);
    const mins = Math.round((route.duration % 3600) / 60);
    kpis.push('<div class="kpi"><div class="k">预计用时</div><div class="v">' +
      (hrs ? hrs + '<span class="u">h</span> ' : '') + mins + '<span class="u">min</span></div></div>');
  }
  kpis.push('<div class="kpi accent"><div class="k">推荐充电</div><div class="v">' + plan.length + '<span class="u">次</span></div></div>');
  kpis.push('<div class="kpi"><div class="k">单段上限</div><div class="v">' + Math.round(eff) + '<span class="u">km</span></div></div>');
  kpis.push('<div class="kpi"><div class="k">沿途可选</div><div class="v">' + cand.length + '<span class="u">站</span></div></div>');
  if (plan.length && maxCost > 0) {
    kpis.push('<div class="kpi' + (maxCost > 20 ? ' warn' : '') + '"><div class="k">最远实绕</div><div class="v">' + maxCost.toFixed(1) + '<span class="u">km</span></div></div>');
  }
  if (kindCount.city) {
    kpis.push('<div class="kpi danger"><div class="k">需下高速</div><div class="v">' + kindCount.city + '<span class="u">站</span></div></div>');
  }

  const kindChips = [
    kindCount.svc ? '<span class="legend-item"><span class="legend-swatch" style="background:' + ACCESS.svc.color + '"></span>服务区 <span class="legend-val">' + kindCount.svc + '</span></span>' : '',
    kindCount.exit ? '<span class="legend-item"><span class="legend-swatch" style="background:' + ACCESS.exit.color + '"></span>高速出口 <span class="legend-val">' + kindCount.exit + '</span></span>' : '',
    kindCount.road ? '<span class="legend-item"><span class="legend-swatch" style="background:' + ACCESS.road.color + '"></span>顺路可达 <span class="legend-val">' + kindCount.road + '</span></span>' : '',
    kindCount.city ? '<span class="legend-item"><span class="legend-swatch" style="background:' + ACCESS.city.color + '"></span>需下高速 <span class="legend-val">' + kindCount.city + '</span></span>' : '',
  ].filter(Boolean).join('');

  const steps = plan.map(function (st, i) {
    const ac = ACCESS[st.kind] || ACCESS.road;
    const acDisp = st.farHw ? (ACCESS[st.acc] || ACCESS.exit) : ac;
    return '<div class="step">' +
      '<span class="dot" style="background:' + acDisp.color + '"></span>' +
      '<span class="no">' + String(i + 1).padStart(2, '0') + '</span>' +
      '<span class="nm" title="' + esc(st.s.name) + '">' + esc(st.s.name) + '</span>' +
      '<span class="tag" style="color:' + acDisp.color + '">' + acDisp.label + '</span>' +
      '<span class="meta">' + st.along.toFixed(0) + 'km · 本段 ' + st.leg.toFixed(0) + 'km' +
        (st.farHw ? ' · 绕行 ' + st.off.toFixed(0) + 'km' : (st.detour > 1 ? ' · 绕 ' + st.detour.toFixed(1) + 'km' : '')) +
        (st.inserted ? ' · 补点' : '') + '</span>' +
      '</div>';
  }).join('');

  const hwKm = route.highwayMeters ? route.highwayMeters / 1000 : 0;
  let meta = '';

  if (est) {
    meta += '<div class="banner" data-tone="warn" style="margin-bottom:10px">' +
      '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><use href="#i-alert"/></svg>' +
      '<span><b>' + esc(A.label) + ' → ' + esc(B.label) + '</b> 这条走廊没有随本站收录真实路网数据，以下按<b>直线路径</b>估算：' +
      '里程为两点直线距离，不是行驶里程；高速/普通道路无法区分，站点只按名称与地址判断可达性。' +
      '结果仅供定位参考，请从面板下方「已收录真实走廊」里挑一条换成真实路线。</span></div>';
  } else {
    meta += '<div class="note" style="padding:0 0 10px;background:transparent;border:0">' +
      '路径来自<b>高德驾车路线规划</b>（真实路网里程）' +
      (route.capturedAt ? '，走廊数据采集于 <b>' + esc(route.capturedAt) + '</b>' : '') + '。' +
      (hwKm ? ' 其中高速路段 <b>' + hwKm.toFixed(0) + ' km</b>（占全程 ' + Math.round(route.highwayRatio * 100) + '%）。' : '') +
      '</div>';
  }

  meta += plan.length
    ? '<div class="legend" style="margin-top:2px">' + kindChips + '</div>'
    : '';

  if (blocked) {
    meta += '<div class="banner" data-tone="danger" style="margin-top:10px">' +
      '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><use href="#i-alert"/></svg>' +
      '<span>走不通了：从上一站往前 <b>' + Math.round(eff) + ' km</b> 内、绕行不超过 <b>' +
      (maxDetour > 1000 ? '任意距离' : maxDetour + ' km') + '</b> 的范围里没有能顺路到的闪充站，剩余 <b>' +
      finalLeg.toFixed(1) + ' km</b> 无覆盖。这一段桩确实稀疏——可以把「最大绕行」放宽到 50 km，或提高续航设定。</span></div>';
  } else {
    meta += '<div class="banner" data-tone="ok" style="margin-top:10px">' +
      '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><use href="#i-check"/></svg>' +
      '<span>全程可覆盖：最后一站到终点还剩 <b>' + finalLeg.toFixed(1) + ' km</b>，在续航内。</span></div>';
  }

  sumEl.innerHTML =
    '<div class="lede">' +
      '<span class="route">' + esc(A.label) + ' → ' + esc(B.label) + '</span>' +
      '<span class="dim" style="font-size:12px">' + esc(A.detail) + ' ｜ ' + esc(B.detail) + '</span>' +
      '<span class="pill" data-cat="plain">' + (mode === 'highway' ? '少下高速' : '充电次数最少') + '</span>' +
      '<span class="pill" data-cat="plain">续航 ' + range + ' km · 余量 ' + Math.round((1 - safety) * 100) + '%</span>' +
      '<span class="pill" data-cat="plain">沿途 ±' + corridor + ' km</span>' +
    '</div>' +
    '<div class="kpis">' + kpis.join('') + '</div>' +
    meta +
    (steps ? '<div class="steps">' + steps + '</div>' : '');

  /* ---------------- 表格：沿途全部可选站 ---------------- */
  wrapEl.style.display = '';
  if (!cand.length) {
    tb.innerHTML = '<tr><td class="empty" colspan="9">这条路沿途 ±' + corridor +
      ' km 内没有闪充站。把「沿途范围」调大到 20 或 40 km 试试。</td></tr>';
  } else {
    tb.innerHTML = cand.map(function (c, i) {
      const star = !!planSet[c.s.name];
      const ac = ACCESS[c.kind] || ACCESS.road;
      const acDisp = c.farHw ? (ACCESS[c.acc] || ACCESS.exit) : ac;
      const gap = c.cost - 2 * c.off;
      const offCell = c.off.toFixed(1) +
        (gap > 0.5
          ? ' <span style="color:' + acDisp.color + '">→' + c.cost.toFixed(0) + '</span>'
          : ' <span class="mut">→' + c.cost.toFixed(0) + '</span>');
      return '<tr' + (star ? ' class="is-pick"' : '') + '>' +
        '<td class="c n mut shrink">' + (i + 1) + '</td>' +
        '<td><span class="name">' + (star ? '★ ' : '') + esc(c.s.name) + '</span></td>' +
        '<td class="dim shrink">' + esc(c.s.city) + '</td>' +
        '<td class="addr">' + esc(c.s.address || '') + '</td>' +
        '<td class="c n shrink"' + (star ? ' style="color:var(--accent-deep);font-weight:600"' : '') + '>' + c.along.toFixed(1) + '</td>' +
        '<td class="c n shrink" title="' + esc(ac.note) + '">' + offCell + '</td>' +
        '<td class="c shrink"><span style="color:' + acDisp.color + ';font-size:11.5px;font-weight:600">' + acDisp.label + '</span>' +
          (c.farHw ? '<br><span class="mut" style="font-size:11px">需绕行 ' + c.off.toFixed(0) + ' km</span>' : '') + '</td>' +
        '<td class="c num-strong shrink">' + c.s.superNum + '</td>' +
        '<td class="c n shrink" style="color:' + (c.s.idleSuperNum > 0 ? 'var(--fg)' : 'var(--warn-ink)') + '">' + c.s.idleSuperNum + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ---------------- 地图：真实路线（three.js 3D） ---------------- */
  mapEl.style.display = '';
  drawRouteScene(route, cand, all, plan, planSet, A, B);


  /* 叠加到全国大地图（轻度抽稀） */
  const stride = Math.max(1, Math.ceil(route.polyline.length / 1500));
  const overlayLine = [], overlayHw = [];
  for (let i = 0; i < route.polyline.length; i += stride) {
    overlayLine.push(route.polyline[i]);
    overlayHw.push(route.hw ? (route.hw[i] ? 1 : 0) : 0);
  }
  const lastPt = route.polyline[route.polyline.length - 1];
  if (overlayLine[overlayLine.length - 1] !== lastPt) {
    overlayLine.push(lastPt);
    overlayHw.push(route.hw ? (route.hw[route.hw.length - 1] ? 1 : 0) : 0);
  }
  routeOverlay = { line: overlayLine, hw: overlayHw, stops: plan, A: A, B: B, from: A.label, to: B.label };
  if (curProv) backToNation(); else drawMap();
  $('clearRouteBtn').hidden = false;
}

function swapRoute() {
  const a = $('routeFrom'), b = $('routeTo');
  const t = a.value; a.value = b.value; b.value = t;
}

/* ------------------------------------------------------------ 初始化 */
function initRouteModule() {
  renderCorridors();
  $('planBtn').addEventListener('click', planRoute);
  $('swapBtn').addEventListener('click', swapRoute);
  ['routeMode', 'routeCorridor', 'routeMaxDetour'].forEach(function (id) {
    $(id).addEventListener('change', function () { if (lastRoutePlan) planRoute(); });
  });
  $('routeRange').addEventListener('change', function () {
    const v = Math.min(800, Math.max(80, Number($('routeRange').value) || 300));
    $('routeRange').value = v;
    if (lastRoutePlan) planRoute();
  });
  $('routeSafety').addEventListener('change', function () { if (lastRoutePlan) planRoute(); });
  $('routeTo').addEventListener('keydown', function (e) { if (e.key === 'Enter') planRoute(); });
}

/* ---------------------------------------------------------------- 启动 */
function boot() {
  buildStats();
  buildTables();
  renderNewToday();
  bindCore();
  initMapModule();
  initRouteModule();
  drawAll();
  drawMap();
  renderDetail();
  renderWorkforce();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
