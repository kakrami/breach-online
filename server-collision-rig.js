import * as world from './world-geometry-rig.js';
import { createAuthoredServerCollision } from './authored-server-collision.js';
export const {projectileSegmentHitZone,segmentFirstObstacleT,segmentFirstWorldHitT,segmentFirstWorldOcclusionT,blastHasLineOfSight,segmentHitsObstacle,actorHasLineOfSight}=createAuthoredServerCollision(world);
