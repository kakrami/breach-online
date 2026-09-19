import { spawnPointCountFor, spawnForModeFromPoints, scoreSpawnCandidate as scoreCandidate, chooseSafeSpawnFromPoints } from './spawn-scoring.js';

// Compact-map spawns use many perimeter candidates instead of one fixed home
// corner. The safety scorer picks the least dangerous viable point every life.
export const TEAM_SPAWN_POINTS = Object.freeze({
  blue:Object.freeze([[-30,-29],[-30,-16],[-30,15],[-29,29],[-18,-30],[-15,30],[-7,-30],[-29,6],[-22,29],[-30,-4]]),
  red:Object.freeze([[30,29],[30,16],[30,-15],[29,-29],[18,30],[15,-30],[7,30],[29,-6],[22,-29],[30,4]]),
});
export const FFA_SPAWN_POINTS = Object.freeze([
  ...TEAM_SPAWN_POINTS.blue,...TEAM_SPAWN_POINTS.red,
  [-7,29],[7,-29],[-29,23],[29,-23],[-23,-29],[23,29]
]);

export const SPAWN_POLICY = Object.freeze({
  allowTeamFlip:true,
  minActorSeparation:2.2,
  occupiedSpawnPenalty:750000,
  minEnemyDistance:13,
  lineOfSightDistance:32,
  facingThreatDistance:38,
  approachThreatDistance:42,
  nearEnemyDistance:19,
  zoneRadius:27,
  recentDeathRadius:12,
  recentSpawnRadius:10,
  projectileThreatRadius:8,
  throwableThreatRadius:10,
  gunfireRadius:21,
  explosionRadius:17,
  enemyDistanceCap:120,
  enemyDistanceWeight:195,
  visibleEnemyPenalty:66000,
  facingEnemyPenalty:17000,
  approachingEnemyPenalty:24000,
  nearEnemyPenalty:9000,
  zoneControlWeight:14500,
  allyIdealMin:7,
  allyIdealMax:16,
  allySupportWeight:6500,
  allyTooCloseDistance:3.6,
  emergencyProtectionMs:850,
  facingThreatCos:Math.cos(58*Math.PI/180),
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
  anyDistanceCap:45,
  anyDistanceWeight:8,
  allySupportFade:30,
  allyTooClosePenalty:9000,
  projectileLookaheadSec:.38,
  throwableLookaheadSec:.65,
});

export function spawnPointCount(mode,team='blue'){return spawnPointCountFor(mode,team,TEAM_SPAWN_POINTS,FFA_SPAWN_POINTS);}
export function spawnForMode(mode,team,index,terrainHeight){return spawnForModeFromPoints(mode,team,index,terrainHeight,TEAM_SPAWN_POINTS,FFA_SPAWN_POINTS);}
export function scoreSpawnCandidate(args){return scoreCandidate(SPAWN_POLICY,args);}
export function chooseSafeSpawn(args){return chooseSafeSpawnFromPoints(SPAWN_POLICY,TEAM_SPAWN_POINTS,FFA_SPAWN_POINTS,args);}
