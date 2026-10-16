/* ============================================================================
   core.js · 数据归一化 · 统计 · 排行榜 · 站点明细 · 今日新增 · 弹窗 · 分节导航
   算法口径沿用原站实现，展示层全部重写。
   ========================================================================== */
'use strict';

const RAW = window.FC_DATA || { stations: [], prevDay: null, newToday: null };

/* 短键 -> 语义键（沿用原站字段名，后续所有算法与原站一致） */
const STATIONS = (RAW.stations || []).map(function (o) {
  return {
    name: o.n, lat: o.lat, lng: o.lng, address: o.a,
    province: o.p, city: o.c,
    superNum: o.g, idleSuperNum: o.i,
    category: o.k, tag: o.t,
    status: o.s ? 'offline' : 'online',
    lastSeen: o.seen, recheckDate: o.rc,
  };
});
const PREV_DAY = RAW.prevDay || null;
const NEW_TODAY = RAW.newToday || null;

/* 品类元数据：颜色取自 brand-spec.md 的 OKLch 换算表（zrender 不解析 oklch） */
const CATS = {
  highway:   { label: '高速',   full: '高速充电站', hex: '#006bbb', ink: '#00488f', css: 'var(--c-highway)' },
  brand:     { label: '品牌',   full: '品牌充电站', hex: '#8048b6', ink: '#622c91', css: 'var(--c-brand)' },
  instation: { label: '站中站', full: '站中站',     hex: '#008585', ink: '#00565d', css: 'var(--c-instation)' },
};
const CAT_ORDER = ['highway', 'brand', 'instation'];

const PAL = {
  ink: '#121c23', muted: '#5a656d', grid: '#ebeff2', border: '#d9dfe3',
  surface: '#ffffff', surface2: '#f0f4f7', surface3: '#e7ecf0',
  accent: '#299236', accentDeep: '#076b29', danger: '#c92f33', warn: '#cb7f00',
  offline: '#8c9399', road: '#80878d',
  heat: ['#e5f0fc', '#b1d6f6', '#5eade2', '#007ac5', '#00488f'],
  /* three.js 专用补充（同样沿 oklch 换算，换算表见 docs/brand-spec.md） */
  borderStrong: '#b9c2c9',   /* 省界缝 / 结构线 */
  roadHi: '#4aa3e0',         /* 路线高速段（--c-highway 提亮版） */
  accentTint: '#e4f4e6',     /* 省份悬停底（--accent-tint） */
};

const $ = function (id) { return document.getElementById(id); };
const fmt = function (n) { return Number(n || 0).toLocaleString('zh-CN'); };
const esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};
const catPill = function (cat, text) {
  const c = CATS[cat];
  return '<span class="pill" data-cat="' + (c ? cat : 'plain') + '">' + esc(text || (c ? c.label : '—')) + '</span>';
};

let CITY_STATS = [];
let PROV_STATS = [];

/* ------------------------------------------------------------ 统计卡片 */
function buildStats() {
  const counts = { highway: 0, brand: 0, instation: 0 };
  const guns = { highway: 0, brand: 0, instation: 0 };
  STATIONS.forEach(function (s) {
    if (counts[s.category] === undefined) return;
    counts[s.category]++;
    guns[s.category] += s.superNum || 0;
  });
  const total = STATIONS.length;
  const totalG = STATIONS.reduce(function (a, s) { return a + (s.superNum || 0); }, 0);
  const totalIdle = STATIONS.reduce(function (a, s) { return a + (s.idleSuperNum || 0); }, 0);
  const offlineN = STATIONS.filter(function (s) { return s.status === 'offline'; }).length;
  const onlineN = total - offlineN;
  const cityN = new Set(STATIONS.map(function (s) { return s.city; })).size;
  const provN = new Set(STATIONS.map(function (s) { return s.province; })).size;

  $('cTotal').textContent = fmt(total);
  $('cTotalSub').innerHTML = '在线 <b>' + fmt(onlineN) + '</b> · 下线 <b>' + fmt(offlineN) + '</b>';
  $('cGuns').textContent = fmt(totalG);
  $('cGunsSub').innerHTML = '平均利用率 ' + ((1 - totalIdle / totalG) * 100).toFixed(1) + '%';
  $('cHw').textContent = fmt(counts.highway);
  $('cHwSub').innerHTML = '枪 <b>' + fmt(guns.highway) + '</b> · 占 ' + (counts.highway / total * 100).toFixed(1) + '%';
  $('cBrand').textContent = fmt(counts.brand);
  $('cBrandSub').innerHTML = '枪 <b>' + fmt(guns.brand) + '</b> · 占 ' + (counts.brand / total * 100).toFixed(1) + '%';
  $('cInst').textContent = fmt(counts.instation);
  $('cInstSub').innerHTML = '枪 <b>' + fmt(guns.instation) + '</b> · 占 ' + (counts.instation / total * 100).toFixed(1) + '%';
  $('cCities').textContent = fmt(cityN);
  $('cCitiesSub').textContent = '覆盖 ' + provN + ' 个省级行政区';

  $('cntAll').textContent = fmt(total);
  $('cntHw').textContent = fmt(counts.highway);
  $('cntBrand').textContent = fmt(counts.brand);
  $('cntInst').textContent = fmt(counts.instation);
  $('dtCntHw').textContent = fmt(counts.highway);
  $('dtCntBrand').textContent = fmt(counts.brand);
  $('dtCntInst').textContent = fmt(counts.instation);
  const vs = $('visitStats');
  if (vs) vs.innerHTML = '数据快照 <b>' + fmt(total) + '</b> 站';

  renderDeltas({
    total: total, guns: totalG,
    highway: counts.highway, brand: counts.brand, instation: counts.instation, cities: cityN,
  });
}

function renderDeltas(cur) {
  if (!PREV_DAY || typeof PREV_DAY.total !== 'number') return;
  const items = [
    ['dTotal', cur.total, PREV_DAY.total],
    ['dGuns', cur.guns, PREV_DAY.guns],
    ['dHw', cur.highway, PREV_DAY.highway],
    ['dBrand', cur.brand, PREV_DAY.brand],
    ['dInst', cur.instation, PREV_DAY.instation],
    ['dCities', cur.cities, PREV_DAY.cities],
  ];
  const prevDate = PREV_DAY.date ? '较 ' + PREV_DAY.date + ' 快照' : '较昨日快照';
  items.forEach(function (it) {
    const el = $(it[0]);
    if (!el || typeof it[2] !== 'number') return;
    const d = it[1] - it[2];
    if (d > 0) { el.className = 'delta delta-up'; el.textContent = '+ ' + d; }
    else if (d < 0) { el.className = 'delta delta-down'; el.textContent = '− ' + Math.abs(d); }
    else { el.className = 'delta delta-flat'; el.textContent = '持平'; }
    el.title = prevDate;
    el.hidden = false;
  });
}

/* ------------------------------------------------------------ 排行榜 */
function buildTables() {
  const cm = {};
  const pm = {};
  STATIONS.forEach(function (s) {
    const k = s.city;
    if (!cm[k]) cm[k] = { city: k, province: s.province, hw: 0, brand: 0, inst: 0, total: 0, guns: 0, idleGuns: 0 };
    const c = cm[k];
    c.total++; c.guns += s.superNum || 0; c.idleGuns += s.idleSuperNum || 0;
    if (s.category === 'highway') c.hw++;
    else if (s.category === 'brand') c.brand++;
    else c.inst++;

    const pk = s.province;
    if (!pm[pk]) pm[pk] = { prov: pk, hw: 0, brand: 0, inst: 0, total: 0, guns: 0 };
    const p = pm[pk];
    p.total++; p.guns += s.superNum || 0;
    if (s.category === 'highway') p.hw++;
    else if (s.category === 'brand') p.brand++;
    else p.inst++;
  });
  CITY_STATS = Object.keys(cm).map(function (k) { return cm[k]; }).sort(function (a, b) { return b.guns - a.guns; });
  PROV_STATS = Object.keys(pm).map(function (k) { return pm[k]; }).sort(function (a, b) { return b.guns - a.guns; });
  renderCityTable(CITY_STATS);
  renderProvTable(PROV_STATS);
  fillCityOptions();
}

function medal(i) {
  if (i < 3) return '<span class="rank-medal" data-rank="' + (i + 1) + '">' + (i + 1) + '</span>';
  return '<span class="rank-medal">' + (i + 1) + '</span>';
}

function catCell(scopeType, scopeKey, cat, val, colorVar) {
  if (!val) return '<td class="c n mut">0</td>';
  return '<td class="c n"><span class="linkable" style="color:' + colorVar + '"' +
    ' data-act="stations" data-scope="' + scopeType + '" data-key="' + esc(scopeKey) + '" data-cat="' + cat + '"' +
    ' title="点击查看明细">' + fmt(val) + '</span></td>';
}

function renderCityTable(list) {
  const tb = $('cityTbody');
  const cc = $('cityCount');
  if (cc) cc.textContent = '共 ' + fmt(list.length) + ' 个城市';
  if (!list.length) { tb.innerHTML = '<tr><td class="empty" colspan="9">没有匹配的城市。</td></tr>'; return; }
  tb.innerHTML = list.map(function (c, i) {
    return '<tr>' +
      '<td class="c">' + medal(i) + '</td>' +
      '<td><span class="linkable plain" data-act="stations" data-scope="city" data-key="' + esc(c.city) + '" data-cat="all" title="查看 ' + esc(c.city) + ' 全部站点">' + esc(c.city) + '</span></td>' +
      '<td class="dim">' + esc(c.province) + '</td>' +
      catCell('city', c.city, 'highway', c.hw, 'var(--c-highway-ink)') +
      catCell('city', c.city, 'brand', c.brand, 'var(--c-brand-ink)') +
      catCell('city', c.city, 'instation', c.inst, 'var(--c-instation-ink)') +
      catCell('city', c.city, 'all', c.total, 'var(--fg-strong)') +
      '<td class="c num-strong">' + fmt(c.guns) + '</td>' +
      '<td class="c n dim">' + fmt(c.idleGuns) + '</td>' +
      '</tr>';
  }).join('');
}

function renderProvTable(list) {
  const tb = $('provTbody');
  tb.innerHTML = list.map(function (p, i) {
    return '<tr>' +
      '<td class="c">' + medal(i) + '</td>' +
      '<td><span class="linkable plain" data-act="stations" data-scope="province" data-key="' + esc(p.prov) + '" data-cat="all" title="查看 ' + esc(p.prov) + ' 全部站点">' + esc(p.prov) + '</span></td>' +
      catCell('province', p.prov, 'highway', p.hw, 'var(--c-highway-ink)') +
      catCell('province', p.prov, 'brand', p.brand, 'var(--c-brand-ink)') +
      catCell('province', p.prov, 'instation', p.inst, 'var(--c-instation-ink)') +
      catCell('province', p.prov, 'all', p.total, 'var(--fg-strong)') +
      '<td class="c num-strong">' + fmt(p.guns) + '</td>' +
      '</tr>';
  }).join('');
}

/* ------------------------------------------------------- 站点明细弹窗 */
let modalCtx = null;

function districtOf(s) {
  let a = s.address || '';
  if (!a) return '其他';
  if (s.province && a.indexOf(s.province) === 0) a = a.slice(s.province.length);
  const cm = a.match(/^(.+?(?:市|自治州|盟|地区))/);
  if (cm) a = a.slice(cm[1].length);
  const dm = a.match(/^(.+?(?:区|县|旗|市))/);
  return dm ? dm[1] : (a.slice(0, 4) || '其他');
}

function showStations(type, key, cat) {
  const pool = STATIONS.filter(function (s) { return type === 'city' ? s.city === key : s.province === key; });
  modalCtx = { type: type, key: key, cat: cat, pool: pool };
  const catName = { highway: '高速充电站', brand: '品牌充电站', instation: '站中站', all: '全部站点' }[cat];
  const filtered = pool.filter(function (s) { return cat === 'all' || s.category === cat; });
  $('cityModalTitle').textContent = key + ' · ' + catName;
  $('cityModalSub').textContent =
    (type === 'city' ? '城市' : '省份') + '：' + key + ' ｜ 类型：' + catName +
    ' ｜ 共 ' + filtered.length + ' 站（按区县分组）';
  const dset = {};
  filtered.forEach(function (s) { dset[districtOf(s)] = 1; });
  const districts = Object.keys(dset).sort();
  const sel = $('cityModalDistrict');
  sel.innerHTML = '<option value="">全部区县（' + districts.length + '）</option>' +
    districts.map(function (d) {
      const n = filtered.filter(function (s) { return districtOf(s) === d; }).length;
      return '<option value="' + esc(d) + '">' + esc(d) + '（' + n + '）</option>';
    }).join('');
  sel.value = '';
  $('cityModalSearch').value = '';
  $('cityModal').hidden = false;
  document.body.style.overflow = 'hidden';
  renderCityModal();
}

function closeCityModal() {
  $('cityModal').hidden = true;
  document.body.style.overflow = '';
  modalCtx = null;
}

function renderCityModal() {
  if (!modalCtx) return;
  const cat = modalCtx.cat;
  const pool = modalCtx.pool;
  const dist = $('cityModalDistrict').value;
  const kw = $('cityModalSearch').value.trim().toLowerCase();
  let list = pool.filter(function (s) { return cat === 'all' || s.category === cat; });
  if (dist) list = list.filter(function (s) { return districtOf(s) === dist; });
  if (kw) list = list.filter(function (s) {
    return (s.name || '').toLowerCase().indexOf(kw) >= 0 || (s.address || '').toLowerCase().indexOf(kw) >= 0;
  });
  $('cityModalCount').textContent = '显示 ' + fmt(list.length) + ' / ' + fmt(pool.filter(function (s) {
    return cat === 'all' || s.category === cat;
  }).length) + ' 站';

  const body = $('cityModalBody');
  if (!list.length) { body.innerHTML = '<div class="dim" style="padding:20px 0">没有匹配的站点。</div>'; return; }

  const groups = {};
  list.forEach(function (s) { const d = districtOf(s); (groups[d] = groups[d] || []).push(s); });
  const keys = Object.keys(groups).sort(function (a, b) { return groups[b].length - groups[a].length; });
  body.innerHTML = keys.map(function (d) {
    const rows = groups[d].sort(function (a, b) { return b.superNum - a.superNum; }).map(function (s, i) {
      const off = s.status === 'offline';
      const tip = off
        ? (s.recheckDate
          ? '最后在线 ' + s.lastSeen + '；已于 ' + s.recheckDate + ' 复核确认下线'
          : '最后在线 ' + s.lastSeen)
        : '';
      return '<tr>' +
        '<td class="c n mut shrink">' + (i + 1) + '</td>' +
        '<td><span class="name' + (off ? ' off' : '') + '">' + esc(s.name) + '</span>' +
          (off ? ' <span class="pill" data-cat="off"' + (tip ? ' title="' + esc(tip) + '"' : '') + '>下线' + (s.recheckDate ? '·已复核' : '') + '</span>' : '') + '</td>' +
        '<td class="shrink">' + catPill(s.category, s.tag || CATS[s.category].label) + '</td>' +
        '<td class="addr">' + esc(s.address || '') + '</td>' +
        '<td class="c num-strong shrink">' + s.superNum + '</td>' +
        '<td class="c n shrink" style="color:' + (s.idleSuperNum > 0 ? 'var(--fg)' : 'var(--warn-ink)') + '">' + s.idleSuperNum + '</td>' +
        '</tr>';
    }).join('');
    return '<div class="district-group">' +
      '<div class="district-head"><span>' + esc(d) + '</span><span class="n">' + groups[d].length + ' 站</span></div>' +
      '<div class="district-body"><table class="tbl"><tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  }).join('');
}

/* --------------------------------------------------------- 站点明细页 */
let detailCat = 'highway';

function setDetailCat(cat) {
  detailCat = cat;
  document.querySelectorAll('#detailTabs .seg-btn').forEach(function (b) {
    b.setAttribute('aria-pressed', String(b.dataset.cat === cat));
  });
  const si = $('detailSearch');
  if (si) si.value = '';
  renderDetail();
}

function renderDetail() {
  const desc = {
    highway: '高速站 = 站名或地址含 高速 / 服务区 / 收费站 / 匝道 / 枢纽 / 互通 / 出口（排除「进出口」）。',
    brand: '品牌站 = 站名含 比亚迪 / 王朝 / 海洋 / 腾势 / 方程豹 / 仰望 / 4S 等品牌关键词。',
    instation: '站中站 = 其余全部，多建在商场、写字楼、停车场等场站内。',
  };
  const base = STATIONS.filter(function (s) { return s.category === detailCat; });
  const kwEl = $('detailSearch');
  const kw = (kwEl ? kwEl.value : '').trim().toLowerCase();
  const list = base.filter(function (s) {
    return !kw || (s.name || '').toLowerCase().indexOf(kw) >= 0
      || (s.city || '').toLowerCase().indexOf(kw) >= 0
      || (s.address || '').toLowerCase().indexOf(kw) >= 0;
  }).sort(function (a, b) { return b.superNum - a.superNum; });

  $('detailDesc').textContent = desc[detailCat] + (kw
    ? '　匹配 ' + fmt(list.length) + ' / ' + fmt(base.length) + ' 站'
    : '　共 ' + fmt(base.length) + ' 站，按闪充枪数降序。') + '　空闲枪为 0 的站点以琥珀色标出。';

  const tb = $('detailTbody');
  if (!list.length) { tb.innerHTML = '<tr><td class="empty" colspan="7">没有匹配的站点，换个关键词试试。</td></tr>'; return; }
  const hex = CATS[detailCat].hex;
  tb.innerHTML = list.map(function (s, i) {
    const off = s.status === 'offline';
    return '<tr>' +
      '<td class="c n mut shrink">' + (i + 1) + '</td>' +
      '<td><span class="name' + (off ? ' off' : '') + '">' + esc(s.name) + '</span>' +
        (off ? ' <span class="pill" data-cat="off" title="' + esc(s.recheckDate ? '最后在线 ' + s.lastSeen + '；已于 ' + s.recheckDate + ' 复核确认下线' : '最后在线 ' + s.lastSeen) + '">下线' + (s.recheckDate ? '·已复核' : '') + '</span>' : '') + '</td>' +
      '<td class="shrink">' + catPill(detailCat, s.tag || (detailCat === 'instation' ? '场站' : CATS[detailCat].label)) + '</td>' +
      '<td class="dim shrink">' + esc(s.city) + '</td>' +
      '<td class="addr">' + esc(s.address || '') + '</td>' +
      '<td class="c num-strong shrink">' + s.superNum + '</td>' +
      '<td class="c n shrink" style="color:' + (s.idleSuperNum > 0 ? 'var(--fg)' : 'var(--warn-ink)') + '">' + s.idleSuperNum + '</td>' +
      '</tr>';
  }).join('');
}

/* ---------------------------------------------------------- 今日新增 */
let newCatFilter = 'all';

function setNewCat(cat) {
  newCatFilter = cat;
  document.querySelectorAll('#newCatFilter .seg-btn').forEach(function (b) {
    b.setAttribute('aria-pressed', String(b.dataset.ncat === cat));
  });
  renderNewToday();
}

function renderNewToday() {
  const badge = $('newTodayBadge');
  const desc = $('newTodayDesc');
  const tb = $('newTbody');
  if (!badge || !tb) return;

  if (!NEW_TODAY) {
    badge.textContent = '暂不可用';
    desc.textContent = '尚未生成今日新增数据。';
    tb.innerHTML = '<tr><td class="empty" colspan="7">暂无数据</td></tr>';
    return;
  }

  const grp = NEW_TODAY.newByCategory || { highway: [], brand: [], instation: [] };
  const cHw = grp.highway.length, cBrand = grp.brand.length, cInst = grp.instation.length;
  const totalNew = cHw + cBrand + cInst;
  const offTotal = NEW_TODAY.offlineCount || 0;
  const offToday = NEW_TODAY.offlineTodayCount || 0;
  const set = function (id, v) { const e = $(id); if (e) e.textContent = v ? fmt(v) : '0'; };
  set('ncAll', totalNew); set('ncHw', cHw); set('ncBrand', cBrand); set('ncInst', cInst);

  if (totalNew > 0) {
    badge.textContent = '本次更新新增 ' + fmt(totalNew) + ' 站';
    desc.innerHTML = '口径：按站点 id 记录的「首次出现」判定新增，消除改名与迁址误判。' +
      ' 高速 <b>' + cHw + '</b> · 品牌 <b>' + cBrand + '</b> · 站中站 <b>' + cInst + '</b>' +
      (offToday ? '　｜　今日下线 <b>' + offToday + '</b> 站' : '') +
      (offTotal ? '　｜　累计下线 <b>' + offTotal + '</b> 站（数据保留，总数不变）' : '');
  } else {
    badge.textContent = '本次无新增';
    desc.innerHTML = '累计收录 <b>' + (NEW_TODAY.totalStations != null ? fmt(NEW_TODAY.totalStations) : '—') + '</b> 站，本次更新没有新上线的站。' +
      (offTotal ? '　其中 <b>' + offTotal + '</b> 站已标注「下线」。' : '');
  }

  let list = newCatFilter === 'all'
    ? [].concat(grp.highway, grp.brand, grp.instation)
    : (grp[newCatFilter] || []);

  const kwEl = $('newSearch');
  const kw = (kwEl ? kwEl.value : '').trim().toLowerCase();
  if (kw) list = list.filter(function (s) {
    return (s.name || '').toLowerCase().indexOf(kw) >= 0
      || (s.city || '').toLowerCase().indexOf(kw) >= 0
      || (s.province || '').toLowerCase().indexOf(kw) >= 0
      || (s.address || '').toLowerCase().indexOf(kw) >= 0;
  });

  if (!list.length) {
    tb.innerHTML = '<tr><td class="empty" colspan="7">' +
      (totalNew ? '没有匹配的站点，换个关键词试试。' : '累计收录已含全部站点，本次更新无新增。') + '</td></tr>';
    return;
  }
  tb.innerHTML = list.map(function (s, i) {
    const tag = s.category === 'highway' ? (s.highwayTag || '高速')
      : s.category === 'brand' ? (s.brandTag || '品牌') : '场站';
    return '<tr>' +
      '<td class="c n mut shrink">' + (i + 1) + '</td>' +
      '<td><span class="name">' + esc(s.name) + '</span></td>' +
      '<td class="shrink">' + catPill(s.category, tag) + '</td>' +
      '<td class="dim shrink">' + esc(s.city) + '</td>' +
      '<td class="dim shrink" style="font-size:11.5px">' + esc(s.province || '') + '</td>' +
      '<td class="addr">' + esc(s.address || '') + '</td>' +
      '<td class="c num-strong shrink">' + (s.superNum || 0) + '</td>' +
      '</tr>';
  }).join('');
}

/* -------------------------------------------------------- 城市自动补全 */
function normCity(s) { return String(s || '').trim().replace(/市$/, ''); }

function fillCityOptions() {
  const dl = $('cityOptions');
  if (!dl) return;
  const seen = {};
  STATIONS.forEach(function (s) { if (s.city) seen[normCity(s.city)] = 1; });
  dl.innerHTML = Object.keys(seen).sort().map(function (c) {
    return '<option value="' + esc(c) + '"></option>';
  }).join('');
}

/* ------------------------------------------------------------ 事件绑定 */
function bindCore() {
  /* 排行榜里的下钻（事件委托，避免内联 onclick 的转义风险） */
  document.addEventListener('click', function (e) {
    const src = e.target instanceof Element ? e.target : e.target.parentElement;
    if (!src) return;
    const t = src.closest('[data-act="stations"]');
    if (!t) return;
    showStations(t.dataset.scope, t.dataset.key, t.dataset.cat);
  });

  $('citySearch').addEventListener('input', function (e) {
    const v = e.target.value.trim().toLowerCase();
    if (!v) return renderCityTable(CITY_STATS);
    renderCityTable(CITY_STATS.filter(function (c) {
      return c.city.toLowerCase().indexOf(v) >= 0 || c.province.toLowerCase().indexOf(v) >= 0;
    }));
  });

  $('detailSearch').addEventListener('input', renderDetail);
  $('newSearch').addEventListener('input', renderNewToday);

  document.querySelectorAll('#detailTabs .seg-btn').forEach(function (b) {
    b.addEventListener('click', function () { setDetailCat(b.dataset.cat); });
  });
  document.querySelectorAll('#newCatFilter .seg-btn').forEach(function (b) {
    b.addEventListener('click', function () { setNewCat(b.dataset.ncat); });
  });

  $('closeCityModal').addEventListener('click', closeCityModal);
  $('cityModal').addEventListener('click', function (e) { if (e.target === this) closeCityModal(); });
  $('cityModalDistrict').addEventListener('change', renderCityModal);
  $('cityModalSearch').addEventListener('input', renderCityModal);

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('cityModal').hidden) closeCityModal();
  });

  setupSectionNav();
}

/* ------------------------------------------------------- 分节导航滚动 */
function setupSectionNav() {
  const links = Array.prototype.slice.call(document.querySelectorAll('#sectionNav .navlink'));
  const secs = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  const offset = 56 + 42 + 8;

  links.forEach(function (a) {
    a.addEventListener('click', function (e) {
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.pageYOffset - offset;
      window.scrollTo({ top: top, behavior: 'smooth' });
      history.replaceState(null, '', a.getAttribute('href'));
    });
  });

  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      const i = secs.indexOf(en.target);
      if (i < 0) return;
      links.forEach(function (a, j) { a.setAttribute('aria-current', String(i === j)); });
    });
  }, { rootMargin: '-' + offset + 'px 0px -55% 0px', threshold: 0 });
  secs.forEach(function (s) { if (s) io.observe(s); });
}
