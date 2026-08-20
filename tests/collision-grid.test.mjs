import test from 'node:test';
import assert from 'node:assert/strict';
import { createObstacleGrid } from '../../2_CLIENT_REPO_UPLOAD/collision-grid.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '../world-geometry.js';

function collides(obstacle, x, z, y) {
  const vertical = y + PLAYER_HEIGHT * 0.92 > obstacle.minY && y < obstacle.maxY - 0.04;
  if (!vertical) return false;
  if (obstacle.type === 'box') return x > obstacle.minX && x < obstacle.maxX && z > obstacle.minZ && z < obstacle.maxZ;
  return Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.r;
}

test('center-cell lookup still sees radius-expanded obstacle across an 8m seam', () => {
  const index = createObstacleGrid({ cellSize: 8, cellHeight: 3, playerHeight: PLAYER_HEIGHT });
  const wall = {
    type: 'box', minX: 8.12 - PLAYER_RADIUS, maxX: 8.42 + PLAYER_RADIUS,
    minZ: -2 - PLAYER_RADIUS, maxZ: 2 + PLAYER_RADIUS, minY: 0, maxY: 3,
  };
  index.register(wall);
  const x = 7.98, z = 0, y = 0;
  assert.equal(Math.floor(x / 8), 0);
  assert.ok(collides(wall, x, z, y));
  assert.ok(index.nearby(x, z, y).includes(wall));
});

test('grid lookup has no false negatives for registered expanded obstacles', () => {
  const index = createObstacleGrid({ cellSize: 8, cellHeight: 3, playerHeight: PLAYER_HEIGHT });
  const obstacles = [];
  for (let i = 0; i < 120; i += 1) {
    const x = -32 + (i * 5.37) % 64;
    const z = -32 + (i * 7.91) % 64;
    const w = 0.5 + (i % 7) * 0.31;
    const d = 0.6 + (i % 5) * 0.27;
    const obstacle = {
      type: 'box', minX: x - w / 2 - PLAYER_RADIUS, maxX: x + w / 2 + PLAYER_RADIUS,
      minZ: z - d / 2 - PLAYER_RADIUS, maxZ: z + d / 2 + PLAYER_RADIUS,
      minY: 0, maxY: 2.6,
    };
    obstacles.push(obstacle);
    index.register(obstacle);
  }
  for (let xi = -320; xi <= 320; xi += 4) {
    const x = xi / 10;
    for (let zi = -320; zi <= 320; zi += 4) {
      const z = zi / 10;
      const expected = obstacles.filter((obstacle) => collides(obstacle, x, z, 0));
      if (!expected.length) continue;
      const candidates = new Set(index.nearby(x, z, 0));
      for (const obstacle of expected) assert.ok(candidates.has(obstacle), `grid miss at ${x},${z}`);
    }
  }
});
