import {actorDimensions} from './actor-rules.js';
// Local dynamic-body avoidance complements the shared static map navigator.
// It never changes an actor's position: waypoints still go through swept physics.
export function actorDetour(actor,goal,actors,world){
 const g=world.geometry,c=world.worldCollision,body=actorDimensions(actor,{height:g.PLAYER_HEIGHT,radius:g.PLAYER_RADIUS,crouchHeight:g.CROUCH_HEIGHT||1.15}),radius=body.radius,height=body.height;
 if(actor.botAirborne||actor.infectionAirborne||actor.ladder||actor.traversal){actor.actorDetour=null;return null;}
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),near=actors.filter(p=>p.hp>0&&distance(actor,p)<8&&actor.y+height-.08>p.y&&actor.y<p.y+actorDimensions(p,{height:g.PLAYER_HEIGHT,radius:g.PLAYER_RADIUS,crouchHeight:g.CROUCH_HEIGHT||1.15}).height-.08);
 const blockedBody=(x,y,z,from)=>near.some(p=>{const other=actorDimensions(p,{height:g.PLAYER_HEIGHT,radius:g.PLAYER_RADIUS,crouchHeight:g.CROUCH_HEIGHT||1.15});if(y+height-.08<=p.y||y>=p.y+other.height-.08)return false;const min=radius+other.radius+.09,d=Math.hypot(x-p.x,z-p.z),old=distance(from,p);return d<min&&!(old<min&&d>=old-.001);});
 function clear(a,b){const d=distance(a,b),n=Math.max(1,Math.ceil(d/.18));let p={...a};for(let i=1;i<=n;i++){const x=a.x+(b.x-a.x)*i/n,z=a.z+(b.z-a.z)*i/n,y=g.worldSupportHeight(x,z,p.y+.45,false,radius);if(Math.abs(x)>=g.ARENA_LIMIT-1||Math.abs(z)>=g.ARENA_LIMIT-1||Math.abs(y-p.y)>.65||c.worldMoveBlockedAt(x,z,y,p.x,p.z,height,radius,p.y)||blockedBody(x,y,z,p))return false;p={x,y,z};}return true;}
 const dx=goal.x-actor.x,dz=goal.z-actor.z,d=Math.hypot(dx,dz);if(d<.1){actor.actorDetour=null;return null;}const ux=dx/d,uz=dz/d;
 let route=actor.actorDetour;
 const cachedBlocker=route&&near.find(p=>(p.clientId||p.id)===route.blocker);if(cachedBlocker&&distance(cachedBlocker,goal)<=Math.max(.1,Number(goal.stopDistance)||0))route=null;
 if(route&&distance(route.goal,goal)<4){while(route.points.length&&distance(actor,route.points[0])<.2)route.points.shift();if(route.points.length&&clear(actor,route.points[0]))return route.points[0];}
 actor.actorDetour=null;
 // Only a nearby body ahead triggers avoidance. Long-range routes remain the
 // responsibility of the static navigator; walls are never treated as players.
 const obstacles=near.filter(p=>distance(p,goal)>Math.max(.1,Number(goal.stopDistance)||0)).map(p=>{const along=(p.x-actor.x)*ux+(p.z-actor.z)*uz,side=Math.abs((p.x-actor.x)*uz-(p.z-actor.z)*ux),other=actorDimensions(p,{height:g.PLAYER_HEIGHT,radius:g.PLAYER_RADIUS,crouchHeight:g.CROUCH_HEIGHT||1.15});return{p,along,side,margin:radius+other.radius+.14};}).filter(o=>o.along>-.2&&o.along<Math.min(d,2.5)&&o.side<o.margin).sort((a,b)=>a.along-b.along);
 const obstacle=obstacles[0];if(!obstacle)return null;
 for(const side of [1,-1])for(const extra of [.35,.8,1.4]){
  const m=obstacle.margin+extra,px=uz*side,pz=-ux*side,back=obstacle.margin+.15;
  const points=[{x:obstacle.p.x-ux*back+px*m,z:obstacle.p.z-uz*back+pz*m},{x:obstacle.p.x+ux*back+px*m,z:obstacle.p.z+uz*back+pz*m}];let previous=actor,valid=true;
  for(const p of points){p.y=g.worldSupportHeight(p.x,p.z,previous.y+.45,false,radius);if(!clear(previous,p)){valid=false;break;}previous=p;}
  if(!valid)continue;actor.actorDetour={goal:{x:goal.x,z:goal.z},points,blocker:obstacle.p.clientId||obstacle.p.id};return points[0];
 }
 return null;
}
