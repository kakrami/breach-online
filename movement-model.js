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
  x, y, z, dx, dz, grounded, arenaLimit, followDrop, supportHeight, blockedAt,
  stepUpHeight, maxStepHeight = 0.62, stepDistance = 0.12,
}) {
  let px = Number.isFinite(Number(x)) ? Number(x) : 0;
  let py = Number.isFinite(Number(y)) ? Number(y) : 0;
  let pz = Number.isFinite(Number(z)) ? Number(z) : 0;
  let followsSupport = !!grounded;
  const limit = Math.max(0, Number(arenaLimit) || 0);
  const drop = Math.max(0, Number(followDrop) || 0);
  const climb = Math.max(0, Number(maxStepHeight) || 0);
  const maxStep = Math.max(0.02, Number(stepDistance) || 0.12);
  const sxTotal = Number.isFinite(Number(dx)) ? Number(dx) : 0;
  const szTotal = Number.isFinite(Number(dz)) ? Number(dz) : 0;
  const support = typeof supportHeight === 'function' ? supportHeight : (() => py);
  const blocked = typeof blockedAt === 'function' ? blockedAt : (() => false);
  const stepUp = typeof stepUpHeight === 'function' ? stepUpHeight : null;

  const followGround = () => {
    if (!followsSupport) return;
    const next = support(px, pz, py);
    if (!Number.isFinite(next)) return;
    if (next >= py - drop && next <= py + climb + 0.001) py = next;
    else if (next < py - drop) followsSupport = false;
  };

  const supportYFor = (nextX, nextZ) => {
    if (!followsSupport) return py;
    const next = support(nextX, nextZ, py);
    return Number.isFinite(next) && next > py ? Math.min(next, py + climb) : py;
  };

  // Conventional FPS character-controller step-up. A floor/landing can touch the
  // capsule before the feet-center reaches its support polygon. If the obstacle
  // top is within step height, test the same horizontal move at the elevated feet
  // position instead of treating the landing's vertical edge as an impassable wall.
  const tryStepUp = (nextX, nextZ, fromX, fromZ) => {
    if (!followsSupport || !stepUp || climb <= 0) return null;
    const candidate = Number(stepUp(nextX, nextZ, py, climb));
    if (!Number.isFinite(candidate) || candidate <= py + 0.015 || candidate > py + climb + 0.001) return null;
    if (blocked(nextX, nextZ, candidate, fromX, fromZ)) return null;
    return candidate;
  };

  const attempt = (nextX, nextZ, fromX, fromZ) => {
    nextX = Math.max(-limit, Math.min(limit, nextX));
    nextZ = Math.max(-limit, Math.min(limit, nextZ));
    let targetY = supportYFor(nextX, nextZ);
    if (blocked(nextX, nextZ, targetY, fromX, fromZ)) {
      const steppedY = tryStepUp(nextX, nextZ, fromX, fromZ);
      if (steppedY == null) return false;
      targetY = steppedY;
    }
    px = nextX; pz = nextZ; py = targetY;
    followGround();
    return true;
  };

  const distance = Math.hypot(sxTotal, szTotal);
  const steps = Math.max(1, Math.ceil(distance / maxStep));
  const sx = sxTotal / steps, sz = szTotal / steps;
  let blockedAny = false;

  for (let i = 0; i < steps; i += 1) {
    const fromX = px, fromZ = pz;
    // Try the intended vector first. If a corner blocks it, fall back to axis
    // slides so the capsule glides along walls instead of catching on corners.
    if (attempt(px + sx, pz + sz, fromX, fromZ)) continue;

    blockedAny = true;
    const xFirst = Math.abs(sx) >= Math.abs(sz);
    let moved = false;
    if (xFirst) {
      if (Math.abs(sx) > 1e-9) moved = attempt(px + sx, pz, px, pz) || moved;
      if (Math.abs(sz) > 1e-9) moved = attempt(px, pz + sz, px, pz) || moved;
    } else {
      if (Math.abs(sz) > 1e-9) moved = attempt(px, pz + sz, px, pz) || moved;
      if (Math.abs(sx) > 1e-9) moved = attempt(px + sx, pz, px, pz) || moved;
    }
    if (!moved) followGround();
  }

  return { x:px, y:py, z:pz, grounded:followsSupport, blocked:blockedAny };
}


export function createTraversalPlan(candidate, startX, startY, startZ, startedAt, seq=0) {
  if(!candidate)return null;
  const mode=candidate.mode==='vault'?'vault':'mantle';
  const sx=Number(startX)||0,sy=Number(startY)||0,sz=Number(startZ)||0;
  const ex=Number(candidate.endX),ey=Number(candidate.endY),ez=Number(candidate.endZ);
  if(!Number.isFinite(ex)||!Number.isFinite(ey)||!Number.isFinite(ez))return null;
  const distance=Math.hypot(ex-sx,ez-sz),rise=Math.max(0,ey-sy);
  const durationMs=mode==='vault'?Math.round(Math.max(300,Math.min(430,300+distance*34))):Math.round(Math.max(380,Math.min(540,390+rise*72+distance*24)));
  return {
    seq:Math.max(0,Math.floor(Number(seq)||0)),mode,role:String(candidate.role||''),
    startX:sx,startY:sy,startZ:sz,endX:ex,endY:ey,endZ:ez,
    peakY:Math.max(Number(candidate.peakY)||ey,ey+.08),startedAt:Number(startedAt)||0,durationMs,
  };
}

function smooth01(value){const t=Math.max(0,Math.min(1,Number(value)||0));return t*t*(3-2*t);}

export function traversalPose(plan, now) {
  if(!plan)return null;
  const duration=Math.max(1,Number(plan.durationMs)||1),raw=(Number(now)-Number(plan.startedAt))/duration,p=Math.max(0,Math.min(1,raw));
  const eased=smooth01(p),sx=Number(plan.startX)||0,sy=Number(plan.startY)||0,sz=Number(plan.startZ)||0,ex=Number(plan.endX)||0,ey=Number(plan.endY)||0,ez=Number(plan.endZ)||0;
  let x,z,y;
  if(plan.mode==='vault'){
    x=sx+(ex-sx)*eased;z=sz+(ez-sz)*eased;
    const base=sy+(ey-sy)*eased,peak=Math.max(Number(plan.peakY)||base,sy,ey);
    y=base+Math.sin(Math.PI*p)*Math.max(0,peak-(sy+ey)*.5);
  }else{
    // Mantle is a two-stage pull: rise to hand height, then move the hips onto
    // the ledge. The motion is deterministic on client and server.
    const lift=smooth01(Math.min(1,p/.56)),pull=smooth01(Math.max(0,(p-.30)/.70));
    const grabY=Math.max(ey+.055,Math.min(Number(plan.peakY)||ey+.10,ey+.18));
    x=sx+(ex-sx)*pull;z=sz+(ez-sz)*pull;y=sy+(grabY-sy)*lift+(ey-grabY)*smooth01(Math.max(0,(p-.62)/.38));
  }
  return {x,y,z,progress:p,done:raw>=1,mode:plan.mode};
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
