import { MOON_MAP_DEFINITION } from './authored-map-moon.js';
import { createAuthoredSpawnDirector } from './authored-spawn-director.js';
export const {TEAM_SPAWN_POINTS,FFA_SPAWN_POINTS,SPAWN_POLICY,spawnPointCount,spawnForMode,scoreSpawnCandidate,chooseSafeSpawn}=createAuthoredSpawnDirector(MOON_MAP_DEFINITION);
