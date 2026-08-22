import { ARENA_LIMIT, PLAYER_HEIGHT, PLAYER_RADIUS, WORLD_PLAYER_COLLIDERS, worldSupportHeight } from './world-geometry.js';

const CELL_SIZE = 8;
const CELL_HEIGHT = 3;
const HORIZONTAL_SKIN = 0.015;
const VERTICAL_SKIN = 0.04;
const TRAVERSE_PROBE = 1.45;
const VAULT_MAX_RISE = 1.08;
const MANTLE_MAX_RISE = 1.25;
const grid = new Map();
const entries = [];
const keyFor = (cx,cy,cz) => `${cx},${cy},${cz}`;
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));

function boundsFor(collider){
  if(collider.type==='box') return {minX:collider.minX,maxX:collider.maxX,minZ:collider.minZ,maxZ:collider.maxZ,minY:collider.minY,maxY:collider.maxY};
  if(collider.type==='round') return {minX:collider.x-collider.r,maxX:collider.x+collider.r,minZ:collider.z-collider.r,maxZ:collider.z+collider.r,minY:collider.minY,maxY:collider.maxY};
  const minX=Math.min(collider.x1,collider.x2),maxX=Math.max(collider.x1,collider.x2),half=collider.w/2;
  return {minX,maxX,minZ:collider.z-half,maxZ:collider.z+half,minY:collider.bottomY,maxY:Math.max(collider.y0,collider.y1)};
}

for(const collider of WORLD_PLAYER_COLLIDERS){
  const bounds=boundsFor(collider),entry={collider,bounds,visit:0};entries.push(entry);
  const minCX=Math.floor(bounds.minX/CELL_SIZE),maxCX=Math.floor(bounds.maxX/CELL_SIZE);
  const minCY=Math.floor(bounds.minY/CELL_HEIGHT),maxCY=Math.floor(bounds.maxY/CELL_HEIGHT);
  const minCZ=Math.floor(bounds.minZ/CELL_SIZE),maxCZ=Math.floor(bounds.maxZ/CELL_SIZE);
  for(let cx=minCX;cx<=maxCX;cx++)for(let cy=minCY;cy<=maxCY;cy++)for(let cz=minCZ;cz<=maxCZ;cz++){
    const key=keyFor(cx,cy,cz),list=grid.get(key);if(list)list.push(entry);else grid.set(key,[entry]);
  }
}

function circleTouchesBox(x,z,r,minX,maxX,minZ,maxZ){
  const qx=clamp(x,minX,maxX),qz=clamp(z,minZ,maxZ),dx=x-qx,dz=z-qz;
  return dx*dx+dz*dz<r*r;
}

function verticalOverlap(y,height,minY,maxY){
  return y+height>minY+VERTICAL_SKIN&&y<maxY-VERTICAL_SKIN;
}

function rampTopAt(collider,x){
  const lo=Math.min(collider.x1,collider.x2),hi=Math.max(collider.x1,collider.x2),sx=clamp(x,lo,hi);
  const span=collider.x2-collider.x1;
  const t=Math.abs(span)>1e-9?(sx-collider.x1)/span:0;
  return collider.y0+(collider.y1-collider.y0)*t;
}

function colliderTopAt(collider,x){
  return collider.type==='ramp'?rampTopAt(collider,x):collider.maxY;
}

let stamp=0;
export function worldBlockerAt(x,z,y,height=PLAYER_HEIGHT,radius=PLAYER_RADIUS){
  const px=Number(x),pz=Number(z),py=Number(y),h=Math.max(0,Number(height)||PLAYER_HEIGHT),r=Math.max(0,Number(radius)||PLAYER_RADIUS);
  if(!Number.isFinite(px)||!Number.isFinite(pz)||!Number.isFinite(py)) return {type:'boundary',role:'invalid'};
  const effectiveRadius=Math.max(0,r-HORIZONTAL_SKIN);
  if(Math.abs(px)+effectiveRadius>ARENA_LIMIT||Math.abs(pz)+effectiveRadius>ARENA_LIMIT)return {type:'boundary',role:'arena'};
  stamp=(stamp+1)>>>0;if(!stamp){for(const entry of entries)entry.visit=0;stamp=1;}
  const minCX=Math.floor((px-r)/CELL_SIZE),maxCX=Math.floor((px+r)/CELL_SIZE);
  const minCY=Math.floor(py/CELL_HEIGHT),maxCY=Math.floor((py+h)/CELL_HEIGHT);
  const minCZ=Math.floor((pz-r)/CELL_SIZE),maxCZ=Math.floor((pz+r)/CELL_SIZE);
  for(let cx=minCX;cx<=maxCX;cx++)for(let cy=minCY;cy<=maxCY;cy++)for(let cz=minCZ;cz<=maxCZ;cz++){
    const list=grid.get(keyFor(cx,cy,cz));if(!list)continue;
    for(const entry of list){
      if(entry.visit===stamp)continue;entry.visit=stamp;
      const c=entry.collider,b=entry.bounds;
      if(c.type==='ramp'){
        if(!circleTouchesBox(px,pz,effectiveRadius,b.minX,b.maxX,b.minZ,b.maxZ))continue;
        const top=rampTopAt(c,px);
        if(verticalOverlap(py,h,c.bottomY,top))return c;
        continue;
      }
      if(!verticalOverlap(py,h,b.minY,b.maxY))continue;
      if(c.type==='box'){
        if(circleTouchesBox(px,pz,effectiveRadius,b.minX,b.maxX,b.minZ,b.maxZ))return c;
      }else if(Math.hypot(px-c.x,pz-c.z)<c.r+effectiveRadius)return c;
    }
  }
  return null;
}

export function worldBlockedAt(x,z,y,height=PLAYER_HEIGHT,radius=PLAYER_RADIUS){
  return worldBlockerAt(x,z,y,height,radius)!==null;
}

function clearStandingAt(x,z,y,height,radius){
  return !worldBlockerAt(x,z,y+.018,height,radius);
}

function findFrontBlocker(x,y,z,dx,dz,height,radius){
  for(let distance=.08;distance<=TRAVERSE_PROBE;distance+=.07){
    const px=x+dx*distance,pz=z+dz*distance,c=worldBlockerAt(px,pz,y,height,radius);
    if(c&&c.role!=='arena'&&c.role!=='invalid')return {collider:c,distance,probeX:px,probeZ:pz};
  }
  return null;
}

function vaultLanding(x,y,z,dx,dz,height,radius,hit,topY){
  let sawBlocked=false;
  for(let distance=Math.max(.12,hit.distance);distance<=3.05;distance+=.07){
    const px=x+dx*distance,pz=z+dz*distance;
    const obstacle=worldBlockerAt(px,pz,y,height,radius);
    if(obstacle){sawBlocked=true;continue;}
    if(!sawBlocked)continue;
    const support=worldSupportHeight(px,pz,y,false,radius);
    if(Math.abs(support-y)>.82)continue;
    if(!clearStandingAt(px,pz,support,height,radius))continue;
    return {endX:px,endY:support,endZ:pz,peakY:Math.max(topY+.20,y+.62)};
  }
  return null;
}

function boxMantleLanding(c,x,y,z,dx,dz,height,radius,hit,topY){
  const inset=radius+.065,minX=c.minX+inset,maxX=c.maxX-inset,minZ=c.minZ+inset,maxZ=c.maxZ-inset;
  if(minX>maxX||minZ>maxZ)return null;
  for(let distance=Math.max(hit.distance,.10);distance<=hit.distance+2.15;distance+=.055){
    const px=x+dx*distance,pz=z+dz*distance;
    if(px<minX||px>maxX||pz<minZ||pz>maxZ)continue;
    if(!clearStandingAt(px,pz,topY,height,radius))continue;
    const support=worldSupportHeight(px,pz,topY,false,radius);
    if(Math.abs(support-topY)>.09)continue;
    return {endX:px,endY:topY,endZ:pz,peakY:topY+.12};
  }
  return null;
}

function roundMantleLanding(c,x,y,z,dx,dz,height,radius,topY){
  const supportRadius=Math.max(radius+.10,Number(c.supportRadius)||c.r),available=supportRadius-radius-.055;
  if(available<=.05)return null;
  let ox=x-c.x,oz=z-c.z,len=Math.hypot(ox,oz);
  if(len<1e-5){ox=-dx;oz=-dz;len=1;}
  const px=c.x+ox/len*available,pz=c.z+oz/len*available;
  if(Math.hypot(px-x,pz-z)>2.35)return null;
  if(!clearStandingAt(px,pz,topY,height,radius))return null;
  const support=worldSupportHeight(px,pz,topY,false,radius);
  if(Math.abs(support-topY)>.09)return null;
  return {endX:px,endY:topY,endZ:pz,peakY:topY+.12};
}

export function findTraversalCandidate({x,y,z,dirX,dirZ,height=PLAYER_HEIGHT,radius=PLAYER_RADIUS,airborne=false}={}){
  const px=Number(x),py=Number(y),pz=Number(z),h=Math.max(.2,Number(height)||PLAYER_HEIGHT),r=Math.max(.05,Number(radius)||PLAYER_RADIUS);
  let dx=Number(dirX)||0,dz=Number(dirZ)||0;const len=Math.hypot(dx,dz);
  if(!Number.isFinite(px)||!Number.isFinite(py)||!Number.isFinite(pz)||len<.35)return null;
  dx/=len;dz/=len;
  const hit=findFrontBlocker(px,py,pz,dx,dz,h,r);if(!hit)return null;
  const c=hit.collider,mode=c.traversal||'';if(!mode)return null;
  const topY=colliderTopAt(c,hit.probeX),rise=topY-py;
  if(!Number.isFinite(topY)||rise<.12)return null;
  // Thin overhead slabs are ceilings, not mantle ledges. A ledge must have a
  // face that reaches down near the player's feet.
  const minY=Number.isFinite(c.minY)?c.minY:Number.isFinite(c.bottomY)?c.bottomY:py;
  if(minY>py+.34)return null;
  if(mode==='vault'){
    if(rise>VAULT_MAX_RISE)return null;
    const landing=vaultLanding(px,py,pz,dx,dz,h,r,hit,topY);if(!landing)return null;
    return {mode:'vault',role:c.role||'',rise,topY,...landing,dirX:dx,dirZ:dz};
  }
  if(mode==='mantle'){
    if(!c.supportTop||rise>MANTLE_MAX_RISE)return null;
    // Higher ledges require the player to actually jump close enough to grab
    // them. Low waist-height ledges may mantle directly from a jump press.
    if(!airborne&&rise>.98)return null;
    const landing=c.type==='box'?boxMantleLanding(c,px,py,pz,dx,dz,h,r,hit,topY):c.type==='round'?roundMantleLanding(c,px,py,pz,dx,dz,h,r,topY):null;
    if(!landing)return null;
    return {mode:'mantle',role:c.role||'',rise,topY,...landing,dirX:dx,dirZ:dz};
  }
  return null;
}

export function collisionDebugStats(){return {colliders:entries.length,cells:grid.size};}
