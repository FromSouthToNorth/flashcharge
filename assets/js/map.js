/* ============================================================================
   map.js · 全国分布（three.js 3D 地图） + 构成与省份堆叠（three.js 图表）
   投影口径与原站一致（等距圆柱，lon/lat 等比投射）；视觉沿用 tech-utility 令牌：
   省份是纯白薄板 + 发丝缝，三个品类色只用在站点标记上。
   ========================================================================== */
'use strict';

let mapType = 'scatter';
let mapCat = 'all';
let curProv = null;
let routeOverlay = null;

/* ------------------------------------------------------------ 常量 */
const MAP_K = 1.62;            /* 度 -> 世界单位 */
const MAP_H = 2.3;             /* 省份板厚度：够厚才能在等距视角下看到侧壁 */
const STATION_Y = MAP_H + 0.06;
const CAT_SYMBOL = { highway: 'triangle', brand: 'rect', instation: 'circle' };
const HEAT_MAX = 30;           /* 热力口径：>30 枪按 30 计（沿用原站） */

/* ------------------------------------------------------------ 状态 */
let MAP = null;                /* three-kit 实例 */
let CN = null;                 /* 全国包围盒（投影基准） */
let GEO = null;                /* 34 省 GeoJSON */
let provGroup = null, stationGroup = null;
let provMeshes = [];           /* { name, mesh, edges, minX..maxZ } */
let stationMeshes = [];        /* InstancedMesh[] */
let stationPickList = [];      /* 与 stationMeshes 一一对应的站点数组 */
let mapTip = null, hoverName = null;
let provTopMat = null, provSideMat = null, provHotMat = null;

/* ------------------------------------------------------------ 投影 */
function wX(lng) { return (lng - CN.cx) * MAP_K; }
function wZ(lat) { return -(lat - CN.cy) * MAP_K; }

function visibleStations() {
  return curProv ? STATIONS.filter(function (s) { return s.province.indexOf(curProv) === 0; }) : STATIONS;
}

/* 符号尺寸：按闪充枪数开方缩放，下钻后更大 */
function symSize(v) {
  const n = v && v[2] ? v[2] : 1;
  const k = curProv ? 0.30 : 0.21;
  return Math.max(curProv ? 0.46 : 0.30, Math.min(curProv ? 0.95 : 0.66, 0.16 + Math.sqrt(n) * k));
}

function heatColor(t) {
  const c = PAL.heat;
  const i = TK.clamp(Math.floor(t * (c.length - 1)), 0, c.length - 2);
  const f = t * (c.length - 1) - i;
  return new THREE.Color(c[i]).lerp(new THREE.Color(c[i + 1]), f);
}

/* ------------------------------------------------------------ 省份几何 */
function ringToPoints(ring) {
  return ring.map(function (p) { return new THREE.Vector2((p[0] - CN.cx) * MAP_K, (p[1] - CN.cy) * MAP_K); });
}
function polygonsOf(geom) {
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

function buildProvinces() {
  provGroup = new THREE.Group();
  provMeshes = [];

  provTopMat = TK.matte(PAL.surface, 1);
  provSideMat = TK.matte(PAL.surface3, 1);
  provHotMat = TK.matte(PAL.accentTint, 1);
  provDimTop = TK.matte(PAL.surface2, 1);
  provEdgeMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(PAL.borderStrong), transparent: true, opacity: 0.85,
  });
  provEdgeDim = new THREE.LineBasicMaterial({
    color: new THREE.Color(PAL.border), transparent: true, opacity: 0.5,
  });

  GEO.features.forEach(function (f) {
    const name = f.properties.name;
    const polys = polygonsOf(f.geometry);
    const shapes = [], edgePts = [];
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;

    polys.forEach(function (poly) {
      if (!poly.length || !poly[0] || poly[0].length < 3) return;
      const outer = ringToPoints(poly[0]);
      const sh = new THREE.Shape(outer);
      for (let i = 1; i < poly.length; i++) {
        if (poly[i] && poly[i].length >= 3) sh.holes.push(new THREE.Path(ringToPoints(poly[i])));
      }
      shapes.push(sh);
      for (let i = 0; i < outer.length; i++) {
        const a = outer[i], b = outer[(i + 1) % outer.length];
        edgePts.push(new THREE.Vector3(a.x, MAP_H + 0.014, -a.y));
        edgePts.push(new THREE.Vector3(b.x, MAP_H + 0.014, -b.y));
        if (a.x < minX) minX = a.x; if (a.x > maxX) maxX = a.x;
        if (-a.y < minZ) minZ = -a.y; if (-a.y > maxZ) maxZ = -a.y;
      }
    });
    if (!shapes.length) return;

    let geom;
    try {
      geom = new THREE.ExtrudeGeometry(shapes, { depth: MAP_H, bevelEnabled: false, curveSegments: 1 });
    } catch (e) {
      console.warn('省份几何构建失败:', name, e);
      return;
    }
    geom.rotateX(-Math.PI / 2);

    const mesh = new THREE.Mesh(geom, [provTopMat, provSideMat]);
    mesh.userData.provName = name;
    provGroup.add(mesh);

    let edges = null;
    if (edgePts.length) {
      edges = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(edgePts), provEdgeMat);
      provGroup.add(edges);
    }
    provMeshes.push({ name: name, mesh: mesh, edges: edges, minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ });
  });

  MAP.scene.add(provGroup);
}

/* 悬停高亮：只把命中那块换成强调底纹 */
function setProvinceTint(name) {
  if (!MAP) return;
  provMeshes.forEach(function (p) {
    if (curProv && p.name !== curProv) return;   /* 下钻状态下不参与悬停高亮 */
    const want = (p.name === name) ? provHotMat : (curProv ? provTopMat : provTopMat);
    if (p.mesh.material[0] !== want) p.mesh.material = [want, provSideMat];
  });
  MAP.requestRender();
}

/* ------------------------------------------------------------ 站点标记 */
function clearStations() {
  if (!stationGroup) return;
  MAP.scene.remove(stationGroup);
  stationGroup.traverse(function (o) {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  stationGroup = null;
  stationMeshes = [];
  stationPickList = [];
}

function buildStations() {
  clearStations();
  stationGroup = new THREE.Group();

  const base = visibleStations();
  const list = mapCat === 'all' ? base : base.filter(function (s) { return s.category === mapCat; });
  const mat4 = new THREE.Matrix4();
  const col = new THREE.Color();

  if (mapType === 'heatmap') {
    /* 热力：底色带取色 + 半径随热度增长，重叠处自然叠亮 */
    const g = TK.symbolGeometry('circle', 1);
    const m = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.82 });
    const im = new THREE.InstancedMesh(g, m, list.length);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const t = TK.clamp((s.superNum || 1) / HEAT_MAX, 0.05, 1);
      const sc = 0.42 + t * 1.25;
      mat4.makeScale(sc, 1, sc);
      mat4.setPosition(wX(s.lng), STATION_Y, wZ(s.lat));
      im.setMatrixAt(i, mat4);
      im.setColorAt(i, heatColor(t));
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    stationGroup.add(im);
    stationMeshes.push(im);
    stationPickList.push(list);
  } else {
    /* 散点：三类各自一种形状（高速▲ / 品牌■ / 站中站●） */
    CAT_ORDER.forEach(function (cat) {
      const arr = list.filter(function (s) { return s.category === cat; });
      if (!arr.length) return;
      const g = TK.symbolGeometry(CAT_SYMBOL[cat], 1);
      const m = new THREE.MeshLambertMaterial({});
      const im = new THREE.InstancedMesh(g, m, arr.length);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < arr.length; i++) {
        const s = arr[i];
        const sc = symSize([s.lng, s.lat, s.superNum]);
        mat4.makeScale(sc, sc, sc);
        mat4.setPosition(wX(s.lng), STATION_Y, wZ(s.lat));
        im.setMatrixAt(i, mat4);
        col.set(s.status === 'offline' ? PAL.offline : CATS[cat].hex);
        im.setColorAt(i, col);
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.userData.cat = cat;
      stationGroup.add(im);
      stationMeshes.push(im);
      stationPickList.push(arr);
    });
  }

  MAP.scene.add(stationGroup);
  updateAnno();
}

function updateAnno() {
  const scope = $('annoScope');
  if (scope) scope.textContent = curProv ? (curProv + ' · 1 个省级行政区') : '全国 · 34 省级行政区';
  const cnt = $('annoCount');
  if (cnt) {
    const base = visibleStations();
    const show = mapCat === 'all' ? base.length : base.filter(function (s) { return s.category === mapCat; }).length;
    cnt.textContent = show.toLocaleString('zh-CN') + ' / ' + STATIONS.length.toLocaleString('zh-CN');
  }
}

/* ------------------------------------------------------------ 场景 */
function drawMap() {
  const ml = $('mapLoading');
  if (ml) ml.remove();
  const g = window.FC_CHINA;
  if (!g) { console.warn('缺少全国边界数据 assets/geo/china.js'); return; }
  if (!MAP) initMapScene(g);
  buildStations();
  MAP.requestRender();
}

const CN_FALLBACK = { cx: 104.3, cy: 35.9 };

function initMapScene(g) {
  const host = $('mapChart');
  host.innerHTML = '';
  host.style.position = 'relative';

  GEO = g;
  CN = chinaBox(GEO);
  if (!isFinite(CN.cx)) CN = CN_FALLBACK;

  MAP = TK.create(host, { fov: 30, alpha: true, controls: true });
  /* 容器尺寸变化时按同一范围重新取景，避免窄屏下地图溢出 */
  MAP.onResize(function () { if (LAST_FIT) fitCamera(LAST_FIT.cx, LAST_FIT.cy, LAST_FIT.w, LAST_FIT.h, false); });
  fitCamera(CN.cx, CN.cy, (CN.maxLng - CN.minLng) * MAP_K, (CN.maxLat - CN.minLat) * MAP_K, false);
  buildProvinces();

  mapTip = document.createElement('div');
  mapTip.className = 'map-tip';
  mapTip.style.display = 'none';
  host.appendChild(mapTip);

  MAP.bindPointer({
    move: function (e) {
      const pickables = [stationGroup, provGroup].filter(Boolean);
      const hits = MAP.pick(e.clientX, e.clientY, pickables, true);
      let html = null, cursor = 'grab';

      for (let i = 0; i < hits.length && !html; i++) {
        const h = hits[i];
        if (h.object.isInstancedMesh && h.instanceId != null) {
          const idx = stationMeshes.indexOf(h.object);
          const s = stationPickList[idx] && stationPickList[idx][h.instanceId];
          if (s) { html = stationTipHTML(s); cursor = 'pointer'; }
        }
      }
      if (!html) {
        for (let i = 0; i < hits.length && !html; i++) {
          const n = hits[i].object.userData && hits[i].object.userData.provName;
          if (n) {
            html = '<b>' + esc(n) + '</b><br><span class="dim">点击下钻到该省</span>';
            cursor = 'pointer';
            if (hoverName !== n) { hoverName = n; setProvinceTint(n); }
          }
        }
      }
      if (!html && hoverName) { hoverName = null; setProvinceTint(null); }

      if (html) {
        mapTip.innerHTML = html;
        mapTip.style.display = '';
        const r = MAP.container.getBoundingClientRect();
        let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
        if (x + mapTip.offsetWidth > r.width - 8) x = e.clientX - r.left - mapTip.offsetWidth - 12;
        if (y + mapTip.offsetHeight > r.height - 8) y = e.clientY - r.top - mapTip.offsetHeight - 12;
        mapTip.style.transform = 'translate(' + Math.max(4, x).toFixed(0) + 'px,' + Math.max(4, y).toFixed(0) + 'px)';
      } else {
        mapTip.style.display = 'none';
      }
      MAP.renderer.domElement.style.cursor = cursor;
    },
    leave: function () {
      if (mapTip) mapTip.style.display = 'none';
      if (hoverName) { hoverName = null; setProvinceTint(null); }
    },
    click: function (e) {
      const pickables = [stationGroup, provGroup].filter(Boolean);
      const hits = MAP.pick(e.clientX, e.clientY, pickables, true);
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        if (h.object.isInstancedMesh && h.instanceId != null) {
          const idx = stationMeshes.indexOf(h.object);
          const s = stationPickList[idx] && stationPickList[idx][h.instanceId];
          if (s) { showStations('city', s.city, 'all'); return; }
        }
      }
      for (let i = 0; i < hits.length; i++) {
        const n = hits[i].object.userData && hits[i].object.userData.provName;
        if (n && n !== curProv) { drillTo(n); return; }
      }
    },
  });
}

function chinaBox(geo) {
  let minLng = 1e9, maxLng = -1e9, minLat = 1e9, maxLat = -1e9;
  geo.features.forEach(function (f) {
    polygonsOf(f.geometry).forEach(function (poly) {
      poly.forEach(function (ring) {
        ring.forEach(function (p) {
          if (p[0] < minLng) minLng = p[0];
          if (p[0] > maxLng) maxLng = p[0];
          if (p[1] < minLat) minLat = p[1];
          if (p[1] > maxLat) maxLat = p[1];
        });
      });
    });
  });
  return { minLng: minLng, maxLng: maxLng, minLat: minLat, maxLat: maxLat,
           cx: (minLng + maxLng) / 2, cy: (minLat + maxLat) / 2 };
}

function stationTipHTML(s) {
  return '<b>' + esc(s.name) + '</b><br>' +
    catPill(s.category) + ' <span class="dim">' + esc(s.city) + '</span><br>' +
    '<span class="mono">' + s.superNum + '</span> 枪 · 空闲 <span class="mono">' + s.idleSuperNum + '</span>' +
    (s.status === 'offline' ? ' · <span class="dim">已下线</span>' : '') +
    (s.address ? '<br><span class="dim">' + esc(s.address) + '</span>' : '');
}

/* ------------------------------------------------------------ 取景 */
/* 世界范围取景：worldW/worldH 为该视角要装下的世界尺寸 */
function fitCamera(cx, cy, worldW, worldH, animate) {
  const cam = MAP.camera, ctl = MAP.controls;
  /* 俯角偏正俯视：保留 3D 立体感，同时避免南大北小的透视畸变把地形拉歪 */
  const TILT = 64;
  const target = new THREE.Vector3(wX(cx), 0, wZ(cy));
  const box = {
    minX: target.x - worldW / 2, maxX: target.x + worldW / 2,
    minY: 0, maxY: MAP_H + 1.2,
    minZ: target.z - worldH / 2, maxZ: target.z + worldH / 2,
  };
  const dist = TK.fitDistanceBox(cam, MAP.container, box, TILT, 1.04);
  const pos = new THREE.Vector3(target.x, dist * Math.sin(TILT * TK.DEG), target.z + dist * Math.cos(TILT * TK.DEG));
  LAST_FIT = { cx: cx, cy: cy, w: worldW, h: worldH };
  if (animate && ctl) {
    tweenCamera(pos, target, 560);
  } else {
    cam.position.copy(pos);
    if (ctl) { ctl.target.copy(target); ctl.update(); } else cam.lookAt(target);
    MAP.requestRender();
  }
}
let LAST_FIT = null;

let camTween = null;
function tweenCamera(pos, target, ms) {
  const cam = MAP.camera, ctl = MAP.controls;
  camTween = {
    t0: performance.now(), ms: ms,
    p0: cam.position.clone(), p1: pos.clone(),
    g0: ctl ? ctl.target.clone() : new THREE.Vector3(), g1: target.clone(),
  };
  if (!MAP.__tweening) {
    MAP.__tweening = true;
    MAP.onFrame(function () {
      const T = camTween;
      if (!T) { MAP.__tweening = false; return false; }
      const k = TK.clamp((performance.now() - T.t0) / T.ms, 0, 1);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      cam.position.lerpVectors(T.p0, T.p1, e);
      if (ctl) ctl.target.lerpVectors(T.g0, T.g1, e);
      if (k >= 1) { camTween = null; MAP.__tweening = false; return false; }
      return true;
    });
  }
  MAP.requestRender();
}

/* ------------------------------------------------------------ 下钻 */
/* 全国边界已含 34 省轮廓，下钻只需按该省包围盒取景 + 收窄站点集合，无需再拉分片文件 */
function drillTo(name) {
  const p = provMeshes.find(function (x) { return x.name === name; });
  if (!p) return Promise.resolve();
  /* 世界坐标 -> 经纬度：x=(lng-cx)*K, z=-(lat-cy)*K */
  const cx = ((p.minX + p.maxX) / 2) / MAP_K + CN.cx;
  const cz = -((p.minZ + p.maxZ) / 2) / MAP_K + CN.cy;
  curProv = name;
  defocusOthers(name);
  fitCamera(cx, cz, Math.max((p.maxX - p.minX) * 1.25, 14), Math.max((p.maxZ - p.minZ) * 1.25, 14), true);
  const bt = $('backNation');
  if (bt) bt.hidden = false;
  const t = $('mapTitle');
  if (t) t.textContent = name + ' · 闪充站分布';
  buildStations();
  return Promise.resolve();
}

/* 下钻后把其余省份压暗，让当前省成为唯一焦点 */
function defocusOthers(name) {
  provMeshes.forEach(function (p) {
    const isCur = p.name === name;
    p.mesh.material = [isCur ? provTopMat : provDimTop, provSideMat];
    if (p.edges) p.edges.material = isCur ? provEdgeMat : provEdgeDim;
  });
  if (MAP) MAP.requestRender();
}
let provDimTop = null, provEdgeMat = null, provEdgeDim = null;

function backToNation() {
  curProv = null;
  provMeshes.forEach(function (p) {
    p.mesh.material = [provTopMat, provSideMat];
    if (p.edges) p.edges.material = provEdgeMat;
  });
  const bt = $('backNation');
  if (bt) bt.hidden = true;
  const t = $('mapTitle');
  if (t) t.textContent = '全国闪充站分布';
  fitCamera(CN.cx, CN.cy, (CN.maxLng - CN.minLng) * MAP_K, (CN.maxLat - CN.minLat) * MAP_K, true);
  buildStations();
}

/* ------------------------------------------------------------ 路线叠加 */
function routeOverlaySeries() { return []; }   /* 兼容旧接口 */

function drawRouteOverlay() {
  if (!MAP) return;
  if (MAP.__routeGroup) { MAP.scene.remove(MAP.__routeGroup); MAP.__routeGroup = null; }
  const o = routeOverlay;
  if (!o) { MAP.requestRender(); return; }

  const g = new THREE.Group();
  const pts = o.line.map(function (p) { return new THREE.Vector3(wX(p[0]), MAP_H + 0.5, wZ(p[1])); });
  let cur = [pts[0]], curHw = o.hw[0] ? 1 : 0;
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const h = o.hw[i] ? 1 : 0;
    cur.push(pts[i]);
    if (h !== curHw) { segs.push({ pts: cur, hw: curHw }); cur = [pts[i]]; curHw = h; }
  }
  if (cur.length > 1) segs.push({ pts: cur, hw: curHw });

  segs.forEach(function (s) {
    if (s.pts.length < 2) return;
    const t = TK.tubeFromPoints(s.pts, s.hw ? 0.62 : 0.34, s.hw ? PAL.roadHi : PAL.road, 0.95);
    if (t) g.add(t);
  });

  const stopMat = TK.matte(PAL.warn);
  o.stops.forEach(function (p, i) {
    const m = new THREE.Mesh(TK.symbolGeometry('circle', 1), stopMat);
    m.scale.setScalar(1.7);
    m.position.set(wX(p.s.lng), MAP_H + 0.9, wZ(p.s.lat));
    g.add(m);
    const el = document.createElement('div');
    el.className = 'tk-tag is-warn';
    el.textContent = String(i + 1);
    MAP.addLabel(el, m.position, { dy: -15 });
  });

  const a = TK.pinMesh(PAL.danger);
  a.position.set(wX(o.A.lng), MAP_H, wZ(o.A.lat));
  g.add(a);
  const b = TK.pinMesh(PAL.danger);
  b.position.set(wX(o.B.lng), MAP_H, wZ(o.B.lat));
  g.add(b);
  const la = document.createElement('div'); la.className = 'tk-tag'; la.textContent = '起 ' + o.from;
  MAP.addLabel(la, a.position, { dy: -30 });
  const lb = document.createElement('div'); lb.className = 'tk-tag'; lb.textContent = '终 ' + o.to;
  MAP.addLabel(lb, b.position, { dy: -30 });

  MAP.__routeGroup = g;
  MAP.scene.add(g);
  MAP.requestRender();
}

function clearRouteOverlay() {
  routeOverlay = null;
  if (MAP) {
    if (MAP.__routeGroup) { MAP.scene.remove(MAP.__routeGroup); MAP.__routeGroup = null; }
    MAP.clearLabels();
    MAP.requestRender();
  }
  const b = $('clearRouteBtn');
  if (b) b.hidden = true;
}

/* ------------------------------------------------------------ 路线专图（03 面板） */
/* 独立取景：只框住起终点走廊。省份几何与全国图共用（three.js 几何可跨场景复用），
   用更淡的材质当背景，让路线与推荐站成为唯一焦点。 */
let ROUTE_VIEW = null;
let routeBgTop = null, routeBgSide = null, routeBgEdge = null;

function drawRouteScene(route, cand, all, plan, planSet, A, B) {
  const host = $('routeMap');
  if (!host) return;
  if (ROUTE_VIEW) { ROUTE_VIEW.dispose(); ROUTE_VIEW = null; }
  host.innerHTML = '';
  host.style.position = 'relative';

  FOCUS = { cx: (A.lng + B.lng) / 2, cy: (A.lat + B.lat) / 2 };
  const _sp = routeSpan(route, A, B);
  ROUTE_VIEW = TK.create(host, { fov: 30, alpha: true, controls: true });

  if (!routeBgTop) {
    routeBgTop = TK.matte(PAL.surface2, 1);
    routeBgSide = TK.matte(PAL.surface3, 1);
    routeBgEdge = new THREE.LineBasicMaterial({ color: new THREE.Color(PAL.border), transparent: true, opacity: 0.6 });
  }

  /* 底图：直接复用全国图的省份几何 */
  (provMeshes || []).forEach(function (p) {
    const m = new THREE.Mesh(p.mesh.geometry, [routeBgTop, routeBgSide]);
    ROUTE_VIEW.scene.add(m);
    if (p.edges) ROUTE_VIEW.scene.add(new THREE.LineSegments(p.edges.geometry, routeBgEdge));
  });

  /* 路线：按高速 / 普通分段 */
  const line = route.polyline.map(function (p) { return [p[0], p[1]]; });
  const segs = splitByHw(line, route.hw);
  segs.forEach(function (s) {
    if (s.pts.length < 2) return;
    const pts = s.pts.map(function (p) { return new THREE.Vector3(rX(p[0]), MAP_H + 0.6, rZ(p[1])); });
    const t = TK.tubeFromPoints(pts, s.hw ? 0.30 : 0.16, s.hw ? PAL.roadHi : PAL.road, 0.95);
    if (t) ROUTE_VIEW.scene.add(t);
  });

  /* 沿途候选站：小棋子做背景 */
  const planSetNames = {};
  plan.forEach(function (p) { planSetNames[p.s.name] = true; });
  const bgStations = (cand && cand.length ? cand : all).filter(function (c) { return !planSetNames[c.s.name]; });
  const bgGeo = TK.symbolGeometry('circle', 1);
  const bgMesh = new THREE.InstancedMesh(bgGeo, new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.45 }), bgStations.length || 1);
  const mat4 = new THREE.Matrix4();
  const col = new THREE.Color();
  for (let i = 0; i < bgStations.length; i++) {
    const s = bgStations[i].s;
    mat4.makeScale(0.42, 1, 0.42);
    mat4.setPosition(rX(s.lng), MAP_H + 0.15, rZ(s.lat));
    bgMesh.setMatrixAt(i, mat4);
    col.set(CATS[s.category].hex);
    bgMesh.setColorAt(i, col);
  }
  bgMesh.count = bgStations.length;
  bgMesh.instanceMatrix.needsUpdate = true;
  if (bgMesh.instanceColor) bgMesh.instanceColor.needsUpdate = true;
  if (bgStations.length) ROUTE_VIEW.scene.add(bgMesh);

  /* 推荐充电站：琥珀大点 + 序号 */
  const stopMat = TK.matte(PAL.warn);
  plan.forEach(function (p, i) {
    const m = new THREE.Mesh(TK.symbolGeometry('circle', 1), stopMat);
    m.scale.setScalar(1.15);
    m.position.set(rX(p.s.lng), MAP_H + 0.75, rZ(p.s.lat));
    ROUTE_VIEW.scene.add(m);
    const el = document.createElement('div');
    el.className = 'tk-tag is-warn';
    el.textContent = String(i + 1);
    ROUTE_VIEW.addLabel(el, m.position, { dy: -16 });
  });

  /* 起终点 */
  const pa = TK.pinMesh(PAL.danger);
  pa.position.set(rX(A.lng), MAP_H, rZ(A.lat));
  ROUTE_VIEW.scene.add(pa);
  const pb = TK.pinMesh(PAL.danger);
  pb.position.set(rX(B.lng), MAP_H, rZ(B.lat));
  ROUTE_VIEW.scene.add(pb);
  const la = document.createElement('div'); la.className = 'tk-tag'; la.textContent = '起 ' + A.label;
  ROUTE_VIEW.addLabel(la, pa.position, { dy: -32 });
  const lb = document.createElement('div'); lb.className = 'tk-tag'; lb.textContent = '终 ' + B.label;
  ROUTE_VIEW.addLabel(lb, pb.position, { dy: -32 });

  ROUTE_VIEW.onResize(function () { if (ROUTE_FIT) fitRouteCamera(A, B, ROUTE_FIT.w, ROUTE_FIT.h); });
  fitRouteCamera(A, B, _sp.w, _sp.h);
}

/* 路线专图的局部投影：以走廊中心为原点，保持与全国图同一比例 */
let FOCUS = null;
function rX(lng) { return (lng - (FOCUS ? FOCUS.cx : CN.cx)) * MAP_K; }
function rZ(lat) { return -(lat - (FOCUS ? FOCUS.cy : CN.cy)) * MAP_K; }

function routeSpan(route, A, B) {
  let minLng = Math.min(A.lng, B.lng), maxLng = Math.max(A.lng, B.lng);
  let minLat = Math.min(A.lat, B.lat), maxLat = Math.max(A.lat, B.lat);
  route.polyline.forEach(function (p) {
    if (p[0] < minLng) minLng = p[0];
    if (p[0] > maxLng) maxLng = p[0];
    if (p[1] < minLat) minLat = p[1];
    if (p[1] > maxLat) maxLat = p[1];
  });
  return {
    w: Math.max((maxLng - minLng) * MAP_K, 8),
    h: Math.max((maxLat - minLat) * MAP_K, 6),
  };
}

function fitRouteCamera(A, B, worldW, worldH) {
  const cam = ROUTE_VIEW.camera, ctl = ROUTE_VIEW.controls;
  const cx = rX((A.lng + B.lng) / 2), cz = rZ((A.lat + B.lat) / 2);
  const TILT = 64;
  const box = {
    minX: cx - worldW / 2, maxX: cx + worldW / 2,
    minY: MAP_H, maxY: MAP_H + 1.6,
    minZ: cz - worldH / 2, maxZ: cz + worldH / 2,
  };
  const dist = TK.fitDistanceBox(cam, ROUTE_VIEW.container, box, TILT, 1.05);
  cam.position.set(cx, dist * Math.sin(TILT * TK.DEG), cz + dist * Math.cos(TILT * TK.DEG));
  if (ctl) { ctl.target.set(cx, 0, cz); ctl.update(); } else cam.lookAt(cx, 0, cz);
  ROUTE_FIT = { w: worldW, h: worldH, A: A, B: B };
  ROUTE_VIEW.requestRender();
}
let ROUTE_FIT = null;

/* ------------------------------------------------------------ 控件 */
function setMapType(type) {
  mapType = type;
  document.querySelectorAll('[data-maptype]').forEach(function (b) {
    b.setAttribute('aria-pressed', String(b.dataset.maptype === type));
  });
  drawMap();
}

function setMapCat(cat) {
  mapCat = cat;
  document.querySelectorAll('#distribution .seg-btn[data-cat]').forEach(function (b) {
    b.setAttribute('aria-pressed', String(b.dataset.cat === cat));
  });
  drawMap();
}

/* ------------------------------------------------------------ 构成与省份堆叠（3D） */
let pieView = null, provView = null;

function drawAll() {
  drawPie();
  drawProvStack();
}

/* 三大类构成：3D 环形扇面 + HTML 图例带数值 */
function drawPie() {
  const host = $('pieChart');
  if (!host) return;
  if (pieView) { pieView.dispose(); pieView = null; }
  host.innerHTML = '';
  host.style.position = 'relative';

  const counts = { highway: 0, brand: 0, instation: 0 };
  STATIONS.forEach(function (s) { counts[s.category]++; });
  const total = STATIONS.length || 1;

  pieView = TK.create(host, { fov: 34, controls: false, alpha: true });
  const scene = pieView.scene;
  const R0 = 3.0, R1 = 4.9, DEPTH = 1.0;

  let a0 = -Math.PI / 2;
  const gap = 0.02;
  CAT_ORDER.forEach(function (cat) {
    const n = counts[cat];
    const ang = (n / total) * Math.PI * 2;
    const g = TK.ringSectorGeometry(R0, R1, Math.max(ang - gap, 0.006));
    g.scale(1, DEPTH, 1);
    const m = new THREE.Mesh(g, TK.matte(CATS[cat].hex));
    m.rotation.y = a0;
    scene.add(m);
    a0 += ang;
  });

  const fitPie = function () {
    const cam = pieView.camera, TILT = 50;
    const R = R1 + 0.6;
    const dist = TK.fitDistanceBox(cam, pieView.container,
      { minX: -R, maxX: R, minY: 0, maxY: DEPTH, minZ: -R, maxZ: R }, TILT, 1.02);
    cam.position.set(0, dist * Math.sin(TILT * TK.DEG), dist * Math.cos(TILT * TK.DEG));
    cam.lookAt(0, 0, 0);
    pieView.renderOnce();
  };
  fitPie();
  pieView.onResize(fitPie);

  /* 中心总量（HTML 叠加，数字走等宽，与令牌一致） */
  const cen = document.createElement('div');
  cen.className = 'pie-center';
  cen.innerHTML = '<div class="v mono">' + fmt(total) + '</div><div class="k">座闪充站</div>';
  pieView.addLabel(cen, new THREE.Vector3(0, DEPTH + 0.1, 0), { dy: 6 });

  const lg = $('pieLegend');
  if (lg) {
    lg.innerHTML = CAT_ORDER.map(function (k) {
      const v = counts[k];
      return '<div class="lr">' +
        '<span class="sw" style="background:' + CATS[k].hex + '"></span>' +
        '<span class="nm">' + CATS[k].full + '</span>' +
        '<span class="vl">' + fmt(v) + '</span>' +
        '<span class="pc">' + (v / total * 100).toFixed(1) + '%</span>' +
        '</div>';
    }).join('');
  }
}

/* 各省份三分类堆叠：3D 横条，省名在左、总枪数在右 */
function drawProvStack() {
  const host = $('provChart');
  if (!host) return;
  if (provView) { provView.dispose(); provView = null; }
  host.innerHTML = '';
  host.style.position = 'relative';

  const top = PROV_STATS.slice(0, 20).reverse();
  if (!top.length) return;

  provView = TK.create(host, { fov: 30, controls: false, alpha: true });
  const scene = provView.scene;

  const ROW = 1.15, BD = 0.72, BH = 0.62;
  const maxTotal = Math.max.apply(null, top.map(function (p) { return p.total; }));
  const W = 24;
  const unit = W / maxTotal;

  top.forEach(function (p, i) {
    const z = -(top.length - 1 - i) * ROW;
    let x = 0;
    CAT_ORDER.forEach(function (cat) {
      const n = cat === 'highway' ? p.hw : (cat === 'brand' ? p.brand : p.inst);
      if (!n) return;
      const w = n * unit;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, BH, BD), TK.matte(CATS[cat].hex));
      m.position.set(x + w / 2, 0, z);
      scene.add(m);
      x += w;
    });
    const nm = document.createElement('div');
    nm.className = 'tk-tag is-plain';
    nm.textContent = p.prov;
    provView.addLabel(nm, new THREE.Vector3(-0.4, 0, z), { dx: -28 });

    const vv = document.createElement('div');
    vv.className = 'tk-tag is-plain mono';
    vv.textContent = fmt(p.guns);
    provView.addLabel(vv, new THREE.Vector3(x + 0.5, 0, z), { dx: 26 });
  });

  /* 取景：把「条 + 左右两侧标签」的整体范围装进画面并居中 */
  const fitStack = function () {
    const totalH = (top.length - 1) * ROW;
    const cam = provView.camera, TILT = 62;
    /* 左右各留出省名 / 总枪数的标签宽度（屏幕像素 -> 世界单位粗估） */
    const padX = 3.2;
    const dist = TK.fitDistanceBox(cam, provView.container, {
      minX: -padX, maxX: W + padX, minY: -0.4, maxY: 0.6,
      minZ: -totalH - 0.8, maxZ: 0.8,
    }, TILT, 1.04);
    const tx = W / 2, tz = -totalH / 2;
    cam.position.set(tx, dist * Math.sin(TILT * TK.DEG), tz + dist * Math.cos(TILT * TK.DEG));
    cam.lookAt(tx, 0, tz);
    provView.renderOnce();
  };
  fitStack();
  provView.onResize(fitStack);
}

/* ------------------------------------------------------------ 初始化 */
function initMapModule() {
  document.querySelectorAll('[data-maptype]').forEach(function (b) {
    b.addEventListener('click', function () { setMapType(b.dataset.maptype); });
  });
  document.querySelectorAll('#distribution .seg-btn[data-cat]').forEach(function (b) {
    b.addEventListener('click', function () { setMapCat(b.dataset.cat); });
  });
  const bn = $('backNation');
  if (bn) bn.addEventListener('click', backToNation);
  const cb = $('clearRouteBtn');
  if (cb) cb.addEventListener('click', clearRouteOverlay);
}
