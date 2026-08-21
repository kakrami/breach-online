import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectileCollisionGrid } from '../../2_CLIENT_REPO_UPLOAD/collision-grid.js';
import { STATIC_BOXES, PYRAMIDS, NATURAL_OBSTACLES, BUILDING_PARTS, terrainHeight, naturalGroundBase } from '../world-geometry.js';

const grid=createProjectileCollisionGrid({
  staticBoxes:STATIC_BOXES,
  pyramids:PYRAMIDS,
  naturalObstacles:NATURAL_OBSTACLES,
  buildingParts:BUILDING_PARTS,
  terrainHeight,
  naturalGroundBase,
  cellSize:8,
  cellHeight:3,
});

test('trajectory projectile index contains the static projectile world',()=>{
  assert.ok(grid.entryCount>STATIC_BOXES.length+PYRAMIDS.length+NATURAL_OBSTACLES.length);
});

test('trajectory index preserves open windows and solid sills',()=>{
  const sill=BUILDING_PARTS.find(part=>part.role==='wall'&&part.crouchStep&&part.projectileSolid!==false);
  assert.ok(sill,'expected a window sill');
  const horizontal=sill.w>sill.d;
  const clearY=sill.topY+.28,blockedY=Math.max(sill.bottomY+.04,sill.topY-.10);
  const clear=horizontal
    ? grid.firstHitT(sill.x,clearY,sill.z-.8,sill.x,clearY,sill.z+.8)
    : grid.firstHitT(sill.x-.8,clearY,sill.z,sill.x+.8,clearY,sill.z);
  const blocked=horizontal
    ? grid.firstHitT(sill.x,blockedY,sill.z-.8,sill.x,blockedY,sill.z+.8)
    : grid.firstHitT(sill.x-.8,blockedY,sill.z,sill.x+.8,blockedY,sill.z);
  assert.equal(clear,null);
  assert.notEqual(blocked,null);
});

test('trajectory index intersects boxes, round obstacles, and pyramids',()=>{
  const box=STATIC_BOXES[0],boxY=terrainHeight(box.x,box.z)+Math.min(1,box.h*.5);
  assert.notEqual(grid.firstHitT(box.x-box.w,boxY,box.z,box.x+box.w,boxY,box.z),null);

  const round=NATURAL_OBSTACLES.find(o=>o.type==='tree');
  const roundBase=naturalGroundBase(round.type,round.x,round.z,round.r),roundY=roundBase+Math.min(1,round.h*.5);
  assert.notEqual(grid.firstHitT(round.x-round.r-1,roundY,round.z,round.x+round.r+1,roundY,round.z),null);

  const pyramid=PYRAMIDS[0],pyramidY=terrainHeight(pyramid.x,pyramid.z)+pyramid.h*.35;
  assert.notEqual(grid.firstHitT(pyramid.x-pyramid.base,pyramidY,pyramid.z,pyramid.x+pyramid.base,pyramidY,pyramid.z),null);
});
