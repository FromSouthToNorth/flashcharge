/* ============================================================================
   three-kit.js · three.js 图表工具层
   为全站图表提供统一的：场景/相机/自适应、浅色仪器面板光照与材质、
   经纬度投影、HTML 标签叠加层、射线拾取（悬停/点击）。
   用色一律取 core.js 的 PAL（oklch 的 hex 换算表），与 CSS 令牌同源。
   ========================================================================== */
'use strict';

var TK = (function () {

  /* ------------------------------------------------------------ 常量与工具 */
  var DEG = Math.PI / 180;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* 经纬度 -> 平面坐标（等距圆柱，与 ECharts geo 同一套投影口径）
     返回 {x, y}，单位「度」；调用方再按比例缩放 */
  function proj(lng, lat) { return { x: lng, y: -lat }; }

  /* 计算一组点的经纬度包围盒 */
  function bbox(coords) {
    var minLng = 1e9, maxLng = -1e9, minLat = 1e9, maxLat = -1e9;
    coords.forEach(function (p) {
      if (p[0] < minLng) minLng = p[0];
      if (p[0] > maxLng) maxLng = p[0];
      if (p[1] < minLat) minLat = p[1];
      if (p[1] > maxLat) maxLat = p[1];
    });
    return { minLng: minLng, maxLng: maxLng, minLat: minLat, maxLat: maxLat,
             cx: (minLng + maxLng) / 2, cy: (minLat + maxLat) / 2 };
  }

  /* 造一块「朝上」的平面几何：Shape 的 (x,y) 映射到世界 (x, 0, -y) */
  function flatGeometry(geometry) {
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }

  /* ------------------------------------------------------------ 图表实例 */
  /* container: DOM 元素；opts: { fov, distance, height, controls, alpha, minZoom }
     返回控制对象；不自动跑循环，按需 requestRender()（省电） */
  function create(container, opts) {
    opts = opts || {};
    var W = function () { return container.clientWidth || 600; };
    var H = function () { return container.clientHeight || 360; };

    var renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: opts.alpha !== false, powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W(), H(), false);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(opts.fov || 38, W() / H(), 0.1, 5000);

    /* 浅色仪器面板的光照：半球光打底 + 主方向光塑形，材质保持哑光 */
    var hemi = new THREE.HemisphereLight(0xffffff, 0xdfe6ec, 0.92);
    scene.add(hemi);
    var key = new THREE.DirectionalLight(0xffffff, 0.62);
    key.position.set(-0.55, 1, 0.62).multiplyScalar(60);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0xffffff, 0.24);
    fill.position.set(0.7, 0.5, -0.8).multiplyScalar(50);
    scene.add(fill);

    var controls = null;
    if (opts.controls !== false && THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.12;
      controls.enablePan = true;
      controls.minPolarAngle = 0.05;
      controls.maxPolarAngle = Math.PI / 2 - 0.02;   /* 不许转到地平线以下 */
      controls.rotateSpeed = 0.55;
      controls.zoomSpeed = 0.8;
    }

    /* ---- 标签叠加层：3D 坐标投影到屏幕，用 HTML 呈现（文字更清晰） ---- */
    var labelLayer = document.createElement('div');
    labelLayer.className = 'tk-labels';
    container.appendChild(labelLayer);

    var labels = [];   /* { el, pos: Vector3, visible: fn|null, offset } */
    function addLabel(el, pos, opt) {
      opt = opt || {};
      labelLayer.appendChild(el);
      var rec = { el: el, pos: pos, visible: opt.visible || null, dx: opt.dx || 0, dy: opt.dy || 0 };
      labels.push(rec);
      return rec;
    }
    function clearLabels() {
      labels.forEach(function (l) { if (l.el.parentNode) l.el.parentNode.removeChild(l.el); });
      labels = [];
    }

    var _v = new THREE.Vector3();
    function syncLabels() {
      var w = W(), h = H();
      labels.forEach(function (l) {
        var show = l.visible ? l.visible() : true;
        if (!show) { l.el.style.display = 'none'; return; }
        _v.copy(l.pos).project(camera);
        if (_v.z > 1) { l.el.style.display = 'none'; return; }
        l.el.style.display = '';
        l.el.style.transform = 'translate(-50%,-50%) translate(' +
          (_v.x * w / 2 + w / 2 + l.dx).toFixed(1) + 'px,' +
          (-_v.y * h / 2 + h / 2 + l.dy).toFixed(1) + 'px)';
      });
    }

    /* ---- 渲染循环：按需渲染（controls 阻尼期间持续） ---- */
    var raf = null, frameHooks = [];
    function renderOnce() {
      renderer.render(scene, camera);
      syncLabels();
    }
    function loop() {
      raf = null;
      var dirty = false;
      if (controls) { dirty = controls.update(); }
      frameHooks.forEach(function (fn) { if (fn()) dirty = true; });
      renderOnce();
      if (dirty) raf = requestAnimationFrame(loop);
    }
    function requestRender() { if (raf == null) raf = requestAnimationFrame(loop); }
    if (controls) controls.addEventListener('change', requestRender);

    /* ---- 自适应 ---- */
    var ro = null, resizeHooks = [];
    function resize() {
      var w = W(), h = H();
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      resizeHooks.forEach(function (fn) { fn(); });
      requestRender();
    }
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () { resize(); });
      ro.observe(container);
    } else {
      window.addEventListener('resize', resize);
    }

    /* ---- 射线拾取 ---- */
    var ray = new THREE.Raycaster();
    var ndc = new THREE.Vector2();
    function pick(clientX, clientY, objects, recursive) {
      var r = container.getBoundingClientRect();
      ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ndc, camera);
      return ray.intersectObjects(objects, recursive !== false);
    }
    function bindPointer(handlers) {
      var el = renderer.domElement;
      var downX = 0, downY = 0, moved = false;
      el.addEventListener('pointerdown', function (e) { downX = e.clientX; downY = e.clientY; moved = false; });
      el.addEventListener('pointermove', function (e) {
        if (Math.abs(e.clientX - downX) > 3 || Math.abs(e.clientY - downY) > 3) moved = true;
        if (handlers.move) handlers.move(e);
      });
      el.addEventListener('pointerup', function (e) {
        if (handlers.click && !moved) handlers.click(e);
      });
      el.addEventListener('pointerleave', function (e) { if (handlers.leave) handlers.leave(e); });
    }

    function dispose() {
      if (raf != null) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      if (controls) controls.dispose();
      clearLabels();
      scene.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); });
          else o.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      if (labelLayer.parentNode) labelLayer.parentNode.removeChild(labelLayer);
    }

    return {
      container: container, scene: scene, camera: camera, renderer: renderer, controls: controls,
      addLabel: addLabel, clearLabels: clearLabels, syncLabels: syncLabels,
      requestRender: requestRender, renderOnce: renderOnce, resize: resize, dispose: dispose,
      pick: pick, bindPointer: bindPointer, onFrame: function (fn) { frameHooks.push(fn); },
      onResize: function (fn) { resizeHooks.push(fn); },
      width: W, height: H,
    };
  }

  /* 按容器宽高比取景：把 worldW × worldH 的世界范围装进画面
     考虑相机俯角带来的纵向压缩，高度按 cos(俯角) 折算后再比较两轴 */
  function fitDistance(camera, container, worldW, worldH, tiltDeg, margin) {
    var aspect = (container.clientWidth || 600) / (container.clientHeight || 360);
    var vFov = camera.fov * DEG;
    var hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    var hEff = worldH * Math.cos((tiltDeg || 0) * DEG);
    var dV = hEff / (2 * Math.tan(vFov / 2));
    var dH = worldW / (2 * Math.tan(hFov / 2));
    return Math.max(dV, dH) * (margin == null ? 1.12 : margin);
  }

  /* 透视感知取景：把包围盒 8 个角点全部纳入画面所需的最小距离（二分求解）。
     上面的 fitDistance 假设正交投影，近距离时明显偏小；内容较深（长路线、多层柱）
     时用这个 —— 它直接投影角点，结论与最终画面一致。 */
  function fitDistanceBox(camera, container, box, tiltDeg, margin) {
    var aspect = (container.clientWidth || 600) / (container.clientHeight || 360);
    var m = margin == null ? 1.06 : margin;
    var cx = (box.minX + box.maxX) / 2;
    var cy = (box.minY + box.maxY) / 2;
    var cz = (box.minZ + box.maxZ) / 2;
    var corners = [], pad = box.pad || 0;
    [box.minX - pad, box.maxX + pad].forEach(function (x) {
      [box.minY, box.maxY].forEach(function (y) {
        [box.minZ - pad, box.maxZ + pad].forEach(function (z) {
          corners.push(new THREE.Vector3(x, y, z));
        });
      });
    });
    var sinT = Math.sin(tiltDeg * DEG), cosT = Math.cos(tiltDeg * DEG);
    var probe = new THREE.PerspectiveCamera(camera.fov, aspect, 0.1, 1e7);
    function fits(d) {
      probe.position.set(cx, cy + d * sinT, cz + d * cosT);
      probe.lookAt(cx, cy, cz);
      probe.updateMatrixWorld(true);
      probe.updateProjectionMatrix();
      for (var i = 0; i < corners.length; i++) {
        var p = corners[i].clone().project(probe);
        if (p.z > 1 || Math.abs(p.x) > 1 / m || Math.abs(p.y) > 1 / m) return false;
      }
      return true;
    }
    var lo = 0.5, hi = 1e6;
    for (var k = 0; k < 44; k++) {
      var mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid; else lo = mid;
    }
    return hi;
  }

  /* ------------------------------------------------------------ 材质与几何 */
  function matte(hex, opacity) {
    return new THREE.MeshLambertMaterial({
      color: new THREE.Color(hex),
      transparent: opacity != null && opacity < 1,
      opacity: opacity == null ? 1 : opacity,
    });
  }

  /* 带侧面的扁条（底面朝下，中心在 y=0 的上表面）——柱状图用 */
  function barGeometry(w, d, h) {
    var g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    return g;
  }

  /* 扁平符号：三角（高速）/ 方块（品牌）/ 圆（站中站），躺在水平面上 */
  function symbolGeometry(kind, size) {
    var s = size || 1;
    var g;
    if (kind === 'triangle') {
      var sh = new THREE.Shape();
      sh.moveTo(0, s * 1.15);
      sh.lineTo(s * 0.98, -s * 0.72);
      sh.lineTo(-s * 0.98, -s * 0.72);
      sh.closePath();
      g = new THREE.ExtrudeGeometry(sh, { depth: s * 0.22, bevelEnabled: false });
      g.rotateX(Math.PI / 2);          /* Shape 的 +y 朝上 -> 世界 -z，与地图一致 */
    } else if (kind === 'rect') {
      g = new THREE.BoxGeometry(s * 1.62, s * 0.24, s * 1.62);
    } else {
      g = new THREE.CylinderGeometry(s * 0.86, s * 0.86, s * 0.24, 16);
    }
    g.translate(0, s * 0.12, 0);
    return g;
  }

  /* 环形扇面（甜甜圈图的一段），底朝下 */
  function ringSectorGeometry(r0, r1, angle) {
    var sh = new THREE.Shape();
    sh.absarc(0, 0, r1, -Math.PI / 2, -Math.PI / 2 + angle, false);
    sh.absarc(0, 0, r0, -Math.PI / 2 + angle, -Math.PI / 2, true);
    sh.closePath();
    var g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 48 });
    g.rotateX(-Math.PI / 2);
    return g;
  }

  /* 沿路径的管状线（路线图用）；pts 为世界坐标数组 */
  function tubeFromPoints(pts, radius, hex, opacity) {
    if (pts.length < 2) return null;
    var curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.02);
    var seg = clamp(Math.round(pts.length * 0.9), 8, 900);
    var g = new THREE.TubeGeometry(curve, seg, radius, 6, false);
    return new THREE.Mesh(g, matte(hex, opacity == null ? 1 : opacity));
  }

  /* 图钉（起终点） */
  function pinMesh(hex) {
    var g = new THREE.ConeGeometry(0.5, 1.5, 14);
    g.translate(0, 1.05, 0);
    var m = new THREE.Mesh(g, matte(hex));
    var b = new THREE.SphereGeometry(0.52, 14, 10);
    b.translate(0, 0.3, 0);
    var ball = new THREE.Mesh(b, matte(hex));
    var grp = new THREE.Group();
    grp.add(m); grp.add(ball);
    return grp;
  }

  return {
    DEG: DEG, proj: proj, bbox: bbox, flatGeometry: flatGeometry,
    create: create, matte: matte, barGeometry: barGeometry, symbolGeometry: symbolGeometry,
    ringSectorGeometry: ringSectorGeometry, tubeFromPoints: tubeFromPoints, pinMesh: pinMesh,
    clamp: clamp, fitDistance: fitDistance, fitDistanceBox: fitDistanceBox,
  };
})();
