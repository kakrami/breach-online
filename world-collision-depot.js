import * as world from './world-geometry-depot.js';
import { createAuthoredWorldCollision } from './authored-world-collision.js';
export const {worldBlockerAt,worldBlockedAt,worldMoveBlockedAt,worldHeightExpansionBlockedAt,findTraversalCandidate,collisionDebugStats}=createAuthoredWorldCollision(world);
