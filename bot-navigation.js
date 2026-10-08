import {ladderBottomExitPoint,ladderTopExitPoint} from './movement-model.js';
// Ground routes use the compiled world collision and support queries used by actors.
// No separate obstacle approximation or invisible navigation walls.
export function createBotNavigator(world){
 const g=world.geometry,c=world.worldCollision,step=1.5,radius=g.PLAYER_RADIUS||.34,height=g.PLAYER_HEIGHT||1.8,nodes=new Map(),edges=new Map(),ladderConnections=new Map();
 const key=(x,z)=>x+','+z;
 function node(ix,iz){const k=key(ix,iz);if(nodes.has(k))return nodes.get(k);const x=ix*step,z=iz*step,ground=g.terrainHeight(x,z),y=g.worldSupportHeight(x,z,ground+.5,false,radius);const n=Math.abs(x)<g.ARENA_LIMIT-1&&Math.abs(z)<g.ARENA_LIMIT-1&&y-ground<.65&&!c.worldBlockedAt(x,z,y,height,radius)?{x,y,z,ix,iz,key:k}:null;nodes.set(k,n);return n;}
 function clear(a,b){const d=Math.hypot(b.x-a.x,b.z-a.z),count=Math.max(1,Math.ceil(d/.6));let px=a.x,py=a.y,pz=a.z;for(let i=1;i<=count;i++){const x=a.x+(b.x-a.x)*i/count,z=a.z+(b.z-a.z)*i/count,y=g.worldSupportHeight(x,z,py+.5,false,radius);if(Math.abs(y-py)>.65||c.worldMoveBlockedAt(x,z,y,px,pz,height,radius,py))return false;px=x;py=y;pz=z;}return Math.abs(py-b.y)<.8;}
 function neighbors(n){if(edges.has(n.key))return edges.get(n.key);const out=[];for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++){if(!x&&!z)continue;const b=node(n.ix+x,n.iz+z);if(b&&clear(n,b))out.push(b);}edges.set(n.key,out);return out;}
 function closest(p){const ix=Math.round(p.x/step),iz=Math.round(p.z/step),candidates=[];for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){const n=node(ix+x,iz+z);if(n&&clear(p,n))candidates.push(n);}return candidates.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];}
 function route(from,to){const target={x:to.x,z:to.z,y:g.worldSupportHeight(to.x,to.z,g.terrainHeight(to.x,to.z)+.5,false,radius)},start=closest(from),end=closest(target);if(!start||!end)return [];
  const open=[],dist=new Map([[start.key,0]]),parent=new Map(),closed=new Set(),heur=n=>Math.hypot(n.x-end.x,n.z-end.z);
  const push=(n,f)=>{let i=open.length;open.push({n,f});while(i){const p=(i-1)>>1;if(open[p].f<=f)break;open[i]=open[p];i=p;}open[i]={n,f};};
  const pop=()=>{const first=open[0],last=open.pop();if(open.length){let i=0;while(i*2+1<open.length){let ch=i*2+1;if(ch+1<open.length&&open[ch+1].f<open[ch].f)ch++;if(open[ch].f>=last.f)break;open[i]=open[ch];i=ch;}open[i]=last;}return first.n;};
  push(start,heur(start));let found=null;
  while(open.length&&closed.size<9000){const n=pop();if(closed.has(n.key))continue;closed.add(n.key);if(n.key===end.key){found=n;break;}for(const b of neighbors(n)){const d=dist.get(n.key)+Math.hypot(b.x-n.x,b.z-n.z);if(d<(dist.get(b.key)??Infinity)){dist.set(b.key,d);parent.set(b.key,n);push(b,d+heur(b)*1.05);}}}
  if(!found)return [];const path=[];for(let n=found;n;n=parent.get(n.key))path.unshift({x:n.x,y:n.y,z:n.z});if(clear(end,target))path.push(target);return path;
 }
 // Resolve vertical pursuit through authored ladders, using their real entry/exit points.
 function approach(from,to){
  if(Math.abs((to.y||0)-(from.y||0))<1.3||(Math.abs(from.y-g.terrainHeight(from.x,from.z))<.7&&Math.abs(to.y-g.terrainHeight(to.x,to.z))<.7)||clear(from,to))return to;
  let best=null;
  for(const ladder of g.LADDERS||[]){const up=to.y>from.y,bottom=ladderBottomExitPoint(ladder,radius),top=ladderTopExitPoint(ladder,radius),entry=up?bottom:top,exit=up?top:bottom;
   if(Math.abs(entry.y-from.y)>1.2||Math.abs(exit.y-to.y)>1.3)continue;
   if(!clear(exit,to)){if(up)continue;const k=`${ladder.id}:${Math.round(to.x/3)},${Math.round(to.z/3)}`;if(!ladderConnections.has(k))ladderConnections.set(k,route(exit,to).length>0);if(!ladderConnections.get(k))continue;}if(!up&&!clear(from,entry))continue;
   const score=Math.hypot(entry.x-from.x,entry.z-from.z)+Math.hypot(exit.x-to.x,exit.z-to.z);
   if(!best||score<best.score)best={...entry,score,ladderDirX:up?-ladder.nx:ladder.nx,ladderDirZ:up?-ladder.nz:ladder.nz};
  }
  return best||to;
 }
 function reachable(from,to){
  if(clear(from,to))return true;const path=route(from,to),end=path.at(-1);if(end&&Math.hypot(end.x-to.x,end.z-to.z)<4&&Math.abs(end.y-to.y)<.8)return true;
  for(const ladder of g.LADDERS||[]){const up=to.y>from.y,entry=up?ladderBottomExitPoint(ladder,radius):ladderTopExitPoint(ladder,radius),exit=up?ladderTopExitPoint(ladder,radius):ladderBottomExitPoint(ladder,radius);if(Math.abs(exit.y-to.y)<1.3&&clear(exit,to)&&(clear(from,entry)||route(from,entry).length))return true;}return false;
 }
 return {route,clear,approach,reachable};
}
