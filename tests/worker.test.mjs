import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom, __test } from '../worker.js';
import { DEFAULT_WORLD_SETTINGS, PROTOCOL_VERSION } from '../game-config.js';
import { STATIC_BOXES, terrainHeight, worldSupportHeight } from '../world-geometry.js';

function fakeRoom() {
  return new GameRoom({ getWebSockets: () => [], storage: {} }, {});
}

function basePlayer(x = 0, z = 0, y = worldSupportHeight(x, z)) {
  return {
    clientId: 'tester', x, y, z, yaw: 0, pitch: 0, ads: false,
    hp: 100, wastedUntil: 0, moveCredit: 10, lastStateAt: 1000,
    lastClientStateAt: 1000, verticalVelocity: 0, serverGrounded: true,
    lastVerticalAt: 1000, lastJumpSeq: 0, flashUntil: 0, flashPower: 0,
    flashDurationMs: 0,
  };
}

test('protocol is the hardened revision', () => {
  assert.equal(PROTOCOL_VERSION, 32);
});

test('room codes use the expected alphabet and length', () => {
  for (let i = 0; i < 200; i += 1) assert.match(__test.makeRoomCode(), /^[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(__test.normalizeRoomCode(' o1-ilZ9! '), 'LZ9');
});

test('world settings clamp unsafe movement values', () => {
  const settings = __test.normalizeWorldSettings({ movement: { runSpeed: 999, walkSpeed: 999, jumpHeight: 99, gravity: 1 } });
  assert.equal(settings.movement.runSpeed, 16);
  assert.equal(settings.movement.walkSpeed, 9);
  assert.equal(settings.movement.jumpHeight, 5);
  assert.equal(settings.movement.gravity, 8);
});

test('flash power decays on the server', () => {
  const p = { flashUntil: 4000, flashDurationMs: 2000, flashPower: 1 };
  assert.equal(__test.activeFlashPower(p, 2000), 1);
  assert.ok(__test.activeFlashPower(p, 3000) > 0.49 && __test.activeFlashPower(p, 3000) < 0.51);
  assert.equal(__test.activeFlashPower(p, 4000), 0);
});

test('modified client cannot hover by submitting arbitrary Y', () => {
  const room = fakeRoom();
  const me = basePlayer();
  const support = me.y;
  const result = room.validateHumanState(me, {
    x: me.x, y: support + 1.5, z: me.z, yaw: 0, pitch: 0, ads: false,
    grounded: false, jumpSeq: 0, clientAt: 1050,
  }, 1050, DEFAULT_WORLD_SETTINGS);
  assert.ok(Math.abs(result.player.y - support) < 0.02);
  assert.equal(result.verticalCorrected, true);
});

test('jump begins only from explicit sequence while grounded', () => {
  const room = fakeRoom();
  const me = basePlayer();
  const result = room.validateHumanState(me, {
    x: me.x, y: me.y, z: me.z, yaw: 0, pitch: 0, ads: false,
    grounded: false, jumpSeq: 1, clientAt: 1050,
  }, 1050, DEFAULT_WORLD_SETTINGS);
  assert.equal(result.player.serverGrounded, false);
  assert.ok(result.player.verticalVelocity > 0);
  assert.equal(result.player.lastJumpSeq, 1);
});

test('leaving a raised support starts a fall instead of snapping to terrain', () => {
  const room = fakeRoom();
  const box = STATIC_BOXES.find((item) => item.w >= 2 && item.h >= 1);
  assert.ok(box);
  const top = terrainHeight(box.x, box.z) + box.h;
  const startX = box.x + box.w / 2 - 0.03;
  const startZ = box.z;
  const me = basePlayer(startX, startZ, top);
  me.moveCredit = 20;
  const desiredX = box.x + box.w / 2 + 0.55;
  const result = room.validateHumanState(me, {
    x: desiredX, y: top, z: startZ, yaw: 0, pitch: 0, ads: false,
    grounded: false, jumpSeq: 0, clientAt: 1100,
  }, 1100, DEFAULT_WORLD_SETTINGS);
  const lowerGround = terrainHeight(result.player.x, result.player.z);
  assert.equal(result.player.serverGrounded, false);
  assert.ok(result.player.y > lowerGround + 0.2, `expected gravity fall above ${lowerGround}, got ${result.player.y}`);
});
