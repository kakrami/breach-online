// Temporary objects use the same catalog/compiler and collision services as the map.
import {createAuthoredWorldCollision} from './authored-world-collision.js';
import {createAuthoredServerCollision} from './authored-server-collision.js';
import {resolveLadderAttachment,ladderPathClear} from './movement-model.js';
export function compileInfectionWorld(base,state={}){
 const props=(state.barricades||[]).filter(p=>p.hp>0).map(p=>({...p,geometry:base.compileProp({assetId:'prop/barricade',kind:'barricade',x:p.x,z:p.z,w:3.2,d:.48,h:1.25,rot:p.rot,yOffset:p.y-base.terrainHeight(p.x,p.z)})}));
 const parts=props.flatMap(p=>p.geometry.parts.map(part=>({...part,infectionId:p.id}))),geometry={...base,LADDERS:[...(base.LADDERS||[]),...(state.ladders||[])],WORLD_PLAYER_COLLIDERS:[...base.WORLD_PLAYER_COLLIDERS,...parts.filter(p=>p.playerSolid)],STATIC_PROJECTILE_COLLIDERS:[...base.STATIC_PROJECTILE_COLLIDERS,...parts.filter(p=>p.projectileSolid)]};
 return {geometry,props,worldCollision:createAuthoredWorldCollision(geometry),serverCollision:createAuthoredServerCollision(geometry)};
}
// Give authored roof holds a second physical approach, never a teleport or invisible path.
export function infectionRoofApproaches(g,c){
 const extra=[],parents=[...g.BUILDINGS,...g.STATIC_BOXES];
 for(const l of g.LADDERS||[]){
  const parent=parents.find(b=>b.id&&b.id===l.parentId);if(!parent)continue;
  const choices=[];
  for(const side of ['e','w','n','s'])for(const t of [0,-.25,.25]){
   const candidate=resolveLadderAttachment({...l,id:'infection-'+l.id,side,t},parent,l.topY,g.terrainHeight,g.PLAYER_RADIUS);
   if(candidate.nx*l.nx+candidate.nz*l.nz>.6||[...g.LADDERS,...extra].some(e=>Math.hypot(e.x-candidate.x,e.z-candidate.z)<5)||!ladderPathClear(candidate,g,c))continue;
   choices.push(candidate);
  }
  choices.sort((a,b)=>Math.hypot(b.x-l.x,b.z-l.z)-Math.hypot(a.x-l.x,a.z-l.z));if(choices.length)extra.push(choices[0]);
 }
 return extra;
}
