export const MAX_PLAYER_PHYSICS_STEP_SEC = 0.15;
export const KNOCK_DAMPING_BASE = 0.08;
export const KNOCK_DAMPING_RATE = -Math.log(KNOCK_DAMPING_BASE);

function safeDelta(value) {
  const dt = Number(value);
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return Math.min(MAX_PLAYER_PHYSICS_STEP_SEC, dt);
}

export function advanceVerticalMotion(y, velocity, gravity, dt) {
  const step = safeDelta(dt);
  const startY = Number.isFinite(Number(y)) ? Number(y) : 0;
  const startVelocity = Number.isFinite(Number(velocity)) ? Number(velocity) : 0;
  const g = Math.max(0, Number.isFinite(Number(gravity)) ? Number(gravity) : 0);
  return Object.freeze({
    y: startY + startVelocity * step - 0.5 * g * step * step,
    velocity: startVelocity - g * step,
    dt: step,
  });
}

export function advanceKnockback(xVelocity, zVelocity, dt) {
  const step = safeDelta(dt);
  let vx = Number.isFinite(Number(xVelocity)) ? Number(xVelocity) : 0;
  let vz = Number.isFinite(Number(zVelocity)) ? Number(zVelocity) : 0;
  if (step <= 0) return Object.freeze({ dx: 0, dz: 0, xVelocity: vx, zVelocity: vz, dt: 0 });
  const decay = Math.pow(KNOCK_DAMPING_BASE, step);
  const factor = (1 - decay) / KNOCK_DAMPING_RATE;
  const dx = vx * factor;
  const dz = vz * factor;
  vx *= decay;
  vz *= decay;
  if (Math.abs(vx) < 0.015) vx = 0;
  if (Math.abs(vz) < 0.015) vz = 0;
  return Object.freeze({ dx, dz, xVelocity: vx, zVelocity: vz, dt: step });
}
