import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom, __test } from '../worker.js';
import { DEFAULT_WORLD_SETTINGS, PROTOCOL_VERSION, CROUCH_HEIGHT, CROUCH_SPEED_MULTIPLIER, WEAPON_ACCURACY } from '../game-config.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS, STATIC_BOXES, BUILDING_PARTS, terrainHeight, worldSupportHeight } from '../world-geometry.js';

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
  assert.equal(PROTOCOL_VERSION, 34);
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


class MemoryStorage {
  constructor(){ this.map=new Map(); }
  async get(key){ return this.map.get(key); }
  async put(key,value){ this.map.set(key, structuredClone(value)); }
}

function ticketRoom(){
  return new GameRoom({ getWebSockets:()=>[], storage:new MemoryStorage() }, {});
}

test('join ticket format is opaque and short-lived', () => {
  const ticket = __test.makeJoinTicket();
  assert.match(ticket, /^[a-f0-9]{48}$/);
  assert.equal(__test.safeJoinTicket(ticket + 'ZZ'), ticket);
  assert.equal(__test.JOIN_TICKET_TTL_MS, 30000);
});

test('join ticket is single-use', async () => {
  const room=ticketRoom();
  const meta={clientAuthHashes:{}};
  const result=await room.issueJoinTicket(meta,{protocol:PROTOCOL_VERSION,client:'player1',auth:'a'.repeat(64),name:'Player One',team:'red'},1000);
  assert.equal(result.status,201);
  const first=await room.consumeJoinTicket(result.data.ticket,1100);
  assert.equal(first.clientId,'player1');
  assert.equal(first.team,'red');
  assert.equal(await room.consumeJoinTicket(result.data.ticket,1200),null);
});

test('expired join ticket is rejected', async () => {
  const room=ticketRoom();
  const result=await room.issueJoinTicket({clientAuthHashes:{}},{protocol:PROTOCOL_VERSION,client:'player2',auth:'b'.repeat(64),name:'P2',team:'blue'},1000);
  assert.equal(await room.consumeJoinTicket(result.data.ticket,1000+__test.JOIN_TICKET_TTL_MS+1),null);
});

test('ticket issuance does not register a new permanent identity', async () => {
  const room=ticketRoom();
  const meta={clientAuthHashes:{}};
  await room.issueJoinTicket(meta,{protocol:PROTOCOL_VERSION,client:'newplayer',auth:'c'.repeat(64),name:'New',team:'blue'},1000);
  assert.deepEqual(meta.clientAuthHashes,{});
});

test('shotgun reload advances exactly one shell per interval', () => {
  const room=fakeRoom();
  const player={weapon:'shotgun',reloadWeapon:'shotgun',reloadAt:1000,ammo:{pistol:12,assault:12,shotgun:2,sniper:12},combatRev:0};
  const first=room.advanceReloadState(player,1000,DEFAULT_WORLD_SETTINGS);
  assert.equal(player.ammo.shotgun,3);
  assert.equal(first.shellLoaded,true);
  assert.equal(first.continues,true);
  assert.equal(player.reloadAt,1000+DEFAULT_WORLD_SETTINGS.weapons.shotgun.reloadMs);
});

test('shotgun reload stops at magazine capacity', () => {
  const room=fakeRoom();
  const player={weapon:'shotgun',reloadWeapon:'shotgun',reloadAt:1000,ammo:{pistol:12,assault:12,shotgun:5,sniper:12},combatRev:0};
  const result=room.advanceReloadState(player,1000,DEFAULT_WORLD_SETTINGS);
  assert.equal(player.ammo.shotgun,6);
  assert.equal(result.completed,true);
  assert.equal(player.reloadAt,0);
  assert.equal(player.reloadWeapon,'');
});

test('weapon switch lock matches client prediction', () => {
  assert.equal(__test.WEAPON_SWITCH_LOCK_MS,120);
});


test('crouch can clear a window sill while standing cannot', () => {
  const sill = BUILDING_PARTS.find((part) => part.crouchPassable && part.playerSolid);
  assert.ok(sill, 'expected at least one crouch-passable window sill');
  const y = sill.bottomY;
  assert.equal(__test.worldBlocked(sill.x, sill.z, PLAYER_RADIUS, y, PLAYER_HEIGHT, false), true);
  assert.equal(__test.worldBlocked(sill.x, sill.z, PLAYER_RADIUS, y, CROUCH_HEIGHT, true), false);
});

test('crouch reduces authoritative movement allowance', () => {
  const room = fakeRoom();
  const standing = basePlayer(90, 90);
  standing.moveCredit = 0;
  const crouching = {...standing, crouched: false};
  const stand = room.validateHumanState(standing, {
    x: standing.x + 2, y: standing.y, z: standing.z, yaw: 0, pitch: 0, ads: false,
    crouched: false, grounded: true, jumpSeq: 0, clientAt: 1100,
  }, 1100, DEFAULT_WORLD_SETTINGS);
  const crouch = room.validateHumanState(crouching, {
    x: crouching.x + 2, y: crouching.y, z: crouching.z, yaw: 0, pitch: 0, ads: false,
    crouched: true, grounded: true, jumpSeq: 0, clientAt: 1100,
  }, 1100, DEFAULT_WORLD_SETTINGS);
  const standTravel = Math.hypot(stand.player.x-standing.x, stand.player.z-standing.z);
  const crouchTravel = Math.hypot(crouch.player.x-crouching.x, crouch.player.z-crouching.z);
  assert.ok(crouchTravel < standTravel);
  assert.ok(crouchTravel <= standTravel * CROUCH_SPEED_MULTIPLIER + 0.08);
});

test('ADS spread is tighter than hip fire for every weapon', () => {
  for (const weapon of Object.keys(WEAPON_ACCURACY)) {
    const hip = __test.weaponSpreadRadians({ads:false,crouched:false,moveSpeed:0}, weapon, DEFAULT_WORLD_SETTINGS);
    const ads = __test.weaponSpreadRadians({ads:true,crouched:false,moveSpeed:0}, weapon, DEFAULT_WORLD_SETTINGS);
    assert.ok(ads < hip, `${weapon} ADS should tighten spread`);
  }
});

test('movement widens spread and crouch provides a stability bonus', () => {
  const stationary = __test.weaponSpreadRadians({ads:false,crouched:false,moveSpeed:0}, 'assault', DEFAULT_WORLD_SETTINGS);
  const moving = __test.weaponSpreadRadians({ads:false,crouched:false,moveSpeed:DEFAULT_WORLD_SETTINGS.movement.runSpeed}, 'assault', DEFAULT_WORLD_SETTINGS);
  const crouched = __test.weaponSpreadRadians({ads:false,crouched:true,moveSpeed:0}, 'assault', DEFAULT_WORLD_SETTINGS);
  assert.ok(moving > stationary);
  assert.ok(crouched < stationary);
});

test('swept projectile hit volume covers the visible lower body', () => {
  const target={x:0,y:0,z:0,crouched:false};
  const hit=__test.projectileSegmentHitZone(target,-1,.18,0,1,.18,0);
  assert.ok(hit,'expected a lower-leg shot to intersect the player');
  assert.equal(hit.zone,'body');
  assert.ok(hit.t>=0&&hit.t<=1);
});

test('window opening is projectile-clear while the wall below it remains solid', () => {
  const sill=BUILDING_PARTS.find(part=>part.role==='wall'&&part.crouchPassable&&part.projectileSolid!==false);
  assert.ok(sill,'expected a projectile-solid lower window wall');
  const horizontalWall=sill.w>sill.d;
  const clearY=sill.topY+.28;
  const blockedY=Math.max(sill.bottomY+.04,sill.topY-.10);
  const clear=horizontalWall
    ? __test.segmentFirstObstacleT(sill.x,clearY,sill.z-.8,sill.x,clearY,sill.z+.8)
    : __test.segmentFirstObstacleT(sill.x-.8,clearY,sill.z,sill.x+.8,clearY,sill.z);
  const blocked=horizontalWall
    ? __test.segmentFirstObstacleT(sill.x,blockedY,sill.z-.8,sill.x,blockedY,sill.z+.8)
    : __test.segmentFirstObstacleT(sill.x-.8,blockedY,sill.z,sill.x+.8,blockedY,sill.z);
  assert.equal(clear,null,'the visible window opening should not contain hidden projectile collision');
  assert.notEqual(blocked,null,'the wall below the window should still block bullets');
});

test('player intersection can occur before cover on the same bullet segment', () => {
  const box=STATIC_BOXES[0];
  const base=terrainHeight(box.x,box.z);
  const target={x:box.x,y:base,z:box.z-box.d/2-.72,crouched:false};
  const z1=target.z-1.2,z2=box.z-box.d/2+.25,y=base+1.0;
  const hit=__test.projectileSegmentHitZone(target,box.x,y,z1,box.x,y,z2);
  const wallT=__test.segmentFirstObstacleT(box.x,y,z1,box.x,y,z2);
  assert.ok(hit&&wallT!=null);
  assert.ok(hit.t<wallT,`expected player ${hit.t} before wall ${wallT}`);
});

test('solid cover remains first when a player is behind it', () => {
  const box=STATIC_BOXES[0];
  const base=terrainHeight(box.x,box.z);
  const target={x:box.x,y:base,z:box.z+box.d/2+.72,crouched:false};
  const z1=box.z-box.d/2-.8,z2=target.z+1.0,y=base+1.0;
  const hit=__test.projectileSegmentHitZone(target,box.x,y,z1,box.x,y,z2);
  const wallT=__test.segmentFirstObstacleT(box.x,y,z1,box.x,y,z2);
  assert.ok(hit&&wallT!=null);
  assert.ok(wallT<hit.t,`expected wall ${wallT} before player ${hit.t}`);
});
