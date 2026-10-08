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
    if (!Number.isFinite(next)) return py;
    // Validate the pose at the height it will actually occupy. Previously small
    // downhill changes were applied only after horizontal collision succeeded,
    // so the follow-ground snap could lower the capsule into a bush, rail or
    // other low blocker without that final pose ever being tested.
    if (next >= py - drop && next <= py + climb + 0.001) return next > py ? Math.min(next, py + climb) : next;
    return py;
  };

  // Conventional FPS character-controller step-up. A floor/landing can touch the
  // capsule before the feet-center reaches its support polygon. If the obstacle
  // top is within step height, test the same horizontal move at the elevated feet
  // position instead of treating the landing's vertical edge as an impassable wall.
  const tryStepUp = (nextX, nextZ, fromX, fromZ) => {
    if (!followsSupport || !stepUp || climb <= 0) return null;
    const candidate = Number(stepUp(nextX, nextZ, py, climb));
    if (!Number.isFinite(candidate) || candidate <= py + 0.015 || candidate > py + climb + 0.001) return null;
    if (blocked(nextX, nextZ, candidate, fromX, fromZ, py)) return null;
    return candidate;
  };

  const attempt = (nextX, nextZ, fromX, fromZ) => {
    nextX = Math.max(-limit, Math.min(limit, nextX));
    nextZ = Math.max(-limit, Math.min(limit, nextZ));
    let targetY = supportYFor(nextX, nextZ);
    if (blocked(nextX, nextZ, targetY, fromX, fromZ, py)) {
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
    seq:Math.max(0,Math.floor(Number(seq)||0)),mode,role:String(candidate.role||''),portalId:String(candidate.portalId||''),affordanceId:String(candidate.affordanceId||''),
    startX:sx,startY:sy,startZ:sz,endX:ex,endY:ey,endZ:ez,
    peakY:Math.max(Number(candidate.peakY)||ey,ey+.08),startedAt:Number(startedAt)||0,durationMs,
    endGrounded:candidate.endGrounded!==false,exitVelocityY:Number.isFinite(Number(candidate.exitVelocityY))?Number(candidate.exitVelocityY):0,
    viewMaxY:candidate.viewMaxY!=null&&Number.isFinite(Number(candidate.viewMaxY))?Number(candidate.viewMaxY):null,
  };
}

function smooth01(value){const t=Math.max(0,Math.min(1,Number(value)||0));return t*t*(3-2*t);}

export function traversalPose(plan, now) {
  if(!plan)return null;
  const duration=Math.max(1,Number(plan.durationMs)||1),raw=(Number(now)-Number(plan.startedAt))/duration,p=Math.max(0,Math.min(1,raw));
  const eased=smooth01(p),sx=Number(plan.startX)||0,sy=Number(plan.startY)||0,sz=Number(plan.startZ)||0,ex=Number(plan.endX)||0,ey=Number(plan.endY)||0,ez=Number(plan.endZ)||0;
  let x,z,y;
  if(plan.mode==='vault'&&plan.role==='window'){
    const lift=smooth01(Math.min(1,p/.34)),cross=smooth01(Math.max(0,Math.min(1,(p-.18)/.64))),settle=smooth01(Math.max(0,(p-.72)/.28));
    const clearanceY=Math.max(Number(plan.peakY)||sy,sy,ey);
    x=sx+(ex-sx)*cross;z=sz+(ez-sz)*cross;y=sy+(clearanceY-sy)*lift+(ey-clearanceY)*settle;
  }else if(plan.mode==='vault'){
    // Vaults are also sweepable now: raise the capsule above the explicit low
    // obstacle before crossing it, then settle onto the validated far support.
    const clearanceY=Math.max(Number(plan.peakY)||sy,sy,ey);
    const lift=smooth01(Math.min(1,p/.28)),cross=smooth01(Math.max(0,(p-.30)/.42)),settle=smooth01(Math.max(0,(p-.72)/.28));
    x=sx+(ex-sx)*cross;z=sz+(ez-sz)*cross;y=sy+(clearanceY-sy)*lift+(ey-clearanceY)*settle;
  }else{
    // Mantle is a two-stage pull: rise to hand height, then move the hips onto
    // the ledge. The motion is deterministic on client and server.
    // Lift the capsule clear of the ledge before pulling it forward.  The old
    // overlap-first curve moved horizontally while the feet were still below
    // the obstacle top; that only worked because traversal bypassed collision.
    // Mantle motion is now physically sweepable from start to finish.
    const lift=smooth01(Math.min(1,p/.46)),pull=smooth01(Math.max(0,(p-.48)/.52));
    const grabY=Math.max(ey+.055,Math.min(Number(plan.peakY)||ey+.10,ey+.18));
    x=sx+(ex-sx)*pull;z=sz+(ez-sz)*pull;y=sy+(grabY-sy)*lift+(ey-grabY)*smooth01(Math.max(0,(p-.78)/.22));
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


export const LADDER_CLIMB_SPEED = 3.15;
export const LADDER_ATTACH_MIN_NORMAL = 0.16;
export const LADDER_ATTACH_MAX_NORMAL = 0.88;
export const LADDER_TOP_ATTACH_MAX_NORMAL = 0.92;

export function ladderById(ladders,id){return (Array.isArray(ladders)?ladders:[]).find(ladder=>String(ladder?.id||'')===String(id||''))||null;}
export function ladderFrame(ladder){const rx=Number(ladder?.nx),rz=Number(ladder?.nz),len=Math.hypot(rx,rz);if(!Number.isFinite(len)||len<.25)return null;const nx=rx/len,nz=rz/len;return{nx,nz,tx:-nz,tz:nx};}
export function ladderClimbPoint(ladder,radius=0.34){const frame=ladderFrame(ladder);if(!frame)return{x:Number(ladder?.x)||0,z:Number(ladder?.z)||0};const r=Math.max(.05,Number(radius)||.34);return{x:Number(ladder.x)+frame.nx*(r+.08),z:Number(ladder.z)+frame.nz*(r+.08)};}
export function ladderBottomExitPoint(ladder,radius=0.34){const frame=ladderFrame(ladder);if(!frame)return{x:Number(ladder?.x)||0,y:Number(ladder?.bottomY)||0,z:Number(ladder?.z)||0};const r=Math.max(.05,Number(radius)||.34);return{x:Number(ladder.x)+frame.nx*(r+.34),y:Number(ladder.bottomY),z:Number(ladder.z)+frame.nz*(r+.34)};}
export function ladderTopExitPoint(ladder,radius=0.34){const frame=ladderFrame(ladder);if(!frame)return{x:Number(ladder?.x)||0,y:Number(ladder?.topY)||0,z:Number(ladder?.z)||0};const r=Math.max(.05,Number(radius)||.34);return{x:Number(ladder.x)-frame.nx*(r+.32),y:Number(ladder.topY),z:Number(ladder.z)-frame.nz*(r+.32)};}
export function findLadderEntry({ladders,x,y,z,dirX,dirZ,faceX=null,faceZ=null,radius=.34,grounded=true}={}){
  if(!grounded||!Array.isArray(ladders)||!ladders.length)return null;
  const px=Number(x),py=Number(y),pz=Number(z),r=Math.max(.05,Number(radius)||.34);let dx=Number(dirX)||0,dz=Number(dirZ)||0;const len=Math.hypot(dx,dz);
  if(!Number.isFinite(px)||!Number.isFinite(py)||!Number.isFinite(pz)||len<.25)return null;dx/=len;dz/=len;
  let fx=Number(faceX),fz=Number(faceZ),faceLen=Math.hypot(fx,fz),hasFacing=Number.isFinite(fx)&&Number.isFinite(fz)&&faceLen>.20;if(hasFacing){fx/=faceLen;fz/=faceLen;}
  let best=null;
  for(const ladder of ladders){
    const frame=ladderFrame(ladder),width=Math.max(.5,Number(ladder.width)||1),bottomY=Number(ladder.bottomY),topY=Number(ladder.topY);
    if(!frame||!Number.isFinite(bottomY)||!Number.isFinite(topY)||topY<=bottomY+.5)continue;
    const {nx,nz,tx,tz}=frame;
    const relX=px-Number(ladder.x),relZ=pz-Number(ladder.z),normal=relX*nx+relZ*nz,lateral=relX*tx+relZ*tz,approach=dx*nx+dz*nz,faceNormal=hasFacing?fx*nx+fz*nz:0;
    if(Math.abs(lateral)>width/2+r*.14)continue;
    if(Math.abs(py-bottomY)<=.42&&normal>=LADDER_ATTACH_MIN_NORMAL&&normal<=LADDER_ATTACH_MAX_NORMAL&&approach<-.38&&(!hasFacing||faceNormal<-.18)){
      const cp=ladderClimbPoint(ladder,r),score=Math.abs(normal-(r+.08))+Math.abs(lateral)*.35;
      const candidate={ladderId:String(ladder.id),entry:'bottom',attachX:cp.x,attachY:bottomY,attachZ:cp.z,score};if(!best||score<best.score)best=candidate;
    }
    if(Math.abs(py-topY)<=.42&&normal<=-.10&&normal>=-LADDER_TOP_ATTACH_MAX_NORMAL&&approach>.38&&(!hasFacing||faceNormal>.18)){
      const cp=ladderClimbPoint(ladder,r),score=Math.abs(normal+.35)+Math.abs(lateral)*.35;
      const candidate={ladderId:String(ladder.id),entry:'top',attachX:cp.x,attachY:topY-.10,attachZ:cp.z,score};if(!best||score<best.score)best=candidate;
    }
  }
  return best;
}
export function ladderClimbStep(ladder,y,input,dt){
  const low=Number(ladder?.bottomY),high=Number(ladder?.topY)-.10,current=Number(y);if(!Number.isFinite(low)||!Number.isFinite(high)||!Number.isFinite(current))return current;
  const step=Math.max(0,Math.min(.15,Number(dt)||0)),amount=Math.max(-1,Math.min(1,Number(input)||0));return Math.max(low,Math.min(high,current+amount*LADDER_CLIMB_SPEED*step));
}

// One attachment contract for authored maps, editor previews and generated approaches.
export function resolveLadderAttachment(ladder,parent,topY,terrainHeight,radius=.38){
  if(!parent||!['e','w','n','s'].includes(ladder.side)||!Number.isFinite(topY))return null;
  const t=Math.max(-.45,Math.min(.45,Number(ladder.t)||0)),side=ladder.side;
  const nx=side==='e'?1:side==='w'?-1:0,nz=side==='s'?1:side==='n'?-1:0;
  const x=nx*(parent.w/2+.08)+(nz?t*parent.w:0),z=nz*(parent.d/2+.08)+(nx?t*parent.d:0);
  const a=(parent.rot||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),normalX=nx*c-nz*s,normalZ=nx*s+nz*c;
  const out={...ladder,parentId:parent.id,side,t,x:parent.x+x*c-z*s,z:parent.z+x*s+z*c,nx:normalX,nz:normalZ,tx:-normalZ,tz:normalX,topY};
  const foot=ladderBottomExitPoint(out,radius);out.bottomY=terrainHeight(foot.x,foot.z);return out;
}
export function ladderPathClear(ladder,geometry,collision){
  const r=geometry.PLAYER_RADIUS,h=geometry.PLAYER_HEIGHT,l=ladder;
  if(!ladderFrame(l)||!Number.isFinite(l.bottomY+l.topY)||l.topY-l.bottomY<=.5)return false;
  const low=ladderBottomExitPoint(l,r),high=ladderTopExitPoint(l,r),climb=ladderClimbPoint(l,r);
  const clear=(x,y,z)=>geometry.terrainHeight(x,z)<=y+.10&&!collision.worldBlockedAt(x,z,y,h,r);
  const segment=(a,b)=>{const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/.12));for(let i=0;i<=n;i++){const t=i/n;if(!clear(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,a.z+(b.z-a.z)*t))return false;}return true;};
  if(!segment(low,{...climb,y:l.bottomY})||!segment({...climb,y:l.bottomY},{...climb,y:l.topY})||!segment({...climb,y:l.topY},high))return false;
  return Math.abs(geometry.worldSupportHeight(high.x,high.z,high.y)-high.y)<.08&&Math.abs(geometry.worldSupportHeight(low.x,low.z,low.y)-low.y)<.15;
}

// Older published maps omitted parent IDs. Recover only an unambiguous exterior
// face match; an interior ladder or an arbitrary nearby object is not an anchor.
export function legacyLadderAttachment(ladder,parents){
 const f=ladderFrame(ladder);if(!f)return null;const matches=[];
 for(const parent of parents){
  const a=(parent.rot||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=ladder.x-parent.x,dz=ladder.z-parent.z,x=dx*c+dz*s,z=-dx*s+dz*c,nx=f.nx*c+f.nz*s,nz=-f.nx*s+f.nz*c;
  for(const side of ['e','w','n','s']){const alongX=side==='n'||side==='s',normal=side==='e'?nx:side==='w'?-nx:side==='s'?nz:-nz,distance=side==='e'?x-parent.w/2:side==='w'?-x-parent.w/2:side==='s'?z-parent.d/2:-z-parent.d/2,t=alongX?x/parent.w:z/parent.d;
   if(normal>.995&&distance>=.02&&distance<=.20&&Math.abs(t)<=.45)matches.push({...ladder,parentId:parent.id,side,t});
  }
 }
 return matches.length===1?matches[0]:null;
}
