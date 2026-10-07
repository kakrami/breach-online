import {INFECTION as R,INFECTION_ARMS as A,INFECTION_SHOP as SHOP,infectionCash,infectionOutcome,infectionPurchaseAvailability} from './infection-rules.js';
import {freshInfectionInventory} from './infection-inventory.js';
import {damageSource} from './combat-feedback.js';
import {roleMovement} from './actor-rules.js';
import {BOT_DIFFICULTIES,aimBotAtTarget,approachAngle,botAimToleranceRadians,botBurstSize,botBurstPause} from './bot-ai.js';
const idOf=a=>a.clientId||a.id;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const ZERO={x:0,y:0,z:0};
const send=(socket,message)=>{if(socket)socket.send(JSON.stringify(message));};

// Infection owns its lifecycle. Combat still uses the room's authoritative
// projectile, collision, pose and network services.
export class InfectionDirector {
 constructor(room){this.room=room;this.effects=[];this.lastEffectsAt=0;this.nextSupplyAt=0;this.routeCache=new Map();this.world=null;}
 get match(){return this.room.metaCache.match;}
 entries(){return this.room.infectionActors();}
 save(e,event='infectionState'){this.room.publishInfectionActor(e,event);}
 notice(title,detail=''){this.room.broadcast({t:'infectionNotice',title,detail});}
 clearEffects(){this.effects=[];this.room.broadcast({t:'infectionEffects',effects:[]});}
 resetActor(a,now,infected=false,first=false){
  if(this.match.infectionRound===1){a.infectionTotals={conversions:0,assists:0,damage:0,supplies:0};a.survivalTotalMs=0;}
  Object.assign(a,freshInfectionInventory(infected,first),{infectionRound:this.match.infectionRound,infectionMatchStartedAt:this.match.startedAt,infectionPending:true,hp:0,wastedUntil:now,spawnAttemptAt:0,spawnProtectedUntil:0,roundSpent:0,infectionResumeHp:0,cash:R.startCash,regenAt:0,shielding:false,infectionStats:{conversions:0,assists:0,damage:0,supplies:0},survivalMs:0,contributions:{},damageRewards:{},killRewards:{},supplyClaims:[],roundStartRole:infected?'infected':'survivor',pendingTeam:'',pendingLoadout:null,killstreakAvailable:[],killstreakEarned:[],traversal:null,ladder:null});
 }
 begin(meta,now,{publish=true}={}){
  const m=meta.match;if(m.infectionPhase||m.status!=='active')return false;m.startedAt=m.startedAt||now;m.infectionRound=1;this.finalMinute=false;Object.assign(m,{infectionPhase:'buy',infectionPhaseEndsAt:now+R.buyMs,infectionWinner:'',endsAt:0,updatedAt:now});
  this.room.bullets.clear();this.room.throwables.clear();this.room.smokeClouds.clear();this.effects=[];this.room.infectionPickups=[];if(publish){this.syncEffects();this.room.broadcast({t:'infectionPickups',pickups:[]});}this.nextSupplyAt=now+R.buyMs+10000;
  let entries=this.entries();if(entries.length<2){this.room.makeInfectionBot(now);entries=this.entries();if(publish)this.notice('PRACTICE OPPONENT ADDED','An infected bot keeps solo matches playable.');}
  const priorHistory=meta.infectionSeedHistory||{},history={...priorHistory},seedCount=Math.max(1,Math.min(entries.length-1,Math.floor(entries.length/10)||1));
  const seeds=new Set([...entries].sort((a,b)=>(history[idOf(a.actor)]||0)-(history[idOf(b.actor)]||0)||(Number(!!b.actor.infectionBackfill)-Number(!!a.actor.infectionBackfill))||String(idOf(a.actor)).localeCompare(String(idOf(b.actor)))).slice(0,seedCount).map(e=>idOf(e.actor)));
  for(const e of entries){const first=seeds.has(idOf(e.actor));if(first)history[idOf(e.actor)]=(history[idOf(e.actor)]||0)+1;this.resetActor(e.actor,now,first,first);if(e.socket)e.socket.serializeAttachment(e.actor);}
  meta.infectionSeedHistory=history;
  // Reserve infected positions first, then deploy every survivor outside
  // their distance and sight constraints. Preparation freezes both sides.
  for(const e of entries.sort((a,b)=>Number(b.actor.infected)-Number(a.actor.infected))){this.spawn(e,now,publish);if(!e.socket)this.botBuy(e,now,publish);}
  if(this.entries().some(e=>e.actor.infectionPending)){
    meta.infectionSeedHistory=priorHistory;this.room.returnMatchToLobby(meta,now);
    this.room.broadcast({t:'infectionStartBlocked',message:'Not enough covered spawn space for this roster. Reduce bots or choose another map.'});return;
  }
  this.room.matchDirty=true;if(publish){this.room.broadcastMatch(meta,now);this.notice('PREPARE FOR INFECTION','20 seconds to prepare · one round · claws spread infection');}return true;
 }
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
 initialSeedFits(actor,x,y,z){
  if(this.match.infectionPhase!=='buy'||!actor.infected)return true;
  const entries=this.entries().map(e=>e.actor);if(entries.some(a=>!a.infected&&a.hp>0))return true;
  const needed=entries.filter(a=>!a.infected).length,infected=[...entries.filter(a=>a.infected&&a.hp>0&&idOf(a)!==idOf(actor)),{x,y,z}],chosen=[];
  for(const site of this.sites()){
   if(chosen.some(p=>distance(p,site)<2.5)||infected.some(p=>distance(p,site)<R.minSpawnDistance||(this.room.world.serverCollision.actorHasLineOfSight(site,p)||this.room.world.serverCollision.actorHasLineOfSight(p,site))))continue;
   chosen.push(site);if(chosen.length>=needed)return true;
  }return false;
 }
 spot(actor,now){
  const room=this.room,g=room.world.geometry,live=this.entries().map(e=>e.actor).filter(a=>a.hp>0),enemies=live.filter(a=>a.team!==actor.team),seedAllies=this.match.infectionPhase==='buy'&&actor.infected?live.filter(a=>a.infected):[];
  const result=room.world.spawns.chooseSafeSpawn({mode:'infection',team:actor.team,actors:this.entries().map(e=>e.actor),excludeId:idOf(actor),index:Math.max(0,Math.floor(actor.deaths||0)),now,strict:true,includeAllPoints:true,maxSafeCandidates:5,candidateOrder:p=>enemies.length?Math.abs(Math.min(...enemies.map(a=>Math.hypot(a.x-p[0],a.z-p[1])))-42):seedAllies.length?Math.abs(Math.min(...seedAllies.map(a=>Math.hypot(a.x-p[0],a.z-p[1])))-5):0,
   extraPoints:this.sites().map(n=>[n.x,n.z,n.y-g.terrainHeight(n.x,n.z)]),
   policyOverride:{minEnemyDistance:R.minSpawnDistance,minProjectedEnemyDistance:R.minSpawnDistance,lineOfSightDistance:R.spawnSightDistance,idealEnemyDistance:42,enemyDistanceWeight:0,minActorSeparation:2.5,allowTeamFlip:true},
   terrainHeight:g.terrainHeight,blockedAt:(x,z,y)=>room.world.worldCollision.worldBlockedAt(x,z,y,g.PLAYER_HEIGHT,g.PLAYER_RADIUS),validAt:(x,y,z)=>this.legalRoute(x,y,z)&&this.initialSeedFits(actor,x,y,z),
   // Solid cover, not temporary smoke, must hide a spawn.
   lineOfSight:(a,b)=>room.world.serverCollision.actorHasLineOfSight(a,b)||room.world.serverCollision.actorHasLineOfSight(b,a),recentDeaths:room.recentDeaths,recentSpawns:room.recentSpawns,recentGunfire:room.recentGunfire,recentExplosions:room.recentExplosions,projectiles:[...room.bullets.values()],throwables:[...room.throwables.values(),...this.effects]});
  return result?{x:result.x,y:result.y,z:result.z,yaw:result.yaw,cluster:result.cluster,spawnProtectedUntil:now+R.spawnProtectionMs}:null;
 }
 spawn(e,now,publish=true){
  const p=e.socket?e.socket.deserializeAttachment():e.actor;e.actor=p;if(!p.infectionPending||p.infectionShopping||now<(p.wastedUntil||0)||now<(p.spawnAttemptAt||0))return false;
  const spawn=this.spot(p,now);p.spawnAttemptAt=now+R.spawnRetryMs;
  if(!spawn){if(publish)this.save(e);else if(e.socket)e.socket.serializeAttachment(p);return false;}
  const resuming=p.infectionResumeHp>0;
  Object.assign(p,this.room.freezeHumanState(p,now),spawn,{hp:resuming?Math.min(p.maxHp,p.infectionResumeHp):p.maxHp||100,infectionResumeHp:0,wastedUntil:0,infectionPending:false,regenAt:now+6000,mutationAmmo:resuming?p.mutationAmmo:A.mag,mutationHeat:resuming?p.mutationHeat:0,mutationReloadAt:resuming?p.mutationReloadAt:0,mutationHotUntil:resuming?p.mutationHotUntil:0,shielding:false,shieldHp:resuming?p.shieldHp:p.infectionGear?.shield?A.shieldHp:0,nextClawAt:now+350,navX:spawn.x,navZ:spawn.z,navUntil:0,targetId:'',targetLockUntil:0,lastSeenTargetId:'',lastSeenAt:0,reactionReadyAt:0,aimYaw:spawn.yaw,aimPitch:0,aimNoiseUntil:0,burstShotsLeft:0,burstPauseUntil:0,patrolUntil:0,lastKnownX:spawn.x,lastKnownZ:spawn.z});
  this.room.noteSpawn(spawn,p.team,idOf(p),now);this.room.recordCombatPose(p,now);if(publish)this.save(e,'respawn');else if(e.socket)e.socket.serializeAttachment(p);return true;
 }
 convert(e,now,first=false){
  const p=e.actor;if(!p.infected){const stats=p.infectionStats,cash=p.cash,role=p.roundStartRole;Object.assign(p,freshInfectionInventory(true,first),{cash:infectionCash(cash),infectionStats:stats,roundStartRole:role,survivalMs:Math.max(0,now-(this.match.infectionPhaseEndsAt-this.match.timeLimitMs))});}
  Object.assign(p,{hp:0,infectionPending:true,infectionShopping:!!e.socket,wastedUntil:now+R.respawnMs,spawnAttemptAt:0,spawnProtectedUntil:0,shielding:false,moveSpeed:0,velocityX:0,velocityZ:0,traversal:null,ladder:null,ads:false,mutationReloadAt:0});
  this.save(e,'infectionRole');
 }
 step(meta,now){
  const m=meta.match;if(!m.infectionPhase){this.begin(meta,now);return;}
  if(m.infectionPhase==='roundEnd'||m.status!=='active')return;
  let entries=this.entries();if(!entries.length)return;
  if(!entries.some(e=>e.actor.infected)){const bot=this.room.makeInfectionBot(now);this.resetActor(bot,now,true,true);this.save({actor:bot,socket:null},'infectionRole');this.notice('INFECTED REINFORCEMENT','A bot replaces the disconnected infected.');entries=this.entries();}
  for(const e of entries){if(e.actor.infectionPending){if(!e.socket)this.botBuy(e,now);this.spawn(e,now);}this.cool(e,now);}
  if(m.infectionPhase==='buy'){
   // A blocked initial deployment is visible and retried. Never silently use
   // an unsafe fallback or run the round before both sides can participate.
   if(now>=m.infectionPhaseEndsAt&&this.entries().every(e=>!e.actor.infectionPending)){
    m.infectionPhase='active';m.infectionPhaseEndsAt=now+(m.timeLimitMs||R.roundMs);m.updatedAt=now;this.finalMinute=false;this.room.matchDirty=true;this.room.broadcastMatch(meta,now);this.notice('OUTBREAK','Survive the clock · infected hunt and respawn');
   }return;
  }
  const boundaryWinner=infectionOutcome(this.entries().map(e=>e.actor),now,m.infectionPhaseEndsAt);if(boundaryWinner){this.end(meta,boundaryWinner,now);return;}
  this.stepEffects(now);this.stepSupply(now);
  if(!this.finalMinute&&m.infectionPhaseEndsAt-now<=60000){this.finalMinute=true;this.notice('FINAL MINUTE','Hold out · infected respawn in 3 seconds');}
  const winner=infectionOutcome(this.entries().map(e=>e.actor),now,m.infectionPhaseEndsAt);if(winner)this.end(meta,winner,now);
 }
 end(meta,winner,now){
  const m=meta.match;if(m.infectionPhase!=='active')return;
  m.infectionPhase='roundEnd';m.infectionWinner=winner;m.infectionPhaseEndsAt=now;m[winner==='blue'?'blueScore':'redScore']++;m.updatedAt=now;
  this.room.bullets.clear();this.room.throwables.clear();this.clearEffects();this.room.infectionPickups=[];this.room.broadcast({t:'infectionPickups',pickups:[]});
  for(const e of this.entries()){const p=e.actor;if(!p.infected)p.survivalMs=m.timeLimitMs;p.infectionTotals||={conversions:0,assists:0,damage:0,supplies:0};for(const key of ['conversions','assists','damage','supplies'])p.infectionTotals[key]+=(p.infectionStats?.[key]||0);p.survivalTotalMs=(p.survivalTotalMs||0)+(p.survivalMs||0);this.save(e);}
  this.room.matchDirty=true;this.room.finishMatch(meta,winner,winner==='blue'?'time':'infected',now);
 }
 shop(e,open,now){
  const p=e.actor,m=this.match;if(m.status!=='active'||m.infectionPhase!=='active'||now>=m.infectionPhaseEndsAt||!p.infected||p.hp>0||!p.infectionPending)return false;
  p.infectionShopping=!!open;this.save(e);if(!open)this.spawn(e,now);return true;
 }
 atSupply(p,now=Date.now()){return (this.room.infectionPickups||[]).some(s=>s.expiresAt>now&&distance(p,s)<=R.supplyRadius&&Math.abs(p.y-s.y)<1.5&&this.room.world.serverCollision.actorHasLineOfSight(p,s));}
 purchase(e,item,now,publish=true){
  if(this.match.status!=='active'||now>=this.match.infectionPhaseEndsAt)return{accepted:false,reason:'phase_locked'};
  const p=e.actor,status=infectionPurchaseAvailability(p,item,this.match.infectionPhase,this.atSupply(p,now));if(!status.accepted)return status;
  const s=SHOP[item];p.cash=infectionCash(p.cash,-s.cost);p.roundSpent=(p.roundSpent||0)+s.cost;p.infectionGear||={};p.equipment||={};
  if(s.weapon){p.primaryOwned=true;p.primaryWeapon=p.weapon=s.weapon;p.primaryAttachments={};p.reloadAt=0;p.reloadWeapon='';p.weaponReadyAt=0;p.combatAction='ready';p.combatActionKind='';p.combatReadyAt=0;this.room.refillInfectionAmmo(p,s.weapon);}
  if(item==='heal')p.medkits=(p.medkits||0)+1;if(item==='armor')p.armor=Math.min(100,(p.armor||0)+50);if(item==='frag'){p.lethal='frag';p.equipment.frag=(p.equipment.frag||0)+1;}
  if(item==='toxic')p.toxicBombs=(p.toxicBombs||0)+1;if(item==='claws')p.infectionWeapon='claws';
  if(['mutation','shield','screech','carapace'].includes(item))p.infectionGear[item]=true;
  if(item==='mutation'){p.infectionWeapon='mutation';p.mutationAmmo=A.mag;}if(item==='shield')p.shieldHp=A.shieldHp;
  if(item==='carapace'){p.maxHp+=50;if(p.hp>0)p.hp+=50;}
  if(publish)this.save(e);else if(e.socket)e.socket.serializeAttachment(p);this.room.matchDirty=true;return status;
 }
 botBuy(e,now,publish=true){const p=e.actor;if(p.botBuyRound===p.infectionRound&&p.hp>0)return;
  if(p.infected){const n=String(idOf(p)).split('').reduce((s,c)=>s+c.charCodeAt(0),0);for(const item of [n%2?'shield':'mutation','toxic','carapace'])this.purchase(e,item,now,publish);}
  else for(const item of ['smg','armor'])this.purchase(e,item,now,publish);p.botBuyRound=p.infectionRound;if(e.socket)e.socket.serializeAttachment(p);
 }
 reward(e,amount){if(!e)return;e.actor.cash=infectionCash(e.actor.cash,amount);this.save(e);}
 damage(e,attackerId,amount,weapon,knockback,now,bulletId='',hitMeta={}){
  const p=e.actor,attacker=this.entries().find(v=>idOf(v.actor)===attackerId),a=attacker?.actor;
  if(this.match.status!=='active'||this.match.infectionPhase!=='active'||now>=this.match.infectionPhaseEndsAt||p.hp<=0||p.godMode||now<(p.spawnProtectedUntil||0))return false;
  const sourceTeam=hitMeta.sourceTeam||a?.team,infectedSource=hitMeta.infectionSource??!!a?.infected;
  if(sourceTeam&&attackerId!==idOf(p)&&sourceTeam===p.team)return false;
  if(infectedSource&&weapon==='machineGun')weapon='mutation';
  let damage=Math.max(0,Number(amount)||0);if(!damage)return false;
  const hostile=!!sourceTeam&&attackerId!==idOf(p)&&sourceTeam!==p.team,source=damageSource(p,a,knockback,hitMeta);let blockedDamage=0;
  if(p.shielding&&p.shieldHp>0&&hostile&&!hitMeta.blast&&!['toxic','frag','sticky'].includes(weapon)){
   const dx=(source?.x??p.x)-p.x,dz=(source?.z??p.z)-p.z,d=Math.hypot(dx,dz)||1;if((-Math.sin(p.yaw)*dx-Math.cos(p.yaw)*dz)/d>.55){const absorbed=Math.min(p.shieldHp,damage);p.shieldHp-=absorbed;damage-=absorbed;blockedDamage=absorbed;if(p.shieldHp<=0){p.shielding=false;this.room.broadcast({t:'infectionShieldBreak',id:idOf(p)});}}
  }
  const armor=Math.min(p.armor||0,damage*.5);p.armor=Math.max(0,(p.armor||0)-armor);damage-=armor;if(!p.infected&&infectedSource&&weapon!=='claw')damage=Math.min(damage,Math.max(0,p.hp-1));const dealt=Math.min(p.hp,damage);p.hp=Math.max(0,p.hp-damage);if(dealt>0||armor>0)p.regenAt=now+6000;
  if(dealt>0||armor>0){p.knockVelocityX=Math.max(-12,Math.min(12,(p.knockVelocityX||0)+(knockback?.x||0)));p.knockVelocityZ=Math.max(-12,Math.min(12,(p.knockVelocityZ||0)+(knockback?.z||0)));if(knockback?.y>0){p.verticalVelocity=Math.max(p.verticalVelocity||0,knockback.y);p.serverGrounded=false;p.lastVerticalAt=now;}}
  if(hostile&&a&&dealt>0){p.contributions||={};const prior=p.contributions[attackerId]||{damage:0,at:now};p.contributions[attackerId]={damage:prior.damage+dealt,at:now};a.infectionStats||={conversions:0,assists:0,damage:0,supplies:0};a.infectionStats.damage+=dealt;
   a.damageRewards||={};const key=idOf(p),window=a.damageRewards[key],paid=window&&now-window.at<30000?window.paid:0,credit=Math.min(dealt,Math.max(0,150-paid));a.damageRewards[key]={paid:paid+credit,at:paid?window.at:now};a.cash=infectionCash(a.cash,Math.floor(credit));if(attacker.socket){attacker.socket.serializeAttachment(a);send(attacker.socket,{t:'infectionEconomy',id:idOf(a),cash:a.cash});}
  }
  const dead=p.hp<=0,converted=dead&&!p.infected&&hostile&&infectedSource&&weapon==='claw';
  if(dead){this.room.noteDeath(p,now);p.deaths=(p.deaths||0)+1;
   if(hostile&&a){a.kills=(a.kills||0)+1;if(converted)a.infectionStats.conversions++;a.killRewards||={};const lastReward=a.killRewards[idOf(p)]||0;if(now-lastReward>=30000){a.cash=infectionCash(a.cash,converted?300:200);a.killRewards[idOf(p)]=now;}this.save(attacker);}
   for(const [id,value]of Object.entries(hostile?p.contributions||{}:{})){if(id===attackerId||now-value.at>12000||value.damage<20)continue;const assist=this.entries().find(v=>idOf(v.actor)===id);if(assist&&assist.actor.team!==p.team){assist.actor.killRewards||={};if(now-(assist.actor.killRewards[idOf(p)]||0)>=30000){assist.actor.killRewards[idOf(p)]=now;assist.actor.infectionStats.assists++;this.reward(assist,150);}}}
   if(converted)this.convert(e,now);else Object.assign(p,{infectionPending:true,infectionShopping:false,wastedUntil:now+(p.infected&&this.finalMinute?3000:R.respawnMs),spawnAttemptAt:0,shielding:false,spawnProtectedUntil:0,traversal:null,ladder:null,mutationReloadAt:0});p.contributions={};
  }
  this.save(e);this.room.broadcast({t:'hit',attacker:attackerId,target:idOf(p),hp:p.hp,armor:p.armor,damage:dealt,weapon,bulletId,headshot:!!hitMeta.headshot,distance:hitMeta.distance||0,source,blockedDamage,blast:!!hitMeta.blast,directImpact:!!hitMeta.directImpact,wasted:dead,respawnAt:p.wastedUntil||0,knockback:knockback||ZERO});
  if(dead){this.room.broadcast(this.room.killEvent(attackerId,idOf(p),weapon,now,{headshot:!!hitMeta.headshot,distance:hitMeta.distance||0}));if(converted)this.room.broadcast({t:'infectionConverted',id:idOf(p),attacker:attackerId,weapon});}
  this.room.matchDirty=true;return true;
 }
 canAttack(p,now){return this.match.status==='active'&&this.match.infectionPhase==='active'&&now<this.match.infectionPhaseEndsAt&&p.infected&&p.hp>0&&now>=(p.infectionReadyAt||0)&&!p.infectionPending&&!p.traversal&&!p.ladder&&now>=(p.wastedUntil||0);}
 claw(e,now){const p=e.actor;if(!this.canAttack(p,now)||now<(p.nextClawAt||0)||p.shielding)return false;
  p.spawnProtectedUntil=0;p.nextClawAt=now+R.clawMs;p.attackAt=now;if(e.socket)e.socket.serializeAttachment(p);this.room.broadcast({t:'infectionAttack',id:idOf(p),attackAt:now});
  for(const victim of this.entries().filter(v=>!v.actor.infected&&v.actor.hp>0).sort((a,b)=>distance(a.actor,p)-distance(b.actor,p))){const t=victim.actor,d=distance(t,p);if(d>R.reach||Math.abs(t.y-p.y)>1.5||(-Math.sin(p.yaw)*(t.x-p.x)-Math.cos(p.yaw)*(t.z-p.z))/Math.max(.01,d)<.25||!this.room.world.serverCollision.actorHasLineOfSight(p,t))continue;
   const hit=this.damage(victim,idOf(p),R.clawDamage,'claw',ZERO,now,'',{distance:d,source:{x:p.x,y:p.y+1,z:p.z},sourceTeam:p.team,infectionSource:true});send(e.socket,{t:'infectionClawResult',accepted:true,hit,converted:t.infected});return hit;
  }send(e.socket,{t:'infectionClawResult',accepted:true,hit:false});return false;
 }
 cool(e,now){const p=e.socket?e.socket.deserializeAttachment():e.actor;e.actor=p;if(!p.infected)return;
  const dt=Math.min(2,Math.max(0,(now-(p.mutationHeatAt||now))/1000));p.mutationHeat=Math.max(0,(p.mutationHeat||0)-dt*A.coolPerSecond);p.mutationHeatAt=now;
  if(p.mutationReloadAt&&now>=p.mutationReloadAt){p.mutationReloadAt=0;p.mutationAmmo=A.mag;this.save(e);}else if(e.socket)e.socket.serializeAttachment(p);
 }
 action(e,action,now){const p=e.actor;if(action==='shieldOff'){if(p.shielding)p.infectionReadyAt=now+350;p.shielding=false;this.save(e);return true;}if(!this.canAttack(p,now))return false;
  if(action==='swap'&&p.infectionGear?.mutation){p.infectionWeapon=p.infectionWeapon==='mutation'?'claws':'mutation';p.shielding=false;p.infectionReadyAt=now+350;this.save(e);return true;}
  if(action==='shield'&&p.infectionGear?.shield&&p.shieldHp>0){p.shielding=!p.shielding;p.infectionReadyAt=now+350;this.save(e);return true;}
  if(action==='reload'&&p.infectionGear?.mutation&&p.mutationAmmo<A.mag&&!p.mutationReloadAt){p.mutationReloadAt=now+A.reloadMs;this.save(e);return true;}
  if(action==='fire'){
   if(p.infectionWeapon!=='mutation')return this.claw(e,now);
   if(p.shielding||!p.infectionGear?.mutation||p.mutationAmmo<=0||p.mutationReloadAt||now<(p.mutationShotAt||0)||now<(p.mutationHotUntil||0))return false;
   p.spawnProtectedUntil=0;p.mutationAmmo--;p.mutationShotAt=now+A.shotMs;p.mutationHeat=Math.min(1,(p.mutationHeat||0)+A.heatPerShot);p.mutationHeatAt=now;if(p.mutationHeat>=.99)p.mutationHotUntil=now+A.overheatMs;
   const yaw=(e.socket?p.yaw:p.aimYaw??p.yaw)+(Math.random()-.5)*.026,pitch=(e.socket?p.pitch||0:p.aimPitch||0)+(Math.random()-.5)*.02,cp=Math.cos(pitch);
   this.room.spawnBullet({ownerId:idOf(p),ownerTeam:'red',infectionSource:true,damage:A.damage,weapon:'machineGun',x:p.x,y:p.y+1.2,z:p.z,vx:-Math.sin(yaw)*cp*A.velocity,vy:Math.sin(pitch)*A.velocity,vz:-Math.cos(yaw)*cp*A.velocity,now,consumeAmmo:false});this.save(e);return true;
  }
  if(action==='bomb'&&p.toxicBombs>0&&now>=(p.bombReadyAt||0)&&!p.shielding){p.toxicBombs--;p.infectionReadyAt=now+500;p.bombReadyAt=now+A.bombCooldownMs;p.spawnProtectedUntil=0;const yaw=e.socket?p.yaw:p.aimYaw??p.yaw,pitch=e.socket?p.pitch||0:p.aimPitch||0,cp=Math.cos(pitch);this.effects.push({id:`toxic-${now}-${idOf(p)}`,kind:'bomb',ownerId:idOf(p),x:p.x,y:p.y+1.25,z:p.z,vx:-Math.sin(yaw)*cp*15,vy:Math.sin(pitch)*15+4,vz:-Math.cos(yaw)*cp*15,bornAt:now,expiresAt:now+1800});this.save(e);this.syncEffects();return true;}
  if(action==='screech'&&p.infectionGear?.screech&&now>=(p.screechReadyAt||0)){p.screechReadyAt=now+18000;p.infectionReadyAt=now+500;p.spawnProtectedUntil=0;const targets=this.entries().filter(v=>!v.actor.infected&&v.actor.hp>0&&distance(v.actor,p)<28).map(v=>({id:idOf(v.actor),x:v.actor.x,y:v.actor.y,z:v.actor.z}));for(const ally of this.entries().filter(v=>v.actor.infected))send(ally.socket,{t:'infectionReveal',targets,expiresAt:now+2500});this.room.broadcast({t:'infectionScreech',id:idOf(p),x:p.x,y:p.y,z:p.z});this.save(e);return true;}
  return false;
 }
 syncEffects(){this.room.broadcast({t:'infectionEffects',effects:this.effects});}
 stepEffects(now){const dt=Math.min(.15,Math.max(0,(now-(this.lastEffectsAt||now))/1000));this.lastEffectsAt=now;let changed=false;
  for(const f of this.effects){if(f.kind==='bomb'){
    const nx=f.x+f.vx*dt,ny=f.y+f.vy*dt,nz=f.z+f.vz*dt,t=this.room.world.serverCollision.segmentFirstWorldHitT(f.x,f.y,f.z,nx,ny,nz,.15);f.vy-=12*dt;
    if(t!=null||now>=f.expiresAt){const amount=t==null?1:Math.max(0,t-.025);f.x+=(nx-f.x)*amount;f.y+=(ny-f.y)*amount;f.z+=(nz-f.z)*amount;Object.assign(f,{kind:'cloud',radius:A.bombRadius,vx:0,vy:0,vz:0,expiresAt:now+A.bombSeconds*1000,tickAt:now+500});changed=true;}else{f.x=nx;f.y=ny;f.z=nz;}
   }else if(now>=f.tickAt&&now<f.expiresAt){f.tickAt=now+500;for(const e of this.entries()){const p=e.actor;if(!p.infected&&p.hp>0&&distance(p,f)<f.radius&&Math.abs(p.y-f.y)<3&&this.room.world.serverCollision.blastHasLineOfSight(f.x,f.y+.2,f.z,p.x,p.y+1,p.z))this.damage(e,f.ownerId,A.bombDps*.5,'toxic',ZERO,now,'',{source:{x:f.x,y:f.y,z:f.z},distance:distance(p,f),sourceTeam:'red',infectionSource:true,blast:true});}}
  }
  const count=this.effects.length;this.effects=this.effects.filter(f=>now<f.expiresAt);if(count!==this.effects.length)changed=true;if(changed||this.effects.length&&now-(this.lastEffectsBroadcast||0)>100){this.lastEffectsBroadcast=now;this.syncEffects();}
 }
 stepSupply(now){
  if(now>=this.nextSupplyAt){const legal=this.sites();if(legal.length){const index=(this.supplyIndex||0)%legal.length,n=legal[index];this.supplyIndex=index+Math.max(1,Math.floor(legal.length/3));const s={id:`supply-${now}`,kind:'supply',x:n.x,y:n.y,z:n.z,expiresAt:now+R.supplyMs};this.room.infectionPickups=[s];this.room.broadcast({t:'infectionPickups',pickups:[s]});this.notice('SUPPLY POINT ACTIVE','Survivors: collect $250 and ammo · shop nearby');}this.nextSupplyAt=now+R.supplyMs;}
  for(const e of this.entries()){const p=e.actor,s=this.room.infectionPickups?.[0];if(p.infected||p.hp<=0||!s||!this.atSupply(p,now)||(p.supplyClaims||[]).includes(s.id))continue;p.supplyClaims=[s.id];p.infectionStats.supplies++;this.room.refillInfectionAmmo(p);this.reward(e,250);}
 }
 botAct(bot,target,now,moveToward,settings,profile=BOT_DIFFICULTIES.normal,dt=1/30){
  if(!this.room.actorLineOfSight(bot,target,now))return;
  const e={actor:bot,socket:null},d=distance(bot,target);
  bot.ads=false;bot.navUntil=0;
  const error=aimBotAtTarget(bot,target,now,dt,profile,1.2,target.crouched?.72:1.05);
  bot.yaw=approachAngle(bot.yaw,bot.aimYaw??bot.yaw,profile.aimTurnDegPerSec*Math.PI/180*dt);
  const reacted=now>=(bot.reactionReadyAt||0),aligned=reacted&&error<=botAimToleranceRadians(profile);
  const wantsGun=!!(bot.infectionGear?.mutation&&d>5&&d<38&&target.hp>35),wantsShield=!!(bot.infectionGear?.shield&&bot.shieldHp>0&&d>3&&d<30&&!wantsGun);
  if(bot.shielding&&!wantsShield)this.action(e,'shieldOff',now);
  if(reacted&&bot.infectionWeapon!==(wantsGun?'mutation':'claws'))this.action(e,'swap',now);
  if(reacted&&wantsShield&&!bot.shielding)this.action(e,'shield',now);
  if(aligned&&d>5&&d<22&&bot.toxicBombs)this.action(e,'bomb',now);
  if(reacted&&bot.infectionGear?.screech)this.action(e,'screech',now);
  const movement=roleMovement(settings.movement,'infection',bot,R.speed);
  if(wantsGun){
   if(!bot.mutationAmmo)this.action(e,'reload',now);
   if(aligned&&now>=(bot.burstPauseUntil||0)){
    if(!(bot.burstShotsLeft>0))bot.burstShotsLeft=botBurstSize(profile,d,'machineGun');
    if(this.action(e,'fire',now)&&--bot.burstShotsLeft<=0)bot.burstPauseUntil=now+botBurstPause(profile);
   }
   moveToward(target.x,target.z,movement.walkSpeed*Math.min(1,profile.moveWalk),14);
  }else{
   moveToward(target.x,target.z,movement.runSpeed*Math.min(1,profile.moveRun),1.5);
   if(reacted&&bot.infectionWeapon==='claws')this.claw(e,now);
  }
 }
}
