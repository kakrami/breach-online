import {INFECTION as R,infectionAbilityActive,infectionBuildSite} from './infection-rules.js';
import {compileInfectionWorld,infectionRoofApproaches} from './infection-world.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),idOf=p=>p.clientId||p.id;
export class InfectionField{
 constructor(director){this.d=director;this.room=director.room;this.state={sockets:[],barricades:[],supplies:[],ladders:[],pings:[]};}
 reset(now){
  this.clear(false);this.base=this.room.world;const g=this.base.geometry,c=this.base.worldCollision;
  this.state={sockets:[],barricades:[],supplies:[],ladders:infectionRoofApproaches(g,c),pings:[]};this.sequence=0;this.finalMinute=false;this.lastSurvivor='';
  // Every defense socket is on supported ground with four clear approaches.
  const candidates=this.d.sites().map(p=>{let cover=0;for(let a=0;a<8;a++){const angle=a*Math.PI/4;if(this.base.serverCollision.segmentFirstWorldHitT(p.x,p.y+1,p.z,p.x+Math.sin(angle)*8,p.y+1,p.z+Math.cos(angle)*8,.1)!=null)cover++;}return {...p,cover};}).filter(p=>p.cover>0&&p.cover<6).sort((a,b)=>b.cover-a.cover);
  for(const p of candidates){if(this.state.sockets.some(q=>distance(p,q)<18))continue;let accepted=null;
   for(const rot of [0,90]){const a=rot*Math.PI/180,dx=Math.cos(a),dz=Math.sin(a);let clear=true;
    for(const [u,v]of [[-2.8,0],[2.8,0],[0,-3],[0,3],[-1.5,-.3],[1.5,.3]]){const x=p.x+dx*u-dz*v,z=p.z+dz*u+dx*v,y=g.worldSupportHeight(x,z,p.y);if(Math.abs(y-p.y)>.25||c.worldBlockedAt(x,z,y,g.PLAYER_HEIGHT,g.PLAYER_RADIUS)){clear=false;break;}}
    if(clear){accepted={id:'defense-'+this.state.sockets.length,x:p.x,y:p.y,z:p.z,rot};break;}}
   if(accepted)this.state.sockets.push(accepted);if(this.state.sockets.length>=8)break;
  }
  this.rebuild();this.sync();
 }
 clear(publish=true){if(this.base&&this.room.world.id===this.base.id)this.room.world=this.base;this.base=null;this.state={sockets:[],barricades:[],supplies:[],ladders:[],pings:[]};if(publish)this.sync();}
 snapshot(team){return {t:'infectionWorld',...this.state,pings:this.state.pings.filter(p=>p.team===team)};}
 sync(){this.room.matchDirty=true;for(const socket of this.room.ctx.getWebSockets()){const p=socket.deserializeAttachment();socket.send(JSON.stringify(this.snapshot(p?.team)));}}
 rebuild(){if(!this.base)return;const compiled=compileInfectionWorld(this.base.geometry,this.state);this.compiled=compiled;this.room.world={...this.base,...compiled};this.d.routeCache.clear();}
 build(e,now){const p=e.actor;if(p.infected||p.hp<=0||!p.infectionGear?.barricade||this.d.match.infectionPhase!=='active'||this.d.match.status!=='active')return false;
  const site=infectionBuildSite(p,this.state,this.d.entries().map(e=>e.actor));if(!site)return false;
  const n={...site,id:'barricade-'+(++this.sequence),socket:site.id,owner:idOf(p),hp:R.barricadeHp,maxHp:R.barricadeHp};this.state.barricades.push(n);p.infectionGear.barricade=false;this.d.save(e);this.rebuild();this.sync();return true;
 }
 strike(p,now,charge=false){const yaw=charge?p.abilityYaw:p.yaw,forward={x:-Math.sin(yaw),z:-Math.cos(yaw)},barrier=this.state.barricades.filter(b=>b.hp>0&&distance(p,b)<(charge?3:2.9)&&Math.abs(p.y-b.y)<1.5&&(forward.x*(b.x-p.x)+forward.z*(b.z-p.z))/(distance(p,b)||1)>.1).sort((a,b)=>distance(p,a)-distance(p,b))[0];if(!barrier||this.base.serverCollision.segmentFirstWorldHitT(p.x,p.y+1,p.z,barrier.x,barrier.y+.8,barrier.z,.04)!=null)return false;
  if(charge&&p.lastChargeBreak===barrier.id)return false;if(charge)p.lastChargeBreak=barrier.id;
  barrier.hp=Math.max(0,barrier.hp-(charge?R.barricadeHp:105));if(!barrier.hp)this.rebuild();this.sync();this.room.broadcast({t:'infectionBreak',x:barrier.x,y:barrier.y,z:barrier.z,destroyed:!barrier.hp});return true;
 }
 ping(e,now,report=null){const p=e.actor;if(p.hp<=0||p.infectionPending||now<(p.nextPingAt||0)||this.d.match.status!=='active')return false;p.nextPingAt=now+3000;
  const dx=-Math.sin(p.yaw),dz=-Math.cos(p.yaw),facing=q=>(dx*(q.x-p.x)+dz*(q.z-p.z))/(distance(p,q)||1),enemies=this.d.entries().map(e=>e.actor).filter(q=>q.team!==p.team&&q.hp>0&&distance(p,q)<55&&facing(q)>.985&&this.room.world.serverCollision.actorHasLineOfSight(p,q));let target=report&&report.team!==p.team&&report.hp>0&&distance(p,report)<85&&this.room.actorLineOfSight(p,report,now)?report:enemies.sort((a,b)=>distance(p,a)-distance(p,b))[0],kind='danger';
  if(!target){target=this.state.supplies.find(q=>distance(p,q)<45&&facing(q)>.95);kind='supply';}
  if(!target){kind='regroup';const t=this.room.world.serverCollision.segmentFirstWorldHitT(p.x,p.y+1,p.z,p.x+dx*18,p.y+1,p.z+dz*18,.1),d=t==null?18:Math.max(2,t*18-1);target={x:p.x+dx*d,z:p.z+dz*d};target.y=this.room.world.geometry.worldSupportHeight(target.x,target.z,p.y);}
  this.state.pings=this.state.pings.filter(q=>q.owner!==idOf(p)&&now<q.expiresAt);this.state.pings.push({id:'ping-'+(++this.sequence),owner:idOf(p),team:p.team,kind,targetId:idOf(target)||'',createdAt:now,x:target.x,y:target.y,z:target.z,expiresAt:now+8000});this.d.save(e);this.sync();return true;
 }
 step(now){
  const m=this.d.match;if(m.status!=='active')return;let changed=false;
  for(const e of this.d.entries()){const p=e.actor;if(p.infected&&p.hp>0&&p.infectionClass==='brute'&&infectionAbilityActive(p,now))this.strike(p,now,true);}
  const old=this.state.pings.length;this.state.pings=this.state.pings.filter(p=>now<p.expiresAt);changed=old!==this.state.pings.length;
  if(m.infectionPhase==='active'){
   const survivors=this.d.entries().filter(e=>!e.actor.infected&&e.actor.hp>0);
   if(m.infectionPhaseEndsAt-now<=60000&&!this.finalMinute){this.finalMinute=true;this.d.notice('FINAL MINUTE','Hold together. Every second counts.');}
   if(survivors.length===1&&this.lastSurvivor!==idOf(survivors[0].actor)){this.lastSurvivor=idOf(survivors[0].actor);this.d.notice('LAST SURVIVOR',survivors[0].actor.name||'Hold out');}

  }
  const count=this.state.supplies.length;this.state.supplies=this.state.supplies.filter(s=>s.charges>0&&now<s.expiresAt);changed||=count!==this.state.supplies.length;if(changed)this.sync();
 }
}
