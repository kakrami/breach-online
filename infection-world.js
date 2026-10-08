// Temporary objects use the same catalog/compiler and collision services as the map.
import {createAuthoredWorldCollision} from './authored-world-collision.js';
import {createAuthoredServerCollision} from './authored-server-collision.js';
import {ladderBottomExitPoint,ladderTopExitPoint} from './movement-model.js';
export function compileInfectionWorld(base,state={}){
 const props=(state.barricades||[]).filter(p=>p.hp>0).map(p=>({...p,geometry:base.compileProp({assetId:'prop/barricade',kind:'barricade',x:p.x,z:p.z,w:3.2,d:.48,h:1.25,rot:p.rot,yOffset:p.y-base.terrainHeight(p.x,p.z)})}));
 const parts=props.flatMap(p=>p.geometry.parts.map(part=>({...part,infectionId:p.id}))),geometry={...base,LADDERS:[...(base.LADDERS||[]),...(state.ladders||[])],WORLD_PLAYER_COLLIDERS:[...base.WORLD_PLAYER_COLLIDERS,...parts.filter(p=>p.playerSolid)],STATIC_PROJECTILE_COLLIDERS:[...base.STATIC_PROJECTILE_COLLIDERS,...parts.filter(p=>p.projectileSolid)]};
 return {geometry,props,worldCollision:createAuthoredWorldCollision(geometry),serverCollision:createAuthoredServerCollision(geometry)};
}
// Give authored roof holds a second physical approach, never a teleport or invisible path.
export function infectionRoofApproaches(g,c){
 const extra=[],solids=[...g.BUILDINGS,...g.STATIC_BOXES.filter(b=>b.h>=2.2)];
 for(const l of g.LADDERS||[]){
  const exit=ladderTopExitPoint(l,g.PLAYER_RADIUS),inside=b=>{const a=-(b.rot||0)*Math.PI/180,x=(exit.x-b.x)*Math.cos(a)-(exit.z-b.z)*Math.sin(a),z=(exit.x-b.x)*Math.sin(a)+(exit.z-b.z)*Math.cos(a);return Math.abs(x)<b.w/2+.15&&Math.abs(z)<b.d/2+.15;},b=solids.find(inside);if(!b)continue;
  const choices=[];
  for(const [lx,lz]of [[1,0],[-1,0],[0,1],[0,-1]])for(const offset of [0,-.25,.25]){
   const a=(b.rot||0)*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a),nx=lx*cs-lz*sn,nz=lx*sn+lz*cs,u=lx*(b.w/2+.08)+(lz?offset*b.w:0),v=lz*(b.d/2+.08)+(lx?offset*b.d:0),x=b.x+u*cs-v*sn,z=b.z+u*sn+v*cs;
   if(nx*l.nx+nz*l.nz>.6||[...g.LADDERS,...extra].some(e=>Math.hypot(e.x-x,e.z-z)<5))continue;
   const candidate={...l,id:'infection-'+l.id,x,z,nx,nz,tx:-nz,tz:nx},low=ladderBottomExitPoint(candidate,g.PLAYER_RADIUS),high=ladderTopExitPoint(candidate,g.PLAYER_RADIUS);
   candidate.bottomY=g.worldSupportHeight(low.x,low.z,g.terrainHeight(low.x,low.z)+.5);candidate.topY=g.worldSupportHeight(high.x,high.z,l.topY+.3);
   if(candidate.topY-candidate.bottomY<1.5||Math.abs(candidate.topY-l.topY)>.6||c.worldBlockedAt(low.x,low.z,candidate.bottomY,g.PLAYER_HEIGHT,g.PLAYER_RADIUS)||c.worldBlockedAt(high.x,high.z,candidate.topY,g.PLAYER_HEIGHT,g.PLAYER_RADIUS))continue;
   choices.push(candidate);
  }
  choices.sort((a,b)=>Math.hypot(b.x-l.x,b.z-l.z)-Math.hypot(a.x-l.x,a.z-l.z));if(choices.length)extra.push(choices[0]);
 }
 return extra;
}
