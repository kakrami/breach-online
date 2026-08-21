import {
  PLAYER_HEIGHT, ARENA_LIMIT, STATIC_BOXES, BUILDING_PARTS, PYRAMIDS, NATURAL_OBSTACLES,
  terrainHeight, naturalGroundBase,
} from './world-geometry.js';
import { CROUCH_HEIGHT } from './game-config.js';
import { segmentAabbFirstT, segmentCylinderFirstT, segmentPyramidFirstT, segmentEllipsoidFirstT } from './collision-primitives.js';

const CELL_SIZE = 8;
const CELL_HEIGHT = 3;
const WORLD_OBSTACLES = [
  ...STATIC_BOXES.map((o) => ({ type: 'box', ...o, playerSolid: true, projectileSolid: true, supportTop: true })),
  ...PYRAMIDS.map((o) => ({ type: 'pyramid', ...o, playerSolid: false, projectileSolid: true })),
  ...NATURAL_OBSTACLES.map((o) => ({ ...o, playerSolid: true, projectileSolid: true })),
  ...BUILDING_PARTS.filter((p) => p.playerSolid || p.projectileSolid).map((p) => ({
    type: 'box', x: p.x, z: p.z, w: p.w, d: p.d, minY: p.bottomY, maxY: p.topY,
    playerSolid: p.playerSolid, projectileSolid: p.projectileSolid, supportTop: p.supportTop,
    crouchStep: !!p.crouchStep, role: p.role,
  })),
];

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const cellKey = (x, y, z) => `${x},${y},${z}`;
let collisionIndex = null;

function obstacleBaseY(obstacle) {
  if (Number.isFinite(obstacle.minY)) return obstacle.minY;
  if (obstacle.type === 'tree' || obstacle.type === 'bush' || obstacle.type === 'rock') {
    return naturalGroundBase(obstacle.type, obstacle.x, obstacle.z, obstacle.r);
  }
  return terrainHeight(obstacle.x, obstacle.z);
}

function ensureCollisionIndex() {
  if (collisionIndex) return collisionIndex;
  const grid = new Map();
  for (const obstacle of WORLD_OBSTACLES) {
    const baseY = obstacleBaseY(obstacle);
    let minX, maxX, minZ, maxZ;
    if (obstacle.type === 'box') {
      minX = obstacle.x - obstacle.w / 2; maxX = obstacle.x + obstacle.w / 2;
      minZ = obstacle.z - obstacle.d / 2; maxZ = obstacle.z + obstacle.d / 2;
    } else if (obstacle.type === 'pyramid') {
      minX = obstacle.x - obstacle.base / 2; maxX = obstacle.x + obstacle.base / 2;
      minZ = obstacle.z - obstacle.base / 2; maxZ = obstacle.z + obstacle.base / 2;
    } else {
      minX = obstacle.x - obstacle.r; maxX = obstacle.x + obstacle.r;
      minZ = obstacle.z - obstacle.r; maxZ = obstacle.z + obstacle.r;
    }
    const maxY = Number.isFinite(obstacle.maxY)
      ? obstacle.maxY
      : baseY + obstacle.h + ((obstacle.type === 'tree' || obstacle.type === 'bush' || obstacle.type === 'rock') ? 0.18 : 0);
    const entry = { obstacle, baseY, maxY, minX, maxX, minZ, maxZ };
    const minCX = Math.floor(minX / CELL_SIZE), maxCX = Math.floor(maxX / CELL_SIZE);
    const minCY = Math.floor(baseY / CELL_HEIGHT), maxCY = Math.floor(maxY / CELL_HEIGHT);
    const minCZ = Math.floor(minZ / CELL_SIZE), maxCZ = Math.floor(maxZ / CELL_SIZE);
    for (let cx = minCX; cx <= maxCX; cx += 1) for (let cy = minCY; cy <= maxCY; cy += 1) for (let cz = minCZ; cz <= maxCZ; cz += 1) {
      const key = cellKey(cx, cy, cz);
      let list = grid.get(key);
      if (!list) { list = []; grid.set(key, list); }
      list.push(entry);
    }
  }
  collisionIndex = grid;
  return grid;
}

function collisionCandidates(minX, maxX, minY, maxY, minZ, maxZ) {
  const grid = ensureCollisionIndex();
  const minCX = Math.floor(minX / CELL_SIZE), maxCX = Math.floor(maxX / CELL_SIZE);
  const minCY = Math.floor(minY / CELL_HEIGHT), maxCY = Math.floor(maxY / CELL_HEIGHT);
  const minCZ = Math.floor(minZ / CELL_SIZE), maxCZ = Math.floor(maxZ / CELL_SIZE);
  const results = [], seen = new Set();
  for (let cx = minCX; cx <= maxCX; cx += 1) for (let cy = minCY; cy <= maxCY; cy += 1) for (let cz = minCZ; cz <= maxCZ; cz += 1) {
    const list = grid.get(cellKey(cx, cy, cz));
    if (!list) continue;
    for (const entry of list) if (!seen.has(entry)) { seen.add(entry); results.push(entry); }
  }
  return results;
}

export function worldBlocked(x, z, radius = 0.38, y = terrainHeight(x, z), playerHeight = PLAYER_HEIGHT) {
  if (Math.abs(x) > ARENA_LIMIT || Math.abs(z) > ARENA_LIMIT) return true;
  for (const entry of collisionCandidates(x - radius, x + radius, y, y + playerHeight * 0.92, z - radius, z + radius)) {
    const obstacle = entry.obstacle;
    if (obstacle.playerSolid === false || obstacle.type === 'pyramid') continue;
    if (y + playerHeight * 0.92 <= entry.baseY || y >= entry.maxY - 0.04) continue;
    if (obstacle.type === 'box') {
      if (x > entry.minX - radius && x < entry.maxX + radius && z > entry.minZ - radius && z < entry.maxZ + radius) return true;
    } else if (Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.r + radius) return true;
  }
  return false;
}

export function projectileSegmentHitZone(target, x1, y1, z1, x2, y2, z2) {
  const tx = finite(target?.x), tz = finite(target?.z);
  const ty = finite(target?.y, terrainHeight(tx, tz));
  const scaleY = target?.crouched ? CROUCH_HEIGHT / PLAYER_HEIGHT : 1;
  const headT = segmentEllipsoidFirstT(x1, y1, z1, x2, y2, z2, tx, ty + 1.66 * scaleY, tz, 0.30, 0.30 * scaleY, 0.30);
  const torsoT = segmentEllipsoidFirstT(x1, y1, z1, x2, y2, z2, tx, ty + 0.99 * scaleY, tz, 0.50, 0.57 * scaleY, 0.40);
  const lowerT = segmentEllipsoidFirstT(x1, y1, z1, x2, y2, z2, tx, ty + 0.39 * scaleY, tz, 0.39, 0.40 * scaleY, 0.34);
  let bodyT = torsoT;
  if (lowerT != null && (bodyT == null || lowerT < bodyT)) bodyT = lowerT;
  if (headT != null && (bodyT == null || headT <= bodyT + 0.012)) return { zone: 'head', t: headT };
  if (bodyT != null) return { zone: 'body', t: bodyT };
  if (headT != null) return { zone: 'head', t: headT };
  return null;
}

export function segmentFirstObstacleT(x1, y1, z1, x2, y2, z2) {
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2), minY = Math.min(y1, y2), maxY = Math.max(y1, y2), minZ = Math.min(z1, z2), maxZ = Math.max(z1, z2);
  let best = null;
  for (const entry of collisionCandidates(minX, maxX, minY, maxY, minZ, maxZ)) {
    const obstacle = entry.obstacle;
    if (obstacle.projectileSolid === false) continue;
    let t = null;
    if (obstacle.type === 'box') t = segmentAabbFirstT(x1, y1, z1, x2, y2, z2, entry.minX, entry.maxX, entry.baseY, entry.maxY, entry.minZ, entry.maxZ);
    else if (obstacle.type === 'pyramid') t = segmentPyramidFirstT(x1, y1, z1, x2, y2, z2, obstacle.x, obstacle.z, obstacle.base, obstacle.h, entry.baseY, entry.maxY);
    else t = segmentCylinderFirstT(x1, y1, z1, x2, y2, z2, obstacle.x, obstacle.z, obstacle.r, entry.baseY, entry.maxY);
    if (t != null && (best == null || t < best)) best = t;
  }
  return best;
}

function segmentTerrainFirstT(x1, y1, z1, x2, y2, z2, sampleStep = 0.04) {
  const distance = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
  const steps = Math.max(2, Math.ceil(distance / Math.max(0.02, sampleStep)));
  const below = (t) => {
    const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, z = z1 + (z2 - z1) * t;
    return y <= terrainHeight(x, z) + 0.06;
  };
  if (below(0)) return 0;
  let previous = 0;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    if (!below(t)) { previous = t; continue; }
    let lo = previous, hi = t;
    for (let n = 0; n < 7; n += 1) { const mid = (lo + hi) / 2; if (below(mid)) hi = mid; else lo = mid; }
    return hi;
  }
  return null;
}

export function segmentFirstWorldHitT(x1, y1, z1, x2, y2, z2) {
  const obstacle = segmentFirstObstacleT(x1, y1, z1, x2, y2, z2);
  const terrain = segmentTerrainFirstT(x1, y1, z1, x2, y2, z2);
  if (obstacle == null) return terrain;
  if (terrain == null) return obstacle;
  return Math.min(obstacle, terrain);
}

export function segmentFirstWorldOcclusionT(x1, y1, z1, x2, y2, z2) {
  const obstacle = segmentFirstObstacleT(x1, y1, z1, x2, y2, z2);
  const terrain = segmentTerrainFirstT(x1, y1, z1, x2, y2, z2, 0.35);
  if (obstacle == null) return terrain;
  if (terrain == null) return obstacle;
  return Math.min(obstacle, terrain);
}

export function segmentHitsObstacle(x1, y1, z1, x2, y2, z2) {
  return segmentFirstObstacleT(x1, y1, z1, x2, y2, z2) != null;
}

export function actorHasLineOfSight(from, to) {
  const fx = finite(from?.x), fz = finite(from?.z), tx = finite(to?.x), tz = finite(to?.z);
  const fy = finite(from?.y, terrainHeight(fx, fz)) + 1.28;
  const ty = finite(to?.y, terrainHeight(tx, tz)) + 1.08;
  return segmentFirstWorldOcclusionT(fx, fy, fz, tx, ty, tz) == null;
}
