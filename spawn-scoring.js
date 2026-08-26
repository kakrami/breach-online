const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const safeTeam=value=>value==='red'?'red':'blue';
const modeId=value=>String(value||'').toLowerCase();
const actorId=actor=>String(actor?.id||actor?.clientId||'');
const distance2d=(a,b)=>Math.hypot(finite(a?.x)-finite(b?.x),finite(a?.z)-finite(b?.z));
const alive=(actor,now)=>!!actor&&finite(actor.hp,100)>0&&now>=finite(actor.wastedUntil,0)&&!actor.replaced;
const isEnemy=(mode,team,actor)=>modeId(mode)==='ffa'||safeTeam(actor?.team)!==safeTeam(team);

function pointSegmentDistance2d(px,pz,ax,az,bx,bz){
  const vx=bx-ax,vz=bz-az,wx=px-ax,wz=pz-az,len2=vx*vx+vz*vz;
  if(len2<1e-8)return Math.hypot(px-ax,pz-az);
  const t=clamp((wx*vx+wz*vz)/len2,0,1),cx=ax+vx*t,cz=az+vz*t;
  return Math.hypot(px-cx,pz-cz);
}

function facingThreat(actor,x,z){
  const dx=x-finite(actor.x),dz=z-finite(actor.z),distance=Math.hypot(dx,dz);if(distance<1e-6)return 1;
  const yaw=finite(actor.yaw,0),fx=-Math.sin(yaw),fz=-Math.cos(yaw);
  return clamp((fx*dx+fz*dz)/distance,-1,1);
}

function approachThreat(actor,x,z){
  const dx=x-finite(actor.x),dz=z-finite(actor.z),distance=Math.hypot(dx,dz);if(distance<1e-6)return 1;
  let vx=finite(actor.velocityX,NaN),vz=finite(actor.velocityZ,NaN);
  if(!Number.isFinite(vx)||!Number.isFinite(vz)||Math.hypot(vx,vz)<.15){
    const speed=Math.max(0,finite(actor.moveSpeed,0)),yaw=finite(actor.yaw,0);vx=-Math.sin(yaw)*speed;vz=-Math.cos(yaw)*speed;
  }
  const speed=Math.hypot(vx,vz);if(speed<.15)return 0;
  return clamp((vx*dx+vz*dz)/(speed*distance),-1,1);
}

function radialEventPenalty(entries,x,z,now,windowMs,radius,weight,factorFn=null){
  let penalty=0;
  for(const item of entries||[]){
    const age=now-finite(item?.at,0);if(age<0||age>windowMs)continue;
    const d=Math.hypot(x-finite(item?.x),z-finite(item?.z));if(d>=radius)continue;
    const factor=factorFn?clamp(finite(factorFn(item),1),0,2):1;
    penalty+=(1-d/radius)*(1-age/windowMs)*weight*factor;
  }
  return penalty;
}

function movingThreatPenalty(threats,x,z,radius,weight,horizonSec){
  let penalty=0,critical=0;
  for(const threat of threats||[]){
    const ax=finite(threat?.x),az=finite(threat?.z),vx=finite(threat?.vx),vz=finite(threat?.vz),bx=ax+vx*horizonSec,bz=az+vz*horizonSec;
    const d=pointSegmentDistance2d(x,z,ax,az,bx,bz);if(d>=radius)continue;
    const scale=1-d/radius;penalty+=scale*weight;if(d<radius*.48)critical++;
  }
  return {penalty,critical};
}

function allySupportScore(distance,policy){
  if(!Number.isFinite(distance))return 0;
  const tooClose=finite(policy.allyTooCloseDistance,4),idealMin=Math.max(tooClose+.1,finite(policy.allyIdealMin,10)),idealMax=Math.max(idealMin+.1,finite(policy.allyIdealMax,28));
  if(distance<tooClose)return -(1-distance/tooClose)*finite(policy.allyTooClosePenalty,9_000);
  if(distance<idealMin)return (distance-tooClose)/(idealMin-tooClose)*finite(policy.allySupportWeight,7_000);
  if(distance<=idealMax)return finite(policy.allySupportWeight,7_000);
  const fade=Math.max(idealMax+1,finite(policy.allySupportFade,idealMax*2));
  return Math.max(0,1-(distance-idealMax)/(fade-idealMax))*finite(policy.allySupportWeight,7_000);
}

export function spawnPointCountFor(mode,team,teamPoints,ffaPoints){
  return modeId(mode)==='ffa'?ffaPoints.length:teamPoints[safeTeam(team)].length;
}

export function spawnForModeFromPoints(mode,team,index,terrainHeight,teamPoints,ffaPoints){
  const points=modeId(mode)==='ffa'?ffaPoints:teamPoints[safeTeam(team)],p=points[Math.abs(Math.floor(finite(index,0)))%points.length],x=p[0],z=p[1];
  return{x,y:finite(terrainHeight?.(x,z),0),z};
}

export function scoreSpawnCandidate(policy,{
  mode,team,x,y,z,actors=[],excludeId='',recentDeaths=[],recentSpawns=[],recentGunfire=[],recentExplosions=[],projectiles=[],throwables=[],now=Date.now(),lineOfSight,
}){
  const normalizedMode=modeId(mode),normalizedTeam=safeTeam(team),live=(actors||[]).filter(actor=>actorId(actor)!==excludeId&&alive(actor,now));
  const enemies=[],allies=[];for(const actor of live)(isEnemy(normalizedMode,normalizedTeam,actor)?enemies:allies).push(actor);
  const enemyCap=finite(policy.enemyDistanceCap,normalizedMode==='ffa'?120:220),anyCap=finite(policy.anyDistanceCap,60),nearDistance=finite(policy.nearEnemyDistance,policy.minEnemyDistance*1.4);
  let minEnemy=enemies.length?Infinity:enemyCap,minAny=live.length?Infinity:anyCap,minAlly=allies.length?Infinity:anyCap,visibleEnemies=0,facingEnemies=0,approachingEnemies=0,nearEnemies=0;
  let enemyPressure=0,allyPressure=0;
  const zoneRadius=Math.max(1,finite(policy.zoneRadius,policy.lineOfSightDistance));
  for(const actor of live){
    const d=distance2d({x,z},actor);minAny=Math.min(minAny,d);
    if(!isEnemy(normalizedMode,normalizedTeam,actor)){
      minAlly=Math.min(minAlly,d);if(d<zoneRadius)allyPressure+=1-d/zoneRadius;continue;
    }
    minEnemy=Math.min(minEnemy,d);if(d<nearDistance)nearEnemies++;if(d<zoneRadius)enemyPressure+=1-d/zoneRadius;
    if(d<=finite(policy.lineOfSightDistance,60)&&lineOfSight?.({x,y,z},actor))visibleEnemies++;
    if(d<=finite(policy.facingThreatDistance,70)&&facingThreat(actor,x,z)>=finite(policy.facingThreatCos,.55))facingEnemies++;
    if(d<=finite(policy.approachThreatDistance,policy.facingThreatDistance)&&approachThreat(actor,x,z)>=finite(policy.approachThreatCos,.35))approachingEnemies++;
  }
  const projectile=movingThreatPenalty(projectiles,x,z,finite(policy.projectileThreatRadius,12),finite(policy.projectileThreatWeight,28_000),finite(policy.projectileLookaheadSec,.38));
  const throwable=movingThreatPenalty(throwables,x,z,finite(policy.throwableThreatRadius,15),finite(policy.throwableThreatWeight,34_000),finite(policy.throwableLookaheadSec,.65));
  const deathPenalty=radialEventPenalty(recentDeaths,x,z,now,finite(policy.recentDeathWindowMs,9000),finite(policy.recentDeathRadius,20),finite(policy.recentDeathWeight,48_000),item=>normalizedMode==='ffa'?1:(safeTeam(item?.team)===normalizedTeam?1:.38));
  const spawnPenalty=radialEventPenalty(recentSpawns,x,z,now,finite(policy.recentSpawnWindowMs,6500),finite(policy.recentSpawnRadius,16),finite(policy.recentSpawnWeight,18_000),item=>normalizedMode==='ffa'?1:(safeTeam(item?.team)===normalizedTeam?1:.55));
  const gunfirePenalty=radialEventPenalty(recentGunfire,x,z,now,finite(policy.gunfireWindowMs,3000),finite(policy.gunfireRadius,policy.lineOfSightDistance*.65),finite(policy.gunfireWeight,25_000),item=>normalizedMode==='ffa'?1:(safeTeam(item?.team)===normalizedTeam?0.28:1));
  const explosionPenalty=radialEventPenalty(recentExplosions,x,z,now,finite(policy.explosionWindowMs,4200),finite(policy.explosionRadius,policy.lineOfSightDistance*.45),finite(policy.explosionWeight,34_000));
  const occupied=minAny<finite(policy.minActorSeparation,2.2);
  const hardDanger=occupied||minEnemy<finite(policy.minEnemyDistance,20)||visibleEnemies>0||projectile.critical>0||throwable.critical>0;
  const safe=!hardDanger;
  let score=safe?1_000_000:0;
  score+=Math.min(minEnemy,enemyCap)*finite(policy.enemyDistanceWeight,150)+Math.min(minAny,anyCap)*finite(policy.anyDistanceWeight,5);
  score-=visibleEnemies*finite(policy.visibleEnemyPenalty,45_000)+facingEnemies*finite(policy.facingEnemyPenalty,12_000)+approachingEnemies*finite(policy.approachingEnemyPenalty,18_000)+nearEnemies*finite(policy.nearEnemyPenalty,6_000);
  if(occupied)score-=finite(policy.occupiedSpawnPenalty,750_000);
  score+=(allyPressure-enemyPressure)*finite(policy.zoneControlWeight,10_000);
  if(normalizedMode!=='ffa')score+=allySupportScore(minAlly,policy);
  score-=deathPenalty+spawnPenalty+gunfirePenalty+explosionPenalty+projectile.penalty+throwable.penalty;
  return{score,safe,hardDanger,occupied,minEnemy,minAny,minAlly,visibleEnemies,facingEnemies,approachingEnemies,nearEnemies,enemyPressure,allyPressure,deathPenalty,spawnPenalty,gunfirePenalty,explosionPenalty,projectileThreats:projectile.critical,throwableThreats:throwable.critical};
}

export function chooseSafeSpawnFromPoints(policy,teamPoints,ffaPoints,{
  mode,team,actors=[],index=0,excludeId='',recentDeaths=[],recentSpawns=[],recentGunfire=[],recentExplosions=[],projectiles=[],throwables=[],now=Date.now(),terrainHeight,blockedAt,lineOfSight,
}){
  const normalizedMode=modeId(mode),normalizedTeam=safeTeam(team),homePoints=teamPoints[normalizedTeam],awayPoints=teamPoints[normalizedTeam==='blue'?'red':'blue'];
  const points=normalizedMode==='ffa'?ffaPoints:(policy.allowTeamFlip?[...homePoints,...awayPoints]:homePoints),start=Math.abs(Math.floor(finite(index,0)))%Math.max(1,homePoints.length);
  let bestSafe=null,bestUnsafe=null;
  for(let offset=0;offset<points.length;offset++){
    const p=points[(start+offset)%points.length],x=p[0],z=p[1],y=finite(terrainHeight?.(x,z),0);if(blockedAt?.(x,z,y))continue;
    const detail=scoreSpawnCandidate(policy,{mode,team,x,y,z,actors,excludeId,recentDeaths,recentSpawns,recentGunfire,recentExplosions,projectiles,throwables,now,lineOfSight});
    const candidate={score:detail.score-offset*.01,x,y,z,detail,emergency:!detail.safe};
    if(detail.safe){if(!bestSafe||candidate.score>bestSafe.score)bestSafe=candidate;}else if(!bestUnsafe||candidate.score>bestUnsafe.score)bestUnsafe=candidate;
  }
  return bestSafe||bestUnsafe||{...spawnForModeFromPoints(mode,team,index,terrainHeight,teamPoints,ffaPoints),score:-Infinity,detail:null,emergency:true};
}
