export function segmentAabbFirstT(x1, y1, z1, x2, y2, z2, minX, maxX, minY, maxY, minZ, maxZ) {
  let lo = 0, hi = 1;
  const p = [x1, y1, z1], d = [x2 - x1, y2 - y1, z2 - z1], mn = [minX, minY, minZ], mx = [maxX, maxY, maxZ];
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(d[i]) < 1e-10) { if (p[i] < mn[i] || p[i] > mx[i]) return null; continue; }
    let a = (mn[i] - p[i]) / d[i], b = (mx[i] - p[i]) / d[i];
    if (a > b) [a, b] = [b, a];
    lo = Math.max(lo, a); hi = Math.min(hi, b);
    if (lo > hi) return null;
  }
  return lo >= 0 && lo <= 1 ? lo : null;
}

export function segmentCylinderFirstT(x1, y1, z1, x2, y2, z2, cx, cz, radius, minY, maxY) {
  const ox = x1 - cx, oz = z1 - cz, dx = x2 - x1, dz = z2 - z1, dy = y2 - y1;
  let radialLo = 0, radialHi = 1;
  const a = dx * dx + dz * dz, b = 2 * (ox * dx + oz * dz), c = ox * ox + oz * oz - radius * radius;
  if (a <= 1e-12) { if (c > 0) return null; }
  else {
    const disc = b * b - 4 * a * c; if (disc < 0) return null;
    const root = Math.sqrt(disc); let t1 = (-b - root) / (2 * a), t2 = (-b + root) / (2 * a);
    if (t1 > t2) [t1, t2] = [t2, t1];
    radialLo = Math.max(0, t1); radialHi = Math.min(1, t2); if (radialLo > radialHi) return null;
  }
  let yLo = 0, yHi = 1;
  if (Math.abs(dy) < 1e-12) { if (y1 < minY || y1 > maxY) return null; }
  else {
    let t1 = (minY - y1) / dy, t2 = (maxY - y1) / dy; if (t1 > t2) [t1, t2] = [t2, t1];
    yLo = Math.max(0, t1); yHi = Math.min(1, t2); if (yLo > yHi) return null;
  }
  const lo = Math.max(radialLo, yLo), hi = Math.min(radialHi, yHi);
  return lo <= hi ? lo : null;
}

function clipLessEqual(lo, hi, a0, ad, bound) {
  if (Math.abs(ad) < 1e-12) return a0 <= bound ? [lo, hi] : null;
  const t = (bound - a0) / ad;
  if (ad > 0) hi = Math.min(hi, t); else lo = Math.max(lo, t);
  return lo <= hi ? [lo, hi] : null;
}

export function segmentPyramidFirstT(x1, y1, z1, x2, y2, z2, cx, cz, baseWidth, height, minY, maxY) {
  if (!(baseWidth > 0) || !(height > 0)) return null;
  const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
  let lo = 0, hi = 1;
  if (Math.abs(dy) < 1e-12) { if (y1 < minY || y1 > maxY) return null; }
  else {
    let a = (minY - y1) / dy, b = (maxY - y1) / dy; if (a > b) [a, b] = [b, a];
    lo = Math.max(lo, a); hi = Math.min(hi, b); if (lo > hi) return null;
  }
  const k = baseWidth / (2 * height), c = baseWidth / 2 + k * minY;
  const planes = [
    [x1 + k * y1, dx + k * dy, cx + c], [-x1 + k * y1, -dx + k * dy, -cx + c],
    [z1 + k * y1, dz + k * dy, cz + c], [-z1 + k * y1, -dz + k * dy, -cz + c],
  ];
  for (const [a0, ad, bound] of planes) {
    const clipped = clipLessEqual(lo, hi, a0, ad, bound); if (!clipped) return null;
    [lo, hi] = clipped;
  }
  return lo >= 0 && lo <= 1 ? lo : null;
}

export function segmentEllipsoidFirstT(x1, y1, z1, x2, y2, z2, cx, cy, cz, rx, ry, rz) {
  const dx = (x2 - x1) / rx, dy = (y2 - y1) / ry, dz = (z2 - z1) / rz;
  const ox = (x1 - cx) / rx, oy = (y1 - cy) / ry, oz = (z1 - cz) / rz;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (ox * dx + oy * dy + oz * dz);
  const c = ox * ox + oy * oy + oz * oz - 1;
  if (a <= 1e-12) return c <= 0 ? 0 : null;
  const disc = b * b - 4 * a * c; if (disc < 0) return null;
  const root = Math.sqrt(disc), t1 = (-b - root) / (2 * a), t2 = (-b + root) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  return null;
}
