export function geometryContract(g){
 return {assets:[g.BUILDINGS,g.STATIC_BOXES,g.ELEVATION_OBJECTS],parts:[g.BUILDING_PARTS,g.STATIC_PARTS],players:g.WORLD_PLAYER_COLLIDERS,projectiles:g.STATIC_PROJECTILE_COLLIDERS,supports:g.BUILDING_SUPPORTS,ceilings:g.BUILDING_HORIZONTAL_SOLIDS,portals:g.BUILDING_WINDOW_PORTALS,ladders:g.LADDERS,terrain:Array.from({length:(g.TERRAIN_SEGMENTS+1)**2},(_,i)=>g.terrainVertexHeight(i%(g.TERRAIN_SEGMENTS+1),Math.floor(i/(g.TERRAIN_SEGMENTS+1))))};
}
export function geometrySignature(g){const value=JSON.stringify(geometryContract(g));let hash=2166136261;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(16).padStart(8,'0');}
export const authoredYaw = degrees => -(Number(degrees)||0)*Math.PI/180;
export function collisionDebugShapes(g,mode='player'){
 if(mode==='player')return g.WORLD_PLAYER_COLLIDERS;
 return [...g.STATIC_PROJECTILE_COLLIDERS,...g.BUILDING_PARTS.filter(p=>p.projectileSolid).map(p=>({...p,type:'box',minY:p.bottomY,maxY:p.topY})),...g.PYRAMIDS.map(p=>({...p,type:'pyramid',minY:g.terrainHeight(p.x,p.z),maxY:g.terrainHeight(p.x,p.z)+p.h})),...g.NATURAL_OBSTACLES.map(o=>({...o,type:'round',minY:g.naturalGroundBase(o.type,o.x,o.z,o.r),maxY:g.naturalGroundBase(o.type,o.x,o.z,o.r)+o.h+.18}))];
}
