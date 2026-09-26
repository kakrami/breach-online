import { ARENA_LIMIT, PLAYER_HEIGHT, PLAYER_RADIUS, WORLD_PLAYER_COLLIDERS, BUILDING_WINDOW_PORTALS, worldSupportHeight, terrainHeight } from './world-geometry-depot.js?v=1.52.1';
import { createTraversalResolver } from './traversal-resolver.js';

const CELL_SIZE = 8;
const CELL_HEIGHT = 3;
const HORIZONTAL_SKIN = 0.015;
const VERTICAL_SKIN = 0.04;
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

function horizontalSignedDistance(collider,b,x,z){
  if(collider.type==='round')return Math.hypot(x-collider.x,z-collider.z)-collider.r;
  const dx=Math.max(b.minX-x,0,x-b.maxX),dz=Math.max(b.minZ-z,0,z-b.maxZ);
  if(dx||dz)return Math.hypot(dx,dz);
  return -Math.min(x-b.minX,b.maxX-x,z-b.minZ,b.maxZ-z);
}

function colliderBlocksAt(collider,b,x,z,y,height,effectiveRadius){
  if(collider.type==='ramp'){
    if(!circleTouchesBox(x,z,effectiveRadius,b.minX,b.maxX,b.minZ,b.maxZ))return false;
    return verticalOverlap(y,height,collider.bottomY,rampTopAt(collider,x));
  }
  if(!verticalOverlap(y,height,b.minY,b.maxY))return false;
  if(collider.type==='box')return circleTouchesBox(x,z,effectiveRadius,b.minX,b.maxX,b.minZ,b.maxZ);
  return Math.hypot(x-collider.x,z-collider.z)<collider.r+effectiveRadius;
}

// Normal collision rejects new penetration, but a player who just stepped off
// a roof can legitimately begin a frame slightly overlapping the wall/slab
// below. Allow motion that strictly reduces every existing overlap. Without
// this, slow walk-offs could freeze horizontally against the ledge until the
// player fell all the way to the ground.
export function worldMoveBlockedAt(x,z,y,fromX,fromZ,height=PLAYER_HEIGHT,radius=PLAYER_RADIUS,fromY=y){
  const px=Number(x),pz=Number(z),py=Number(y),fx=Number(fromX),fz=Number(fromZ),fpy=Number(fromY),h=Math.max(0,Number(height)||PLAYER_HEIGHT),r=Math.max(0,Number(radius)||PLAYER_RADIUS);
  if(!Number.isFinite(px)||!Number.isFinite(pz)||!Number.isFinite(py)||!Number.isFinite(fx)||!Number.isFinite(fz)||!Number.isFinite(fpy))return true;
  const effectiveRadius=Math.max(0,r-HORIZONTAL_SKIN);
  if(Math.abs(px)+effectiveRadius>ARENA_LIMIT||Math.abs(pz)+effectiveRadius>ARENA_LIMIT)return true;
  stamp=(stamp+1)>>>0;if(!stamp){for(const entry of entries)entry.visit=0;stamp=1;}
  const minCX=Math.floor((px-r)/CELL_SIZE),maxCX=Math.floor((px+r)/CELL_SIZE),minCY=Math.floor(py/CELL_HEIGHT),maxCY=Math.floor((py+h)/CELL_HEIGHT),minCZ=Math.floor((pz-r)/CELL_SIZE),maxCZ=Math.floor((pz+r)/CELL_SIZE);
  for(let cx=minCX;cx<=maxCX;cx++)for(let cy=minCY;cy<=maxCY;cy++)for(let cz=minCZ;cz<=maxCZ;cz++){
    const list=grid.get(keyFor(cx,cy,cz));if(!list)continue;
    for(const entry of list){
      if(entry.visit===stamp)continue;entry.visit=stamp;const c=entry.collider;
      const b=entry.bounds;if(!colliderBlocksAt(c,b,px,pz,py,h,effectiveRadius))continue;
      const wasBlocked=colliderBlocksAt(c,b,fx,fz,fpy,h,effectiveRadius);
      if(!wasBlocked)return true;
      const before=horizontalSignedDistance(c,b,fx,fz),after=horizontalSignedDistance(c,b,px,pz);
      if(!(after>before+.0005))return true;
    }
  }
  return false;
}

// Standing up is a height-expansion test, not a fresh full-body collision test.
// Checking the entire standing capsule made low sills/steps near the feet report
// false "clearance" failures even though the extra head space was open.
export function worldHeightExpansionBlockedAt(x,z,y,fromHeight,toHeight,radius=PLAYER_RADIUS){
  const low=Math.max(.05,Number(fromHeight)||0),high=Math.max(low,Number(toHeight)||low);
  if(high<=low+.001)return false;
  const sliceY=Number(y)+low-.018,sliceHeight=high-low+.036;
  return worldBlockerAt(x,z,sliceY,sliceHeight,radius)!==null;
}


const traversalResolver=createTraversalResolver({
  colliders:WORLD_PLAYER_COLLIDERS,windowPortals:BUILDING_WINDOW_PORTALS,worldBlockerAt,worldSupportHeight,terrainHeight,playerHeight:PLAYER_HEIGHT,playerRadius:PLAYER_RADIUS,
});

export function findTraversalCandidate(args={}){return traversalResolver.findTraversalCandidate(args);}

export function collisionDebugStats(){return {colliders:entries.length,cells:grid.size,traversalAffordances:traversalResolver.affordances.all.length};}
