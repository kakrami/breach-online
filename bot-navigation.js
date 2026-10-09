import {actorDimensions} from './actor-rules.js';
import {ladderBottomExitPoint,ladderTopExitPoint} from './movement-model.js';
// Ground routes use the compiled world collision and support queries used by actors.
// No separate obstacle approximation or invisible navigation walls.
export function createBotNavigator(world){
 const g=world.geometry,c=world.worldCollision,step=1.5,radius=g.PLAYER_RADIUS||.34,height=g.PLAYER_HEIGHT||1.8,nodes=new Map(),edges=new Map(),ladderConnections=new Map(),dropConnections=new Map(),routeMemo=new Map();let routeMemoPoints=0;const routeStats={hits:0,misses:0};
 const key=(x,z)=>x+','+z;
 function node(ix,iz){const k=key(ix,iz);if(nodes.has(k))return nodes.get(k);const x=ix*step,z=iz*step,ground=g.terrainHeight(x,z),y=g.worldSupportHeight(x,z,ground+.5,false,radius);const n=Math.abs(x)<g.ARENA_LIMIT-1&&Math.abs(z)<g.ARENA_LIMIT-1&&y-ground<.65&&!c.worldBlockedAt(x,z,y,height,radius)?{x,y,z,ix,iz,key:k}:null;nodes.set(k,n);return n;}
 function clear(a,b){const d=Math.hypot(b.x-a.x,b.z-a.z),count=Math.max(1,Math.ceil(d/.6));let px=a.x,py=a.y,pz=a.z;for(let i=1;i<=count;i++){const x=a.x+(b.x-a.x)*i/count,z=a.z+(b.z-a.z)*i/count,y=g.worldSupportHeight(x,z,py+.5,false,radius);if(Math.abs(y-py)>.65||c.worldMoveBlockedAt(x,z,y,px,pz,height,radius,py))return false;px=x;py=y;pz=z;}return Math.abs(py-b.y)<.8;}
 function neighbors(n){if(edges.has(n.key))return edges.get(n.key);const out=[];for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++){if(!x&&!z)continue;const b=node(n.ix+x,n.iz+z);if(b&&clear(n,b))out.push(b);}edges.set(n.key,out);return out;}
 function closest(p,allowed=()=>true,segment=()=>true){const ix=Math.round(p.x/step),iz=Math.round(p.z/step),candidates=[];for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){const n=node(ix+x,iz+z);if(n&&allowed(n)&&clear(p,n)&&segment(p,n))candidates.push(n);}return candidates.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];}
 function route(from,to,actors=[]){
  const bodies=actors.filter(p=>p.hp>0).map(p=>({...p,body:actorDimensions(p,{height,radius,crouchHeight:g.CROUCH_HEIGHT||1.15})}));
  const allowed=n=>!bodies.some(p=>n.y+height-.08>p.y&&n.y<p.y+p.body.height-.08&&Math.hypot(n.x-p.x,n.z-p.z)<radius+p.body.radius+.08);
  const segment=(a,b)=>{const d=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(d/.3));for(let i=1;i<=steps;i++)if(!allowed({x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps,z:a.z+(b.z-a.z)*i/steps}))return false;return true;};
  const target={x:to.x,z:to.z,y:g.worldSupportHeight(to.x,to.z,g.terrainHeight(to.x,to.z)+.5,false,radius)},start=closest(from,allowed,segment),end=closest(target,allowed);if(!start||!end)return [];
  // Static graph routes are immutable for this navigator's compiled world.
  // Reuse lattice paths, not actor coordinates or dynamic-body decisions.
  const memoKey=actors.length?null:start.key+'>'+end.key;
  const finish=path=>{const copy=path.map(p=>({...p}));if(copy.length&&clear(end,target)&&segment(end,target))copy.push(target);return copy;};
  if(memoKey&&routeMemo.has(memoKey)){const saved=routeMemo.get(memoKey);routeMemo.delete(memoKey);routeMemo.set(memoKey,saved);routeStats.hits++;return finish(saved);}
  routeStats.misses++;
  const remember=path=>{if(memoKey){routeMemo.set(memoKey,path);routeMemoPoints+=path.length;while(routeMemo.size>1024||routeMemoPoints>32768){const oldest=routeMemo.keys().next().value;routeMemoPoints-=routeMemo.get(oldest).length;routeMemo.delete(oldest);}}return finish(path);};
  const open=[],dist=new Map([[start.key,0]]),parent=new Map(),closed=new Set(),heur=n=>Math.hypot(n.x-end.x,n.z-end.z);
  const push=(n,f)=>{let i=open.length;open.push({n,f});while(i){const p=(i-1)>>1;if(open[p].f<=f)break;open[i]=open[p];i=p;}open[i]={n,f};};
  const pop=()=>{const first=open[0],last=open.pop();if(open.length){let i=0;while(i*2+1<open.length){let ch=i*2+1;if(ch+1<open.length&&open[ch+1].f<open[ch].f)ch++;if(open[ch].f>=last.f)break;open[i]=open[ch];i=ch;}open[i]=last;}return first.n;};
  push(start,heur(start));let found=null;
  while(open.length&&closed.size<9000){const n=pop();if(closed.has(n.key))continue;closed.add(n.key);if(n.key===end.key){found=n;break;}for(const b of neighbors(n)){if(!allowed(b)||!segment(n,b))continue;const d=dist.get(n.key)+Math.hypot(b.x-n.x,b.z-n.z);if(d<(dist.get(b.key)??Infinity)){dist.set(b.key,d);parent.set(b.key,n);push(b,d+heur(b)*1.05);}}}
  if(!found)return remember([]);const path=[];for(let n=found;n;n=parent.get(n.key))path.unshift({x:n.x,y:n.y,z:n.z});return remember(path);
 }
 // A directed drop is physical movement, not a teleport. Scan supported roof
 // approaches and validate the entire falling capsule plus the landing route.
 function dropExit(from,to){
  if(from.y-g.terrainHeight(from.x,from.z)<=.65)return null;
  const cacheKey=`${Math.round(from.x)},${Math.round(from.y*4)},${Math.round(from.z)}`;
  let options=dropConnections.get(cacheKey);
  if(!options){options=[];
   for(let direction=0;direction<16;direction++){
    const angle=direction*Math.PI/8;let px=from.x,pz=from.z,py=from.y;
    for(let n=1;n<=40;n++){
     const x=from.x+Math.sin(angle)*n*.6,z=from.z+Math.cos(angle)*n*.6;
     if(Math.abs(x)>=g.ARENA_LIMIT-1||Math.abs(z)>=g.ARENA_LIMIT-1)break;
     const support=g.worldSupportHeight(x,z,py+.45,false,radius);
     if(support-py>.65||c.worldMoveBlockedAt(x,z,py,px,pz,height,radius,py))break;
     const drop=py-support;
     if(drop>.65){
      if(drop>6)break;
      let valid=true;for(let y=py;y>support+.02;y-=.25)if(c.worldBlockedAt(x,z,y,height,radius)){valid=false;break;}
      if(valid&&!c.worldBlockedAt(x,z,support,height,radius))options.push({x,y:py,z,drop:true,landing:{x,y:support,z}});
      break;
     }
     px=x;pz=z;py=support;
    }
   }
   if(dropConnections.size>512)dropConnections.clear();dropConnections.set(cacheKey,options);
  }
  return options.slice().sort((a,b)=>Math.hypot(a.x-from.x,a.z-from.z)+Math.hypot(to.x-a.x,to.z-a.z)-Math.hypot(b.x-from.x,b.z-from.z)-Math.hypot(to.x-b.x,to.z-b.z)).find(p=>clear(p.landing,to)||route(p.landing,to).length)||null;
 }
 // Height alone cannot identify a connected floor: terrain can slope between
 // ladder base and target. Validate actual walking routes at both ladder ends.
 function walkReachable(from,to){if(clear(from,to))return true;const path=route(from,to),end=path.at(-1);return !!end&&Math.hypot(end.x-to.x,end.z-to.z)<4&&Math.abs(end.y-to.y)<.8;}
 function ladderApproach(from,to){
  let best=null;
  for(const ladder of g.LADDERS||[])for(const up of [true,false]){
   const bottom=ladderBottomExitPoint(ladder,radius),top=ladderTopExitPoint(ladder,radius),entry=up?bottom:top,exit=up?top:bottom;
   if(!walkReachable(from,entry))continue;
   const k=`${ladder.id}:${up}:${Math.round(to.x/3)},${Math.round(to.y)},${Math.round(to.z/3)}`;
   if(!ladderConnections.has(k)){if(ladderConnections.size>=2048)ladderConnections.delete(ladderConnections.keys().next().value);ladderConnections.set(k,walkReachable(exit,to));}
   if(!ladderConnections.get(k))continue;
   const score=Math.hypot(entry.x-from.x,entry.z-from.z)+Math.abs(top.y-bottom.y)+Math.hypot(exit.x-to.x,exit.z-to.z);
   if(!best||score<best.score)best={...entry,score,ladderDirX:up?-ladder.nx:ladder.nx,ladderDirZ:up?-ladder.nz:ladder.nz};
  }
  return best;
 }
 function approach(from,to){
  if((Math.abs(from.y-g.terrainHeight(from.x,from.z))<.7&&Math.abs(to.y-g.terrainHeight(to.x,to.z))<.7)||clear(from,to))return to;
  return ladderApproach(from,to)||dropExit(from,to)||to;
 }
 function reachable(from,to){return walkReachable(from,to)||!!ladderApproach(from,to)||!!dropExit(from,to);}
 return {route,clear,approach,reachable,dropExit,cacheStats:()=>({...routeStats,entries:routeMemo.size,points:routeMemoPoints})};
}
