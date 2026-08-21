import test from 'node:test';
import assert from 'node:assert/strict';
import { GameRoom, __test } from '../worker.js';
import { DEFAULT_WORLD_SETTINGS, PROTOCOL_VERSION, CROUCH_HEIGHT, CROUCH_SPEED_MULTIPLIER, WEAPON_ACCURACY } from '../game-config.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS, STATIC_BOXES, BUILDING_PARTS, NATURAL_OBSTACLES, terrainHeight, naturalGroundBase, worldSupportHeight } from '../world-geometry.js';

function fakeRoom() {
  return new GameRoom({ getWebSockets: () => [], storage: {} }, {});
}

function basePlayer(x = 0, z = 0, y = worldSupportHeight(x, z)) {
  return {
    clientId: 'tester', x, y, z, yaw: 0, pitch: 0, ads: false,
    hp: 100, wastedUntil: 0, lastStateAt: 1000,
    knockVelocityX: 0, knockVelocityZ: 0, verticalVelocity: 0, serverGrounded: true,
    lastVerticalAt: 1000, lastJumpSeq: 0, flashUntil: 0, flashPower: 0,
    flashDurationMs: 0,
  };
}

test('protocol is the hardened revision', () => {
  assert.equal(PROTOCOL_VERSION, 36);
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

test('client timestamps cannot increase authoritative movement distance', () => {
  const room = fakeRoom();
  const normal = basePlayer(90, 90);
  const forged = structuredClone(normal);
  const payload = {
    x: 95, y: normal.y, z: 90, yaw: 0, pitch: 0, ads: false, crouched: false,
    moveX: 1, moveZ: 0, grounded: true, jumpSeq: 0,
  };
  const a = room.validateHumanState(normal, {...payload, clientAt: 1033}, 1033, DEFAULT_WORLD_SETTINGS);
  const b = room.validateHumanState(forged, {...payload, clientAt: 999999999}, 1033, DEFAULT_WORLD_SETTINGS);
  const da = Math.hypot(a.player.x-normal.x, a.player.z-normal.z);
  const db = Math.hypot(b.player.x-forged.x, b.player.z-forged.z);
  assert.ok(Math.abs(da-db) < 1e-9);
  assert.ok(da <= DEFAULT_WORLD_SETTINGS.movement.runSpeed * .033 + .01);
});

test('server applies horizontal knockback even if the client reports no displacement', () => {
  const room = fakeRoom();
  const me = basePlayer(90, 90);
  me.knockVelocityX = 2.4;
  const result = room.validateHumanState(me, {
    x: me.x, y: me.y, z: me.z, yaw: 0, pitch: 0, ads: false, crouched: false,
    moveX: 0, moveZ: 0, grounded: true, jumpSeq: 0, clientAt: 1100,
  }, 1100, DEFAULT_WORLD_SETTINGS);
  assert.ok(result.player.x > me.x + .05);
  assert.ok(result.player.knockVelocityX < me.knockVelocityX);
});

test('first movement input after idle cannot consume the whole idle interval', () => {
  const room=fakeRoom(),me=basePlayer(90,90);
  const predicted=0.08;
  const result=room.validateHumanState(me,{
    x:me.x+predicted,y:me.y,z:me.z,yaw:0,pitch:0,ads:false,crouched:false,
    moveX:1,moveZ:0,grounded:true,jumpSeq:0,clientAt:1250,
  },1250,DEFAULT_WORLD_SETTINGS);
  const moved=result.player.x-me.x;
  assert.ok(moved<=predicted+.01,`movement start lurched ${moved}m`);
  assert.ok(moved>0);
});

test('position spoofing without movement input cannot move the player', () => {
  const room=fakeRoom(),me=basePlayer(90,90);
  const result=room.validateHumanState(me,{
    x:99,y:me.y,z:99,yaw:0,pitch:0,ads:false,crouched:false,
    moveX:0,moveZ:0,grounded:true,jumpSeq:0,clientAt:1250,
  },1250,DEFAULT_WORLD_SETTINGS);
  assert.ok(Math.hypot(result.player.x-me.x,result.player.z-me.z)<1e-9);
  assert.equal(result.corrected,true);
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

test('server static-box collision top matches the visible walkable top', () => {
  const box=STATIC_BOXES[0],base=terrainHeight(box.x,box.z),top=base+box.h;
  assert.equal(__test.worldBlocked(box.x,box.z,PLAYER_RADIUS,base,PLAYER_HEIGHT),true);
  assert.equal(__test.worldBlocked(box.x,box.z,PLAYER_RADIUS,top,PLAYER_HEIGHT),false);
});

test('server natural-obstacle vertical extent matches the client collision extent', () => {
  const rock=NATURAL_OBSTACLES.find((o)=>o.type==='rock');
  const base=naturalGroundBase(rock.type,rock.x,rock.z,rock.r);
  assert.equal(__test.worldBlocked(rock.x,rock.z,PLAYER_RADIUS,base+rock.h+.12,CROUCH_HEIGHT),true);
  assert.equal(__test.worldBlocked(rock.x,rock.z,PLAYER_RADIUS,base+rock.h+.23,CROUCH_HEIGHT),false);
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
    moveX: 1, moveZ: 0, grounded: false, jumpSeq: 0, clientAt: 1100,
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

test('join ticket issuance is rate-limited before it can keep writing room storage', async () => {
  const room=ticketRoom(),meta={clientAuthHashes:{}};
  for(let i=0;i<__test.JOIN_TICKET_RATE_MAX_PER_CLIENT;i++){
    const result=await room.issueJoinTicket(meta,{protocol:PROTOCOL_VERSION,client:'ratelimited',auth:'d'.repeat(64),name:'Rate',team:'blue'},1000+i);
    assert.equal(result.status,201);
  }
  const blocked=await room.issueJoinTicket(meta,{protocol:PROTOCOL_VERSION,client:'ratelimited',auth:'d'.repeat(64),name:'Rate',team:'blue'},1020);
  assert.equal(blocked.status,429);
});

test('loadout restricts players to pistol plus one selected primary', () => {
  const player={primaryWeapon:'sniper'};
  assert.equal(__test.playerCanEquip(player,'pistol'),true);
  assert.equal(__test.playerCanEquip(player,'sniper'),true);
  assert.equal(__test.playerCanEquip(player,'assault'),false);
  assert.equal(__test.playerCanEquip(player,'shotgun'),false);
  assert.equal(__test.safePrimaryWeapon('not-a-gun'),'assault');
});

test('match lifecycle owns team score independently of connected-player kill totals', () => {
  const room=fakeRoom(),now=1000;
  const meta={match:__test.defaultMatchState(now),custom:false};room.metaCache=meta;room.bots=[];room.broadcast=()=>{};
  room.findCombatant=(id)=>id==='a'?{id:'a',team:'blue',godMode:false}:{id:'b',team:'red',godMode:false};
  assert.equal(room.startWarmupIfWaiting(meta,now),true);
  room.stepMatch(now+5000,meta);
  assert.equal(meta.match.status,'active');
  room.recordMatchKill('a','b',now+5100);
  assert.equal(meta.match.blueScore,1);
  assert.equal(meta.match.redScore,0);
});

test('god-mode eliminations do not advance the competitive match score', () => {
  const room=fakeRoom(),now=1000,match={...__test.defaultMatchState(now),status:'active',startedAt:now,endsAt:now+600000};
  const meta={match,custom:true};room.metaCache=meta;room.bots=[];room.broadcast=()=>{};
  room.findCombatant=(id)=>id==='a'?{id:'a',team:'blue',godMode:true}:{id:'b',team:'red',godMode:false};
  room.recordMatchKill('a','b',now+100);
  assert.equal(meta.match.blueScore,0);
});

test('queued team switch applies only when the next round respawns the player', () => {
  let attachment={clientId:'tester',team:'blue',pendingTeam:'red',primaryWeapon:'shotgun',weapon:'pistol',hp:37,kills:4,deaths:2,combatRev:2};
  const socket={deserializeAttachment:()=>attachment,serializeAttachment:(next)=>{attachment=next;},send:()=>{}};
  const room=new GameRoom({getWebSockets:()=>[socket],storage:{}},{});room.bots=[];room.broadcast=()=>{};
  const meta={match:{...__test.defaultMatchState(1000),status:'ended',round:1,scoreLimit:30,timeLimitMs:480000},blueBots:0,redBots:0,custom:false};
  room.resetRound(meta,2000);
  assert.equal(attachment.team,'red');
  assert.equal(attachment.pendingTeam,'');
  assert.equal(attachment.primaryWeapon,'shotgun');
  assert.equal(attachment.weapon,'shotgun');
  assert.equal(attachment.hp,100);
  assert.equal(attachment.kills,0);
  assert.equal(attachment.deaths,0);
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


test('crouch traverses windows by stepping onto the sill, never by disabling sill collision', () => {
  const sill = BUILDING_PARTS.find((part) => part.crouchStep && part.playerSolid);
  assert.ok(sill, 'expected at least one crouch-step window sill');
  const y = sill.bottomY;
  assert.equal(__test.worldBlocked(sill.x, sill.z, PLAYER_RADIUS, y, PLAYER_HEIGHT), true);
  assert.equal(__test.worldBlocked(sill.x, sill.z, PLAYER_RADIUS, y, CROUCH_HEIGHT), true, 'crouching at floor height must not noclip through the sill');
  assert.ok(worldSupportHeight(sill.x, sill.z, y, false) < sill.topY - .1, 'standing should not auto-step onto the sill');
  assert.ok(Math.abs(worldSupportHeight(sill.x, sill.z, y, true) - sill.topY) < .02, 'crouching should expose the window sill as a valid step');
  assert.equal(__test.worldBlocked(sill.x, sill.z, PLAYER_RADIUS, sill.topY, CROUCH_HEIGHT), false, 'once physically on the sill the window opening should be clear');
});

test('authoritative movement crosses a window only while crouched', () => {
  const sill = BUILDING_PARTS.find((part) => part.crouchStep && part.playerSolid);
  assert.ok(sill);
  const horizontal = sill.w > sill.d;
  const offset = (horizontal ? sill.d : sill.w) / 2 + PLAYER_RADIUS + .08;
  let sx=sill.x, sz=sill.z, ex=sill.x, ez=sill.z;
  if(horizontal){ sz-=offset; ez+=offset; } else { sx-=offset; ex+=offset; }
  const y=terrainHeight(sx,sz);
  const run=(crouched)=>{
    const room=fakeRoom(),me=basePlayer(sx,sz,y);me.crouched=crouched;
    const vx=ex-sx,vz=ez-sz,n=Math.hypot(vx,vz)||1;
    return room.validateHumanState(me,{x:ex,y,z:ez,yaw:0,pitch:0,ads:false,crouched,moveX:vx/n,moveZ:vz/n,grounded:true,jumpSeq:0,clientAt:1150},1150,DEFAULT_WORLD_SETTINGS);
  };
  const standing=run(false),ducking=run(true);
  const standingCrossed=horizontal?standing.player.z>sill.z:standing.player.x>sill.x;
  const crouchedCrossed=horizontal?ducking.player.z>sill.z:ducking.player.x>sill.x;
  assert.equal(standingCrossed,false);
  assert.equal(crouchedCrossed,true);
});

test('every generated building wall remains solid to a crouched body at its base', () => {
  const walls=BUILDING_PARTS.filter((part)=>part.role==='wall'&&part.playerSolid);
  assert.ok(walls.length>300);
  for(const wall of walls){
    assert.equal(__test.worldBlocked(wall.x,wall.z,PLAYER_RADIUS,wall.bottomY,CROUCH_HEIGHT),true,`crouched wall collision missing at ${wall.x},${wall.z}`);
  }
});

test('crouch never disables walls, boxes, or natural obstacle collision', () => {
  const wall=BUILDING_PARTS.find((part)=>part.role==='wall'&&!part.crouchStep&&part.playerSolid);
  assert.ok(wall);
  assert.equal(__test.worldBlocked(wall.x,wall.z,PLAYER_RADIUS,wall.bottomY,CROUCH_HEIGHT),true);
  const box=STATIC_BOXES[0],boxY=terrainHeight(box.x,box.z);
  assert.equal(__test.worldBlocked(box.x,box.z,PLAYER_RADIUS,boxY,CROUCH_HEIGHT),true);
  const natural=NATURAL_OBSTACLES.find((o)=>o.type==='rock');
  const naturalY=terrainHeight(natural.x,natural.z);
  assert.equal(__test.worldBlocked(natural.x,natural.z,PLAYER_RADIUS,naturalY,CROUCH_HEIGHT),true);
});

test('crouch reduces authoritative movement allowance', () => {
  const room = fakeRoom();
  const standing = basePlayer(90, 90);
  const crouching = {...standing, crouched: false};
  const stand = room.validateHumanState(standing, {
    x: standing.x + 2, y: standing.y, z: standing.z, yaw: 0, pitch: 0, ads: false,
    crouched: false, moveX: 1, moveZ: 0, grounded: true, jumpSeq: 0, clientAt: 1100,
  }, 1100, DEFAULT_WORLD_SETTINGS);
  const crouch = room.validateHumanState(crouching, {
    x: crouching.x + 2, y: crouching.y, z: crouching.z, yaw: 0, pitch: 0, ads: false,
    crouched: true, moveX: 1, moveZ: 0, grounded: true, jumpSeq: 0, clientAt: 1100,
  }, 1100, DEFAULT_WORLD_SETTINGS);
  const standTravel = Math.hypot(stand.player.x-standing.x, stand.player.z-standing.z);
  const crouchTravel = Math.hypot(crouch.player.x-crouching.x, crouch.player.z-crouching.z);
  assert.ok(crouchTravel < standTravel);
  assert.ok(crouchTravel <= standTravel * CROUCH_SPEED_MULTIPLIER + 0.08);
});

test('fixed-step simulation catches up idle time instead of slowing bots', async () => {
  const room = fakeRoom();
  room.bots = [];
  room.lastSimAt = 1000;
  room.simAccumulatorMs = 0;
  const steps = [];
  room.respawnExpiredHumans = () => {};
  room.stepBots = (at, dt) => steps.push({at,dt});
  room.advanceHumanReloads = () => {};
  room.stepThrowables = () => {};
  room.stepBullets = () => {};
  room.stepRegeneration = () => {};
  room.updateDirectory = async () => {};
  room.liveSockets = () => [];
  await room.stepSimulation(1250, { settings:DEFAULT_WORLD_SETTINGS, expiresAt:9999999, match:{...__test.defaultMatchState(1000),status:'active',startedAt:1000,endsAt:9999999} });
  assert.ok(steps.length >= 7, `expected at least 7 fixed steps, got ${steps.length}`);
  assert.ok(steps.every((s)=>Math.abs(s.dt-__test.SIM_FIXED_STEP_MS/1000)<1e-9));
});

test('throwable integration does not discard time beyond the old 350ms cap', () => {
  const room = fakeRoom();
  room.bots = [];
  room.throwables.set('g1', {
    id:'g1', kind:'flash', ownerId:'tester', ownerTeam:'blue',
    x:90, y:20, z:90, vx:10, vy:0, vz:0,
    born:1000, lastAt:1000, fuseAt:5000, stuck:false, stuckTo:'', lastBroadcast:1000,
  });
  room.stepThrowables(1500, DEFAULT_WORLD_SETTINGS);
  const g = room.throwables.get('g1');
  assert.ok(g.x > 94.8, `expected ~5m horizontal travel, got ${g.x-90}`);
  assert.equal(g.lastAt, 1500);
});

test('terrain blocks authoritative line of sight even when no object is in the ray', () => {
  const from={x:-100,z:-100,y:terrainHeight(-100,-100)};
  const to={x:-80,z:100,y:terrainHeight(-80,100)};
  const obstacle=__test.segmentFirstObstacleT(from.x,from.y+1.28,from.z,to.x,to.y+1.08,to.z);
  assert.equal(obstacle,null);
  assert.equal(__test.actorHasLineOfSight(from,to),false);
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

test('coarse swept sniper segment can penetrate multiple players in one server tick', () => {
  const room=fakeRoom();
  room.bots=[
    {id:'bot-red-1',name:'R1',team:'red',x:90,y:18,z:90,hp:100,wastedUntil:0,kills:0,deaths:0},
    {id:'bot-red-2',name:'R2',team:'red',x:92,y:18,z:90,hp:100,wastedUntil:0,kills:0,deaths:0},
  ];
  room.bullets.set('s1',{
    id:'s1',ownerId:'tester',ownerTeam:'blue',damage:120,weapon:'sniper',penetrationPower:220,
    hitTargets:new Set(),traveledDistance:0,lifetimeMs:3600,x:88,y:19,z:90,vx:180,vy:0,vz:0,born:1000,lastAt:1000,
  });
  room.stepBullets(1033,DEFAULT_WORLD_SETTINGS);
  assert.ok(room.bots[0].hp<100,'first target should be hit');
  assert.ok(room.bots[1].hp<100,'second target should be hit after penetration');
});

test('window opening is projectile-clear while the wall below it remains solid', () => {
  const sill=BUILDING_PARTS.find(part=>part.role==='wall'&&part.crouchStep&&part.projectileSolid!==false);
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
