import * as world from './world-geometry-moon.js';
import { createAuthoredServerCollision } from './authored-server-collision.js';
export const {projectileSegmentHitZone,segmentFirstObstacleT,segmentFirstWorldHitT,segmentFirstWorldOcclusionT,blastHasLineOfSight,segmentHitsObstacle,actorHasLineOfSight}=createAuthoredServerCollision(world);
