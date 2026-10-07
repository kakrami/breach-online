import {INFECTION as R,INFECTION_ARMS as A,INFECTION_CLASSES,INFECTION_SHOP as SHOP,infectionClass,infectionPrice,infectionCash,infectionOutcome,infectionPurchaseAvailability} from './infection-rules.js';
import {freshInfectionInventory} from './infection-inventory.js';
import {damageSource} from './combat-feedback.js';
import {roleMovement} from './actor-rules.js';
import {BOT_DIFFICULTIES,aimBotAtTarget,approachAngle} from './bot-ai.js';
const idOf=a=>a.clientId||a.id,distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),ZERO={x:0,y:0,z:0};
const send=(socket,message)=>{if(socket)socket.send(JSON.stringify(message));};
export class InfectionDirector {
 constructor(room){this.room=room;this.effects=[];this.lastEffectsAt=0;this.routeCache=new Map();this.world=null;}
 get match(){return this.room.metaCache.match;}
 entries(){return this.room.infectionActors();}
 save(e,event='infectionState'){Object.assign(e.actor,{infectionBombsAllowed:!!this.match.infectionBombs,infectedCount:this.entries().filter(v=>v.actor.infected&&idOf(v.actor)!==idOf(e.actor)).length+Number(!!e.actor.infected)});this.room.publishInfectionActor(e,event);}
 notice(title,detail=''){this.room.broadcast({t:'infectionNotice',title,detail});}
 clearEffects(){this.effects=[];this.syncEffects();}
 resetActor(a,now){
  const cls=INFECTION_CLASSES[a.infectionNextClass]?a.infectionNextClass:'classic',weapon=a.infectionPreferredWeapon||'ump';
  Object.assign(a,freshInfectionInventory(false,false,cls,weapon),{infectionRound:1,infectionMatchStartedAt:this.match.startedAt,infectionPending:true,hp:0,wastedUntil:now,spawnAttemptAt:0,spawnProtectedUntil:0,roundSpent:0,infectionResumeHp:0,cash:R.startCash,regenAt:0,infectionStats:{conversions:0,assists:0,damage:0,supplies:0},infectionTotals:{conversions:0,assists:0,damage:0,supplies:0},survivalMs:0,survivalTotalMs:0,contributions:{},damageRewards:{},killRewards:{},packDamage:0,antidoteUsed:false,roundStartRole:'survivor',pendingTeam:'',pendingLoadout:null,killstreakAvailable:[],killstreakEarned:[],traversal:null,ladder:null});this.room.refillInfectionAmmo(a);
 }
 begin(meta,now,{publish=true}={}){
  const m=meta.match;if(m.infectionPhase||m.status!=='active')return false;
  Object.assign(m,{startedAt:now,infectionRound:1,infectionPhase:'buy',infectionPhaseEndsAt:now+R.buyMs,infectionWinner:'',endsAt:0,updatedAt:now});
  this.room.bullets.clear();this.room.throwables.clear();this.room.smokeClouds.clear();this.effects=[];if(publish)this.syncEffects();
  let entries=this.entries();if(entries.length<2){this.room.makeInfectionBot(now);entries=this.entries();}
  this.reserveSite=this.findOutbreakReserve(entries.length);
  for(const e of entries){this.resetActor(e.actor,now);if(e.socket)e.socket.serializeAttachment(e.actor);}
  for(const e of entries){this.spawn(e,now,publish);if(!e.socket)this.botBuy(e,now,publish);}
  if(this.entries().some(e=>e.actor.infectionPending)){this.room.returnMatchToLobby(meta,now);this.room.broadcast({t:'infectionStartBlocked',message:'This map has insufficient safe space for the roster.'});return false;}
  this.room.matchDirty=true;if(publish){this.room.broadcastMatch(meta,now);this.notice('PREPARE','Choose a weapon and find cover · outbreak in 20 seconds');}return true;
 }
 outbreak(meta,now){
  const entries=this.entries(),m=meta.match;if(entries.length<2){this.room.makeInfectionBot(now);return this.outbreak(meta,now);}
  const history=meta.infectionSeedHistory||{},candidates=entries.map(e=>({e,rank:Math.random()})).sort((a,b)=>(history[idOf(a.e.actor)]||0)-(history[idOf(b.e.actor)]||0)||Number(!!b.e.actor.infectionBackfill)-Number(!!a.e.actor.infectionBackfill)||a.rank-b.rank);
  const count=Math.max(1,Math.min(entries.length-1,Math.ceil((entries.length-1)/R.motherRatio)||1));
  Object.assign(m,{infectionPhase:'active',infectionPhaseEndsAt:now+(m.timeLimitMs||R.roundMs),updatedAt:now});
  for(const {e}of candidates.slice(0,count)){history[idOf(e.actor)]=(history[idOf(e.actor)]||0)+1;this.convert(e,now,true);this.spawn(e,now);}
  meta.infectionSeedHistory=history;this.room.matchDirty=true;this.room.broadcastMatch(meta,now);this.notice('OUTBREAK','Survivors hold out · infected close the distance');
 }
 findOutbreakReserve(count){
  const sites=this.sites();for(const reserve of sites){const chosen=[];for(const p of sites){if(distance(reserve,p)<R.minSpawnDistance+5||chosen.some(c=>distance(c,p)<2.8)||this.room.world.serverCollision.actorHasLineOfSight(p,reserve)||this.room.world.serverCollision.actorHasLineOfSight(reserve,p))continue;chosen.push(p);if(chosen.length>=count)return reserve;}}return null;
 }
 preparationSite(x,y,z){const r=this.reserveSite;if(this.match.infectionPhase!=='buy'||!r)return true;const p={x,y,z};return distance(p,r)>=R.minSpawnDistance+5&&!this.room.world.serverCollision.actorHasLineOfSight(p,r)&&!this.room.world.serverCollision.actorHasLineOfSight(r,p);}
 legalRoute(x,y,z){
  const room=this.room,g=room.world.geometry,c=room.world.worldCollision;
  if(this.world!==room.world){this.world=room.world;this.routeCache.clear();}
  const key=`${x},${y},${z}`;if(this.routeCache.has(key))return this.routeCache.get(key);
  const height=g.PLAYER_HEIGHT||1.8,radius=g.PLAYER_RADIUS||.34,limit=g.ARENA_LIMIT||140;
  let valid=Number.isFinite(y)&&Math.abs(x)<limit-1&&Math.abs(z)<limit-1&&Math.abs(g.worldSupportHeight(x,z,y,false,radius)-y)<.16&&!c.worldBlockedAt(x,z,y,height,radius),exits=[];
  if(valid)for(let direction=0;direction<8;direction++){
   let px=x,py=y,pz=z,clear=true;const angle=direction*Math.PI/4;
   for(let step=1;step<=10;step++){const nx=x+Math.sin(angle)*step*.6,nz=z+Math.cos(angle)*step*.6,ny=g.worldSupportHeight(nx,nz,py+.45,false,radius);
    if(Math.abs(nx)>=limit-1||Math.abs(nz)>=limit-1||ny-py>.5||py-ny>.75||c.worldMoveBlockedAt(nx,nz,ny,px,pz,height,radius,py)){clear=false;break;}px=nx;py=ny;pz=nz;
   }if(clear)exits.push(direction);
  }
  valid=valid&&exits.some(a=>exits.some(b=>Math.min(Math.abs(a-b),8-Math.abs(a-b))>=2));this.routeCache.set(key,valid);return valid;
 }
 sites(){
  const {world}=this.room,g=world.geometry;if(this.siteWorld===world&&this.siteCache)return this.siteCache;
  const seen=new Set(),base=[...Object.values(world.spawns.TEAM_SPAWN_POINTS||{}).flat(),...(world.spawns.FFA_SPAWN_POINTS||[]),...(g.COMBAT_FLOW_NODES||[]).map(n=>[n.x,n.z,0])],sites=[];
  // Expand only around authored spawn/navigation anchors. Every neighboring
  // position still needs support, headroom and two clear walking exits.
  for(const p of base)for(const dx of [0,-4,4])for(const dz of [0,-4,4]){const x=p[0]+dx,z=p[1]+dz,y=g.terrainHeight(x,z)+(dx===0&&dz===0?(p[2]||0):0),key=`${x},${y},${z}`;if(seen.has(key))continue;seen.add(key);if(this.legalRoute(x,y,z))sites.push({x,y,z});}
  this.siteWorld=world;this.siteCache=sites;return sites;
 }
 spot(actor,now){
  const room=this.room,g=room.world.geometry,live=this.entries().map(e=>e.actor).filter(a=>a.hp>0),enemies=live.filter(a=>a.team!==actor.team),seedAllies=this.match.infectionPhase==='buy'&&actor.infected?live.filter(a=>a.infected):[];
  const result=room.world.spawns.chooseSafeSpawn({mode:'infection',team:actor.team,actors:this.entries().map(e=>e.actor),excludeId:idOf(actor),index:Math.max(0,Math.floor(actor.deaths||0)),now,strict:true,includeAllPoints:true,maxSafeCandidates:5,candidateOrder:p=>enemies.length?Math.abs(Math.min(...enemies.map(a=>Math.hypot(a.x-p[0],a.z-p[1])))-42):seedAllies.length?Math.abs(Math.min(...seedAllies.map(a=>Math.hypot(a.x-p[0],a.z-p[1])))-5):0,
   extraPoints:this.sites().map(n=>[n.x,n.z,n.y-g.terrainHeight(n.x,n.z)]),
   policyOverride:{minEnemyDistance:R.minSpawnDistance,minProjectedEnemyDistance:R.minSpawnDistance,lineOfSightDistance:R.spawnSightDistance,idealEnemyDistance:42,enemyDistanceWeight:0,minActorSeparation:2.5,allowTeamFlip:true},
   terrainHeight:g.terrainHeight,blockedAt:(x,z,y)=>room.world.worldCollision.worldBlockedAt(x,z,y,g.PLAYER_HEIGHT,g.PLAYER_RADIUS),validAt:(x,y,z)=>this.legalRoute(x,y,z)&&this.preparationSite(x,y,z),
   // Solid cover, not temporary smoke, must hide a spawn.
   lineOfSight:(a,b)=>room.world.serverCollision.actorHasLineOfSight(a,b)||room.world.serverCollision.actorHasLineOfSight(b,a),recentDeaths:room.recentDeaths,recentSpawns:room.recentSpawns,recentGunfire:room.recentGunfire,recentExplosions:room.recentExplosions,projectiles:[...room.bullets.values()],throwables:[...room.throwables.values(),...this.effects]});
  return result?{x:result.x,y:result.y,z:result.z,yaw:result.yaw,cluster:result.cluster,spawnProtectedUntil:now+R.spawnProtectionMs}:null;
 }
 spawn(e,now,publish=true){
  const p=e.socket?e.socket.deserializeAttachment():e.actor;e.actor=p;
  if(!p.infectionPending||now<(p.wastedUntil||0)||now<(p.spawnAttemptAt||0))return false;
  const pos=this.spot(p,now);p.spawnAttemptAt=now+R.spawnRetryMs;if(!pos){if(publish)this.save(e);else if(e.socket)e.socket.serializeAttachment(p);return false;}
  const resuming=p.infectionResumeHp>0;
  if(p.infected&&!resuming){p.infectionClass=p.infectionNextClass||p.infectionClass||'classic';p.maxHp=infectionClass(p.infectionClass).hp*(p.infectionMother?2:1);}
  Object.assign(p,this.room.freezeHumanState(p,now),pos,{hp:resuming?Math.min(p.maxHp,p.infectionResumeHp):p.maxHp||100,infectionResumeHp:0,wastedUntil:0,infectionPending:false,infectionReadyAt:now+R.spawnProtectionMs,nextClawAt:now+R.spawnProtectionMs,frozenUntil:0,burningUntil:0,burnOwnerId:'',burnNextTickAt:0,madnessUntil:0,navX:pos.x,navZ:pos.z,navUntil:0,targetId:'',targetLockUntil:0,lastSeenTargetId:'',lastSeenAt:0,reactionReadyAt:0,aimYaw:pos.yaw,aimPitch:0,aimNoiseUntil:0,burstShotsLeft:0,burstPauseUntil:0,patrolUntil:0,lastKnownX:pos.x,lastKnownZ:pos.z,routePath:[],routeCheckAt:0,infectionHold:null,infectionHoldUntil:0});
  if(!resuming&&!p.infected)this.room.refillInfectionAmmo(p);
  this.room.noteSpawn(pos,p.team,idOf(p),now);this.room.recordCombatPose(p,now);if(publish)this.save(e,'respawn');else if(e.socket)e.socket.serializeAttachment(p);return true;
 }
 convert(e,now,first=false){
  const p=e.actor;if(p.infected)return false;
  const cls=p.infectionNextClass||'classic',cash=p.cash,stats=p.infectionStats,preferred=p.infectionPreferredWeapon||p.primaryWeapon||'ump';
  Object.assign(p,freshInfectionInventory(true,first,cls),{cash:infectionCash(cash),infectionStats:stats,infectionPreferredWeapon:preferred,survivalMs:Math.max(0,now-(this.match.infectionPhaseEndsAt-this.match.timeLimitMs)),infectionPending:first,hp:first?0:infectionClass(cls).hp,wastedUntil:0,spawnAttemptAt:0,infectionReadyAt:now+R.conversionGraceMs,nextClawAt:now+R.conversionGraceMs,spawnProtectedUntil:now+R.conversionGraceMs,traversal:null,ladder:null,ads:false,knockVelocityX:0,knockVelocityZ:0,contributions:{}});
  if(first)p.maxHp=infectionClass(cls).hp*2;
  for(const [id,b]of this.room.bullets)if(b.ownerId===idOf(p))this.room.bullets.delete(id);
  for(const [id,g]of this.room.throwables)if(g.ownerId===idOf(p))this.room.throwables.delete(id);
  this.save(e,'infectionRole');return true;
 }
 step(meta,now){
  const m=meta.match;if(!m.infectionPhase){this.begin(meta,now);return;}if(m.status!=='active'||m.infectionPhase==='roundEnd')return;
  let entries=this.entries();if(!entries.length)return;
  if(m.infectionPhase==='active'&&!entries.some(e=>e.actor.infected)){const bot=this.room.makeInfectionBot(now);this.resetActor(bot,now);this.convert({actor:bot,socket:null},now,true);this.notice('INFECTED REINFORCEMENT','An infected bot replaces the disconnected player.');entries=this.entries();}
  for(const e of entries){const p=e.actor;let changed=false;for(const key of ['frozenUntil','burningUntil','madnessUntil'])if(p[key]&&now>=p[key]){p[key]=0;changed=true;}if(changed)this.save(e);if(p.infectionPending)this.spawn(e,now);}
  if(m.infectionPhase==='buy'){if(now>=m.infectionPhaseEndsAt)this.outbreak(meta,now);return;}
  const winner=infectionOutcome(this.entries().map(e=>e.actor),now,m.infectionPhaseEndsAt);if(winner){this.end(meta,winner,now);return;}
  this.stepBurns(now);this.stepEffects(now);
  const after=infectionOutcome(this.entries().map(e=>e.actor),now,m.infectionPhaseEndsAt);if(after)this.end(meta,after,now);
 }
 end(meta,winner,now){
  const m=meta.match;if(m.infectionPhase!=='active')return;
  Object.assign(m,{infectionPhase:'roundEnd',infectionWinner:winner,infectionPhaseEndsAt:now,updatedAt:now});m[winner==='blue'?'blueScore':'redScore']++;
  this.room.bullets.clear();this.room.throwables.clear();this.clearEffects();
  for(const e of this.entries()){const p=e.actor;if(!p.infected)p.survivalMs=m.timeLimitMs;p.infectionTotals={...p.infectionStats};p.survivalTotalMs=p.survivalMs||0;this.save(e);}
  this.room.matchDirty=true;this.room.finishMatch(meta,winner,winner==='blue'?'time':'infected',now);
 }
 purchase(e,item,now,publish=true){
  const p=e.actor,m=this.match;if(m.status!=='active'||now>=m.infectionPhaseEndsAt)return {accepted:false,reason:'phase_locked'};
  Object.assign(p,{infectionBombsAllowed:!!m.infectionBombs,infectedCount:this.entries().filter(v=>v.actor.infected).length});
  const result=infectionPurchaseAvailability(p,item,m.infectionPhase);if(!result.accepted)return result;
  const s=SHOP[item],price=infectionPrice(s,m.infectionPhase);p.cash=infectionCash(p.cash,-price);p.roundSpent=(p.roundSpent||0)+price;
  if(s.classId){p.infectionNextClass=s.classId;if(!p.infected)p.infectionClass=s.classId;}
  if(s.weapon){p.primaryOwned=true;p.primaryWeapon=p.weapon=p.infectionPreferredWeapon=s.weapon;p.primaryAttachments={};p.reloadAt=0;p.reloadWeapon='';p.weaponReadyAt=0;p.combatAction='ready';p.combatActionKind='';p.combatReadyAt=0;this.room.refillInfectionAmmo(p,s.weapon);}
  p.infectionGear||={};p.infectionGrenades||={};
  if(item==='heal')p.medkits=(p.medkits||0)+1;if(item==='armor')p.armor=100;
  if(['fire','frost','flare','bomb'].includes(item))p.infectionGrenades[item]=(p.infectionGrenades[item]||0)+1;
  if(['madness','nightvision'].includes(item))p.infectionGear[item]=true;
  if(item==='antidote'){const cash=p.cash,stats=p.infectionStats,cls=p.infectionNextClass,preferred=p.infectionPreferredWeapon||'ump';Object.assign(p,freshInfectionInventory(false,false,cls,preferred),{cash,infectionStats:stats,hp:100,antidoteUsed:true,spawnProtectedUntil:now+R.conversionGraceMs,infectionReadyAt:now+R.conversionGraceMs,infectionPending:false});this.room.refillInfectionAmmo(p);this.save(e,'infectionRole');}
  if(publish)this.save(e);else if(e.socket)e.socket.serializeAttachment(p);this.room.matchDirty=true;return result;
 }
 botBuy(e,now,publish=true){const p=e.actor;if(this.match.infectionPhase!=='buy')return;const n=String(idOf(p)).split('').reduce((s,c)=>s+c.charCodeAt(0),0);p.infectionNextClass=Object.keys(INFECTION_CLASSES)[n%6];this.purchase(e,['smg','assault','shotgun','machine','sniper','auto'][n%6],now,publish);if(n%3===0)this.purchase(e,'armor',now,publish);else this.purchase(e,n%3===1?'frost':'heal',now,publish);}
 reward(e,n){if(!e)return;e.actor.cash=infectionCash(e.actor.cash,n);this.save(e);}
 damage(e,attackerId,amount,weapon,knockback,now,bulletId='',hitMeta={}){
  const p=e.actor,aEntry=this.entries().find(v=>idOf(v.actor)===attackerId),a=aEntry?.actor,m=this.match;
  if(m.status!=='active'||m.infectionPhase!=='active'||now>=m.infectionPhaseEndsAt||p.hp<=0||p.godMode||now<(p.spawnProtectedUntil||0)||now<(p.madnessUntil||0))return false;
  const sourceTeam=hitMeta.sourceTeam||a?.team,infectedSource=hitMeta.infectionSource??!!a?.infected;
  if(a&&sourceTeam&&a.team!==sourceTeam)return false;
  if(sourceTeam&&attackerId!==idOf(p)&&sourceTeam===p.team)return false;
  if(infectedSource&&weapon!=='claw')return false;
  const hostile=!!a&&sourceTeam!==p.team&&attackerId!==idOf(p),source=damageSource(p,a,knockback,hitMeta);
  if(weapon==='claw'&&infectedSource&&hostile&&!p.infected){
   if(distance(p,a)>R.reach||Math.abs(p.y-a.y)>1.5||!this.room.world.serverCollision.actorHasLineOfSight(a,p))return false;
   if(p.armor>0){p.armor=Math.max(0,p.armor-50);this.save(e);this.room.broadcast({t:'hit',attacker:attackerId,target:idOf(p),hp:p.hp,armor:p.armor,damage:0,weapon,source,blockedDamage:50,wasted:false,knockback:ZERO});return true;}
   return this.infectHit(e,aEntry,now,weapon);
  }
  let damage=Math.max(0,Number(amount)||0);if(!damage)return false;
  const armor=Math.min(p.armor||0,damage*.5);p.armor=Math.max(0,(p.armor||0)-armor);damage-=armor;const dealt=Math.min(p.hp,damage);p.hp=Math.max(0,p.hp-damage);
  let force=knockback||ZERO;
  if(p.infected&&hostile&&a){const d=distance(p,a)||1,power=Math.min(8,2+dealt*.045)*infectionClass(p.infectionClass).knockback*(p.infectionMother?.45:1);force={x:(p.x-a.x)/d*power,z:(p.z-a.z)/d*power,y:0};}
  p.knockVelocityX=Math.max(-12,Math.min(12,(p.knockVelocityX||0)+force.x));p.knockVelocityZ=Math.max(-12,Math.min(12,(p.knockVelocityZ||0)+force.z));
  if(hostile&&dealt>0){p.contributions||={};const prior=p.contributions[attackerId]||{damage:0};p.contributions[attackerId]={damage:prior.damage+dealt,at:now};a.infectionStats||={conversions:0,assists:0,damage:0,supplies:0};a.infectionStats.damage+=dealt;
   a.damageRewards||={};const prev=a.damageRewards[idOf(p)],paid=prev&&now-prev.at<30000?prev.paid:0,credit=Math.min(dealt,Math.max(0,1250-paid));a.damageRewards[idOf(p)]={paid:paid+credit,at:paid?prev.at:now};a.packDamage=(a.packDamage||0)+credit;const packs=Math.floor(a.packDamage/R.damagePerPack);a.packDamage%=R.damagePerPack;a.cash=infectionCash(a.cash,packs);this.save(aEntry);
  }
  const dead=p.hp<=0;if(dead){this.room.noteDeath(p,now);p.deaths=(p.deaths||0)+1;
   if(hostile){a.kills=(a.kills||0)+1;a.killRewards||={};if(now-(a.killRewards[idOf(p)]||0)>=30000){a.killRewards[idOf(p)]=now;a.cash=infectionCash(a.cash,2);}this.save(aEntry);}
   for(const [id,v]of Object.entries(p.contributions||{})){if(id===attackerId||now-v.at>12000||v.damage<75)continue;const assist=this.entries().find(v=>idOf(v.actor)===id);if(assist&&assist.actor.team!==p.team){assist.actor.infectionStats.assists++;this.reward(assist,1);}}
   Object.assign(p,{infectionPending:true,wastedUntil:now+R.respawnMs,spawnAttemptAt:0,spawnProtectedUntil:0,traversal:null,ladder:null,contributions:{},madnessUntil:0,frozenUntil:0,burningUntil:0});
  }
  this.save(e);this.room.broadcast({t:'hit',attacker:attackerId,target:idOf(p),hp:p.hp,armor:p.armor,damage:dealt,weapon,bulletId,headshot:!!hitMeta.headshot,distance:hitMeta.distance||0,source,blockedDamage:armor,blast:!!hitMeta.blast,wasted:dead,respawnAt:p.wastedUntil||0,knockback:force});
  if(dead)this.room.broadcast(this.room.killEvent(attackerId,idOf(p),weapon,now,{headshot:!!hitMeta.headshot,distance:hitMeta.distance||0}));this.room.matchDirty=true;return true;
 }
 infectHit(victim,attacker,now,weapon='claw'){
  const p=victim.actor,a=attacker.actor;if(p.infected||p.hp<=0||!a.infected)return false;
  if(!this.convert(victim,now))return false;a.infectionStats||={conversions:0,assists:0,damage:0,supplies:0};a.infectionStats.conversions++;a.kills=(a.kills||0)+1;a.cash=infectionCash(a.cash,3);a.hp=Math.min(a.maxHp,a.hp+(infectionClass(a.infectionClass).heal||0));this.save(attacker);this.room.broadcast({t:'infectionConverted',id:idOf(p),attacker:idOf(a),weapon});this.room.matchDirty=true;return true;
 }
 canAttack(p,now){return this.match.status==='active'&&this.match.infectionPhase==='active'&&now<this.match.infectionPhaseEndsAt&&p.hp>0&&now>=(p.infectionReadyAt||0)&&!p.infectionPending&&!p.traversal&&!p.ladder&&now>=(p.frozenUntil||0);}
 claw(e,now){const p=e.actor;if(!p.infected||!this.canAttack(p,now)||now<(p.nextClawAt||0))return false;p.spawnProtectedUntil=0;p.nextClawAt=now+R.clawMs;p.attackAt=now;this.save(e);this.room.broadcast({t:'infectionAttack',id:idOf(p),attackAt:now});
  for(const v of this.entries().filter(e=>!e.actor.infected&&e.actor.hp>0).sort((a,b)=>distance(a.actor,p)-distance(b.actor,p))){const t=v.actor,d=distance(t,p);if(d>R.reach||Math.abs(t.y-p.y)>1.5||(-Math.sin(p.yaw)*(t.x-p.x)-Math.cos(p.yaw)*(t.z-p.z))/Math.max(.01,d)<.35||!this.room.world.serverCollision.actorHasLineOfSight(p,t))continue;const hit=this.damage(v,idOf(p),R.clawDamage,'claw',ZERO,now,'',{distance:d,sourceTeam:p.team,infectionSource:true});send(e.socket,{t:'infectionClawResult',accepted:true,hit,converted:t.infected});return hit;}
  send(e.socket,{t:'infectionClawResult',accepted:true,hit:false});return false;
 }
 action(e,action,now){const p=e.actor;if(!this.canAttack(p,now))return false;
  if(action==='fire'&&p.infected)return this.claw(e,now);
  if(action==='madness'&&p.infected&&p.infectionGear?.madness&&now>=(p.madnessReadyAt||0)){p.infectionGear.madness=false;p.madnessUntil=now+A.madnessMs;p.madnessReadyAt=now+A.madnessCooldownMs;this.save(e);this.room.broadcast({t:'infectionScreech',id:idOf(p),x:p.x,y:p.y,z:p.z});return true;}
  if(['napalm','frost','flare','bomb'].includes(action)){const kind=action==='napalm'?'fire':action;if(p.infected?kind!=='bomb'||!this.match.infectionBombs:kind==='bomb')return false;if(!(p.infectionGrenades?.[kind]>0)||now<(p.grenadeReadyAt||0))return false;p.infectionGrenades[kind]--;p.grenadeReadyAt=now+1000;p.spawnProtectedUntil=0;const yaw=e.socket?p.yaw:p.aimYaw??p.yaw,pitch=e.socket?p.pitch||0:p.aimPitch||0,cp=Math.cos(pitch);this.effects.push({id:`grenade-${now}-${idOf(p)}`,kind:'projectile',type:kind,ownerId:idOf(p),sourceTeam:p.team,x:p.x,y:p.y+1.25,z:p.z,vx:-Math.sin(yaw)*cp*15,vy:Math.sin(pitch)*15+4,vz:-Math.cos(yaw)*cp*15,bornAt:now,expiresAt:now+A.grenadeFuseMs});this.save(e);this.syncEffects();return true;}
  return false;
 }
 stepBurns(now){
  for(const e of this.entries()){const p=e.actor;if(!p.infected||p.hp<=0||!(p.burningUntil>now)||!(p.burnNextTickAt>0)||now<p.burnNextTickAt)continue;
   const ticks=Math.min(12,1+Math.floor((now-p.burnNextTickAt)/500));p.burnNextTickAt+=ticks*500;
   this.damage(e,p.burnOwnerId,ticks*A.fireDps*.5,'napalm',ZERO,now,'',{sourceTeam:p.burnSourceTeam,blast:false});
  }
 }
 syncEffects(){this.room.broadcast({t:'infectionEffects',effects:this.effects});}
 stepEffects(now){const dt=Math.min(.15,Math.max(0,(now-(this.lastEffectsAt||now))/1000));this.lastEffectsAt=now;let changed=false;
  for(const f of this.effects){if(f.kind==='projectile'){
   const nx=f.x+f.vx*dt,ny=f.y+f.vy*dt,nz=f.z+f.vz*dt,t=this.room.world.serverCollision.segmentFirstWorldHitT(f.x,f.y,f.z,nx,ny,nz,.15);f.vy-=12*dt;
   if(t!=null||now>=f.expiresAt){const amount=t==null?1:Math.max(0,t-.025);f.x+=(nx-f.x)*amount;f.y+=(ny-f.y)*amount;f.z+=(nz-f.z)*amount;Object.assign(f,{kind:f.type,radius:f.type==='flare'?8:A.bombRadius,vx:0,vy:0,vz:0,expiresAt:now+(f.type==='flare'?20000:500),tickAt:now});changed=true;}else{f.x=nx;f.y=ny;f.z=nz;}
  }
  if(f.kind!=='projectile'&&f.kind!=='flare'&&now>=f.tickAt&&now<f.expiresAt){f.tickAt=now+500;const owner=this.entries().find(e=>idOf(e.actor)===f.ownerId);if(!owner||owner.actor.team!==f.sourceTeam)continue;
   for(const e of this.entries()){const p=e.actor;if(p.hp<=0||p.team===f.sourceTeam||distance(p,f)>f.radius||Math.abs(p.y-f.y)>3||!this.room.world.serverCollision.blastHasLineOfSight(f.x,f.y+.3,f.z,p.x,p.y+1,p.z)||now<(p.spawnProtectedUntil||0)||now<(p.madnessUntil||0))continue;
    if(f.kind==='fire'&&p.infected){p.burningUntil=now+A.fireSeconds*1000;p.burnOwnerId=f.ownerId;p.burnSourceTeam=f.sourceTeam;p.burnNextTickAt=now+500;this.damage(e,f.ownerId,A.fireDps*.5,'napalm',ZERO,now,'',{sourceTeam:f.sourceTeam,blast:true});}
    if(f.kind==='frost'&&p.infected){p.frozenUntil=now+A.frostMs;this.save(e);}
    if(f.kind==='bomb'&&!p.infected&&this.match.infectionBombs&&this.entries().filter(e=>!e.actor.infected).length>1)this.infectHit(e,owner,now,'infectionBomb');
   }
  }}
  const count=this.effects.length;this.effects=this.effects.filter(f=>now<f.expiresAt);if(count!==this.effects.length)changed=true;if(changed||this.effects.length&&now-(this.lastEffectsBroadcast||0)>100){this.lastEffectsBroadcast=now;this.syncEffects();}
 }
 botHold(bot,now){
  if(!bot.infectionHold||now>(bot.infectionHoldUntil||0)){const sites=this.sites(),allies=this.entries().filter(e=>!e.actor.infected&&idOf(e.actor)!==idOf(bot)&&e.actor.hp>0).map(e=>e.actor);let best=null;
   for(const p of sites){const d=distance(bot,p);if(d>55)continue;const near=allies.length?Math.min(...allies.map(a=>distance(a,p))):12;let cover=0;for(let i=0;i<8;i++){const x=p.x+Math.sin(i*Math.PI/4)*6,z=p.z+Math.cos(i*Math.PI/4)*6;if(this.room.world.serverCollision.segmentFirstWorldHitT(p.x,p.y+1,p.z,x,p.y+1,z,.1)!=null)cover++;}const score=cover*5-Math.abs(near-7)*.5-d*.06;if(cover>0&&(!best||score>best.score))best={...p,score};}
   bot.infectionHold=best||{x:bot.x,z:bot.z};bot.infectionHoldUntil=now+15000;
  }return bot.infectionHold;
 }
 botAct(bot,target,now,moveToward,settings,profile=BOT_DIFFICULTIES.normal,dt=1/30){
  const e={actor:bot,socket:null},d=distance(bot,target);bot.ads=false;bot.navUntil=0;aimBotAtTarget(bot,target,now,dt,profile,1.2,target.crouched?.72:1.05);bot.yaw=approachAngle(bot.yaw,bot.aimYaw??bot.yaw,profile.aimTurnDegPerSec*Math.PI/180*dt);
  if(bot.hp<bot.maxHp*.45&&d<16){if(!bot.infectionGear?.madness)this.purchase(e,'madness',now);this.action(e,'madness',now);}
  const movement=roleMovement(settings.movement,'infection',bot);moveToward(target.x,target.z,movement.runSpeed*Math.min(1,profile.moveRun),1.4,target.y);if(now>=(bot.reactionReadyAt||0))this.claw(e,now);
 }
}
