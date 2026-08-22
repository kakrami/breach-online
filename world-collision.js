import { ARENA_LIMIT, PLAYER_HEIGHT, PLAYER_RADIUS, WORLD_PLAYER_COLLIDERS } from './world-geometry.js';

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

export function collisionDebugStats(){return {colliders:entries.length,cells:grid.size};}
