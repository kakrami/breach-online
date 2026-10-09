import {ladderTopExitPoint} from './movement-model.js';
import {InfectionField} from './infection-field.js';
import {INFECTION as R,INFECTION_ARMS as A,INFECTION_CLASSES,INFECTION_SHOP as SHOP,infectionClass,infectionClassId,infectionAbilityActive,infectionInitialCount,infectionFirstHealth,infectionPrice,infectionCash,infectionOutcome,infectionPurchaseAvailability} from './infection-rules.js';
import {freshInfectionInventory} from './infection-inventory.js';
import {damageSource} from './combat-feedback.js';
import {normalizeWeaponAttachments,SECONDARY_WEAPONS} from './game-config.js';
import {roleMovement} from './actor-rules.js';
import {BOT_DIFFICULTIES,aimBotAtTarget,approachAngle} from './bot-ai.js';
const idOf=a=>a.clientId||a.id,distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),ZERO={x:0,y:0,z:0};
const send=(socket,message)=>{if(socket)socket.send(JSON.stringify(message));};
export class InfectionDirector {
 constructor(room){this.room=room;this.effects=[];this.lastEffectsAt=0;this.routeCache=new Map();this.world=null;this.field=new InfectionField(this);}
 snapshot(){return structuredClone({startedAt:this.match.startedAt,round:this.match.infectionRound,field:this.field.state,effects:this.effects,reserveSite:this.reserveSite,waitRetryAt:this.waitRetryAt||0,finalMinute:!!this.field.finalMinute,lastSurvivor:this.field.lastSurvivor||'',fieldSequence:this.field.sequence||0});}
 restore(snapshot,now){if(!snapshot||snapshot.startedAt!==this.match.startedAt||snapshot.round!==this.match.infectionRound)return false;this.field.clear(false);if(['buy','active','waiting'].includes(this.match.infectionPhase)){this.field.base=this.room.world;this.field.state={sockets:[],barricades:[],supplies:[],ladders:[],pings:[],...snapshot.field,supplies:[]};this.field.state.pings=this.field.state.pings.filter(p=>p.expiresAt>now);this.field.sequence=snapshot.fieldSequence||0;this.field.finalMinute=!!snapshot.finalMinute;this.field.lastSurvivor=snapshot.lastSurvivor||'';this.field.rebuild();}this.effects=(snapshot.effects||[]).filter(f=>f.expiresAt>now&&(f.kind==='frost'||f.kind==='projectile'&&f.type==='frost'));this.reserveSite=snapshot.reserveSite||null;this.waitRetryAt=snapshot.waitRetryAt||0;this.lastEffectsAt=now;return true;}
 recordActivity(e,now){const p=e.actor;p.infectionLastIntentAt=now;p.infectionAfkWarned=false;}
 get match(){return this.room.metaCache.match;}
 entries(){return this.room.infectionActors();}
 compactActor(p,now=Date.now()){for(const [key,ttl]of [['contributions',12000],['damageRewards',30000],['killRewards',30000],['infectionPressure',10000]]){const entries=Object.entries(p[key]||{}).filter(([id,v])=>id.length<=80&&Number.isFinite(typeof v==='number'?v:v?.at)&&now-(typeof v==='number'?v:v.at)<=ttl).sort((a,b)=>(typeof b[1]==='number'?b[1]:b[1].at)-(typeof a[1]==='number'?a[1]:a[1].at)).slice(0,8);p[key]=Object.fromEntries(entries);}for(const key of ['infectionStats','infectionTotals']){const raw=p[key]||{};p[key]=Object.fromEntries(['conversions','assists','damage','supplies'].map(k=>[k,Math.min(1000000000,Math.max(0,Number.isFinite(raw[k])?raw[k]:0))]));}return p;}
 save(e,event='infectionState'){this.compactActor(e.actor);this.room.publishInfectionActor(e,event);}
 notice(title,detail=''){this.room.broadcast({t:'infectionNotice',title,detail});}
 clearEffects(){this.effects=[];this.syncEffects();}
 resetActor(a,now,newMatch=false){
  const remembered=a.infected?(a.infectionHumanLoadout||{}):a,cls=infectionClassId(a.infectionNextClass),weapon=remembered.primaryWeapon||a.infectionPreferredWeapon||'ump',secondary=SECONDARY_WEAPONS.includes(remembered.secondaryWeapon)?remembered.secondaryWeapon:'pistol',primaryAttachments=normalizeWeaponAttachments(weapon,remembered.primaryAttachments),secondaryAttachments=normalizeWeaponAttachments(secondary,remembered.secondaryAttachments),cash=newMatch?R.startCash:infectionCash(a.cash),totals=newMatch?{}:a.infectionTotals||{},survivalTotalMs=newMatch?0:a.survivalTotalMs||0;
  Object.assign(a,freshInfectionInventory(false,false,cls,weapon),{secondaryWeapon:secondary,primaryAttachments,secondaryAttachments,infectionHumanLoadout:{primaryWeapon:weapon,secondaryWeapon:secondary,primaryAttachments,secondaryAttachments},infectionPreferredWeapon:weapon,infectionRound:this.match.infectionRound,infectionMatchStartedAt:this.match.startedAt,infectionPending:true,hp:0,wastedUntil:now,spawnAttemptAt:0,spawnProtectedUntil:0,roundSpent:0,infectionResumeHp:0,cash,regenAt:0,infectionStats:{conversions:0,assists:0,damage:0,supplies:0},infectionTotals:totals,survivalMs:0,survivalTotalMs,contributions:{},damageRewards:{},killRewards:{},packDamage:0,roundStartRole:'survivor',pendingTeam:'',pendingLoadout:null,godMode:false,killstreakKills:0,killstreakControl:null,killstreakAvailable:[],killstreakEarned:[],traversal:null,ladder:null,infectionPurchaseSequence:0,infectionTransactions:{},infectionRoundReward:!newMatch&&a.infectionRound===this.match.infectionRound?(a.infectionRoundReward||0):0,infectionActiveMs:0,infectionDistance:0,infectionActivityAt:now,infectionLastActivityPose:null,infectionLastIntentAt:now,infectionAfkWarned:false,infectionAfk:false});this.room.refillInfectionAmmo(a);
 }
 clearRound(){this.room.combatHistory?.clear();this.room.bullets.clear();this.room.throwables.clear();this.room.smokeClouds.clear();if(this.room.killstreakEffects)this.room.killstreakEffects.length=0;this.effects=[];this.lastEffectsAt=0;this.room.recentDeaths=[];this.room.recentSpawns=[];this.room.recentGunfire=[];this.room.recentExplosions=[];}
 begin(meta,now,{publish=true}={}){
  const m=meta.match;if(m.infectionPhase||m.status!=='active')return false;
  Object.assign(m,{startedAt:now,infectionRound:1,infectionPhase:'waiting',infectionPhaseEndsAt:0,infectionWinner:'',endsAt:0,updatedAt:now,timeLimitMs:R.roundMs,infectionRoundResult:null});
  this.prepareRound(meta,now,true,publish);return true;
 }
 prepareRound(meta,now,newMatch=false,publish=true){
  const m=meta.match,entries=this.entries();this.clearRound();this.field.clear(false);
  Object.assign(m,{infectionPhase:entries.length<2?'waiting':'buy',infectionPhaseEndsAt:entries.length<2?0:now+R.buyMs,infectionWinner:'',infectionWaitReason:entries.length<2?'players':'',updatedAt:now});
  this.field.reset(now);this.reserveSite=this.findOutbreakReserve(entries.length);
  for(const e of entries){this.resetActor(e.actor,now,newMatch);if(e.socket)e.socket.serializeAttachment(e.actor);}
  for(const e of entries){this.spawn(e,now,publish);if(!e.socket)this.botBuy(e,now,publish);}
  const staged=this.entries().map(e=>e.actor),navigator=this.room.navigator,anchor=staged[0];
  const connected=staged.length<2||staged.every(a=>navigator.reachable(anchor,a)&&navigator.reachable(a,anchor));
  if(staged.some(a=>a.infectionPending)||!connected){m.infectionPhase='waiting';m.infectionPhaseEndsAt=0;m.infectionWaitReason='safe_spawns';this.waitRetryAt=now+3000;}
  this.room.matchDirty=true;if(publish){this.syncEffects();this.room.broadcastMatch(meta,now);this.notice(m.infectionPhase==='waiting'?'WAITING':'PREPARE',m.infectionPhase==='waiting'?'Need at least two participants and safe spawns.':`Round ${m.infectionRound} / ${R.rounds} · outbreak in 20 seconds`);}
 }
 outbreak(meta,now){
  const entries=this.entries(),m=meta.match;if(entries.length<2){this.pauseForPlayers(meta,now);return false;}
  const history=meta.infectionSeedHistory||{},candidates=entries.map(e=>({e,rank:-Math.log(Math.max(Number.EPSILON,Math.random()))*(1+(history[idOf(e.actor)]||0))})).sort((a,b)=>a.rank-b.rank),count=infectionInitialCount(entries.length);
  Object.assign(m,{infectionPhase:'active',infectionActiveStartedAt:now,infectionPhaseEndsAt:now+R.roundMs,updatedAt:now});
  for(const {e}of candidates.slice(0,count)){this.convert(e,now,true);this.spawn(e,now);}
  if(candidates.slice(0,count).some(({e})=>e.actor.infectionPending)){this.room.returnMatchToLobby(meta,now);this.room.broadcast({t:'infectionStartBlocked',message:'This map cannot provide reachable, safe outbreak positions for this roster. Choose another map or reduce participants.'});return false;}
  for(const {e}of candidates.slice(0,count))history[idOf(e.actor)]=(history[idOf(e.actor)]||0)+1;
  for(const e of this.entries()){const p=e.actor;p.infectionActiveRound=m.infectionRound;if(!p.infected){for(const item of p.infectionReservations||[]){const price=SHOP[item]?.cost||0;if(p.cash<price)continue;p.cash=infectionCash(p.cash,-price);p.roundSpent+=price;if(item==='frost')p.infectionGrenades.frost=Math.min(2,(p.infectionGrenades.frost||0)+1);if(item==='barricade')p.infectionGear.barricade=true;}}p.infectionReservations=[];p.infectionReservedCash=0;p.roundStartRole=p.infected?'infected':'survivor';p.infectionLastIntentAt=now;this.save(e);}
  meta.infectionSeedHistory=history;this.room.matchDirty=true;this.room.broadcastMatch(meta,now);this.notice('OUTBREAK','Survivors hold out · infected close the distance');return true;
 }
 pauseForPlayers(meta,now){this.prepareRound(meta,now,false);meta.match.infectionPhase='waiting';meta.match.infectionPhaseEndsAt=0;meta.match.infectionWaitReason='players';this.room.broadcastMatch(meta,now);}
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
 coveredSites(){
  const world=this.room.world,g=world.geometry;if(this.coverSiteWorld===world)return this.coverSiteCache;
  const points=[];
  for(const b of [...g.BUILDINGS,...g.STATIC_BOXES.filter(b=>b.h>=2&&b.w>=2&&b.d>=1)]){const a=(b.rot||0)*Math.PI/180,cs=Math.cos(a),sn=Math.sin(a),w=b.w/2+2,d=b.d/2+2;
   for(const [u,v]of [[-w,-d],[w,-d],[-w,d],[w,d],[0,-d],[0,d],[-w,0],[w,0]]){const x=b.x+u*cs-v*sn,z=b.z+u*sn+v*cs,y=g.worldSupportHeight(x,z,g.terrainHeight(x,z)+.5);if(!points.some(p=>Math.hypot(x-p.x,z-p.z)<1)&&this.legalRoute(x,y,z))points.push({x,y,z});}
  }
  this.coverSiteWorld=world;this.coverSiteCache=points;return points;
 }
 spot(actor,now){
  const room=this.room,g=room.world.geometry,live=this.entries().map(e=>e.actor).filter(a=>a.hp>0),enemies=live.filter(a=>a.team!==actor.team),seedAllies=this.match.infectionPhase==='buy'&&actor.infected?live.filter(a=>a.infected):[];
  for(const exposed of [false,true]){const rejected=new Set();for(let attempt=0;attempt<5;attempt++){
  const result=room.world.spawns.chooseSafeSpawn({mode:'infection',team:actor.team,actors:this.entries().map(e=>e.actor),excludeId:idOf(actor),index:Math.max(0,Math.floor(actor.deaths||0)),now,strict:true,includeAllPoints:true,maxSafeCandidates:5,candidateOrder:p=>enemies.length?Math.abs(Math.min(...enemies.map(a=>Math.hypot(a.x-p[0],a.z-p[1])))-42):seedAllies.length?Math.abs(Math.min(...seedAllies.map(a=>Math.hypot(a.x-p[0],a.z-p[1])))-5):0,
   extraPoints:[...this.sites(),...this.coveredSites()].map(n=>[n.x,n.z,n.y-g.terrainHeight(n.x,n.z)]),
   policyOverride:{minEnemyDistance:R.minSpawnDistance,minProjectedEnemyDistance:R.minSpawnDistance,lineOfSightDistance:exposed?0:R.spawnSightDistance,idealEnemyDistance:42,enemyDistanceWeight:0,minActorSeparation:2.5,allowTeamFlip:true},
   terrainHeight:g.terrainHeight,blockedAt:(x,z,y)=>room.world.worldCollision.worldBlockedAt(x,z,y,g.PLAYER_HEIGHT,g.PLAYER_RADIUS),validAt:(x,y,z)=>!rejected.has(`${x},${z}`)&&this.legalRoute(x,y,z)&&this.preparationSite(x,y,z),
   // Prefer solid cover. Exposed fallback retains distance, collision and reachable-route tests and extends release protection.
   lineOfSight:(a,b)=>room.world.serverCollision.actorHasLineOfSight(a,b)||room.world.serverCollision.actorHasLineOfSight(b,a),recentDeaths:room.recentDeaths,recentSpawns:room.recentSpawns,recentGunfire:room.recentGunfire,recentExplosions:room.recentExplosions,projectiles:[...room.bullets.values()],throwables:[...room.throwables.values(),...this.effects]});
  if(!result)break;
  if(!enemies.length||enemies.slice().sort((a,b)=>distance(a,result)-distance(b,result)).slice(0,3).some(target=>room.navigator.reachable(result,target)))return {x:result.x,y:result.y,z:result.z,yaw:result.yaw,cluster:result.cluster,infectionSpawnExposed:exposed,spawnProtectedUntil:now+(actor.infected&&actor.infectionMother&&!actor.infectionFirstSpawned?R.seedReleaseMs:exposed?R.exposedSpawnProtectionMs:R.spawnProtectionMs)};
  rejected.add(`${result.x},${result.z}`);
  }}return null;
 }
 spawn(e,now,publish=true){
  const p=e.socket?e.socket.deserializeAttachment():e.actor;e.actor=p;
  if(!p.infectionPending||now<(p.wastedUntil||0)||now<(p.spawnAttemptAt||0))return false;
  const pos=this.spot(p,now);p.spawnAttemptAt=now+R.spawnRetryMs;if(!pos){if(publish)this.save(e);else if(e.socket)e.socket.serializeAttachment(p);return false;}
  const resuming=p.infectionResumeHp>0,resumeFields=['frostSlowUntil','frostRecoveryUntil','frozenUntil','burningUntil','burnOwnerId','burnSourceTeam','burnNextTickAt','abilityStartsAt','abilityUntil','abilityRecoveryUntil','abilityReadyAt','abilityLaunchedAt','grenadeReadyAt','reloadAt','reloadWeapon','weaponReadyAt','sprintFireReadyAt','fireReadyAt','fireHeat','fireHeatAt','combatAction','combatActionKind','combatReadyAt','equipmentReadyAt'],resumeState=resuming?Object.fromEntries(resumeFields.filter(k=>p[k]!==undefined).map(k=>[k,p[k]])):{},oldNextClawAt=p.nextClawAt||0,oldInfectionReadyAt=p.infectionReadyAt||0;
  if(p.infected&&!resuming){if(!e.socket&&p.deaths>0&&p.deaths%2===0){const ids=Object.keys(INFECTION_CLASSES);p.infectionNextClass=ids[(ids.indexOf(p.infectionClass)+1)%ids.length];}p.infectionClass=p.infectionNextClass||p.infectionClass||'runner';p.maxHp=infectionClass(p.infectionClass).hp*(p.infectionMother&&!p.infectionFirstSpawned?infectionFirstHealth(this.entries().length):1);}
  Object.assign(p,this.room.freezeHumanState(p,now),pos,{hp:resuming?Math.min(p.maxHp,p.infectionResumeHp):p.maxHp||100,infectionResumeHp:0,wastedUntil:0,infectionPending:false,infectionReadyAt:now+R.spawnProtectionMs,nextClawAt:now+R.spawnProtectionMs,frozenUntil:0,frostSlowUntil:0,burningUntil:0,burnOwnerId:'',burnNextTickAt:0,infectionAirborne:false,abilityLaunchedAt:0,verticalVelocity:0,knockWindowAt:0,knockWindowUsed:0,knockVelocityX:0,knockVelocityZ:0,abilityStartsAt:0,abilityUntil:0,clawImpactAt:0,abilityRecoveryUntil:0,navX:pos.x,navZ:pos.z,navUntil:0,targetId:'',targetLockUntil:0,lastSeenTargetId:'',lastSeenAt:0,reactionReadyAt:0,aimYaw:pos.yaw,aimPitch:0,aimNoiseUntil:0,burstShotsLeft:0,burstPauseUntil:0,patrolUntil:0,lastKnownX:pos.x,lastKnownZ:pos.z,routePath:[],actorDetour:null,routeCheckAt:0,infectionHold:null,infectionHoldUntil:0},resumeState,{clawImpactAt:0,nextClawAt:Math.max(pos.spawnProtectedUntil,resuming?oldNextClawAt:0),infectionReadyAt:Math.max(pos.spawnProtectedUntil,resuming?oldInfectionReadyAt:0)});
  if(!resuming&&!p.infected)this.room.refillInfectionAmmo(p);
  if(p.infected)p.infectionFirstSpawned=true;this.room.combatHistory?.delete(idOf(p));this.room.noteSpawn(pos,p.team,idOf(p),now);this.room.recordCombatPose(p,now);if(publish)this.save(e,'respawn');else if(e.socket)e.socket.serializeAttachment(p);return true;
 }
 convert(e,now,first=false){
  const p=e.actor;if(p.infected)return false;this.room.combatHistory?.delete(idOf(p));
  const humanLoadout={primaryWeapon:p.primaryWeapon,secondaryWeapon:p.secondaryWeapon,primaryAttachments:normalizeWeaponAttachments(p.primaryWeapon,p.primaryAttachments),secondaryAttachments:normalizeWeaponAttachments(p.secondaryWeapon,p.secondaryAttachments)};
  const rememberedAllies=(e.socket?[]:this.entries()).filter(e=>idOf(e.actor)!==idOf(p)&&e.actor.team===p.team&&e.actor.hp>0).map(e=>({id:idOf(e.actor),x:e.actor.x,y:e.actor.y,z:e.actor.z,seenAt:now,expiresAt:now+75000}));
  const cls=p.infectionNextClass||'runner',cash=p.cash,stats=p.infectionStats,preferred=p.infectionPreferredWeapon||p.primaryWeapon||'ump';
  Object.assign(p,freshInfectionInventory(true,first,cls),{cash:infectionCash(cash),infectionStats:stats,infectionPreferredWeapon:preferred,infectionHumanLoadout:humanLoadout,infectionSearchLeads:rememberedAllies,infectionLeadVisited:{},infectionLeadTarget:'',survivalMs:first?0:Math.max(0,now-this.match.infectionActiveStartedAt),infectionPending:first,hp:first?0:infectionClass(cls).hp,wastedUntil:0,spawnAttemptAt:0,infectionReadyAt:now+R.conversionGraceMs,nextClawAt:now+R.conversionGraceMs,spawnProtectedUntil:now+R.conversionGraceMs,traversal:null,ladder:null,ads:false,knockVelocityX:0,knockVelocityZ:0,contributions:{}});
  if(first)p.maxHp=infectionClass(cls).hp*infectionFirstHealth(this.entries().length);
  for(const [id,b]of this.room.bullets)if(b.ownerId===idOf(p))this.room.bullets.delete(id);
  for(const [id,g]of this.room.throwables)if(g.ownerId===idOf(p))this.room.throwables.delete(id);
  const effectCount=this.effects.length;this.effects=this.effects.filter(f=>f.ownerId!==idOf(p));if(effectCount!==this.effects.length)this.syncEffects();
  this.save(e,'infectionRole');return true;
 }
 step(meta,now){
  const m=meta.match;if(!m.infectionPhase){this.begin(meta,now);return;}if(m.status!=='active')return;
  const entries=this.entries();
  if(m.infectionPhase==='roundEnd'){if(now>=m.infectionPhaseEndsAt){m.infectionRound++;this.prepareRound(meta,now);}return;}
  if(m.infectionPhase==='waiting'){if(entries.length>=2&&now>=(this.waitRetryAt||0)){this.waitRetryAt=now+3000;this.prepareRound(meta,now);}return;}
  if(entries.length<2){this.pauseForPlayers(meta,now);return;}
  // Deadline takes precedence over late effects/conversions from this tick.
  if(m.infectionPhase==='active'&&now>=m.infectionPhaseEndsAt){const human=entries.some(e=>!e.actor.infected);this.end(meta,human?'blue':'red',now,human?'time':'infected');return;}
  for(const e of entries){const p=e.actor;let changed=false,privateChanged=false;for(const key of ['frozenUntil','frostSlowUntil','burningUntil'])if(p[key]&&now>=p[key]){p[key]=0;changed=true;}
   if(m.infectionPhase==='active'&&p.hp>0){const prev=p.infectionLastActivityPose,dt=Math.min(1000,Math.max(0,now-(p.infectionActivityAt||now))),moved=prev?Math.hypot(p.x-prev.x,p.z-prev.z):0;if(moved>.01&&moved<15){this.recordActivity(e,now);p.infectionDistance=(p.infectionDistance||0)+moved;p.infectionActiveMs=(p.infectionActiveMs||0)+dt;}p.infectionActivityAt=now;p.infectionLastActivityPose={x:p.x,z:p.z};privateChanged=true;}
   if(m.infectionPhase==='active'&&e.socket&&!p.infected&&p.hp>0){const idle=now-(p.infectionLastIntentAt||m.infectionActiveStartedAt);if(idle>=60000){p.infectionAfk=true;this.convert(e,now);changed=true;}else if(idle>=45000&&!p.infectionAfkWarned){p.infectionAfkWarned=true;send(e.socket,{t:'infectionNotice',title:'MOVE TO STAY HUMAN',detail:'Inactive survivors turn infected after 60 seconds.'});changed=true;}}
   if(changed)this.save(e);else if(privateChanged&&e.socket)e.socket.serializeAttachment(p);if(p.infectionPending)this.spawn(e,now);if(p.clawImpactAt&&now>=p.clawImpactAt)this.clawImpact(e,now);}
  if(m.infectionPhase==='buy'){if(now>=m.infectionPhaseEndsAt)this.outbreak(meta,now);return;}
  // A disconnected sole infected pauses the round rather than granting free wins or adding unconfigured bots.
  if(!this.entries().some(e=>e.actor.infected)){this.pauseForPlayers(meta,now);return;}
  this.field.step(now);this.stepEffects(now);
  const winner=infectionOutcome(this.entries().map(e=>e.actor),now,m.infectionPhaseEndsAt);if(winner)this.end(meta,winner,now,'infected');
 }
 end(meta,winner,now,reason=winner==='blue'?'time':'infected'){
  const m=meta.match;if(m.infectionPhase!=='active')return;
  Object.assign(m,{infectionPhase:'roundEnd',infectionWinner:winner,infectionPhaseEndsAt:now+R.intermissionMs,infectionRoundResult:{round:m.infectionRound,winner,reason,endedAt:now},updatedAt:now});m[winner==='blue'?'blueScore':'redScore']=(m[winner==='blue'?'blueScore':'redScore']||0)+1;
  this.clearRound();this.syncEffects();this.field.clear();
  for(const e of this.entries()){const p=e.actor;if(!p.infected)p.survivalMs=Math.min(R.roundMs,now-m.infectionActiveStartedAt);const participated=(p.infectionActiveMs||0)>=15000&&(p.infectionDistance||0)>=12,contributed=(p.infectionStats?.damage||0)>=150||(p.infectionStats?.conversions||0)>0||(p.infectionStats?.assists||0)>0;
   if(!p.infectionAfk&&(participated||contributed))this.reward(e,2+Number(participated)+Number((winner==='red')===!!p.infected));
   const totals={...p.infectionTotals};for(const [key,value]of Object.entries(p.infectionStats||{}))totals[key]=(totals[key]||0)+value;p.infectionTotals=totals;p.survivalTotalMs=(p.survivalTotalMs||0)+(p.survivalMs||0);p.infectionReservations=[];p.infectionReservedCash=0;p.clawImpactAt=p.abilityRecoveryUntil=p.abilityStartsAt=p.abilityUntil=p.frostSlowUntil=0;this.save(e);}
  this.room.matchDirty=true;
  if(m.infectionRound>=R.rounds){const matchWinner=m.blueScore>m.redScore?'blue':'red';this.room.finishMatch(meta,matchWinner,'rounds',now);}else{this.room.broadcastMatch(meta,now);this.notice(winner==='blue'?'SURVIVORS WIN':'INFECTED WIN',`Round ${m.infectionRound} / ${R.rounds} · next round in 6 seconds`);}
 }
 purchase(e,item,now,publish=true,transaction={}){
  const p=e.actor,m=this.match;if(!Object.hasOwn(SHOP,item))return {accepted:false,reason:'unavailable',round:m.infectionRound,sequence:transaction.sequence};const round=transaction.round??(!e.socket?m.infectionRound:undefined),sequence=transaction.sequence??(!e.socket?(p.infectionPurchaseSequence||0)+1:undefined);
  if(round!==m.infectionRound||!Number.isSafeInteger(sequence)||sequence<1)return {accepted:false,reason:'invalid_transaction',round:m.infectionRound,sequence};
  p.infectionTransactions||={};const prior=p.infectionTransactions[sequence];if(prior)return prior.item===item?prior.result:{accepted:false,reason:'sequence_conflict',round,sequence};
  if(sequence<=(p.infectionPurchaseSequence||0)||sequence>(p.infectionPurchaseSequence||0)+1)return {accepted:false,reason:'sequence_out_of_order',round,sequence};
  p.infectionPurchaseSequence=sequence;
  let result=m.status!=='active'||now>=m.infectionPhaseEndsAt?{accepted:false,reason:'phase_locked'}:infectionPurchaseAvailability(p,item,m.infectionPhase,now);
  if(result.accepted){const spec=SHOP[item];if(result.cancel){p.infectionReservations=p.infectionReservations.filter(id=>id!==item);p.infectionReservedCash=Math.max(0,(p.infectionReservedCash||0)-spec.cost);result={accepted:true,cancelled:true};}
   else if(spec.classId){p.infectionNextClass=spec.classId;if(!p.infected)p.infectionClass=spec.classId;}
   else if(spec.weapon){p.primaryOwned=true;p.primaryWeapon=p.weapon=p.infectionPreferredWeapon=spec.weapon;p.primaryAttachments={};p.reloadAt=0;p.reloadWeapon='';p.weaponReadyAt=0;p.combatAction='ready';p.combatActionKind='';p.combatReadyAt=0;this.room.refillInfectionAmmo(p,spec.weapon);}
   else{p.infectionReservations||=[];p.infectionReservations.push(item);p.infectionReservedCash=(p.infectionReservedCash||0)+spec.cost;result={...result,reserved:true};}}
  result={...result,round,sequence};p.infectionTransactions[sequence]={item,result};const old=Object.keys(p.infectionTransactions).map(Number).sort((a,b)=>a-b);for(const k of old.slice(0,-8))delete p.infectionTransactions[k];if(publish)this.save(e);else if(e.socket)e.socket.serializeAttachment(p);this.room.matchDirty=true;return result;
 }
 botBuy(e,now,publish=true){const p=e.actor;if(this.match.infectionPhase!=='buy')return;const n=String(idOf(p)).split('').reduce((s,c)=>s+c.charCodeAt(0),0);p.infectionNextClass=Object.keys(INFECTION_CLASSES)[n%3];const weapons=Object.keys(SHOP).filter(id=>SHOP[id].weapon);this.purchase(e,weapons[n%weapons.length],now,publish);this.purchase(e,n%2?'frost':'barricade',now,publish);}
 reward(e,n){if(!e)return;const p=e.actor,credit=p.infectionAfk||this.match.cheatsUsed?0:Math.max(0,Math.min(n,R.roundRewardCap-(p.infectionRoundReward||0)));p.infectionRoundReward=(p.infectionRoundReward||0)+credit;p.cash=infectionCash(p.cash,credit);this.save(e);}
 damage(e,attackerId,amount,weapon,knockback,now,bulletId='',hitMeta={}){
  const p=e.actor,aEntry=this.entries().find(v=>idOf(v.actor)===attackerId),a=aEntry?.actor,m=this.match;
  if(m.status!=='active'||m.infectionPhase!=='active'||now>=m.infectionPhaseEndsAt||p.hp<=0||p.godMode||now<(p.spawnProtectedUntil||0))return false;
  const sourceTeam=hitMeta.sourceTeam||a?.team,infectedSource=hitMeta.infectionSource??!!a?.infected;
  if(a&&sourceTeam&&a.team!==sourceTeam)return false;
  if(a&&(a.hp<=0||a.infectionPending||now<(a.infectionReadyAt||0)))return false;
  if(sourceTeam&&attackerId!==idOf(p)&&sourceTeam===p.team)return false;
  if(infectedSource&&weapon!=='claw')return false;
  const hostile=!!a&&sourceTeam!==p.team&&attackerId!==idOf(p),source=damageSource(p,a,knockback,hitMeta);
  if(weapon==='claw'&&infectedSource&&hostile&&!p.infected){
   if(distance(p,a)>R.reach||Math.abs(p.y-a.y)>1.5||!this.room.world.serverCollision.actorHasLineOfSight(a,p))return false;
   if(p.armor>0){p.lastArmorHitAt=now;p.armor=Math.max(0,p.armor-50);p.infectionPressure||={};p.infectionPressure[attackerId]=now;this.save(e);this.room.broadcast({t:'hit',attacker:attackerId,target:idOf(p),hp:p.hp,armor:p.armor,damage:0,weapon,source,blockedDamage:50,wasted:false,knockback:ZERO});return true;}
   return this.infectHit(e,aEntry,now,weapon);
  }
  let damage=Math.max(0,Number(amount)||0);if(!damage)return false;
  if(p.infected&&infectionAbilityActive(p,now)&&p.infectionClass==='brute')damage*=.5;
  const armor=Math.min(p.armor||0,damage*.5);p.armor=Math.max(0,(p.armor||0)-armor);damage-=armor;const dealt=Math.min(p.hp,damage);p.hp=Math.max(0,p.hp-damage);
  let force=knockback||ZERO;
  if(p.infected&&hostile&&a){
   const d=distance(p,a)||1,cls=infectionClass(p.infectionClass),power=Math.min(3.5,.7+dealt*.022)*cls.knockback*(infectionAbilityActive(p,now)&&p.infectionClass==='brute'?.35:1);
   if(now>=(p.knockWindowAt||0)+R.knockbackWindowMs){p.knockWindowAt=now;p.knockWindowUsed=0;}
   const allowed=Math.max(0,Math.min(power,R.knockbackCap-(p.knockWindowUsed||0)));p.knockWindowUsed=(p.knockWindowUsed||0)+allowed;force={x:(p.x-a.x)/d*allowed,z:(p.z-a.z)/d*allowed,y:0};
  }
  const oldX=p.knockVelocityX||0,oldZ=p.knockVelocityZ||0,kx=oldX+force.x,kz=oldZ+force.z,scale=Math.min(1,R.knockbackCap/(Math.hypot(kx,kz)||1));p.knockVelocityX=kx*scale;p.knockVelocityZ=kz*scale;force={x:p.knockVelocityX-oldX,z:p.knockVelocityZ-oldZ,y:force.y||0};
  if(hostile&&dealt>0){p.contributions||={};const prior=p.contributions[attackerId]||{damage:0};p.contributions[attackerId]={damage:prior.damage+dealt,at:now};a.infectionStats||={conversions:0,assists:0,damage:0,supplies:0};a.infectionStats.damage+=dealt;
   a.damageRewards||={};const prev=a.damageRewards[idOf(p)],paid=prev&&now-prev.at<30000?prev.paid:0,credit=Math.min(dealt,Math.max(0,1000-paid));a.damageRewards[idOf(p)]={paid:paid+credit,at:paid?prev.at:now};a.packDamage=(a.packDamage||0)+credit;const packs=Math.floor(a.packDamage/R.damagePerPack);a.packDamage%=R.damagePerPack;this.reward(aEntry,packs);this.save(aEntry);
  }
  const dead=p.hp<=0;if(dead){if(p.infected&&!e.socket&&hostile){p.infectionSearchLeads=[{id:`fight-${now}`,x:p.x,y:p.y,z:p.z,seenAt:now,expiresAt:now+60000},...(p.infectionSearchLeads||[]).filter(v=>v.expiresAt>now)].slice(0,8);p.infectionLeadTarget='';p.infectionSearchZone=null;p.infectionSearch=null;}this.room.noteDeath(p,now);p.deaths=(p.deaths||0)+1;
   if(hostile){a.kills=(a.kills||0)+1;a.killRewards||={};if(now-(a.killRewards[idOf(p)]||0)>=30000){a.killRewards[idOf(p)]=now;this.reward(aEntry,1);}this.save(aEntry);}
   for(const [id,v]of Object.entries(p.contributions||{})){if(id===attackerId||now-v.at>12000||v.damage<75)continue;const assist=this.entries().find(v=>idOf(v.actor)===id);if(assist&&assist.actor.team!==p.team){assist.actor.infectionStats.assists++;this.reward(assist,1);}}
   if(!p.infected)this.convert(e,now);
   Object.assign(p,{hp:0,infectionPending:true,wastedUntil:now+R.respawnMs,spawnAttemptAt:0,spawnProtectedUntil:0,traversal:null,ladder:null,contributions:{},abilityStartsAt:0,abilityUntil:0,clawImpactAt:0,abilityRecoveryUntil:0,frozenUntil:0,frostSlowUntil:0,burningUntil:0});
  }
  this.save(e);this.room.broadcast({t:'hit',attacker:attackerId,target:idOf(p),hp:p.hp,armor:p.armor,damage:dealt,weapon,bulletId,headshot:!!hitMeta.headshot,distance:hitMeta.distance||0,source,blockedDamage:armor,blast:!!hitMeta.blast,wasted:dead,respawnAt:p.wastedUntil||0,knockback:force});
  if(dead)this.room.broadcast(this.room.killEvent(attackerId,idOf(p),weapon,now,{headshot:!!hitMeta.headshot,distance:hitMeta.distance||0}));this.room.matchDirty=true;if(dead&&!this.entries().some(e=>!e.actor.infected))this.end(this.room.metaCache,'red',now,'infected');return true;
 }
 infectHit(victim,attacker,now,weapon='claw'){
  const p=victim.actor,a=attacker.actor;if(p.infected||p.hp<=0||!a.infected||!this.canAttack(a,now)||this.match.infectionPhase!=='active'||now>=this.match.infectionPhaseEndsAt)return false;
  const pressure={...p.infectionPressure};if(!this.convert(victim,now))return false;for(const [id,at]of Object.entries(pressure)){if(id===idOf(a)||now-at>10000)continue;const ally=this.entries().find(e=>idOf(e.actor)===id&&e.actor.infected);if(ally){ally.actor.infectionStats.assists++;this.reward(ally,1);}}a.infectionStats||={conversions:0,assists:0,damage:0,supplies:0};a.infectionStats.conversions++;a.kills=(a.kills||0)+1;this.reward(attacker,2);a.hp=Math.min(a.maxHp,a.hp+Math.round(a.maxHp*.12));this.save(attacker);this.room.broadcast({t:'infectionConverted',id:idOf(p),attacker:idOf(a),weapon});this.room.matchDirty=true;if(!this.entries().some(e=>!e.actor.infected))this.end(this.room.metaCache,'red',now,'infected');return true;
 }
 canAttack(p,now){return this.match.status==='active'&&this.match.infectionPhase==='active'&&now<this.match.infectionPhaseEndsAt&&p.hp>0&&now>=(p.infectionReadyAt||0)&&!p.infectionPending&&!p.traversal&&!p.ladder&&now>=(p.frozenUntil||0)&&!(now>=(p.abilityUntil||0)&&now<(p.abilityRecoveryUntil||0));}
 claw(e,now){const p=e.actor;if(!p.infected||!this.canAttack(p,now)||now<(p.nextClawAt||0)||p.clawImpactAt)return false;this.recordActivity(e,now);p.spawnProtectedUntil=0;p.nextClawAt=now+R.clawMs;p.attackAt=now;p.clawImpactAt=now+R.clawWindupMs;p.clawRound=this.match.infectionRound;p.clawYaw=p.yaw;this.save(e);this.room.broadcast({t:'infectionAttack',id:idOf(p),attackAt:now,impactAt:p.clawImpactAt,recoveryUntil:p.nextClawAt});return true;
 }
 clawImpact(e,now){const p=e.actor;if(!p.clawImpactAt||now<p.clawImpactAt)return false;const round=p.clawRound,yaw=p.clawYaw;p.clawImpactAt=0;this.save(e);if(!p.infected||round!==this.match.infectionRound||!this.canAttack(p,now))return false;
  for(const v of this.entries().filter(e=>!e.actor.infected&&e.actor.hp>0).sort((a,b)=>distance(a.actor,p)-distance(b.actor,p))){const t=v.actor,d=distance(t,p);if(d>R.reach||Math.abs(t.y-p.y)>1.5||(-Math.sin(yaw)*(t.x-p.x)-Math.cos(yaw)*(t.z-p.z))/Math.max(.01,d)<.35||!this.room.world.serverCollision.actorHasLineOfSight(p,t))continue;const hit=this.damage(v,idOf(p),R.clawDamage,'claw',ZERO,now,'',{distance:d,source:{x:p.x,y:p.y+1,z:p.z},sourceTeam:p.team,infectionSource:true});send(e.socket,{t:'infectionClawResult',accepted:true,hit,converted:t.infected});return hit;}
  const hit=this.field.strike({...p,yaw},now);send(e.socket,{t:'infectionClawResult',accepted:true,hit,converted:false});return hit;
 }
 action(e,action,now){if(action==='ping')return this.field.ping(e,now);const p=e.actor;if(!this.canAttack(p,now))return false;if(action==='build')return this.field.build(e,now);
  if(action==='fire'&&p.infected)return this.claw(e,now);
  if(action==='ability'&&p.infected&&!p.clawImpactAt&&now>=(p.abilityReadyAt||0)){
   const cls=infectionClass(p.infectionClass);if(p.infectionClass==='leaper'&&(p.serverGrounded===false||p.infectionAirborne))return false;this.recordActivity(e,now);p.abilityStartsAt=now+180;p.abilityUntil=p.abilityStartsAt+cls.abilityMs;p.abilityRecoveryUntil=p.abilityUntil+(cls.recoveryMs||0);p.abilityReadyAt=now+cls.cooldownMs;p.abilityYaw=p.yaw;p.spawnProtectedUntil=0;this.save(e);this.room.broadcast({t:'infectionAbility',id:idOf(p),classId:p.infectionClass,startsAt:p.abilityStartsAt,until:p.abilityUntil,recoveryUntil:p.abilityRecoveryUntil,x:p.x,y:p.y,z:p.z});return true;
  }
  if(action==='frost'&&!p.infected){if(!(p.infectionGrenades?.frost>0)||now<(p.grenadeReadyAt||0))return false;this.recordActivity(e,now);p.infectionGrenades.frost--;p.grenadeReadyAt=now+1000;const yaw=e.socket?p.yaw:p.aimYaw??p.yaw,pitch=e.socket?p.pitch||0:p.aimPitch||0,cp=Math.cos(pitch);this.effects.push({id:`grenade-${now}-${idOf(p)}`,kind:'projectile',type:'frost',ownerId:idOf(p),sourceTeam:p.team,x:p.x,y:p.y+1.25,z:p.z,vx:-Math.sin(yaw)*cp*15,vy:Math.sin(pitch)*15+4,vz:-Math.cos(yaw)*cp*15,bornAt:now,expiresAt:now+A.grenadeFuseMs});this.save(e);this.syncEffects();return true;}
  return false;
 }
 syncEffects(){this.room.matchDirty=true;this.room.broadcast({t:'infectionEffects',effects:this.effects});}
 stepEffects(now){const dt=Math.min(.15,Math.max(0,(now-(this.lastEffectsAt||now))/1000));this.lastEffectsAt=now;let changed=false;
  for(const f of this.effects){if(f.kind==='projectile'){
   const nx=f.x+f.vx*dt,ny=f.y+f.vy*dt,nz=f.z+f.vz*dt,t=this.room.world.serverCollision.segmentFirstWorldHitT(f.x,f.y,f.z,nx,ny,nz,.15);f.vy-=12*dt;
   if(t!=null||now>=f.expiresAt){const amount=t==null?1:Math.max(0,t-.025);f.x+=(nx-f.x)*amount;f.y+=(ny-f.y)*amount;f.z+=(nz-f.z)*amount;Object.assign(f,{kind:f.type,radius:A.frostRadius,vx:0,vy:0,vz:0,expiresAt:now+500,tickAt:now});changed=true;}else{f.x=nx;f.y=ny;f.z=nz;}
  }
  if(f.kind==='frost'&&now>=f.tickAt&&now<f.expiresAt){f.tickAt=now+500;const owner=this.entries().find(e=>idOf(e.actor)===f.ownerId);if(!owner||owner.actor.team!==f.sourceTeam)continue;
   for(const e of this.entries()){const p=e.actor;if(p.hp<=0||p.team===f.sourceTeam||distance(p,f)>f.radius||Math.abs(p.y-f.y)>3||!this.room.world.serverCollision.blastHasLineOfSight(f.x,f.y+.3,f.z,p.x,p.y+1,p.z)||now<(p.spawnProtectedUntil||0))continue;
    if(f.kind==='frost'&&p.infected){const repeated=now<(p.frostRecoveryUntil||0);p.frostSlowUntil=Math.max(p.frostSlowUntil||0,now+(repeated?450:1400));p.frostRecoveryUntil=now+A.frostRecoveryMs;this.save(e);}
   }
  }}
  const count=this.effects.length;this.effects=this.effects.filter(f=>now<f.expiresAt);if(count!==this.effects.length)changed=true;if(changed||this.effects.length&&now-(this.lastEffectsBroadcast||0)>100){this.lastEffectsBroadcast=now;this.syncEffects();}
 }
 botSearch(bot,now){
  const g=this.room.world.geometry,actors=this.entries().map(e=>e.actor),friendlyId=id=>actors.some(p=>idOf(p)===id&&p.team===bot.team),heard=this.room.recentGunfire.filter(s=>s.team!==bot.team&&!friendlyId(s.id)&&now-s.at<2500&&distance(s,bot)<55).sort((a,b)=>b.at-a.at)[0];
  const footsteps=this.entries().map(e=>e.actor).filter(p=>p.hp>0&&p.team!==bot.team&&p.moveSpeed>2&&distance(p,bot)<(p.sprinting?18:10)).sort((a,b)=>distance(a,bot)-distance(b,bot))[0];
  const ping=this.field.state.pings.filter(p=>p.team===bot.team&&p.kind==='danger'&&!friendlyId(p.targetId)&&now<p.expiresAt).sort((a,b)=>distance(a,bot)-distance(b,bot))[0],sense=heard||footsteps||ping;
  if(sense){bot.lastKnownX=sense.x;bot.lastKnownZ=sense.z;bot.lastKnownY=sense.y??g.worldSupportHeight(sense.x,sense.z,g.terrainHeight(sense.x,sense.z));bot.heardAt=sense===footsteps?now:Number(sense.at??sense.createdAt??(sense.expiresAt-8000))||now;}
  if(friendlyId(bot.lastSeenTargetId))bot.lastSeenAt=0;
  if(now-Math.max(bot.lastSeenAt||0,bot.heardAt||0)<6500&&Number.isFinite(bot.lastKnownX)&&Math.hypot(bot.x-bot.lastKnownX,bot.z-bot.lastKnownZ)>2)return{x:bot.lastKnownX,y:bot.lastKnownY??bot.y,z:bot.lastKnownZ};
  // Former friendly minimap positions are frozen at conversion, never refreshed through walls.
  bot.infectionSearchLeads=(bot.infectionSearchLeads||[]).filter(p=>p.expiresAt>now&&!friendlyId(p.id));bot.infectionLeadVisited||={};
  let lead=bot.infectionSearchLeads.find(p=>p.id===bot.infectionLeadTarget&&!bot.infectionLeadVisited[p.id]);
  if(lead){const d=distance(bot,lead);if(!Number.isFinite(bot.infectionLeadBestDistance)||d<bot.infectionLeadBestDistance-1){bot.infectionLeadBestDistance=d;bot.infectionLeadProgressAt=now;}if(d<3&&Math.abs(bot.y-lead.y)<1.5||now-(bot.infectionLeadProgressAt||now)>=8000){bot.infectionLeadVisited[lead.id]=true;if(d<3){bot.infectionSearchZone={x:lead.x,z:lead.z,expiresAt:Math.min(lead.expiresAt,now+25000)};bot.infectionSearch=null;}lead=null;bot.infectionLeadTarget='';}else return lead;}
  if(!lead&&!(bot.infectionSearchZone?.expiresAt>now)){const pack=this.entries().map(e=>e.actor).filter(p=>p.infected&&p.hp>0&&idOf(p)!==idOf(bot));const leads=bot.infectionSearchLeads.filter(p=>!bot.infectionLeadVisited[p.id]).sort((a,b)=>(distance(bot,a)+pack.filter(p=>p.infectionLeadTarget===a.id).length*60)-(distance(bot,b)+pack.filter(p=>p.infectionLeadTarget===b.id).length*60));
   for(const candidate of leads){if(distance(bot,candidate)<3||!this.room.navigator.reachable(bot,candidate)){bot.infectionLeadVisited[candidate.id]=true;continue;}bot.infectionLeadTarget=candidate.id;bot.infectionLeadBestDistance=distance(bot,candidate);bot.infectionLeadProgressAt=now;return candidate;}
  }
  const stalled=bot.infectionSearch&&now>(bot.searchProgressAt||0)+8000;
  if(bot.infectionSearch){const d=distance(bot,bot.infectionSearch);if(!Number.isFinite(bot.searchBestDistance)||d<bot.searchBestDistance-1){bot.searchBestDistance=d;bot.searchProgressAt=now;}}
  if(!bot.infectionSearch||stalled||now>(bot.searchUntil||0)||(distance(bot,bot.infectionSearch)<2&&Math.abs(bot.y-(bot.infectionSearch.y??bot.y))<1.2)){
   // Explore the map's full authored, validated route anchors, not only defense sockets.
   const allPoints=[...this.sites(),...g.LADDERS.map(l=>ladderTopExitPoint(l,g.PLAYER_RADIUS))],zone=bot.infectionSearchZone?.expiresAt>now?bot.infectionSearchZone:null,points=zone?allPoints.filter(p=>distance(p,zone)<24):allPoints;bot.searchVisited||={};if(bot.infectionSearch)bot.searchVisited[`${Math.round(bot.infectionSearch.x/12)},${Math.round(bot.infectionSearch.z/12)}`]=now;
   const searchPack=this.entries().map(e=>e.actor).filter(p=>p.infected&&idOf(p)!==idOf(bot)&&p.infectionSearch);
   const score=p=>distance(bot,p)+searchPack.filter(a=>distance(a.infectionSearch,p)<9).length*55+(now-(bot.searchVisited[`${Math.round(p.x/12)},${Math.round(p.z/12)}`]||0)<90000?500:0);points.sort((a,b)=>score(a)-score(b));
   bot.infectionSearch=points.slice(0,24).find(p=>distance(bot,p)>3&&this.room.navigator.reachable(bot,p))||points.find(p=>distance(bot,p)>3)||bot;
   bot.searchUntil=now+Math.max(8000,Math.min(25000,distance(bot,bot.infectionSearch)/4*1000+6000));bot.searchProgressAt=now;bot.searchBestDistance=distance(bot,bot.infectionSearch);
  }
  return bot.infectionSearch;
 }
 botAir(bot,now,dt,settings){
  if(!bot.infected)return;
  if(bot.infectionClass==='leaper'&&infectionAbilityActive(bot,now)&&bot.abilityLaunchedAt!==bot.abilityStartsAt&&!bot.infectionAirborne){bot.abilityLaunchedAt=bot.abilityStartsAt;bot.infectionAirborne=true;bot.verticalVelocity=Math.sqrt(2*settings.movement.gravity*roleMovement(settings.movement,'infection',bot,now).jumpHeight);}

 }
 botCover(bot,now){return this.entries().map(e=>e.actor).some(p=>idOf(p)!==idOf(bot)&&!p.infected&&p.hp>0&&distance(bot,p)<14&&now>=(p.reloadAt||0));}
 botHold(bot,now){
  const ping=this.field.state.pings.find(p=>p.team===bot.team&&p.kind==='regroup'&&now<p.expiresAt);if(ping&&this.preparationSite(ping.x,ping.y,ping.z))return ping;
  if(!bot.infectionHold||now>(bot.infectionHoldUntil||0)){
   const sites=this.field.state.sockets.length?this.field.state.sockets:this.sites(),allies=this.entries().filter(e=>!e.actor.infected&&idOf(e.actor)!==idOf(bot)&&e.actor.hp>0),people=allies.filter(e=>e.socket).map(e=>e.actor);let best=null;
   for(const p of sites){if(!this.preparationSite(p.x,p.y,p.z))continue;const d=distance(bot,p);if(d>65||!this.room.navigator.reachable(bot,p))continue;const near=people.length?Math.min(...people.map(a=>distance(a,p))):allies.length?Math.min(...allies.map(e=>distance(e.actor,p))):12;
    const assigned=allies.filter(e=>e.actor.infectionHold&&distance(e.actor.infectionHold,p)<5).length,occupied=allies.filter(e=>distance(e.actor,p)<4).length;let cover=0;for(let i=0;i<8;i++){const x=p.x+Math.sin(i*Math.PI/4)*6,z=p.z+Math.cos(i*Math.PI/4)*6;if(this.room.world.serverCollision.segmentFirstWorldHitT(p.x,p.y+1,p.z,x,p.y+1,z,.1)!=null)cover++;}
    const score=cover*2.5-Math.abs(near-9)*.16-d*.45-assigned*15-occupied*8;if(cover>0&&(!best||score>best.score))best={...p,score};
   }
   bot.infectionHold=best||{x:bot.x,y:bot.y,z:bot.z};bot.infectionHoldUntil=now+12000;
  }return bot.infectionHold;
 }
 botAct(bot,target,now,moveToward,settings,profile=BOT_DIFFICULTIES.normal,dt=1/30){
  const e={actor:bot,socket:null},d=distance(bot,target);bot.ads=false;bot.navUntil=0;aimBotAtTarget(bot,target,now,dt,profile,1.2,target.crouched?.72:1.05);bot.yaw=approachAngle(bot.yaw,bot.aimYaw??bot.yaw,profile.aimTurnDegPerSec*Math.PI/180*dt);
  if(d>3&&d<16)this.action(e,'ability',now);
  const movement=roleMovement(settings.movement,'infection',bot,now);let goal=target;
  const active=infectionAbilityActive(bot,now);if(active)goal={x:bot.x-Math.sin(bot.abilityYaw)*5,z:bot.z-Math.cos(bot.abilityYaw)*5,y:bot.y};
  else if(d>7&&d<24){const pack=this.entries().map(e=>e.actor).filter(p=>p.infected&&p.hp>0&&idOf(p)!==idOf(bot)&&distance(p,target)<d),side=String(idOf(bot)).split('').reduce((n,c)=>n+c.charCodeAt(0),0)%2?1:-1;
   if(pack.length){const ux=(target.x-bot.x)/d,uz=(target.z-bot.z)/d,x=target.x-uz*side*5,z=target.z+ux*side*5,y=this.room.world.geometry.worldSupportHeight(x,z,target.y);if(!this.room.world.worldCollision.worldBlockedAt(x,z,y,1.7,.38))goal={x,y,z};}}
  moveToward(goal.x,goal.z,movement.runSpeed*Math.min(1,profile.moveRun),active?.1:1.4,goal.y);if(now>=(bot.reactionReadyAt||0))this.claw(e,now);
 }
}
