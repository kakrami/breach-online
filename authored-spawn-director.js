import { spawnPointCountFor, spawnForModeFromPoints, scoreSpawnCandidate as scoreCandidate, chooseSafeSpawnFromPoints } from './spawn-scoring.js';
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
export function createAuthoredSpawnDirector(def={}){
  const raw=def?.spawnSets||{},clean=list=>(Array.isArray(list)?list:[]).filter(p=>Array.isArray(p)&&p.length>=2).map(p=>Object.freeze([finite(p[0]),finite(p[1])])),blue=Object.freeze(clean(raw.blue)),red=Object.freeze(clean(raw.red)),ffa=Object.freeze(clean(raw.ffa).length?clean(raw.ffa):[...blue,...red]);
  const TEAM_SPAWN_POINTS=Object.freeze({blue,red}),FFA_SPAWN_POINTS=ffa,SPAWN_POLICY=Object.freeze({...def?.spawnPolicy});
  return {TEAM_SPAWN_POINTS,FFA_SPAWN_POINTS,SPAWN_POLICY,spawnPointCount:(mode,team='blue')=>spawnPointCountFor(mode,team,TEAM_SPAWN_POINTS,FFA_SPAWN_POINTS),spawnForMode:(mode,team,index,terrainHeight)=>spawnForModeFromPoints(mode,team,index,terrainHeight,TEAM_SPAWN_POINTS,FFA_SPAWN_POINTS),scoreSpawnCandidate:args=>scoreCandidate(SPAWN_POLICY,args),chooseSafeSpawn:args=>chooseSafeSpawnFromPoints(SPAWN_POLICY,TEAM_SPAWN_POINTS,FFA_SPAWN_POINTS,args)};
}
