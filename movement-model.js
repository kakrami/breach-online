export const MAX_PLAYER_PHYSICS_STEP_SEC = 0.15;
const KNOCK_DAMPING_RATE = -Math.log(0.08);

function safeDelta(value) {
  const dt = Number(value);
  return Number.isFinite(dt) && dt > 0 ? Math.min(MAX_PLAYER_PHYSICS_STEP_SEC, dt) : 0;
}

export function advanceVerticalMotion(y, velocity, gravity, dt) {
  const step = safeDelta(dt);
  const startY = Number.isFinite(Number(y)) ? Number(y) : 0;
  const startVelocity = Number.isFinite(Number(velocity)) ? Number(velocity) : 0;
  const g = Math.max(0, Number.isFinite(Number(gravity)) ? Number(gravity) : 0);
  return {
    y: startY + startVelocity * step - 0.5 * g * step * step,
    velocity: startVelocity - g * step,
  };
}

export function advanceKnockback(xVelocity, zVelocity, dt) {
  const step = safeDelta(dt);
  let vx = Number.isFinite(Number(xVelocity)) ? Number(xVelocity) : 0;
  let vz = Number.isFinite(Number(zVelocity)) ? Number(zVelocity) : 0;
  if (!step) return { dx:0, dz:0, xVelocity:vx, zVelocity:vz };
  const decay = Math.exp(-KNOCK_DAMPING_RATE * step);
  const factor = (1 - decay) / KNOCK_DAMPING_RATE;
  const dx = vx * factor, dz = vz * factor;
  vx *= decay; vz *= decay;
  if (Math.abs(vx) < 0.015) vx = 0;
  if (Math.abs(vz) < 0.015) vz = 0;
  return { dx, dz, xVelocity:vx, zVelocity:vz };
}

export function sweepHorizontalMovement({
  x, y, z, dx, dz, grounded, arenaLimit, followDrop, supportHeight, blockedAt, stepDistance = 0.16,
}) {
  let px = Number.isFinite(Number(x)) ? Number(x) : 0;
  let py = Number.isFinite(Number(y)) ? Number(y) : 0;
  let pz = Number.isFinite(Number(z)) ? Number(z) : 0;
  let followsSupport = !!grounded;
  const limit = Math.max(0, Number(arenaLimit) || 0);
  const drop = Math.max(0, Number(followDrop) || 0);
  const maxStep = Math.max(0.01, Number(stepDistance) || 0.16);
  const sxTotal = Number.isFinite(Number(dx)) ? Number(dx) : 0;
  const szTotal = Number.isFinite(Number(dz)) ? Number(dz) : 0;
  const support = typeof supportHeight === 'function' ? supportHeight : (() => py);
  const blocked = typeof blockedAt === 'function' ? blockedAt : (() => false);

  const followGround = () => {
    if (!followsSupport) return;
    const next = support(px, pz, py);
    if (next >= py - drop) py = next;
    else followsSupport = false;
  };
  const stepY = (nextX, nextZ) => {
    if (!followsSupport) return py;
    const next = support(nextX, nextZ, py);
    return next > py ? next : py;
  };

  const distance = Math.hypot(sxTotal, szTotal);
  const steps = Math.max(1, Math.ceil(distance / maxStep));
  const sx = sxTotal / steps, sz = szTotal / steps;
  for (let i = 0; i < steps; i += 1) {
    const fromX = px, fromZ = pz;
    const nextX = Math.max(-limit, Math.min(limit, px + sx));
    const nextXY = stepY(nextX, pz);
    if (!blocked(nextX, pz, nextXY, fromX, fromZ)) { px = nextX; py = nextXY; }
    followGround();

    const beforeZx = px, beforeZz = pz;
    const nextZ = Math.max(-limit, Math.min(limit, pz + sz));
    const nextZY = stepY(px, nextZ);
    if (!blocked(px, nextZ, nextZY, beforeZx, beforeZz)) { pz = nextZ; py = nextZY; }
    followGround();
  }

  return { x:px, y:py, z:pz, grounded:followsSupport };
}

export function tacticalThrowVelocity(yaw, pitch, speed, loft) {
  const throwYaw = Number.isFinite(Number(yaw)) ? Number(yaw) : 0;
  const throwPitch = Math.max(-1.25, Math.min(1.15, Number.isFinite(Number(pitch)) ? Number(pitch) : 0));
  const throwSpeed = Math.max(0, Number(speed) || 0);
  const throwLoft = Number.isFinite(Number(loft)) ? Number(loft) : 0;
  const cp = Math.cos(throwPitch);
  const fx = -Math.sin(throwYaw) * cp;
  const fz = -Math.cos(throwYaw) * cp;
  return { yaw:throwYaw, pitch:throwPitch, fx, fz, vx:fx*throwSpeed, vy:Math.sin(throwPitch)*throwSpeed+throwLoft, vz:fz*throwSpeed };
}
