import { createTraversalPlan, traversalPose } from './movement-model.js';

const TRAVERSE_PROBE = 1.65;
const VAULT_MAX_RISE = 1.10;
const MANTLE_GROUNDED_MAX_RISE = 1.18;
const MANTLE_AIR_MAX_RISE = 1.90;
const VERTICAL_SKIN = 0.04;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const normalizeRot=v=>{let r=(Number(v)||0)%360;if(r<0)r+=360;return r;};

// Traversal is an explicit semantic layer. Collision objects never grant traversal
// merely by existing; only roles listed here compile an affordance.
const VAULT_ROLES=new Set(['rail','bush','barrier','sandbag','brokenWall']);
const MANTLE_ROLES=new Set([
  'static','rock','roof','platform','overpass',
  'box','crate','pipe','tank','shed','containerBlue','containerRed','containerGreen','containerTan','pipeBank',
  'burntCarBody','burntCarCabin','burntBusBody','burntBusUpper','dumpsterBody','dumpsterLid','checkpointBody','checkpointRoof'
]);

function localPoint(c,x,z){const a=-normalizeRot(c.rot||0)*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a),dx=x-c.x,dz=z-c.z;return{x:dx*cs-dz*sn,z:dx*sn+dz*cs};}
function topAt(c,x,z){
  if(c.type==='ramp'){
    const z1=c.z1??c.z,z2=c.z2??c.z,vx=c.x2-c.x1,vz=z2-z1,len2=vx*vx+vz*vz||1,t=clamp(((x-c.x1)*vx+(z-z1)*vz)/len2,0,1);return c.y0+(c.y1-c.y0)*t;
  }
  if(c.type==='pyramid'){
    const half=c.base/2,relief=Math.max(Math.abs(x-c.x),Math.abs(z-c.z));return c.minY+c.h*(1-clamp(relief/Math.max(.001,half),0,1));
  }
  return Number(c.maxY);
}
function insideTop(c,x,z,radius){
  const inset=Math.max(.04,radius+.065);
  if(c.type==='round')return Math.hypot(x-c.x,z-c.z)<=Math.max(.02,(Number(c.supportRadius)||c.r)-inset);
  if(c.type==='box'){
    const p=localPoint(c,x,z);return Math.abs(p.x)<=c.w/2-inset&&Math.abs(p.z)<=c.d/2-inset;
  }
  return false;
}

export function compileTraversalAffordances(colliders=[],windowPortals=[]){
  const byCollider=new Map(),all=[];
  colliders.forEach((c,index)=>{
    const role=String(c?.role||'');let mode='';
    if(VAULT_ROLES.has(role))mode='vault';
    else if(c?.supportTop&&MANTLE_ROLES.has(role))mode='mantle';
    if(!mode)return;
    const a=Object.freeze({id:`c${index}:${mode}:${role}`,type:mode,role,collider:c});byCollider.set(c,a);all.push(a);
  });
  const portals=(Array.isArray(windowPortals)?windowPortals:[]).map((p,index)=>Object.freeze({id:`portal:${p.id||index}`,type:'portal',role:'window',portal:p}));
  return Object.freeze({byCollider,portals:Object.freeze(portals),all:Object.freeze([...all,...portals])});
}

export function createTraversalResolver({
  colliders=[],windowPortals=[],worldBlockerAt,worldSupportHeight,terrainHeight=()=>-Infinity,playerHeight=1.8,playerRadius=.34,
}={}){
  const compiled=compileTraversalAffordances(colliders,windowPortals);
  const clearStandingAt=(x,z,y,height,radius)=>!worldBlockerAt(x,z,y+.018,height,radius);

  function findWindowPortalCandidate(x,y,z,dx,dz,height,radius){
    let best=null;
    for(const item of compiled.portals){const portal=item.portal;
      const relX=x-portal.cx,relZ=z-portal.cz,normalDistance=relX*portal.nx+relZ*portal.nz;
      if(Math.abs(normalDistance)>.08+TRAVERSE_PROBE)continue;
      const approach=dx*portal.nx+dz*portal.nz;if(Math.abs(approach)<.28||normalDistance*approach>=-.012)continue;
      const distance=-normalDistance/approach;if(distance<.015||distance>TRAVERSE_PROBE+.38)continue;
      const crossX=x+dx*distance,crossZ=z+dz*distance,lateral=(crossX-portal.cx)*portal.tx+(crossZ-portal.cz)*portal.tz;
      const assistHalf=Math.max(.08,portal.halfWidth-.055);if(Math.abs(lateral)>assistHalf)continue;
      const openingHeight=portal.topY-portal.bottomY;if(openingHeight+VERTICAL_SKIN*2<height)continue;
      if(y<portal.floorY-.48||y>portal.bottomY+.72)continue;
      const sillTop=portal.bottomY+.015,rise=sillTop-y;if(rise>VAULT_MAX_RISE+.08)continue;
      const safeHalf=Math.max(.04,portal.halfWidth-radius-.075),safeLateral=clamp(lateral,-safeHalf,safeHalf);
      const targetNormal=(normalDistance>0?-1:1)*(portal.wallThickness/2+radius+.16);
      const endX=portal.cx+portal.tx*safeLateral+portal.nx*targetNormal,endZ=portal.cz+portal.tz*safeLateral+portal.nz*targetNormal;
      const support=worldSupportHeight(endX,endZ,portal.floorY,false,radius),supportClose=Math.abs(support-portal.floorY)<=.82;
      let endY=portal.floorY,endGrounded=false;
      if(supportClose&&clearStandingAt(endX,endZ,support,height,radius)){endY=support;endGrounded=true;}
      else if(!clearStandingAt(endX,endZ,endY,height,radius))continue;
      const candidate={mode:'vault',role:'window',portalId:portal.id,affordanceId:item.id,rise:Math.max(.12,rise),topY:sillTop,endX,endY,endZ,peakY:Math.max(sillTop+.075,y+.62),endGrounded,exitVelocityY:endGrounded?0:-1.15,viewMaxY:portal.topY-.16,dirX:dx,dirZ:dz};
      if(!best||distance<best.distance)best={distance,candidate};
    }
    return best?.candidate||null;
  }

  function findFrontBlocker(x,y,z,dx,dz,height,radius){
    for(let distance=.08;distance<=TRAVERSE_PROBE;distance+=.07){const px=x+dx*distance,pz=z+dz*distance,c=worldBlockerAt(px,pz,y,height,radius);if(c&&c.role!=='arena'&&c.role!=='invalid')return{collider:c,distance,probeX:px,probeZ:pz};}
    return null;
  }

  function vaultLanding(x,y,z,dx,dz,height,radius,hit,topY){
    // The front probe already established contact with this explicit vault
    // affordance. Walk forward until the capsule has cleared that exact
    // obstacle, then choose the first valid support on the far side.
    let clearedAuthorized=false;
    for(let distance=Math.max(.12,hit.distance);distance<=3.05;distance+=.05){const px=x+dx*distance,pz=z+dz*distance,obstacle=worldBlockerAt(px,pz,y,height,radius);if(obstacle===hit.collider)continue;if(obstacle)continue;clearedAuthorized=true;if(!clearedAuthorized)continue;const support=worldSupportHeight(px,pz,y,false,radius);if(Math.abs(support-y)>.82||!clearStandingAt(px,pz,support,height,radius))continue;return{endX:px,endY:support,endZ:pz,peakY:Math.max(topY+.24,y+.74),endGrounded:true};}
    return null;
  }

  function mantleLanding(c,x,y,z,dx,dz,height,radius,hit,topY){
    if(c.type==='round'){
      const available=Math.max(radius+.10,Number(c.supportRadius)||c.r)-radius-.055;if(available<=.05)return null;let ox=x-c.x,oz=z-c.z,len=Math.hypot(ox,oz);if(len<1e-5){ox=-dx;oz=-dz;len=1;}const px=c.x+ox/len*available,pz=c.z+oz/len*available;if(Math.hypot(px-x,pz-z)>2.35||!clearStandingAt(px,pz,topY,height,radius))return null;const support=worldSupportHeight(px,pz,topY,false,radius);if(Math.abs(support-topY)>.09)return null;return{endX:px,endY:topY,endZ:pz,peakY:topY+.14,endGrounded:true};
    }
    if(c.type!=='box')return null;
    for(let distance=Math.max(hit.distance,.10);distance<=hit.distance+2.15;distance+=.055){const px=x+dx*distance,pz=z+dz*distance;if(!insideTop(c,px,pz,radius))continue;if(!clearStandingAt(px,pz,topY,height,radius))continue;const support=worldSupportHeight(px,pz,topY,false,radius);if(Math.abs(support-topY)>.09)continue;return{endX:px,endY:topY,endZ:pz,peakY:topY+.14,endGrounded:true};}
    return null;
  }

  function sweptPathClear(candidate,x,y,z,height,radius){
    const plan=createTraversalPlan(candidate,x,y,z,0,0);if(!plan)return false;
    const horiz=Math.hypot(plan.endX-plan.startX,plan.endZ-plan.startZ),samples=Math.max(24,Math.ceil(horiz/.055));
    for(let i=1;i<samples;i++){
      const at=plan.durationMs*(i/samples),pose=traversalPose(plan,at);if(!pose)return false;
      const ground=Number(terrainHeight(pose.x,pose.z));if(Number.isFinite(ground)&&pose.y<ground-VERTICAL_SKIN)return false;const blocker=worldBlockerAt(pose.x,pose.z,pose.y+.018,height,radius);if(blocker)return false;
    }
    return true;
  }

  function findTraversalCandidate({x,y,z,dirX,dirZ,height=playerHeight,radius=playerRadius,airborne=false}={}){
    const px=Number(x),py=Number(y),pz=Number(z),h=Math.max(.2,Number(height)||playerHeight),r=Math.max(.05,Number(radius)||playerRadius);let dx=Number(dirX)||0,dz=Number(dirZ)||0;const len=Math.hypot(dx,dz);if(!Number.isFinite(px)||!Number.isFinite(py)||!Number.isFinite(pz)||len<.35)return null;dx/=len;dz/=len;
    const portal=findWindowPortalCandidate(px,py,pz,dx,dz,h,r);if(portal&&sweptPathClear(portal,px,py,pz,h,r))return portal;
    const hit=findFrontBlocker(px,py,pz,dx,dz,h,r);if(!hit)return null;const affordance=compiled.byCollider.get(hit.collider);if(!affordance)return null;
    const c=hit.collider,topY=topAt(c,hit.probeX,hit.probeZ),rise=topY-py;if(!Number.isFinite(topY)||rise<.12)return null;
    let candidate=null;
    if(affordance.type==='vault'){
      if(rise>VAULT_MAX_RISE)return null;const landing=vaultLanding(px,py,pz,dx,dz,h,r,hit,topY);if(!landing)return null;candidate={mode:'vault',role:affordance.role,affordanceId:affordance.id,rise,topY,...landing,dirX:dx,dirZ:dz};
    }else if(affordance.type==='mantle'){
      const maxRise=airborne?MANTLE_AIR_MAX_RISE:MANTLE_GROUNDED_MAX_RISE;if(rise>maxRise)return null;const landing=mantleLanding(c,px,py,pz,dx,dz,h,r,hit,topY);if(!landing)return null;const landingRise=landing.endY-py;if(landingRise>.12&&landingRise>maxRise+.001)return null;candidate={mode:'mantle',role:affordance.role,affordanceId:affordance.id,rise:Math.max(rise,landingRise),topY:Math.max(topY,landing.endY),...landing,dirX:dx,dirZ:dz};
    }
    return candidate&&sweptPathClear(candidate,px,py,pz,h,r)?candidate:null;
  }

  return Object.freeze({findTraversalCandidate,affordances:compiled});
}
