import { spawnPointCountFor, spawnForModeFromPoints, scoreSpawnCandidate as scoreCandidate, chooseSafeSpawnFromPoints } from './spawn-scoring.js';

export const TEAM_SPAWN_POINTS = Object.freeze({
  blue:Object.freeze([[-108,-72],[-110,-38],[-110,4],[-108,48],[-92,88],[-76,-90],[-70,24],[-54,-56],[-46,88],[-88,64]]),
  red:Object.freeze([[108,72],[110,38],[110,-4],[108,-48],[92,-88],[76,90],[70,-24],[54,56],[46,-88],[88,-64]]),
});
export const FFA_SPAWN_POINTS = Object.freeze([...TEAM_SPAWN_POINTS.blue,...TEAM_SPAWN_POINTS.red]);

export const SPAWN_POLICY = Object.freeze({
  allowTeamFlip:true,
  minActorSeparation:2.2,
  occupiedSpawnPenalty:750000,
  minEnemyDistance:30,
  lineOfSightDistance:58,
  facingThreatDistance:72,
  approachThreatDistance:78,
  nearEnemyDistance:42,
  zoneRadius:58,
  recentDeathRadius:24,
  recentSpawnRadius:18,
  projectileThreatRadius:13,
  throwableThreatRadius:16,
  gunfireRadius:38,
  explosionRadius:30,
  enemyDistanceCap:220,
  enemyDistanceWeight:120,
  visibleEnemyPenalty:42000,
  facingEnemyPenalty:9500,
  approachingEnemyPenalty:16000,
  nearEnemyPenalty:4500,
  zoneControlWeight:9000,
  allyIdealMin:11,
  allyIdealMax:30,
  allySupportWeight:6500,
  allyTooCloseDistance:5,
  emergencyProtectionMs:700,
  facingThreatCos:Math.cos(55*Math.PI/180),
  approachThreatCos:.32,
  recentDeathWindowMs:9000,
  recentSpawnWindowMs:6500,
  projectileThreatWeight:30000,
  throwableThreatWeight:38000,
  gunfireWindowMs:3000,
  gunfireWeight:28000,
  explosionWindowMs:4200,
  explosionWeight:40000,
  recentDeathWeight:52000,
  recentSpawnWeight:18000,
  anyDistanceCap:60,
  anyDistanceWeight:5,
  allySupportFade:48,
  allyTooClosePenalty:9000,
  projectileLookaheadSec:.38,
  throwableLookaheadSec:.65,
});

export function spawnPointCount(mode,team='blue'){return spawnPointCountFor(mode,team,TEAM_SPAWN_POINTS,FFA_SPAWN_POINTS);}
export function spawnForMode(mode,team,index,terrainHeight){return spawnForModeFromPoints(mode,team,index,terrainHeight,TEAM_SPAWN_POINTS,FFA_SPAWN_POINTS);}
export function scoreSpawnCandidate(args){return scoreCandidate(SPAWN_POLICY,args);}
export function chooseSafeSpawn(args){return chooseSafeSpawnFromPoints(SPAWN_POLICY,TEAM_SPAWN_POINTS,FFA_SPAWN_POINTS,args);}
