import { spawnPointCountFor, spawnForModeFromPoints, scoreSpawnCandidate as scoreCandidate, chooseSafeSpawnFromPoints } from './spawn-scoring.js';

export const TEAM_SPAWN_POINTS = Object.freeze({
  blue:Object.freeze([[-46,-43],[-45,-28],[-46,-10],[-31,-45],[-16,-46],[-45,11],[-41,29],[-28,43],[-10,46],[-43,42]]),
  red:Object.freeze([[46,43],[45,28],[46,10],[31,45],[16,46],[45,-11],[45,-27],[28,-43],[10,-46],[43,-42]]),
});
export const FFA_SPAWN_POINTS = Object.freeze([
  ...TEAM_SPAWN_POINTS.blue,...TEAM_SPAWN_POINTS.red,
  [-46,25],[46,-25],[-25,-46],[25,46],[-45,0],[45,0],[0,-46],[0,46]
]);

export const SPAWN_POLICY = Object.freeze({
  allowTeamFlip:true,
  minActorSeparation:2.2,
  occupiedSpawnPenalty:750000,
  minEnemyDistance:16,
  lineOfSightDistance:44,
  facingThreatDistance:48,
  approachThreatDistance:52,
  nearEnemyDistance:21,
  zoneRadius:34,
  recentDeathRadius:14,
  recentSpawnRadius:12,
  projectileThreatRadius:9,
  throwableThreatRadius:11,
  gunfireRadius:25,
  explosionRadius:20,
  enemyDistanceCap:120,
  enemyDistanceWeight:190,
  visibleEnemyPenalty:62000,
  facingEnemyPenalty:16000,
  approachingEnemyPenalty:22000,
  nearEnemyPenalty:8500,
  zoneControlWeight:13000,
  allyIdealMin:8,
  allyIdealMax:19,
  allySupportWeight:7000,
  allyTooCloseDistance:4,
  emergencyProtectionMs:800,
  facingThreatCos:Math.cos(58*Math.PI/180),
  approachThreatCos:.32,
  enemyPredictionSec:.72,
  predictedEnemyDistance:20,
  minProjectedEnemyDistance:11.5,
  predictedEnemyWeight:30000,
  allyAnchorIdeal:14,
  allyAnchorRange:10,
  allyAnchorWeight:9000,
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
