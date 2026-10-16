/* ============================================================================
   workforce.js · 比亚迪人力与薪酬（09 面板）· 全部图表为 three.js
   数据来自 byd_workforce.json（年报 / ESG 口径，人工录入，与站点数据无关）。
   视觉沿用 tech-utility：浅底、发丝线、等宽数字、品类色只用于数据编码。
   ========================================================================== */
'use strict';

const WORKFORCE = window.FC_WORKFORCE || null;
const WF_VIEWS = [];

/* 数字格式化 */
const wfInt = function (n) { return Number(n).toLocaleString('zh-CN'); };
const wfWan = function (n) { return (n / 10000).toFixed(1); };
const wfW = function (n, d) { return Number(n).toFixed(d == null ? 1 : d); };
const wfAmt = function (n) { return Number(Number(n).toFixed(2)).toLocaleString('zh-CN'); };

/* ------------------------------------------------------------ 面板渲染 */
function renderWorkforce() {
  const badge = $('wfBadge');
  if (!badge) return;
  const cellIds = ['wfHeadChart', 'wfJobChart', 'wfEduChart', 'wfPayChart'];

  if (!WORKFORCE || !WORKFORCE.headcount || !WORKFORCE.pay) {
    badge.textContent = '暂不可用';
    cellIds.forEach(function (id) {
      const el = $(id);
      if (el && el.closest('.wf-cell')) el.closest('.wf-cell').hidden = true;
    });
    const tb = $('wfBoardTbody');
    if (tb) tb.innerHTML = '<tr><td class="empty" colspan="5">未找到 byd_workforce.json，人力模块已隐藏。</td></tr>';
    const notes = $('wfNotes');
    if (notes) notes.innerHTML = '把年报口径的数字填入 <span class="mono">byd_workforce.json</span>，再运行 <span class="mono">node tools/build-data.mjs</span> 即可自动展示（字段结构见该文件）。';
    return;
  }

  const hs = WORKFORCE.headcount.series || [];
  const last = hs[hs.length - 1];
  const prev = hs[hs.length - 2] || last;
  const jobs = (WORKFORCE.jobs && WORKFORCE.jobs.items) || [];
  const edu = (WORKFORCE.education && WORKFORCE.education.items) || [];
  const pay = WORKFORCE.pay;
  const emp = pay.employee || {};
  const inj = (WORKFORCE.social && WORKFORCE.social.injury2024) || { covered: 0, spendYuan: 0 };

  const totalJobs = jobs.reduce(function (a, j) { return a + j.n; }, 0) || last.total;
  const prod = jobs.find(function (j) { return j.key === 'production'; }) || { n: 0 };
  const rd = jobs.find(function (j) { return j.key === 'rd'; }) || { n: 0 };
  const lowEdu = edu.find(function (e) { return e.label.indexOf('大专') === 0; }) || { n: 0 };
  const execAvg = pay.execTotalWan / pay.execCount;
  const avg = pay.cashPaidToEmployees2025Yuan / last.total / 10000;
  const top = pay.people[0];
  const chairman = pay.people.find(function (p) { return p.name === '王传福'; }) || top;
  const frontline = emp.frontlineAnnualMidWan || 7.2;

  badge.textContent = '年报口径 · 截至 ' + WORKFORCE.meta.asOf;
  const asOf = $('wfAsOf');
  if (asOf) asOf.textContent = WORKFORCE.meta.report || '';

  const dHead = last.total - prev.total;
  const kpis = [
    { k: '员工总数（' + last.year + ' 末）', v: wfInt(last.total), u: '人', cls: '',
      s: '较 ' + prev.year + ' 年 <b>' + (dHead < 0 ? '−' : '+') + wfInt(Math.abs(dHead)) + '</b> 人（' + (dHead < 0 ? '−' : '') + wfW(Math.abs(dHead) / prev.total * 100) + '%）' },
    { k: '社保覆盖率（正式员工）', v: '100', u: '%', cls: 'accent',
      s: '2024 年工伤险覆盖 <b>' + wfInt(inj.covered) + '</b> 人 · 投入 ' + wfW(inj.spendYuan / 100000000, 2) + ' 亿元' },
    { k: '全员人均用工成本', v: wfW(avg), u: '万元/年', cls: '',
      s: '含公司承担的社保公积金 · 媒体口径 ' + wfW(emp.avgPerHeadMedia2025Wan, 2) + ' 万元' },
    { k: '董监高人均薪酬', v: wfW(execAvg), u: '万元/年', cls: 'warn',
      s: pay.execCount + ' 人合计 ' + wfInt(pay.execTotalWan) + ' 万元 · 占全部用工支出 ' + wfW(pay.execTotalWan / (pay.cashPaidToEmployees2025Yuan / 10000) * 100, 2) + '%' },
    { k: '最高 ÷ 全员人均', v: wfW(top.payWan / avg, 0), u: '倍', cls: 'danger',
      s: esc(top.name) + '（' + esc(top.title) + '）' + wfInt(top.payWan) + ' 万元/年' },
    { k: '一线生产岗占比', v: wfW(prod.n / totalJobs * 100), u: '%', cls: '',
      s: '研发技术人员 <b>' + wfW(rd.n / totalJobs * 100) + '%</b> · 大专及以下 ' + wfW(lowEdu.n / totalJobs * 100) + '%' },
  ];
  const kpiEl = $('wfKpis');
  if (kpiEl) {
    kpiEl.innerHTML = kpis.map(function (k) {
      return '<div class="kpi' + (k.cls ? ' ' + k.cls : '') + '">' +
        '<div class="k">' + k.k + '</div>' +
        '<div class="v">' + k.v + '<span class="u">' + k.u + '</span></div>' +
        '<div class="s">' + k.s + '</div>' +
        '</div>';
    }).join('');
  }

  const boardSub = $('wfBoardSub');
  if (boardSub) {
    boardSub.textContent = '2025 年 · 税前 · ' + pay.execCount + ' 人合计 ' + wfInt(pay.execTotalWan) + ' 万元';
  }
  const tb = $('wfBoardTbody');
  if (tb) {
    tb.innerHTML = pay.people.map(function (p, i) {
      const m = i < 3
        ? '<span class="rank-medal" data-rank="' + (i + 1) + '">' + (i + 1) + '</span>'
        : '<span class="rank-medal">' + (i + 1) + '</span>';
      return '<tr>' +
        '<td class="c">' + m + '</td>' +
        '<td class="name">' + esc(p.name) + '</td>' +
        '<td class="dim">' + esc(p.title) + '</td>' +
        '<td class="c num-strong">' + p.payWan.toFixed(2) + '</td>' +
        '<td class="c n dim">' + (p.payWan / avg).toFixed(0) + ' 倍</td>' +
        '</tr>';
    }).join('');
  }

  const notes = $('wfNotes');
  if (notes) {
    const src = (WORKFORCE.sources || []).map(function (s) {
      return s.url
        ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.label) + '</a>'
        : esc(s.label);
    }).join(' · ');
    notes.innerHTML =
      '<div class="spec-body">' +
      (WORKFORCE.notes || []).map(function (t) { return '<p>· ' + esc(t) + '</p>'; }).join('') +
      (src ? '<p style="margin-top:6px"><span class="dim">数据来源：</span>' + src + '</p>' : '') +
      '</div>';
  }

  drawWorkforce(hs, jobs, totalJobs, edu, { pay: pay, execAvg: execAvg, avg: avg, top: top, chairman: chairman, frontline: frontline });
}

/* ------------------------------------------------------------ 视图工具 */
/* 每张图一个独立 three.js 场景；返回 view 并登记以便重绘时销毁 */
function wfView(id) {
  const host = $(id);
  if (!host) return null;
  const old = WF_VIEWS.find(function (v) { return v.host === host; });
  if (old) { old.view.dispose(); WF_VIEWS.splice(WF_VIEWS.indexOf(old), 1); }
  host.innerHTML = '';
  host.style.position = 'relative';
  const view = TK.create(host, { fov: 30, controls: false, alpha: true });
  WF_VIEWS.push({ host: host, view: view });
  return view;
}

/* ------------------------------------------------------------ 四张图 */
function drawWorkforce(hs, jobs, totalJobs, edu, ctx) {
  drawWfHead(hs);
  drawWfJobs(jobs, totalJobs);
  drawWfEdu(edu);
  drawWfPay(ctx);
}

/* ① 员工总数（年度柱状） */
function drawWfHead(hs) {
  const V = wfView('wfHeadChart');
  if (!V) return;
  const BW = 1.5, GAP = 0.85, DEPTH = 1.5;
  const maxN = Math.max.apply(null, hs.map(function (h) { return h.total; }));
  const HMAX = 6.2;

  hs.forEach(function (h, i) {
    const hh = (h.total / maxN) * HMAX;
    const x = i * (BW + GAP);
    /* 当年走强调色；估算年份最浅；其余年份中性灰 */
    const color = h.est ? '#c3ccd3' : (i === hs.length - 1 ? PAL.accent : PAL.offline);
    const m = new THREE.Mesh(new THREE.BoxGeometry(BW, hh, DEPTH), TK.matte(color));
    m.position.set(x, hh / 2, 0);
    V.scene.add(m);

    const lab = document.createElement('div');
    lab.className = 'tk-tag is-plain mono';
    lab.textContent = wfWan(h.total) + '万';
    V.addLabel(lab, new THREE.Vector3(x, hh + 0.35, 0));

    const yr = document.createElement('div');
    yr.className = 'tk-tag is-plain dim';
    yr.textContent = h.year + ' 末';
    V.addLabel(yr, new THREE.Vector3(x, -0.55, 0));
  });

  /* 基线 */
  const bw = hs.length * (BW + GAP);
  const base = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.06, DEPTH + 0.5), TK.matte(PAL.borderStrong));
  base.position.set((hs.length - 1) * (BW + GAP) / 2, -0.03, 0);
  V.scene.add(base);

  const fit = function () {
    const cam = V.camera, TILT = 60;
    const spanX = (hs.length - 1) * (BW + GAP) + BW;
    const dist = TK.fitDistanceBox(cam, V.container,
      { minX: -0.9, maxX: spanX + 0.9, minY: -1.3, maxY: HMAX + 1.3, minZ: -DEPTH / 2 - 0.5, maxZ: DEPTH / 2 + 0.5 },
      TILT, 1.03);
    const tx = spanX / 2;
    cam.position.set(tx, dist * Math.sin(TILT * TK.DEG), dist * Math.cos(TILT * TK.DEG));
    cam.lookAt(tx, HMAX * 0.42, 0);
    V.renderOnce();
  };
  fit();
  V.onResize(fit);
}

/* ② 岗位构成（横向柱状，值标在条右） */
function drawWfJobs(jobs, totalJobs) {
  const V = wfView('wfJobChart');
  if (!V) return;
  const list = jobs.slice().sort(function (a, b) { return a.n - b.n; });
  const ROW = 1.05, BH = 0.62, BD = 0.72;
  const maxN = Math.max.apply(null, list.map(function (j) { return j.n; }));
  const W = 13.5;
  const unit = W / maxN;

  list.forEach(function (j, i) {
    const z = -(list.length - 1 - i) * ROW;
    const w = Math.max(j.n * unit, 0.04);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, BH, BD), TK.matte(j.color));
    m.position.set(w / 2, 0, z);
    V.scene.add(m);

    const nm = document.createElement('div');
    nm.className = 'tk-tag is-plain';
    nm.textContent = j.label;
    V.addLabel(nm, new THREE.Vector3(0, 0, z), { dx: -46 });

    const vv = document.createElement('div');
    vv.className = 'tk-tag is-plain mono';
    vv.textContent = wfWan(j.n) + '万 · ' + wfW(j.n / totalJobs * 100) + '%';
    V.addLabel(vv, new THREE.Vector3(w + 0.25, 0, z), { dx: 46 });
  });

  const fit = function () {
    const cam = V.camera, TILT = 62;
    const totalH = (list.length - 1) * ROW;
    /* 左右各留标签宽度 */
    const dist = TK.fitDistanceBox(cam, V.container, {
      minX: -3.8, maxX: W + 6.2, minY: -0.6, maxY: 0.7, minZ: -totalH - 0.9, maxZ: 0.9,
    }, TILT, 1.03);
    const tx = W / 2, tz = -totalH / 2;
    cam.position.set(tx, dist * Math.sin(TILT * TK.DEG), tz + dist * Math.cos(TILT * TK.DEG));
    cam.lookAt(tx, 0, tz);
    V.renderOnce();
  };
  fit();
  V.onResize(fit);
}

/* ③ 学历结构（3D 环形） */
function drawWfEdu(edu) {
  const V = wfView('wfEduChart');
  if (!V) return;
  const total = edu.reduce(function (a, e) { return a + e.n; }, 0) || 1;
  const R0 = 2.0, R1 = 3.15, DEPTH = 0.72;
  let a0 = -Math.PI / 2;
  const gap = 0.03;
  edu.forEach(function (e) {
    const ang = (e.n / total) * Math.PI * 2;
    const g = TK.ringSectorGeometry(R0, R1, Math.max(ang - gap, 0.008));
    g.scale(1, DEPTH, 1);
    const m = new THREE.Mesh(g, TK.matte(e.color));
    m.rotation.y = a0;
    V.scene.add(m);
    a0 += ang;
  });

  const cen = document.createElement('div');
  cen.className = 'pie-center';
  cen.innerHTML = '<div class="v mono">' + wfWan(total) + '万</div><div class="k">员工总数</div>';
  V.addLabel(cen, new THREE.Vector3(0, DEPTH + 0.05, 0), { dy: 4 });

  const fit = function () {
    const cam = V.camera, TILT = 52;
    const R = R1 + 0.5;
    const dist = TK.fitDistanceBox(cam, V.container,
      { minX: -R, maxX: R, minY: 0, maxY: DEPTH, minZ: -R, maxZ: R }, TILT, 1.02);
    cam.position.set(0, dist * Math.sin(TILT * TK.DEG), dist * Math.cos(TILT * TK.DEG));
    cam.lookAt(0, 0, 0);
    V.renderOnce();
  };
  fit();
  V.onResize(fit);

  /* 图例带数值（不靠颜色单独承载信息） */
  const host = $('wfEduChart');
  if (host) {
    const lg = document.createElement('div');
    lg.className = 'wf-mini-legend';
    lg.innerHTML = edu.map(function (e) {
      return '<span class="it"><span class="sw" style="background:' + e.color + '"></span>' +
        esc(e.label) + ' <b class="mono">' + (e.n / total * 100).toFixed(1) + '%</b></span>';
    }).join('');
    host.appendChild(lg);
  }
}

/* ④ 薪酬梯度（对数轴横向柱状） */
function drawWfPay(ctx) {
  const V = wfView('wfPayChart');
  if (!V) return;
  const bars = [
    { label: '一线普工（估算）', v: ctx.frontline, c: PAL.offline },
    { label: '全员人均', v: ctx.avg, c: PAL.accent },
    { label: '研发人均（2024）', v: ctx.pay.employee.rdAvg2024Wan || ctx.avg * 1.7, c: PAL.highway },
    { label: '董监高人均', v: ctx.execAvg, c: PAL.warn },
    { label: '董事长 ' + ctx.chairman.name, v: ctx.chairman.payWan, c: PAL.brand },
    { label: '最高 ' + ctx.top.name, v: ctx.top.payWan, c: PAL.danger },
  ];
  const ROW = 1.05, BH = 0.62, BD = 0.72;
  /* 对数刻度：L = log10(v) - log10(1)，1 万 => 0，3000 万 => 顶 */
  const L0 = Math.log10(1), L1 = Math.log10(3000), W = 13.5;

  bars.forEach(function (b, i) {
    const z = -(bars.length - 1 - i) * ROW;
    const t = (Math.log10(Math.max(b.v, 1)) - L0) / (L1 - L0);
    const w = Math.max(TK.clamp(t, 0, 1) * W, 0.04);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, BH, BD), TK.matte(b.c));
    m.position.set(w / 2, 0, z);
    V.scene.add(m);

    const nm = document.createElement('div');
    nm.className = 'tk-tag is-plain';
    nm.textContent = b.label;
    V.addLabel(nm, new THREE.Vector3(0, 0, z), { dx: -46 });

    const vv = document.createElement('div');
    vv.className = 'tk-tag is-plain mono';
    vv.textContent = wfAmt(b.v) + '万 · ×' + wfW(b.v / ctx.avg, 2);
    V.addLabel(vv, new THREE.Vector3(w + 0.25, 0, z), { dx: 52 });
  });

  const fit = function () {
    const cam = V.camera, TILT = 62;
    const totalH = (bars.length - 1) * ROW;
    const dist = TK.fitDistanceBox(cam, V.container, {
      minX: -3.8, maxX: W + 7.6, minY: -0.6, maxY: 0.7, minZ: -totalH - 0.9, maxZ: 0.9,
    }, TILT, 1.03);
    const tx = W / 2, tz = -totalH / 2;
    cam.position.set(tx, dist * Math.sin(TILT * TK.DEG), tz + dist * Math.cos(TILT * TK.DEG));
    cam.lookAt(tx, 0, tz);
    V.renderOnce();
  };
  fit();
  V.onResize(fit);
}
