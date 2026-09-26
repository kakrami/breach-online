import { createTraversalResolver } from './traversal-resolver.js';
export function createAuthoredWorldCollision(world){
  const {ARENA_LIMIT,PLAYER_HEIGHT,PLAYER_RADIUS,WORLD_PLAYER_COLLIDERS,BUILDING_WINDOW_PORTALS,worldSupportHeight,terrainHeight}=world;
  
  const CELL_SIZE = 8;
  const CELL_HEIGHT = 3;
  const HORIZONTAL_SKIN = 0.015;
  const VERTICAL_SKIN = 0.04;
          const grid = new Map();
  const entries = [];
  const keyFor = (cx,cy,cz) => `${cx},${cy},${cz}`;
  const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
  const normalizeRot=v=>{let r=(Number(v)||0)%360;if(r<0)r+=360;return r;};
  function localPoint(c,x,z){const a=-normalizeRot(c.rot||0)*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a),dx=x-c.x,dz=z-c.z;return{x:dx*cs-dz*sn,z:dx*sn+dz*cs};}
  function boxAabb(c){const a=normalizeRot(c.rot||0)*Math.PI/180,cs=Math.abs(Math.cos(a)),sn=Math.abs(Math.sin(a)),hx=c.w/2*cs+c.d/2*sn,hz=c.w/2*sn+c.d/2*cs;return{minX:c.x-hx,maxX:c.x+hx,minZ:c.z-hz,maxZ:c.z+hz};}
  function rampProjection(c,x,z){const z1=c.z1??c.z,z2=c.z2??c.z,vx=c.x2-c.x1,vz=z2-z1,len2=vx*vx+vz*vz;if(len2<1e-9)return{t:0,raw:0,d:Math.hypot(x-c.x1,z-z1),length:0};const raw=((x-c.x1)*vx+(z-z1)*vz)/len2,t=clamp(raw,0,1),px=c.x1+vx*t,pz=z1+vz*t;return{t,raw,d:Math.hypot(x-px,z-pz),length:Math.sqrt(len2)};}
  
  function boundsFor(collider){
    if(collider.type==='box'){const a=boxAabb(collider);return {...a,minY:collider.minY,maxY:collider.maxY};}
    if(collider.type==='round') return {minX:collider.x-collider.r,maxX:collider.x+collider.r,minZ:collider.z-collider.r,maxZ:collider.z+collider.r,minY:collider.minY,maxY:collider.maxY};
    if(collider.type==='pyramid'){const half=collider.base/2;return{minX:collider.x-half,maxX:collider.x+half,minZ:collider.z-half,maxZ:collider.z+half,minY:collider.minY,maxY:collider.maxY};}
    const z1=collider.z1??collider.z,z2=collider.z2??collider.z,half=collider.w/2;
    return {minX:Math.min(collider.x1,collider.x2)-half,maxX:Math.max(collider.x1,collider.x2)+half,minZ:Math.min(z1,z2)-half,maxZ:Math.max(z1,z2)+half,minY:collider.bottomY,maxY:Math.max(collider.y0,collider.y1)};
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
  
  function circleTouchesBox(x,z,r,minX,maxX,minZ,maxZ){const qx=clamp(x,minX,maxX),qz=clamp(z,minZ,maxZ),dx=x-qx,dz=z-qz;return dx*dx+dz*dz<r*r;}
  function circleTouchesColliderBox(c,x,z,r){const p=localPoint(c,x,z);return circleTouchesBox(p.x,p.z,r,-c.w/2,c.w/2,-c.d/2,c.d/2);}
  function circleTouchesRamp(c,x,z,r){const q=rampProjection(c,x,z),pad=q.length>0?r/q.length:0;return q.raw>=-pad&&q.raw<=1+pad&&q.d<c.w/2+r;}
  function pyramidContact(c,x,z,r=0){const half=c.base/2,qx=clamp(x,c.x-half,c.x+half),qz=clamp(z,c.z-half,c.z+half),dx=x-qx,dz=z-qz;if(dx*dx+dz*dz>r*r)return null;const relief=Math.max(Math.abs(qx-c.x),Math.abs(qz-c.z)),top=c.minY+c.h*(1-clamp(relief/Math.max(.001,half),0,1));return{x:qx,z:qz,top};}
  
  function verticalOverlap(y,height,minY,maxY){
    return y+height>minY+VERTICAL_SKIN&&y<maxY-VERTICAL_SKIN;
  }
  
  function rampTopAt(collider,x,z){const q=rampProjection(collider,x,z);return collider.y0+(collider.y1-collider.y0)*q.t;}
  
  let stamp=0;
  function worldBlockerAt(x,z,y,height=PLAYER_HEIGHT,radius=PLAYER_RADIUS){
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
        if(colliderBlocksAt(c,b,px,pz,py,h,effectiveRadius))return c;
      }
    }
    return null;
  }
  
  function worldBlockedAt(x,z,y,height=PLAYER_HEIGHT,radius=PLAYER_RADIUS){
    return worldBlockerAt(x,z,y,height,radius)!==null;
  }
  
  function horizontalSignedDistance(collider,b,x,z){
    if(collider.type==='round')return Math.hypot(x-collider.x,z-collider.z)-collider.r;
    if(collider.type==='pyramid'){const half=collider.base/2,dx=Math.max(Math.abs(x-collider.x)-half,0),dz=Math.max(Math.abs(z-collider.z)-half,0);if(dx||dz)return Math.hypot(dx,dz);return -Math.min(half-Math.abs(x-collider.x),half-Math.abs(z-collider.z));}
    if(collider.type==='ramp'){const q=rampProjection(collider,x,z),along=q.raw<0?-q.raw*q.length:q.raw>1?(q.raw-1)*q.length:0,side=q.d-collider.w/2;if(along>0||side>0)return Math.hypot(Math.max(0,along),Math.max(0,side));return -Math.min(collider.w/2-q.d,Math.min(q.t,1-q.t)*q.length);}
    const p=localPoint(collider,x,z),hx=collider.w/2,hz=collider.d/2,dx=Math.max(-hx-p.x,0,p.x-hx),dz=Math.max(-hz-p.z,0,p.z-hz);if(dx||dz)return Math.hypot(dx,dz);return -Math.min(p.x+hx,hx-p.x,p.z+hz,hz-p.z);
  }
  
  function colliderBlocksAt(collider,b,x,z,y,height,effectiveRadius){
    if(collider.type==='ramp'){if(!circleTouchesRamp(collider,x,z,effectiveRadius))return false;return verticalOverlap(y,height,collider.bottomY,rampTopAt(collider,x,z));}
    if(collider.type==='pyramid'){const contact=pyramidContact(collider,x,z,effectiveRadius);return!!contact&&verticalOverlap(y,height,collider.minY,contact.top);}
    if(!verticalOverlap(y,height,b.minY,b.maxY))return false;
    if(collider.type==='box')return circleTouchesColliderBox(collider,x,z,effectiveRadius);
    return Math.hypot(x-collider.x,z-collider.z)<collider.r+effectiveRadius;
  }
  
  // Normal collision rejects new penetration, but a player who just stepped off
  // a roof can legitimately begin a frame slightly overlapping the wall/slab
  // below. Allow motion that strictly reduces every existing overlap. Without
  // this, slow walk-offs could freeze horizontally against the ledge until the
  // player fell all the way to the ground.
  function worldMoveBlockedAt(x,z,y,fromX,fromZ,height=PLAYER_HEIGHT,radius=PLAYER_RADIUS,fromY=y){
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
  function worldHeightExpansionBlockedAt(x,z,y,fromHeight,toHeight,radius=PLAYER_RADIUS){
    const low=Math.max(.05,Number(fromHeight)||0),high=Math.max(low,Number(toHeight)||low);
    if(high<=low+.001)return false;
    const sliceY=Number(y)+low-.018,sliceHeight=high-low+.036;
    return worldBlockerAt(x,z,sliceY,sliceHeight,radius)!==null;
  }
  
  
  const traversalResolver=createTraversalResolver({
    colliders:WORLD_PLAYER_COLLIDERS,windowPortals:BUILDING_WINDOW_PORTALS,worldBlockerAt,worldSupportHeight,terrainHeight,playerHeight:PLAYER_HEIGHT,playerRadius:PLAYER_RADIUS,
  });
  function findTraversalCandidate(args={}){return traversalResolver.findTraversalCandidate(args);}
  
  function collisionDebugStats(){return {colliders:entries.length,cells:grid.size,traversalAffordances:traversalResolver.affordances.all.length};}
  return {worldBlockerAt,worldBlockedAt,worldMoveBlockedAt,worldHeightExpansionBlockedAt,findTraversalCandidate,collisionDebugStats};
}
