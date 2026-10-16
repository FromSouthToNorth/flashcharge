/* ECharts 压缩 GeoJSON 解码（算法取自本机 echarts.min.js 的 B_/V_ 函数）
   - UTF8Scale 缺省 1024
   - Polygon / MultiLineString : encodeOffsets[i] 对应第 i 个环
   - MultiPolygon              : encodeOffsets[polyIdx] 对应第 polyIdx 个多边形
   - LineString                : encodeOffsets 即该线的偏移
   ZigZag 解码 + 增量累加 + 除以缩放系数 */
'use strict';

export function decodeRing(code, offset, scale) {
  const out = [];
  let px = offset[0], py = offset[1];
  for (let i = 0; i < code.length; i += 2) {
    let x = code.charCodeAt(i) - 64;
    let y = code.charCodeAt(i + 1) - 64;
    x = (x >> 1) ^ -(x & 1);
    y = (y >> 1) ^ -(y & 1);
    px = x + px;
    py = y + py;
    out.push([px / scale, py / scale]);
  }
  return out;
}

function decodeGeometry(geom, scale) {
  const offs = geom.encodeOffsets;
  if (!offs) return geom;
  const c = geom.coordinates;
  if (geom.type === 'LineString') {
    geom.coordinates = decodeRing(c, offs, scale);
  } else if (geom.type === 'Polygon' || geom.type === 'MultiLineString') {
    geom.coordinates = c.map((ring, i) => decodeRing(ring, offs[i], scale));
  } else if (geom.type === 'MultiPolygon') {
    /* MultiPolygon 的 encodeOffsets 是两层：[多边形下标][环下标] */
    geom.coordinates = c.map((poly, pi) => poly.map((ring, ri) => decodeRing(ring, offs[pi][ri], scale)));
  }
  delete geom.encodeOffsets;
  return geom;
}

export function decodeGeoJSON(json) {
  if (!json || !json.UTF8Encoding) return json;
  const scale = json.UTF8Scale == null ? 1024 : json.UTF8Scale;
  json.features.forEach((f) => {
    if (f.geometry && f.geometry.encodeOffsets) decodeGeometry(f.geometry, scale);
  });
  json.UTF8Encoding = false;
  return json;
}
