const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const safeTeam=value=>value==='red'?'red':'blue';

// Dust Rig uses a ring of spawn candidates behind peripheral cover. The center
// remains a contested power position and is never used as a normal spawn.
export const TEAM_SPAWN_POINTS = Object.freeze({
  blue:Object.freeze([[-46,-43],[-45,-28],[-46,-10],[-31,-45],[-16,-46],[-45,11],[-41,29],[-28,43],[-10,46],[-43,42]]),
  red:Object.freeze([[46,43],[45,28],[46,10],[31,45],[16,46],[45,-11],[45,-27],[28,-43],[10,-46],[43,-42]]),
});
export const FFA_SPAWN_POINTS = Object.freeze([
  ...TEAM_SPAWN_POINTS.blue,...TEAM_SPAWN_POINTS.red,
  [-46,25],[46,-25],[-25,-46],[25,46],[-45,0],[45,0],[0,-46],[0,46]
]);

export const SPAWN_POLICY = Object.freeze({
  minEnemyDistance:16,
  lineOfSightDistance:44,
  facingThreatDistance:48,
  facingThreatCos:Math.cos(58*Math.PI/180),
  recentDeathWindowMs:9000,
  recentDeathRadius:14,
  recentSpawnWindowMs:6500,
  recentSpawnRadius:12,
  projectileThreatRadius:9,
  throwableThreatRadius:11,
});

export function spawnPointCount(mode,team='blue'){
  return String(mode||'').toLowerCase()==='ffa'?FFA_SPAWN_POINTS.length:TEAM_SPAWN_POINTS[safeTeam(team)].length;
}
export function spawnForMode(mode,team,index,terrainHeight){
  const points=String(mode||'').toLowerCase()==='ffa'?FFA_SPAWN_POINTS:TEAM_SPAWN_POINTS[safeTeam(team)];
  const p=points[Math.abs(Math.floor(finite(index,0)))%points.length],x=p[0],z=p[1];
  return{x,y:finite(terrainHeight?.(x,z),0),z};
}
function actorId(actor){return String(actor?.id||actor?.clientId||'');}
function actorAlive(actor,now){return !!actor&&finite(actor.hp,100)>0&&now>=finite(actor.wastedUntil,0)&&!actor.replaced;}
function enemyFor(mode,team,actor){return String(mode||'').toLowerCase()==='ffa'||safeTeam(actor?.team)!==safeTeam(team);}
function distance2d(a,b){return Math.hypot(finite(a?.x)-finite(b?.x),finite(a?.z)-finite(b?.z));}
function facingThreat(actor,x,z){const dx=x-finite(actor.x),dz=z-finite(actor.z),distance=Math.hypot(dx,dz);if(distance<1e-6)return 1;const yaw=finite(actor.yaw,0),fx=-Math.sin(yaw),fz=-Math.cos(yaw);return clamp((fx*dx+fz*dz)/distance,-1,1);}
function recentPenalty(entries,x,z,now,windowMs,radius,weight){let penalty=0;for(const item of entries||[]){const age=now-finite(item?.at,0);if(age<0||age>windowMs)continue;const d=Math.hypot(x-finite(item?.x),z-finite(item?.z));if(d>=radius)continue;penalty+=(1-d/radius)*(1-age/windowMs)*weight;}return penalty;}
function threatPenalty(threats,x,z,radius,weight){let penalty=0;for(const threat of threats||[]){const d=Math.hypot(x-finite(threat?.x),z-finite(threat?.z));if(d<radius)penalty+=(1-d/radius)*weight;}return penalty;}
export function scoreSpawnCandidate({mode,team,x,y,z,actors=[],excludeId='',recentDeaths=[],recentSpawns=[],projectiles=[],throwables=[],now=Date.now(),lineOfSight,}){
  const live=(actors||[]).filter(actor=>actorId(actor)!==excludeId&&actorAlive(actor,now));
  const enemies=live.filter(actor=>enemyFor(mode,team,actor));
  let minEnemy=enemies.length?Infinity:120,minAny=live.length?Infinity:45,visibleEnemies=0,facingEnemies=0,nearEnemies=0;
  for(const actor of live){const d=distance2d({x,z},actor);minAny=Math.min(minAny,d);if(!enemyFor(mode,team,actor))continue;minEnemy=Math.min(minEnemy,d);if(d<21)nearEnemies++;if(d<=SPAWN_POLICY.lineOfSightDistance&&lineOfSight?.({x,y,z},actor))visibleEnemies++;if(d<=SPAWN_POLICY.facingThreatDistance&&facingThreat(actor,x,z)>=SPAWN_POLICY.facingThreatCos)facingEnemies++;}
  const safe=minEnemy>=SPAWN_POLICY.minEnemyDistance;let score=safe?1_000_000:0;
  score+=Math.min(minEnemy,120)*185+Math.min(minAny,45)*8;
  score-=visibleEnemies*58_000+facingEnemies*16_000+nearEnemies*8_000;
  score-=recentPenalty(recentDeaths,x,z,now,SPAWN_POLICY.recentDeathWindowMs,SPAWN_POLICY.recentDeathRadius,56_000);
  score-=recentPenalty(recentSpawns,x,z,now,SPAWN_POLICY.recentSpawnWindowMs,SPAWN_POLICY.recentSpawnRadius,20_000);
  score-=threatPenalty(projectiles,x,z,SPAWN_POLICY.projectileThreatRadius,30_000);
  score-=threatPenalty(throwables,x,z,SPAWN_POLICY.throwableThreatRadius,38_000);
  return{score,safe,minEnemy,minAny,visibleEnemies,facingEnemies,nearEnemies};
}
export function chooseSafeSpawn({mode,team,actors=[],index=0,excludeId='',recentDeaths=[],recentSpawns=[],projectiles=[],throwables=[],now=Date.now(),terrainHeight,blockedAt,lineOfSight,}){
  const points=String(mode||'').toLowerCase()==='ffa'?FFA_SPAWN_POINTS:TEAM_SPAWN_POINTS[safeTeam(team)];let best=null;
  for(let offset=0;offset<points.length;offset++){const p=points[(Math.abs(Math.floor(finite(index,0)))+offset)%points.length],x=p[0],z=p[1],y=finite(terrainHeight?.(x,z),0);if(blockedAt?.(x,z,y))continue;const detail=scoreSpawnCandidate({mode,team,x,y,z,actors,excludeId,recentDeaths,recentSpawns,projectiles,throwables,now,lineOfSight});const score=detail.score-offset*.01;if(!best||score>best.score)best={score,x,y,z,detail};}
  return best||{...spawnForMode(mode,team,index,terrainHeight),score:-Infinity,detail:null};
}
