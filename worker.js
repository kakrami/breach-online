import {
  PLAYER_HEIGHT, PLAYER_RADIUS, ARENA_LIMIT, MAX_STEP_HEIGHT, COMBAT_FLOW_NODES, terrainHeight, worldSupportHeight, worldStepUpHeight, resolveCeilingCollision
} from './world-geometry.js';
import {
  APP_VERSION, PROTOCOL_VERSION, ROOM_CODE_LENGTH, MAX_PLAYERS, MAX_BOTS, TEAM_COLORS,
  WEAPON_ORDER, PRIMARY_WEAPONS, WEAPON_SPECS, weaponSpreadRadians, weaponHeatAfterDelay, weaponHeatAfterShot, weaponDamageAtDistance, CROUCH_HEIGHT, CROUCH_SPEED_MULTIPLIER, EQUIPMENT_CAPS, EQUIPMENT_SPECS, TACTICAL_EQUIPMENT, LETHAL_EQUIPMENT, normalizeTactical, normalizeLethal, equipmentForLoadout, DEFAULT_WORLD_SETTINGS, normalizeWorldSettings, MOVEMENT_FEEL, WEAPON_SWITCH_MS,
  DEFAULT_MATCH_RULES, GAME_MODES, normalizeGameMode, gameModeSpec, MATCH_WARMUP_MS, MATCH_END_MS, TACTICAL_THROW_SPEED, TACTICAL_THROW_LOFT, TACTICAL_GRAVITY, FLASH_RADIUS, STICKY_RADIUS, STICKY_MAX_DAMAGE, FRAG_RADIUS, FRAG_MAX_DAMAGE, SMOKE_RADIUS, SMOKE_DURATION_MS, GROUND_FOLLOW_DROP
} from './game-config.js';
import { normalizeMatchRules, defaultMatchState, normalizeMatchState, publicMatchState, matchRulesAreDefault } from './match-model.js';
import { MATCH_STATUS, matchAllowsLobbyEdits, matchAllowsMovement, matchAllowsCombat, matchAllowsRespawn, matchPreservesReconnectPosition } from './gameplay-phase.js';
import { spawnForMode as directedSpawnForMode, chooseSafeSpawn as directedChooseSafeSpawn, spawnPointCount } from './spawn-director.js';
import { MAX_PLAYER_PHYSICS_STEP_SEC, advanceVerticalMotion, advanceKnockback, sweepHorizontalMovement, createTraversalPlan, traversalPose, tacticalThrowVelocity } from './movement-model.js';
import { projectileSegmentHitZone, segmentFirstWorldHitT, segmentHitsObstacle, actorHasLineOfSight, blastHasLineOfSight } from './server-collision.js';
import { worldBlockedAt, worldMoveBlockedAt, worldHeightExpansionBlockedAt, findTraversalCandidate } from './world-collision.js';

const GAME_VERSION = APP_VERSION;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_MESSAGE_BYTES = 24 * 1024;
const ROOM_MAX_LIFETIME_MS = 12 * 60 * 60 * 1000;
const EMPTY_ROOM_GRACE_MS = 10 * 60 * 1000;
const ALARM_MIN_FUTURE_MS = 5 * 1000;
const DIRECTORY_LEASE_MS = 30 * 1000;
const DIRECTORY_HEARTBEAT_MS = 10 * 1000;
const SIM_MIN_STEP_MS = 16;
const SIM_FIXED_STEP_MS = 1000 / 30;
const SIM_MAX_CATCHUP_MS = 400;
const MOVE_BUDGET_INITIAL_SEC = 0.04;
const MOVE_BUDGET_MAX_SEC = 0.26;
const BOT_PERSIST_INTERVAL_MS = 10 * 1000;
const BULLET_MAX_SEGMENT_DISTANCE = 6;
const THROWABLE_BROADCAST_MS = 33;
const EXPLOSIVE_PROJECTILE_BROADCAST_MS = 45;
const SERVER_VERTICAL_MAX_CATCHUP_SEC = .40;
const SERVER_COYOTE_TIME_MS = MOVEMENT_FEEL.coyoteTimeMs + 5;
const BOT_TARGET_MEMORY_MS = 3200;
const BOT_PATROL_MIN_MS = 1800;
const BOT_PATROL_MAX_MS = 4200;
const RECONNECT_GRACE_MS = 45 * 1000;
const HEALTH_REGEN_TICK_MS = 500;
const MULTI_KILL_WINDOW_MS = 4500;
const CREATE_RATE_WINDOW_MS = 60 * 1000;
const CREATE_RATE_MAX_PER_CLIENT = 5;
const CREATE_RATE_MAX_GLOBAL = 60;
const WEAPON_SWITCH_LOCK_MS = WEAPON_SWITCH_MS;
const JOIN_TICKET_TTL_MS = 30 * 1000;
const JOIN_TICKET_MAX = 64;
const JOIN_TICKET_RATE_WINDOW_MS = 60 * 1000;
const JOIN_TICKET_RATE_MAX_TOTAL = 80;
const JOIN_TICKET_RATE_MAX_PER_CLIENT = 10;
const MAX_CLIENT_IDENTITIES = 64;
const BOT_DIFFICULTIES = {
  easy: { moveRun:.44, moveWalk:.58, strafe:.08, preferredRange:9.5, range:19, fireScale:1.48, reactionBase:480, reactionJitter:430, spreadBase:.098, spreadDistance:.0028 },
  normal: { moveRun:.72, moveWalk:.86, strafe:.38, preferredRange:8, range:30, fireScale:.82, reactionBase:105, reactionJitter:160, spreadBase:.022, spreadDistance:.00105 },
  hard: { moveRun:.94, moveWalk:1.02, strafe:.72, preferredRange:7, range:38, fireScale:.56, reactionBase:42, reactionJitter:70, spreadBase:.0085, spreadDistance:.00048 },
  elite: { moveRun:1.06, moveWalk:1.10, strafe:.96, preferredRange:6.3, range:46, fireScale:.42, reactionBase:12, reactionJitter:28, spreadBase:.0038, spreadDistance:.00022 },
};
function safeBotDifficulty(value) {
  const key = String(value || "normal").toLowerCase();
  return Object.prototype.hasOwnProperty.call(BOT_DIFFICULTIES, key) ? key : "normal";
}

function worldSettingsAreDefault(value) {
  return JSON.stringify(normalizeWorldSettings(value)) === JSON.stringify(normalizeWorldSettings(DEFAULT_WORLD_SETTINGS));
}

function configuredOrigins(env) {
  const raw = String(env.GAME_ORIGINS || env.GAME_ORIGIN || "*");
  return raw.split(',').map((value) => value.trim()).filter(Boolean);
}

function isOriginAllowed(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!origin) return true;
  const allowed = configuredOrigins(env);
  return allowed.includes('*') || allowed.includes(origin);
}

function responseOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = configuredOrigins(env);
  if (allowed.includes('*')) return '*';
  return origin && allowed.includes(origin) ? origin : '';
}

function corsHeaders(request, env) {
  const headers = {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "cache-control": "no-store",
    vary: "Origin",
  };
  const origin = responseOrigin(request, env);
  if (origin) headers["access-control-allow-origin"] = origin;
  return headers;
}

function json(request, env, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function sendJson(socket, data) { try { socket.send(JSON.stringify(data)); return true; } catch { return false; } }

function parseJson(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function makeRoomCode() {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join("");
}

function normalizeRoomCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-HJ-NP-Z2-9]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

function safeClientId(value) {
  return String(value || "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 80);
}

function safeClientAuth(value) {
  return String(value || "")
    .replace(/[^A-Fa-f0-9]/g, "")
    .slice(0, 128);
}

function safeJoinTicket(value) {
  return String(value || "")
    .replace(/[^A-Fa-f0-9]/g, "")
    .slice(0, 64);
}

function makeJoinTicket() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeClientAuthHashes(meta) {
  const raw = meta?.clientAuthHashes && typeof meta.clientAuthHashes === 'object' ? meta.clientAuthHashes : {};
  const out = {};
  for (const [id, hash] of Object.entries(raw)) {
    const safeId = safeClientId(id);
    const safeHash = String(hash || '').toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 64);
    if (safeId && safeHash.length === 64) out[safeId] = safeHash;
  }
  return out;
}

function safeName(value) {
  const cleaned = String(value || "Player")
    .replace(/[<>\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
  return cleaned || "Player";
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeTeam(value) {
  return String(value || "blue").toLowerCase() === "red" ? "red" : "blue";
}
function matchMode(value){return normalizeGameMode(value?.mode??value);}
function matchUsesTeams(value){return !!gameModeSpec(matchMode(value)).teamBased;}
function combatantsAreFriendly(mode,ownerId,ownerTeam,targetId,targetTeam){return ownerId!==targetId&&matchUsesTeams(mode)&&safeTeam(ownerTeam)===safeTeam(targetTeam);}

function normalizeAdminIds(meta) {
  const owner = safeClientId(meta?.ownerClientId);
  const raw = Array.isArray(meta?.adminClientIds) ? meta.adminClientIds : [];
  const out = [];
  for (const id of [owner, ...raw]) {
    const safe = safeClientId(id);
    if (safe && !out.includes(safe)) out.push(safe);
  }
  return out;
}
function isRoomAdmin(meta, clientId) { return !!clientId && meta.adminClientIds.includes(clientId); }

function safeWeapon(value) {
  return Object.prototype.hasOwnProperty.call(WEAPON_SPECS, value) ? value : "pistol";
}
function safePrimaryWeapon(value) {
  const weapon = safeWeapon(value);
  return PRIMARY_WEAPONS.includes(weapon) ? weapon : 'assault';
}
function playerCanEquip(player, weapon) {
  const safe = safeWeapon(weapon);
  return safe === 'pistol' || safe === safePrimaryWeapon(player?.primaryWeapon);
}

function safeEquipmentKind(value){return Object.prototype.hasOwnProperty.call(EQUIPMENT_CAPS,value)?value:'flash';}
function safeTactical(value){return normalizeTactical(value);}
function safeLethal(value){return normalizeLethal(value);}
function normalizeLoadout(value,fallback={primaryWeapon:'assault',tactical:'flash',lethal:'sticky'}){const v=value&&typeof value==='object'?value:{};return{primaryWeapon:safePrimaryWeapon(v.primaryWeapon??fallback.primaryWeapon),tactical:safeTactical(v.tactical??fallback.tactical),lethal:safeLethal(v.lethal??fallback.lethal)};}
function freshAmmo(){return Object.fromEntries(WEAPON_ORDER.map(name=>[name,WEAPON_SPECS[name].mag]));}
function normalizeFireReady(value){const v=value&&typeof value==='object'?value:{};return Object.fromEntries(WEAPON_ORDER.map(name=>[name,Math.max(0,finiteNumber(v[name],0))]));}
function normalizeAmmo(value){
  const v=value&&typeof value==="object"?value:{};
  return Object.fromEntries(WEAPON_ORDER.map(name=>{const mag=WEAPON_SPECS[name].mag;return[name,clamp(Math.floor(finiteNumber(v[name],mag)),0,mag)]}));
}
function freshEquipment(tactical='flash',lethal='sticky'){return equipmentForLoadout(safeTactical(tactical),safeLethal(lethal));}
function normalizeEquipment(v){v=v&&typeof v==="object"?v:{};return Object.fromEntries(Object.entries(EQUIPMENT_CAPS).map(([name,cap])=>[name,clamp(Math.floor(finiteNumber(v[name],cap)),0,cap)]));}
function refreshUnlimitedResources(me){
  if(!me?.godMode)return;
  me.ammo=freshAmmo();me.equipment=freshEquipment(me.tactical,me.lethal);me.reloadAt=0;me.reloadWeapon='';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function activeFlashPower(player, now = Date.now()) {
  const until = finiteNumber(player?.flashUntil, 0);
  if (until <= now) return 0;
  const duration = Math.max(1, finiteNumber(player?.flashDurationMs, until - now));
  const remaining = clamp((until - now) / duration, 0, 1);
  return clamp(finiteNumber(player?.flashPower, 0), 0, 1) * remaining;
}

function spreadShotAngles(yaw, pitch, radius) {
  if (!(radius > 0)) return { yaw, pitch };
  const distance = Math.sqrt(Math.random()) * radius;
  const angle = Math.random() * Math.PI * 2;
  const pitchOffset = Math.sin(angle) * distance;
  const yawScale = Math.max(0.32, Math.cos(pitch));
  return {
    yaw: yaw + Math.cos(angle) * distance / yawScale,
    pitch: clamp(pitch + pitchOffset, -1.4, 1.4),
  };
}

function normalizeAngle(value){let angle=Number(value)||0;while(angle>Math.PI)angle-=Math.PI*2;while(angle<-Math.PI)angle+=Math.PI*2;return angle;}
function safeShotAim(me,payload){
  // State and fire packets share one ordered WebSocket. Bound the fire aim to
  // the most recent body aim so recoil/fast input is allowed without turning
  // the fire packet into an arbitrary server-side direction override.
  const baseYaw=finiteNumber(me.yaw,0),basePitch=clamp(finiteNumber(me.pitch,0),-1.4,1.4),requestedYaw=finiteNumber(payload.yaw,baseYaw),requestedPitch=clamp(finiteNumber(payload.pitch,basePitch),-1.4,1.4);
  return{yaw:baseYaw+clamp(normalizeAngle(requestedYaw-baseYaw),-.20,.20),pitch:clamp(basePitch+clamp(requestedPitch-basePitch,-.20,.20),-1.4,1.4)};
}
function shotVector(yaw,pitch){const cp=Math.cos(pitch);return{x:-Math.sin(yaw)*cp,y:Math.sin(pitch),z:-Math.cos(yaw)*cp};}
function shotLaunchPose(me,yaw,pitch,crouched=false,weapon='pistol'){
  const dir=shotVector(yaw,pitch),eyeHeight=(crouched?CROUCH_HEIGHT:PLAYER_HEIGHT)-.08,eye={x:me.x,y:me.y+eyeHeight,z:me.z},ballistic={x:eye.x+dir.x*.18,y:eye.y+dir.y*.18,z:eye.z+dir.z*.18};
  // Standard firearms are camera/reticle authoritative. Their old synthetic
  // muzzle sat below and to the side of the eye, which could intersect a
  // balcony/window lip while the center-screen ray was visibly clear. That
  // made steep downward fire get redirected into the ledge. Large launcher
  // projectiles retain a physical barrel-clearance check because their actual
  // projectile body must fit past nearby cover.
  if(weapon!=='grenadeLauncher'&&weapon!=='rpg')return{x:ballistic.x,y:ballistic.y,z:ballistic.z,dx:dir.x,dy:dir.y,dz:dir.z,muzzleBlocked:false};
  const right={x:Math.cos(yaw),z:-Math.sin(yaw)},muzzle={x:me.x+right.x*.23+(-Math.sin(yaw))*.43,y:eye.y-.20,z:me.z+right.z*.23+(-Math.cos(yaw))*.43},near={x:ballistic.x+dir.x*1.15,y:ballistic.y+dir.y*1.15,z:ballistic.z+dir.z*1.15},hitT=segmentFirstWorldHitT(muzzle.x,muzzle.y,muzzle.z,near.x,near.y,near.z);
  if(hitT!=null&&hitT<.995){const hx=muzzle.x+(near.x-muzzle.x)*hitT,hy=muzzle.y+(near.y-muzzle.y)*hitT,hz=muzzle.z+(near.z-muzzle.z)*hitT,dx=hx-muzzle.x,dy=hy-muzzle.y,dz=hz-muzzle.z,len=Math.hypot(dx,dy,dz);if(len<.025)return{x:muzzle.x,y:muzzle.y,z:muzzle.z,dx:dir.x,dy:dir.y,dz:dir.z,muzzleBlocked:true};return{x:muzzle.x,y:muzzle.y,z:muzzle.z,dx:dx/len,dy:dy/len,dz:dz/len,muzzleBlocked:true};}
  return{x:ballistic.x,y:ballistic.y,z:ballistic.z,dx:dir.x,dy:dir.y,dz:dir.z,muzzleBlocked:false};
}
function decayedFireHeat(me,weapon,now){const heats=me.fireHeat&&typeof me.fireHeat==='object'?me.fireHeat:{},times=me.fireHeatAt&&typeof me.fireHeatAt==='object'?me.fireHeatAt:{},last=Math.max(0,finiteNumber(times[weapon],0));return weaponHeatAfterDelay(weapon,finiteNumber(heats[weapon],0),last?now-last:0);}
function storeFireHeat(me,weapon,now,preShotHeat){me.fireHeat={...(me.fireHeat&&typeof me.fireHeat==='object'?me.fireHeat:{}),[weapon]:weaponHeatAfterShot(weapon,preShotHeat)};me.fireHeatAt={...(me.fireHeatAt&&typeof me.fireHeatAt==='object'?me.fireHeatAt:{}),[weapon]:now};}

function publicPlayer(attachment) {
  return {
    id: attachment.clientId,
    name: attachment.name,
    color: TEAM_COLORS[safeTeam(attachment.team)],
    team: safeTeam(attachment.team),
    bot: false,
    hp: attachment.hp,
    wastedUntil: attachment.wastedUntil || 0,
    x: attachment.x,
    y: attachment.y,
    z: attachment.z,
    yaw: attachment.yaw,
    pitch: attachment.pitch,
    ads: !!attachment.ads,
    crouched: !!attachment.crouched,
    weapon: safeWeapon(attachment.weapon),
    primaryWeapon: safePrimaryWeapon(attachment.primaryWeapon),
    tactical: safeTactical(attachment.tactical),
    lethal: safeLethal(attachment.lethal),
    pendingLoadout: attachment.pendingLoadout ? normalizeLoadout(attachment.pendingLoadout,{primaryWeapon:attachment.primaryWeapon,tactical:attachment.tactical,lethal:attachment.lethal}) : null,
    pendingTeam: attachment.pendingTeam ? safeTeam(attachment.pendingTeam) : '',
    ammo: attachment.ammo,
    equipment: attachment.equipment,
    reloadAt: attachment.reloadAt || 0,
    reloadWeapon: attachment.reloadWeapon || "",
    combatRev: 0,
    kills: Math.max(0, Math.floor(finiteNumber(attachment.kills, 0))),
    deaths: Math.max(0, Math.floor(finiteNumber(attachment.deaths, 0))),
    godMode: !!attachment.godMode,
    admin: !!attachment.admin,
    grounded: attachment.serverGrounded !== false,
    verticalVelocity: finiteNumber(attachment.verticalVelocity, 0),
    jumpSeq: Math.max(0, Math.floor(finiteNumber(attachment.lastJumpSeq, 0))),
    traversal: attachment.traversal ? {mode:attachment.traversal.mode,role:attachment.traversal.role||'',seq:attachment.traversal.seq,startX:attachment.traversal.startX,startY:attachment.traversal.startY,startZ:attachment.traversal.startZ,endX:attachment.traversal.endX,endY:attachment.traversal.endY,endZ:attachment.traversal.endZ,peakY:attachment.traversal.peakY,startedAt:attachment.traversal.startedAt,durationMs:attachment.traversal.durationMs,endGrounded:attachment.traversal.endGrounded!==false,exitVelocityY:Number(attachment.traversal.exitVelocityY)||0,portalId:String(attachment.traversal.portalId||'')} : null,
  };
}

function publicBot(bot) {
  return {
    id: bot.id,
    name: bot.name,
    color: TEAM_COLORS[safeTeam(bot.team)],
    team: safeTeam(bot.team),
    bot: true,
    hp: bot.hp,
    wastedUntil: bot.wastedUntil || 0,
    x: bot.x,
    y: bot.y,
    z: bot.z,
    yaw: bot.yaw,
    pitch: 0,
    weapon: safePrimaryWeapon(bot.weapon||bot.primaryWeapon),
    primaryWeapon: safePrimaryWeapon(bot.primaryWeapon||bot.weapon),
    tactical:'flash',lethal:'sticky',pendingLoadout:null,
    ads: false,
    reloadAt: bot.reloadAt || 0,
    reloadWeapon: bot.reloadWeapon || "",
    kills: Math.max(0, Math.floor(finiteNumber(bot.kills, 0))),
    deaths: Math.max(0, Math.floor(finiteNumber(bot.deaths, 0))),
    traversal: bot.traversal ? {mode:bot.traversal.mode,role:bot.traversal.role||'',seq:bot.traversal.seq,startX:bot.traversal.startX,startY:bot.traversal.startY,startZ:bot.traversal.startZ,endX:bot.traversal.endX,endY:bot.traversal.endY,endZ:bot.traversal.endZ,peakY:bot.traversal.peakY,startedAt:bot.traversal.startedAt,durationMs:bot.traversal.durationMs,endGrounded:bot.traversal.endGrounded!==false,exitVelocityY:Number(bot.traversal.exitVelocityY)||0,portalId:String(bot.traversal.portalId||'')} : null,
  };
}

function sendLoadout(socket, me, extra = {}) { sendJson(socket,{t:'loadout',weapon:safeWeapon(me.weapon),primaryWeapon:safePrimaryWeapon(me.primaryWeapon),tactical:safeTactical(me.tactical),lethal:safeLethal(me.lethal),pendingLoadout:me.pendingLoadout?normalizeLoadout(me.pendingLoadout,{primaryWeapon:me.primaryWeapon,tactical:me.tactical,lethal:me.lethal}):null,ammo:me.ammo,equipment:me.equipment,reloadAt:me.reloadAt||0,reloadWeapon:me.reloadWeapon||'',rev:0,...extra}); }

function spawnForTeam(team,index){return directedSpawnForMode('tdm',safeTeam(team),index,terrainHeight);}
function spawnForMode(mode,team,index){return directedSpawnForMode(normalizeGameMode(mode),safeTeam(team),index,terrainHeight);}
function spawnedPlayerState(player,spawn,team,now,{resetStats=false}={}){
  const active=normalizeLoadout(player?.pendingLoadout||player,{primaryWeapon:player?.primaryWeapon,tactical:player?.tactical,lethal:player?.lethal});
  const next={
    ...player,...spawn,team,pendingTeam:'',pendingLoadout:null,primaryWeapon:active.primaryWeapon,tactical:active.tactical,lethal:active.lethal,hp:100,wastedUntil:0,regenAt:0,
    weapon:active.primaryWeapon,ammo:freshAmmo(),equipment:freshEquipment(active.tactical,active.lethal),reloadAt:0,reloadWeapon:'',
    fireReadyAt:normalizeFireReady(),weaponReadyAt:0,equipmentReadyAt:0,ads:false,crouched:false,moveSpeed:0,
    verticalVelocity:0,serverGrounded:true,lastGroundedAt:now,lastVerticalAt:now,lastStateAt:now,moveBudgetSec:MOVE_BUDGET_INITIAL_SEC,
    flashUntil:0,flashPower:0,flashDurationMs:0,fireHeat:{},fireHeatAt:{},knockVelocityX:0,knockVelocityZ:0,traversal:null,lastTraverseSeq:0,
  };
  if(resetStats)Object.assign(next,{kills:0,deaths:0,multiKillCount:0,lastKillAt:0});
  return next;
}

const BOT_PRIMARY_WEAPONS=['assault','ump','shotgun','semiShotgun','sniper'];
function makeBot(team, teamIndex, mode='tdm', spawnIndex=teamIndex, spawnOverride=null) {
  team = safeTeam(team);
  const spawn = spawnOverride || spawnForMode(mode, team, spawnIndex),primaryWeapon=BOT_PRIMARY_WEAPONS[Math.abs(spawnIndex)%BOT_PRIMARY_WEAPONS.length]||'assault';
  const label = team === "red" ? "Red" : "Blue",ffa=normalizeGameMode(mode)==='ffa';
  return {
    id: `bot-${team}-${teamIndex + 1}`,
    name: ffa?`Bot ${spawnIndex + 1}`:`${label} Bot ${teamIndex + 1}`,
    team,
    ...spawn,
    yaw: 0,
    hp: 100,
    wastedUntil: 0,
    nextShotAt: 0,
    ammo: freshAmmo(),
    reloadAt: 0,
    reloadWeapon: "",
    weapon: primaryWeapon,
    primaryWeapon,
    regenAt: 0,
    kills: 0,
    deaths: 0,
    traversal: null,
    traverseSeq: 0,
    lastSeenTargetId:'',lastSeenAt:0,lastKnownX:spawn.x,lastKnownZ:spawn.z,patrolX:spawn.x,patrolZ:spawn.z,patrolUntil:0,patrolNodeIndex:-1,
  };
}
function makeBots(blueBots, redBots, mode='tdm') {
  blueBots = clamp(Math.floor(finiteNumber(blueBots, 0)), 0, MAX_BOTS);
  redBots = clamp(Math.floor(finiteNumber(redBots, 0)), 0, MAX_BOTS);
  const bots = [];let spawnIndex=0;
  for (let i = 0; i < blueBots; i += 1) bots.push(makeBot("blue", i, mode, spawnIndex++));
  for (let i = 0; i < redBots; i += 1) bots.push(makeBot("red", i, mode, spawnIndex++));
  return bots;
}
function reconcileBots(existing, blueBots, redBots, mode='tdm') {
  const prior = new Map((Array.isArray(existing) ? existing : []).map((bot) => [bot.id, bot]));
  return makeBots(blueBots, redBots, mode).map((fresh) => {
    const old = prior.get(fresh.id);
    if (!old) return fresh;
    const primaryWeapon=safePrimaryWeapon(old.primaryWeapon||old.weapon||fresh.primaryWeapon);
    return {
      ...fresh,
      ...old,
      id: fresh.id,
      name: fresh.name,
      team: fresh.team,
      x: clamp(finiteNumber(old.x, fresh.x), -ARENA_LIMIT, ARENA_LIMIT),
      z: clamp(finiteNumber(old.z, fresh.z), -ARENA_LIMIT, ARENA_LIMIT),
      y: terrainHeight(clamp(finiteNumber(old.x, fresh.x), -ARENA_LIMIT, ARENA_LIMIT), clamp(finiteNumber(old.z, fresh.z), -ARENA_LIMIT, ARENA_LIMIT)),
      ammo: normalizeAmmo(old.ammo),
      weapon: primaryWeapon,
      primaryWeapon,
    };
  });
}
function botCountsFromMeta(meta) {
  const blueBots = clamp(Math.floor(finiteNumber(meta?.blueBots, 0)), 0, MAX_BOTS);
  const redBots = clamp(Math.floor(finiteNumber(meta?.redBots, 0)), 0, MAX_BOTS);
  return { blueBots, redBots, botCount: Math.min(MAX_BOTS, blueBots + redBots) };
}

async function directoryStub(env) {
  return env.DIRECTORY.get(env.DIRECTORY.idFromName("global"));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (!isOriginAllowed(request, env)) return new Response(null, { status: 403, headers: corsHeaders(request, env) });
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (url.pathname !== "/health" && !isOriginAllowed(request, env)) {
      return json(request, env, { error: "Origin not allowed." }, 403);
    }

    if (url.pathname === "/health") {
      return json(request, env, {
        ok: true,
        service: "breach-online",
        protocol: PROTOCOL_VERSION,
        game: GAME_VERSION,
        mode: "durable-object-tactical-fps-lobby-modes",
      });
    }

    if (url.pathname === "/rooms" && request.method === "GET") {
      const response = await (await directoryStub(env)).fetch("https://directory.internal/list");
      const body = await response.json();
      return json(request, env, body, response.status);
    }

    if (url.pathname === "/rooms" && request.method === "POST") {
      let body = {};
      try { body = await request.json(); } catch {}
      const clientId = safeClientId(body.client);
      const clientAuth = safeClientAuth(body.auth);
      const protocol = Math.floor(finiteNumber(body.protocol, 0));
      if (protocol !== PROTOCOL_VERSION) return json(request, env, { error: `Client protocol ${protocol || "missing"} is incompatible. Update the game client.`, protocol: PROTOCOL_VERSION }, 409);
      if (!clientId) return json(request, env, { error: "Missing client ID." }, 400);
      if (clientAuth.length < 32) return json(request, env, { error: "Missing client credential." }, 400);

      const directory = await directoryStub(env);
      const networkId = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      try {
        const limiter = await directory.fetch('https://directory.internal/allow-create', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: await sha256Hex(networkId) }),
        });
        if (limiter.status === 429) return json(request, env, { error: "Too many matches created from this connection. Try again shortly." }, 429);
        if (!limiter.ok) return json(request, env, { error: "Match creation protection is temporarily unavailable." }, 503);
      } catch {
        return json(request, env, { error: "Match creation protection is temporarily unavailable." }, 503);
      }

      const ownerAuthHash = await sha256Hex(clientAuth);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const code = makeRoomCode();
        const room = env.ROOMS.get(env.ROOMS.idFromName(code));
        const created = await room.fetch('https://room.internal/create', {
          method: "POST",
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code, ownerClientId: clientId, ownerAuthHash }),
        });
        if (created.status === 201) {
          return json(request, env, { code }, 201);
        }
      }
      return json(request, env, { error: "Could not create a world. Try again." }, 503);
    }

    const ticketMatch = url.pathname.match(new RegExp(`^/rooms/([A-HJ-NP-Z2-9]{${ROOM_CODE_LENGTH}})/ticket$`, "i"));
    if (ticketMatch && request.method === "POST") {
      const code = normalizeRoomCode(ticketMatch[1]);
      let body = {};
      try { body = await request.json(); } catch {}
      const room = env.ROOMS.get(env.ROOMS.idFromName(code));
      const response = await room.fetch("https://room.internal/ticket", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      let data = {};
      try { data = await response.json(); } catch { data = { error: "Could not issue join ticket." }; }
      return json(request, env, data, response.status);
    }

    const roomMatch = url.pathname.match(new RegExp(`^/rooms/([A-HJ-NP-Z2-9]{${ROOM_CODE_LENGTH}})/socket$`, "i"));
    if (roomMatch) {
      const code = normalizeRoomCode(roomMatch[1]);
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
    }

    return json(request, env, { error: "Not found." }, 404);
  },
};

export class WorldDirectory {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const rooms = (await this.ctx.storage.get("rooms")) || {};
    const now = Date.now();

    if (url.pathname === "/allow-create" && request.method === "POST") {
      let body = {};
      try { body = await request.json(); } catch {}
      const key = String(body.key || '').toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 64);
      if (key.length !== 64) return new Response('bad key', { status: 400 });
      const rates = (await this.ctx.storage.get("createLimits")) || {};
      const cutoff = now - CREATE_RATE_WINDOW_MS;
      for (const [rateKey, entry] of Object.entries(rates)) {
        if (!entry || finiteNumber(entry.windowStart, 0) < cutoff) delete rates[rateKey];
      }
      const currentRate = (rateKey) => rates[rateKey] && finiteNumber(rates[rateKey].windowStart, 0) >= cutoff
        ? rates[rateKey]
        : { windowStart: now, count: 0 };
      const clientRate = currentRate(`client:${key}`);
      const globalRate = currentRate('global');
      if (Math.floor(finiteNumber(clientRate.count, 0)) >= CREATE_RATE_MAX_PER_CLIENT || Math.floor(finiteNumber(globalRate.count, 0)) >= CREATE_RATE_MAX_GLOBAL) {
        await this.ctx.storage.put("createLimits", rates);
        return new Response('rate limited', { status: 429 });
      }
      clientRate.count = Math.floor(finiteNumber(clientRate.count, 0)) + 1;
      globalRate.count = Math.floor(finiteNumber(globalRate.count, 0)) + 1;
      rates[`client:${key}`] = clientRate;
      rates.global = globalRate;
      await this.ctx.storage.put("createLimits", rates);
      return new Response('ok');
    }

    if (url.pathname === "/list") {
      let changed = false;
      for (const [code, room] of Object.entries(rooms)) {
        const leaseExpired = !room || room.players <= 0 || now - finiteNumber(room.updatedAt, 0) > DIRECTORY_LEASE_MS;
        const incompatible = !room || Math.floor(finiteNumber(room.protocol,0)) !== PROTOCOL_VERSION;
        const worldExpired = !room || finiteNumber(room.expiresAt, 0) <= now;
        if (leaseExpired || incompatible || worldExpired) {
          delete rooms[code];
          changed = true;
        }
      }
      if (changed) await this.ctx.storage.put("rooms", rooms);
      const list = Object.values(rooms)
        .filter((room) => room.players > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 30);
      return new Response(JSON.stringify({ rooms: list }), {
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (url.pathname === "/upsert" && request.method === "POST") {
      const body = await request.json();
      const code = normalizeRoomCode(body.code);
      if (!code) return new Response("bad code", { status: 400 });
      const mode=normalizeGameMode(body.mode),modeSpec=gameModeSpec(mode);
      rooms[code] = {
        code,
        protocol: PROTOCOL_VERSION,
        players: clamp(Math.floor(finiteNumber(body.players, 0)), 0, MAX_PLAYERS),
        blueBots: clamp(Math.floor(finiteNumber(body.blueBots, 0)), 0, MAX_BOTS),
        redBots: clamp(Math.floor(finiteNumber(body.redBots, 0)), 0, MAX_BOTS),
        botDifficulty: safeBotDifficulty(body.botDifficulty),
        mode,
        blue: clamp(Math.floor(finiteNumber(body.blue, 0)), 0, MAX_PLAYERS + MAX_BOTS),
        red: clamp(Math.floor(finiteNumber(body.red, 0)), 0, MAX_PLAYERS + MAX_BOTS),
        maxPlayers: MAX_PLAYERS,
        createdAt: finiteNumber(body.createdAt, now),
        updatedAt: now,
        expiresAt: finiteNumber(body.expiresAt, now + ROOM_MAX_LIFETIME_MS),
        custom: !!body.custom,
        matchStatus: String(body.matchStatus || 'waiting'),
        blueScore: Math.max(0, Math.floor(finiteNumber(body.blueScore, 0))),
        redScore: Math.max(0, Math.floor(finiteNumber(body.redScore, 0))),
        scoreLimit: modeSpec.scoreType==='none'?0:clamp(Math.floor(finiteNumber(body.scoreLimit, modeSpec.scoreLimit||DEFAULT_MATCH_RULES.scoreLimit)), 5, 100),
      };
      await this.ctx.storage.put("rooms", rooms);
      return new Response("ok");
    }

    if (url.pathname === "/remove" && request.method === "POST") {
      const body = await request.json();
      const code = normalizeRoomCode(body.code);
      if (code && rooms[code]) {
        delete rooms[code];
        await this.ctx.storage.put("rooms", rooms);
      }
      return new Response("ok");
    }

    return new Response("not found", { status: 404 });
  }
}

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.bots = null;
    this.bullets = new Map();
    this.throwables = new Map();
    this.smokeClouds = new Map();
    this.lastSimAt = 0;
    this.simAccumulatorMs = 0;
    this.lastBotBroadcastAt = 0;
    this.lastPersistAt = 0;
    this.lastDirectoryHeartbeatAt = 0;
    this.metaCache = null;
    this.socketRate = new WeakMap();
    this.joinTicketRate = { windowAt:0, total:0, clients:new Map() };
    this.matchDirty = false;
    this.recentDeaths = [];
    this.recentSpawns = [];
  }

  async getMeta() {
    if (this.metaCache) return this.metaCache;
    const meta = await this.ctx.storage.get("meta");
    if (meta) {
      meta.adminClientIds = normalizeAdminIds(meta);
      meta.clientAuthHashes = normalizeClientAuthHashes(meta);
      meta.settings = normalizeWorldSettings(meta.settings);
      const legacyRules=meta.match||{...DEFAULT_MATCH_RULES,mode:normalizeGameMode(meta.mode)};
      meta.match=normalizeMatchState(meta.match,Date.now(),legacyRules);
      delete meta.mode;delete meta.custom;
      this.metaCache=meta;
    }
    return meta || null;
  }

  async putMeta(meta) {
    meta.adminClientIds = normalizeAdminIds(meta);
    meta.clientAuthHashes=normalizeClientAuthHashes(meta);delete meta.mode;delete meta.custom;
    this.metaCache=meta;
    await this.ctx.storage.put("meta", meta);
  }

  liveSockets(exceptSocket = null) {
    return this.ctx.getWebSockets().filter((socket) => {
      if (socket === exceptSocket) return false;
      const attachment = socket.deserializeAttachment() || {};
      return !!attachment.clientId && !attachment.replaced;
    });
  }

  isCustomMatch(meta) {
    if (!meta) return false;
    if (!worldSettingsAreDefault(meta.settings) || !matchRulesAreDefault(meta.match)) return true;
    return this.liveSockets().some((socket) => !!(socket.deserializeAttachment() || {}).godMode);
  }

  allowSocketMessage(socket, type, now = Date.now()) {
    const config = type === '__all__' ? { rate: 100, burst: 160 }
      : type === 'state' ? { rate: 55, burst: 80 }
      : type === 'simTick' ? { rate: 40, burst: 60 }
      : type === 'fire' ? { rate: 24, burst: 30 }
      : ['throw','reload','weapon','loadout','team','god','startMatch','lobbyMode','adminPlayer','adminSettings','adminMatch','adminBots'].includes(type) ? { rate: 14, burst: 22 }
      : type === 'ping' ? { rate: 8, burst: 12 }
      : { rate: 30, burst: 45 };
    let state = this.socketRate.get(socket);
    if (!state) {
      state = { buckets: new Map(), violations: 0, violationWindowAt: now };
      this.socketRate.set(socket, state);
    }
    let bucket = state.buckets.get(type);
    if (!bucket) bucket = { tokens: config.burst, at: now };
    const elapsed = Math.max(0, (now - bucket.at) / 1000);
    bucket.tokens = Math.min(config.burst, bucket.tokens + elapsed * config.rate);
    bucket.at = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      state.buckets.set(type, bucket);
      return true;
    }
    state.buckets.set(type, bucket);
    if (now - state.violationWindowAt > 10_000) {
      state.violationWindowAt = now;
      state.violations = 0;
    }
    state.violations += 1;
    if (state.violations >= 24) {
      try { socket.close(1008, 'Message rate exceeded'); } catch {}
    }
    return false;
  }

  async scheduleRoomAlarm(targetAt) {
    const now = Date.now();
    const target = finiteNumber(targetAt, 0);
    // Never schedule an alarm at or near a timestamp that has already passed.
    // A past alarm time can execute again immediately and create an alarm storm.
    if (target <= now + ALARM_MIN_FUTURE_MS) {
      await this.ctx.storage.deleteAlarm();
      return false;
    }
    const current = await this.ctx.storage.getAlarm();
    if (current != null && Math.abs(current - target) < 1000) return true;
    await this.ctx.storage.setAlarm(target);
    return true;
  }

  async cleanupRoom(meta) {
    this.metaCache = null;
    if (meta?.code) await this.removeDirectory(meta.code);
    // Clear the scheduled wake-up before deleting the room state.
    try { await this.ctx.storage.deleteAlarm(); } catch {}
    await this.ctx.storage.deleteAll();
  }

  async ensureSimulation(meta) {
    if (this.bots) return;
    const counts = botCountsFromMeta(meta);
    const stored = await this.ctx.storage.get("bots");
    if (Array.isArray(stored) && stored.length === counts.botCount) this.bots = stored;
    else {
      this.bots = makeBots(counts.blueBots, counts.redBots, matchMode(meta.match));
      await this.ctx.storage.put("bots", this.bots);
    }
    this.lastSimAt = Date.now();
    this.simAccumulatorMs = 0;
  }

  pruneSpawnHistory(now=Date.now()){
    const cutoff=now-12_000;
    this.recentDeaths=this.recentDeaths.filter(item=>finiteNumber(item?.at,0)>=cutoff).slice(-48);
    this.recentSpawns=this.recentSpawns.filter(item=>finiteNumber(item?.at,0)>=cutoff).slice(-48);
  }

  noteDeath(actor,now=Date.now()){
    if(!actor)return;this.pruneSpawnHistory(now);
    this.recentDeaths.push({x:finiteNumber(actor.x,0),z:finiteNumber(actor.z,0),team:safeTeam(actor.team),id:String(actor.clientId||actor.id||''),at:now});
  }

  noteSpawn(spawn,team,id,now=Date.now()){
    if(!spawn)return;this.pruneSpawnHistory(now);
    this.recentSpawns.push({x:finiteNumber(spawn.x,0),z:finiteNumber(spawn.z,0),team:safeTeam(team),id:String(id||''),at:now});
  }

  selectSpawn(mode,team,actors=[],index=0,excludeId='',now=Date.now()){
    this.pruneSpawnHistory(now);
    const result=directedChooseSafeSpawn({
      mode:normalizeGameMode(mode),team:safeTeam(team),actors,index,excludeId,now,
      recentDeaths:this.recentDeaths,recentSpawns:this.recentSpawns,
      projectiles:[...this.bullets.values()],throwables:[...this.throwables.values()],
      terrainHeight,
      blockedAt:(x,z,y)=>worldBlockedAt(x,z,y,PLAYER_HEIGHT,PLAYER_RADIUS),
      lineOfSight:(spawn,actor)=>actorHasLineOfSight(spawn,actor),
    });
    const spawn={x:result.x,y:result.y,z:result.z};this.noteSpawn(spawn,team,excludeId,now);return spawn;
  }

  freezeHumanState(player,now=Date.now()){
    const support=worldSupportHeight(player.x,player.z,player.y,false);
    return {...player,y:support,ads:false,crouched:false,moveSpeed:0,verticalVelocity:0,serverGrounded:true,lastGroundedAt:now,lastVerticalAt:now,lastStateAt:now,moveBudgetSec:MOVE_BUDGET_INITIAL_SEC,traversal:null,knockVelocityX:0,knockVelocityZ:0};
  }

  broadcastMatch(meta,now=Date.now(),extra={}){this.broadcast({t:'match',match:publicMatchState(meta.match,now),custom:this.isCustomMatch(meta),...extra});}

  finishMatch(meta,winner,reason,now=Date.now()){
    const match=meta.match;if(match.status==='ended')return false;
    const result=winner&&typeof winner==='object'?winner:{winner:winner||'draw'};
    Object.assign(match,{status:MATCH_STATUS.ENDED,endedAt:now,restartAt:now+MATCH_END_MS,winner:['blue','red','draw'].includes(result.winner)?result.winner:'',winnerId:safeClientId(result.winnerId||''),winnerName:String(result.winnerName||'').slice(0,24),reason:String(reason||'').slice(0,24),updatedAt:now});
    this.bullets.clear();this.throwables.clear();this.smokeClouds.clear();
    for(const socket of this.ctx.getWebSockets()){const p=socket.deserializeAttachment()||{};if(!p.clientId||p.replaced)continue;socket.serializeAttachment(this.freezeHumanState(p,now));}
    for(const bot of this.bots||[]){bot.traversal=null;bot.reloadAt=0;bot.reloadWeapon='';bot.moveSpeed=0;bot.y=worldSupportHeight(bot.x,bot.z,bot.y,false);}
    meta.match=match;this.matchDirty=true;this.broadcastMatch(meta,now);return true;
  }

  individualLeaders(){
    const rows=[];
    for(const socket of this.ctx.getWebSockets()){const p=socket.deserializeAttachment()||{};if(p.clientId&&!p.replaced)rows.push(this.findCombatant(p.clientId));}
    for(const bot of this.bots)rows.push(this.findCombatant(bot.id));
    rows.sort((a,b)=>(b.kills-a.kills)||(a.deaths-b.deaths)||a.name.localeCompare(b.name));return rows;
  }

  prepareRound(meta,now=Date.now(),{increment=false}={}){
    const old=meta.match,mode=matchMode(old);
    meta.match={...defaultMatchState(now,old),round:Math.max(1,old.round+(increment?1:0)),status:MATCH_STATUS.WARMUP,warmupEndsAt:now+MATCH_WARMUP_MS,mode,scoreLimit:old.scoreLimit,timeLimitMs:old.timeLimitMs,minimapRevealAll:!!old.minimapRevealAll};
    this.bullets.clear();this.throwables.clear();this.smokeClouds.clear();this.recentDeaths=[];this.recentSpawns=[];const players=[],assigned=[];let index=0;
    for(const socket of this.ctx.getWebSockets()){
      const p=socket.deserializeAttachment()||{};if(!p.clientId||p.replaced)continue;
      const team=matchUsesTeams(mode)&&p.pendingTeam?safeTeam(p.pendingTeam):safeTeam(p.team),spawn=this.selectSpawn(mode,team,assigned,index++,p.clientId,now);
      const reset=spawnedPlayerState(p,spawn,team,now,{resetStats:true});socket.serializeAttachment(reset);players.push(publicPlayer(reset));assigned.push(reset);
    }
    this.bots=[];let botSpawnIndex=index;
    for(const [team,count] of [['blue',meta.blueBots||0],['red',meta.redBots||0]])for(let i=0;i<count;i++){
      const spawn=this.selectSpawn(mode,team,[...assigned,...this.bots],botSpawnIndex,`bot-${team}-${i+1}`,now);
      this.bots.push(makeBot(team,i,mode,botSpawnIndex++,spawn));
    }
    this.matchDirty=true;
    this.broadcast({t:'matchReset',match:publicMatchState(meta.match,now),players,bots:this.bots.map(publicBot),custom:this.isCustomMatch(meta)});
    return true;
  }

  resetRound(meta,now=Date.now()){return this.prepareRound(meta,now,{increment:true});}


  stepMatch(now,meta){
    const match=meta.match,mode=matchMode(match),spec=gameModeSpec(mode);
    if(match.status===MATCH_STATUS.WAITING)return;
    if(match.status===MATCH_STATUS.WARMUP&&match.warmupEndsAt&&now>=match.warmupEndsAt){
      Object.assign(match,{status:MATCH_STATUS.ACTIVE,startedAt:now,endsAt:spec.timeLimitMs>0?now+match.timeLimitMs:0,warmupEndsAt:0,winner:'',winnerId:'',winnerName:'',reason:'',updatedAt:now});
      for(const socket of this.ctx.getWebSockets()){const p=socket.deserializeAttachment()||{};if(!p.clientId||p.replaced)continue;socket.serializeAttachment({...p,lastStateAt:now,lastVerticalAt:now,lastGroundedAt:now,moveBudgetSec:MOVE_BUDGET_INITIAL_SEC,moveSpeed:0,verticalVelocity:0,serverGrounded:true,knockVelocityX:0,knockVelocityZ:0,traversal:null});}
      this.matchDirty=true;this.broadcastMatch(meta,now);return;
    }
    if(match.status===MATCH_STATUS.ACTIVE&&spec.scoreType!=='none'&&match.endsAt&&now>=match.endsAt){
      if(spec.scoreType==='team'){
        const winner=match.blueScore===match.redScore?'draw':match.blueScore>match.redScore?'blue':'red';this.finishMatch(meta,winner,'time',now);
      }else{
        const leaders=this.individualLeaders(),top=leaders[0],second=leaders[1];
        if(!top||second&&top.kills===second.kills)this.finishMatch(meta,'draw','time',now);else this.finishMatch(meta,{winnerId:top.id,winnerName:top.name},'time',now);
      }
      return;
    }
    if(match.status===MATCH_STATUS.ENDED&&match.restartAt&&now>=match.restartAt)this.resetRound(meta,now);
  }

  recordMatchKill(attackerId,victimId,now=Date.now()){
    const meta=this.metaCache;if(!meta)return;const match=meta.match,mode=matchMode(match),spec=gameModeSpec(mode);
    if(!matchAllowsCombat(match)||spec.scoreType==='none'||!attackerId||attackerId===victimId)return;
    const attacker=this.findCombatant(attackerId),victim=this.findCombatant(victimId);
    if(!attacker?.id||!victim?.id||attacker.godMode||combatantsAreFriendly(mode,attacker.id,attacker.team,victim.id,victim.team))return;
    match.updatedAt=now;meta.match=match;this.matchDirty=true;
    if(spec.scoreType==='team'){
      if(attacker.team==='red')match.redScore+=1;else match.blueScore+=1;
      const reached=attacker.team==='red'?match.redScore>=match.scoreLimit:match.blueScore>=match.scoreLimit;
      if(reached)this.finishMatch(meta,attacker.team,'score',now);else this.broadcastMatch(meta,now);return;
    }
    if(attacker.kills>=match.scoreLimit){this.finishMatch(meta,{winnerId:attacker.id,winnerName:attacker.name},'score',now);return;}
    this.broadcastMatch(meta,now);
  }

  async loadJoinTickets(now = Date.now()) {
    const raw = (await this.ctx.storage.get("joinTickets")) || {};
    const tickets = raw && typeof raw === "object" ? raw : {};
    for (const [ticket, entry] of Object.entries(tickets)) {
      if (!entry || finiteNumber(entry.expiresAt, 0) <= now) delete tickets[ticket];
    }
    const entries = Object.entries(tickets).sort((a, b) => finiteNumber(a[1]?.issuedAt, 0) - finiteNumber(b[1]?.issuedAt, 0));
    while (entries.length >= JOIN_TICKET_MAX) {
      const [ticket] = entries.shift();
      delete tickets[ticket];
    }
    return tickets;
  }

  allowJoinTicketRequest(clientId, now = Date.now()) {
    const id = safeClientId(clientId);
    let state = this.joinTicketRate;
    if (!state || now - finiteNumber(state.windowAt, 0) >= JOIN_TICKET_RATE_WINDOW_MS || now < finiteNumber(state.windowAt, 0)) {
      state = { windowAt:now, total:0, clients:new Map() };
      this.joinTicketRate = state;
    }
    const clientCount = state.clients.get(id) || 0;
    if (state.total >= JOIN_TICKET_RATE_MAX_TOTAL || clientCount >= JOIN_TICKET_RATE_MAX_PER_CLIENT) return false;
    state.total += 1;
    state.clients.set(id, clientCount + 1);
    return true;
  }

  async issueJoinTicket(meta, body, now = Date.now()) {
    const protocol = Math.floor(finiteNumber(body?.protocol, 0));
    if (protocol !== PROTOCOL_VERSION) return { status: 409, data: { error: "Client update required.", protocol: PROTOCOL_VERSION } };
    const clientId = safeClientId(body?.client);
    const clientAuth = safeClientAuth(body?.auth);
    const name = safeName(body?.name);
    const team = safeTeam(body?.team);
    const primaryWeapon = safePrimaryWeapon(body?.primaryWeapon);
    const tactical = safeTactical(body?.tactical);
    const lethal = safeLethal(body?.lethal);
    if (!clientId) return { status: 400, data: { error: "Missing client ID." } };
    if (clientAuth.length < 32) return { status: 401, data: { error: "Missing client credential." } };
    if (!this.allowJoinTicketRequest(clientId, now)) return { status: 429, data: { error: "Too many join attempts. Try again shortly." } };
    const clientAuthHash = await sha256Hex(clientAuth);
    const expected = meta.clientAuthHashes[clientId] || "";
    if (expected && expected !== clientAuthHash) return { status: 403, data: { error: "Client credential rejected." } };
    const tickets = await this.loadJoinTickets(now);
    const ticket = makeJoinTicket();
    tickets[ticket] = { clientId, clientAuthHash, name, team, primaryWeapon, tactical, lethal, issuedAt: now, expiresAt: now + JOIN_TICKET_TTL_MS };
    await this.ctx.storage.put("joinTickets", tickets);
    return { status: 201, data: { ticket, expiresInMs: JOIN_TICKET_TTL_MS } };
  }

  async consumeJoinTicket(value, now = Date.now()) {
    const ticket = safeJoinTicket(value);
    if (!ticket) return null;
    const raw = (await this.ctx.storage.get("joinTickets")) || {};
    const tickets = raw && typeof raw === "object" ? raw : {};
    const entry = tickets[ticket];
    delete tickets[ticket];
    for (const [key, candidate] of Object.entries(tickets)) {
      if (!candidate || finiteNumber(candidate.expiresAt, 0) <= now) delete tickets[key];
    }
    await this.ctx.storage.put("joinTickets", tickets);
    if (!entry || finiteNumber(entry.expiresAt, 0) <= now) return null;
    return entry;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/create" && request.method === "POST") {
      const existing = await this.getMeta();
      if (existing) return json(request, this.env, { error: "Match already exists." }, 409);

      let body = {};
      try { body = await request.json(); } catch {}
      const code = normalizeRoomCode(body.code);
      const ownerClientId = safeClientId(body.ownerClientId);
      const ownerAuthHash = String(body.ownerAuthHash || '').toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 64);
      if (!code || !ownerClientId || ownerAuthHash.length !== 64) return json(request, this.env, { error: "Invalid match owner credentials." }, 400);
      const blueBots = 0;
      const redBots = 0;
      const botDifficulty = 'normal';
      const mode = normalizeGameMode();
      const now = Date.now();
      const match = defaultMatchState(now, {mode,...gameModeSpec(mode)});
      const meta = {
        code,
        protocol: PROTOCOL_VERSION,
        ownerClientId,
        adminClientIds: [ownerClientId],
        clientAuthHashes: { [ownerClientId]: ownerAuthHash },
        blueBots,
        redBots,
        botDifficulty,
        settings: normalizeWorldSettings(),
        match,
        createdAt: now,
        expiresAt: now + ROOM_MAX_LIFETIME_MS,
      };
      await this.putMeta(meta);
      this.bots = makeBots(blueBots, redBots, mode);
      await this.ctx.storage.put("bots", this.bots);
      await this.scheduleRoomAlarm(meta.expiresAt);
      await this.updateDirectory(0, meta);
      return json(request, this.env, { ok: true }, 201);
    }

    if (url.pathname === "/ticket" && request.method === "POST") {
      const meta = await this.getMeta();
      if (!meta) return json(request, this.env, { error: "Match not found." }, 404);
      if (Math.floor(finiteNumber(meta.protocol, 0)) !== PROTOCOL_VERSION) return json(request, this.env, { error: "Match protocol mismatch. Create a new match.", protocol: PROTOCOL_VERSION }, 409);
      let body = {};
      try { body = await request.json(); } catch {}
      const result = await this.issueJoinTicket(meta, body);
      return json(request, this.env, result.data, result.status);
    }

    let meta = await this.getMeta();
    if (!meta) return json(request, this.env, { error: "Match not found." }, 404);
    if (Math.floor(finiteNumber(meta.protocol, 0)) !== PROTOCOL_VERSION) return json(request, this.env, { error: "Match protocol mismatch. Create a new match.", protocol: PROTOCOL_VERSION }, 409);
    const fetchNow = Date.now();
    if (fetchNow >= finiteNumber(meta.expiresAt, 0)) return json(request, this.env, { error: "Match expired." }, 410);
    if (finiteNumber(meta.expiresAt, 0) <= fetchNow + 60_000) {
      meta.expiresAt = fetchNow + ROOM_MAX_LIFETIME_MS;
      await this.putMeta(meta);
    }
    await this.ensureSimulation(meta);

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json(request, this.env, { error: "WebSocket required." }, 426);
    }

    const protocol = Math.floor(finiteNumber(url.searchParams.get("protocol"), 0));
    if (protocol !== PROTOCOL_VERSION) return json(request, this.env, { error: "Client update required.", protocol: PROTOCOL_VERSION }, 409);

    const join = await this.consumeJoinTicket(url.searchParams.get("ticket"));
    if (!join) return json(request, this.env, { error: "Join ticket is missing, expired, or already used." }, 401);
    const clientId = safeClientId(join.clientId);
    const clientAuthHash = String(join.clientAuthHash || "");
    const name = safeName(join.name);
    const requestedTeam = safeTeam(join.team);
    const requestedPrimary = safePrimaryWeapon(join.primaryWeapon);
    const requestedTactical = safeTactical(join.tactical);
    const requestedLethal = safeLethal(join.lethal);
    const authHashes = meta.clientAuthHashes;
    const expectedAuthHash = authHashes[clientId] || '';
    if (expectedAuthHash && expectedAuthHash !== clientAuthHash) return json(request, this.env, { error: "Client credential rejected." }, 403);

    const sockets = this.ctx.getWebSockets();
    const members = sockets.map((socket) => ({ socket, attachment: socket.deserializeAttachment() || {} }));
    const duplicate = members.find(({ attachment }) => attachment.clientId === clientId);
    let preserved = duplicate?.attachment || null;

    if (duplicate) {
      duplicate.socket.serializeAttachment({ ...duplicate.attachment, replaced: true });
      try { duplicate.socket.close(4001, "Reconnected"); } catch {}
    } else {
      const saved = await this.ctx.storage.get(`reconnect:${clientId}`);
      if (saved && saved.expiresAt > Date.now()) preserved = saved.attachment;
    }

    const liveMembers = members.filter(({ attachment }) => attachment.clientId !== clientId && !attachment.replaced);
    if (liveMembers.length >= MAX_PLAYERS) {
      return json(request, this.env, { error: "Match is full." }, 409);
    }
    if (!expectedAuthHash) {
      if (Object.keys(authHashes).length >= MAX_CLIENT_IDENTITIES) return json(request, this.env, { error: "Match identity capacity reached. Create a new match." }, 429);
      authHashes[clientId] = clientAuthHash;
      meta.clientAuthHashes = authHashes;
      await this.putMeta(meta);
    }

    const mode=matchMode(meta.match),joinTeam=matchUsesTeams(mode)&&preserved?.pendingTeam?safeTeam(preserved.pendingTeam):safeTeam(preserved?.team||requestedTeam);
    const requestedTeamCount = liveMembers.filter(({attachment:a}) => safeTeam(a.team) === joinTeam).length;
    const spawnActors=[...liveMembers.map(({attachment})=>attachment),...(this.bots||[])];
    const preservePosition=!!preserved&&matchPreservesReconnectPosition(meta.match);
    const spawn = preservePosition?preserved:(matchAllowsLobbyEdits(meta.match)?spawnForMode(mode,joinTeam,mode==='ffa'?liveMembers.length:requestedTeamCount):this.selectSpawn(mode,joinTeam,spawnActors,liveMembers.length,clientId,fetchNow));
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const attachment = {
      clientId,
      name,
      team: joinTeam,
      connectedAt: Date.now(),
      replaced: false,
      x: clamp(finiteNumber(spawn.x, 0), -ARENA_LIMIT, ARENA_LIMIT),
      y: finiteNumber(spawn.y, terrainHeight(spawn.x || 0, spawn.z || 0)),
      z: clamp(finiteNumber(spawn.z, 0), -ARENA_LIMIT, ARENA_LIMIT),
      yaw: finiteNumber(spawn.yaw, 0),
      pitch: clamp(finiteNumber(spawn.pitch, 0), -1.4, 1.4),
      hp: clamp(Math.floor(finiteNumber(spawn.hp, 100)), 0, 100),
      wastedUntil: finiteNumber(spawn.wastedUntil, 0),
      fireReadyAt: normalizeFireReady(spawn.fireReadyAt),
      regenAt: finiteNumber(spawn.regenAt, 0),
      primaryWeapon: safePrimaryWeapon(preserved?.primaryWeapon || requestedPrimary),
      tactical: safeTactical(preserved?.tactical || requestedTactical),
      lethal: safeLethal(preserved?.lethal || requestedLethal),
      pendingLoadout: preserved?.pendingLoadout ? normalizeLoadout(preserved.pendingLoadout,{primaryWeapon:preserved.primaryWeapon,tactical:preserved.tactical,lethal:preserved.lethal}) : null,
      weapon: preserved && playerCanEquip({ primaryWeapon: preserved?.primaryWeapon || requestedPrimary }, preserved.weapon)
        ? safeWeapon(preserved.weapon)
        : safePrimaryWeapon(preserved?.primaryWeapon || requestedPrimary),
      ammo: normalizeAmmo(spawn.ammo),
      equipment: preserved ? normalizeEquipment(spawn.equipment) : freshEquipment(requestedTactical,requestedLethal),
      reloadAt: finiteNumber(spawn.reloadAt, 0),
      reloadWeapon: safeWeapon(spawn.reloadWeapon || spawn.weapon),
      weaponReadyAt: Math.max(0, finiteNumber(spawn.weaponReadyAt, 0)),
      equipmentReadyAt: Math.max(0, finiteNumber(spawn.equipmentReadyAt, 0)),
      kills: Math.max(0, Math.floor(finiteNumber(spawn.kills, 0))),
      deaths: Math.max(0, Math.floor(finiteNumber(spawn.deaths, 0))),
      godMode: preserved ? !!preserved.godMode : false,
      pendingTeam: preserved?.pendingTeam ? safeTeam(preserved.pendingTeam) : '',
      admin: isRoomAdmin(meta, clientId),
      ads: false,
      crouched: !!preserved?.crouched,
      moveSpeed: 0,
      flashUntil: Math.max(0, finiteNumber(preserved?.flashUntil, 0)),
      flashPower: clamp(finiteNumber(preserved?.flashPower, 0), 0, 1),
      flashDurationMs: Math.max(0, finiteNumber(preserved?.flashDurationMs, 0)),
      verticalVelocity: finiteNumber(preserved?.verticalVelocity, 0),
      serverGrounded: preserved?.serverGrounded !== false,
      lastGroundedAt: preserved?.serverGrounded !== false ? Date.now() : Math.max(0,finiteNumber(preserved?.lastGroundedAt,0)),
      lastJumpSeq: Math.max(0, Math.floor(finiteNumber(preserved?.lastJumpSeq, 0))),
      traversal:null,lastTraverseSeq:Math.max(0,Math.floor(finiteNumber(preserved?.lastTraverseSeq,0))),
      lastVerticalAt: Date.now(),
      lastStateAt: Date.now(),
      moveBudgetSec: MOVE_BUDGET_INITIAL_SEC,
      knockVelocityX: 0, knockVelocityZ: 0,
    };

    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server);
    await this.ctx.storage.delete("emptySince");
    await this.ctx.storage.delete(`reconnect:${clientId}`);
    await this.scheduleRoomAlarm(meta.expiresAt);

    const currentPlayers = liveMembers.map(({ attachment: a }) => publicPlayer(a));
    sendJson(server,{
      t: "welcome",
      self: publicPlayer(attachment),
      players: currentPlayers,
      bots: this.bots.map(publicBot),
      code: meta.code,
      maxPlayers: MAX_PLAYERS,
      botConfig: { blueBots: meta.blueBots || 0, redBots: meta.redBots || 0, difficulty: safeBotDifficulty(meta.botDifficulty) },
      isAdmin: isRoomAdmin(meta, clientId),
      ownerClientId: meta.ownerClientId,
      settings: meta.settings,
      match: publicMatchState(meta.match, Date.now()),
      custom: this.isCustomMatch(meta),
      serverTime: Date.now(),
      protocol: PROTOCOL_VERSION,
      gameVersion: GAME_VERSION,
    });

    this.broadcast({ t: "join", player: publicPlayer(attachment) }, server);
    await this.updateDirectory(liveMembers.length + 1, meta);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, message) {
    const receivedAt = Date.now();
    if (!this.allowSocketMessage(socket, '__all__', receivedAt)) return;
    if (typeof message !== "string") {
      socket.close(1003, "Text messages only");
      return;
    }
    if (new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES) {
      socket.close(1009, "Message too large");
      return;
    }

    const payload = parseJson(message);
    if (!payload) return;
    const messageType = String(payload.t || '');
    if (!this.allowSocketMessage(socket, messageType, receivedAt)) return;
    const meta = await this.getMeta();
    if (!meta) return;
    await this.ensureSimulation(meta);

    let me = socket.deserializeAttachment() || {};
    if (!me.clientId || me.replaced) return;
    const now = receivedAt;
    const settings = meta.settings;

    me = this.advanceReloadForSocket(socket, me, now, settings);
    if(matchAllowsMovement(meta.match))me=this.advanceTraversalState(me,now);
    else if(me.traversal)me={...me,traversal:null,verticalVelocity:0,moveSpeed:0};
    socket.serializeAttachment(me);

    if (payload.t === "state") {
      if (me.hp > 0 || now >= me.wastedUntil) {
        if (!matchAllowsMovement(meta.match)) {
          const requestedX=clamp(finiteNumber(payload.x,me.x),-ARENA_LIMIT,ARENA_LIMIT),requestedY=finiteNumber(payload.y,me.y),requestedZ=clamp(finiteNumber(payload.z,me.z),-ARENA_LIMIT,ARENA_LIMIT);
          const corrected=Math.hypot(requestedX-me.x,requestedZ-me.z)>.01||Math.abs(requestedY-me.y)>.05||!!payload.crouched||!!payload.ads;
          const support=worldSupportHeight(me.x,me.z,me.y,false),incomingJumpSeq=Math.max(0,Math.floor(finiteNumber(payload.jumpSeq,me.lastJumpSeq||0)));
          me={...me,y:support,yaw:finiteNumber(payload.yaw,me.yaw),pitch:clamp(finiteNumber(payload.pitch,me.pitch),-1.4,1.4),ads:false,crouched:false,moveSpeed:0,verticalVelocity:0,serverGrounded:true,lastGroundedAt:now,lastVerticalAt:now,lastStateAt:now,moveBudgetSec:MOVE_BUDGET_INITIAL_SEC,lastJumpSeq:incomingJumpSeq,traversal:null,knockVelocityX:0,knockVelocityZ:0};
          socket.serializeAttachment(me);
          this.broadcast({t:'state',id:me.clientId,x:me.x,y:me.y,z:me.z,yaw:me.yaw,pitch:me.pitch,ads:false,crouched:false,traversal:''},socket);
          if(corrected)sendJson(socket,{t:'correction',x:me.x,y:me.y,z:me.z,vertical:false,verticalVelocity:0,grounded:true,crouched:false});
        } else {
          const next = this.validateHumanState(me, payload, now, settings);
          me = next.player;
          socket.serializeAttachment(me);
          const state = { t: "state", id: me.clientId, x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch, ads: !!me.ads, crouched: !!me.crouched, traversal:me.traversal?.mode||'' };
          this.broadcast(state, socket);
          if (next.corrected) sendJson(socket,{
            t:"correction",x:me.x,y:me.y,z:me.z,vertical:next.verticalCorrected,
            verticalVelocity:finiteNumber(me.verticalVelocity,0),grounded:me.serverGrounded!==false,crouched:!!me.crouched,
          });
        }
      }
      await this.stepSimulation(now, meta);
      return;
    }


    if (payload.t === "traverse") {
      const seq=Math.max(0,Math.floor(finiteNumber(payload.seq,0))),previousSeq=Math.max(0,Math.floor(finiteNumber(me.lastTraverseSeq,0)));
      if(seq<=previousSeq||me.traversal||!matchAllowsMovement(meta.match)||me.hp<=0||now<me.wastedUntil){sendJson(socket,{t:'traverse',id:me.clientId,seq,accepted:false,x:me.x,y:me.y,z:me.z});return;}
      let dirX=clamp(finiteNumber(payload.dirX,0),-1,1),dirZ=clamp(finiteNumber(payload.dirZ,0),-1,1),dirLen=Math.hypot(dirX,dirZ);
      if(dirLen<.35){sendJson(socket,{t:'traverse',id:me.clientId,seq,accepted:false,x:me.x,y:me.y,z:me.z});return;}dirX/=dirLen;dirZ/=dirLen;
      const playerHeight=me.crouched?CROUCH_HEIGHT:PLAYER_HEIGHT,candidate=findTraversalCandidate({x:me.x,y:me.y,z:me.z,dirX,dirZ,height:playerHeight,radius:PLAYER_RADIUS,airborne:me.serverGrounded===false});
      const solidActors=this.solidActors(me.clientId,now);
      if(!candidate||this.actorBlocksAt(candidate.endX,candidate.endZ,candidate.endY,me.x,me.z,solidActors,playerHeight)){sendJson(socket,{t:'traverse',id:me.clientId,seq,accepted:false,x:me.x,y:me.y,z:me.z});return;}
      const plan=createTraversalPlan(candidate,me.x,me.y,me.z,now,seq);if(!plan){sendJson(socket,{t:'traverse',id:me.clientId,seq,accepted:false,x:me.x,y:me.y,z:me.z});return;}
      me={...me,traversal:plan,lastTraverseSeq:seq,verticalVelocity:0,serverGrounded:false,ads:false,moveSpeed:0};socket.serializeAttachment(me);
      const event={t:'traverse',id:me.clientId,accepted:true,...plan};sendJson(socket,event);this.broadcast(event,socket);return;
    }

    if (payload.t === "simTick") { await this.stepSimulation(now, meta); return; }

    if (payload.t === "fire") {
      if(!matchAllowsCombat(meta.match)){sendLoadout(socket,me,{action:'fire',accepted:false,reason:'match_inactive'});return;}
      const requestedWeapon=safeWeapon(payload.weapon||me.weapon);
      if(requestedWeapon!==me.weapon){sendLoadout(socket,me,{action:'fire',accepted:false,reason:'weapon_mismatch'});return;}
      const weapon=safeWeapon(me.weapon),spec=settings.weapons[weapon],unlimited=!!me.godMode;
      if(me.hp<=0||now<me.wastedUntil){sendLoadout(socket,me,{action:'fire',accepted:false,reason:'dead'});return;}
      if(me.traversal){sendLoadout(socket,me,{action:'fire',accepted:false,reason:'traversing'});return;}
      const interruptShotgunReload=!unlimited&&!!me.reloadAt&&weapon==='shotgun'&&me.ammo.shotgun>0;
      if(!unlimited&&me.reloadAt&&!interruptShotgunReload){sendLoadout(socket,me,{action:'fire',accepted:false,reason:'reloading'});return;}
      if(interruptShotgunReload){me.reloadAt=0;me.reloadWeapon='';this.broadcast({t:'reload',id:me.clientId,weapon:'shotgun',reloadAt:0},socket);}
      const switchReadyAt=finiteNumber(me.weaponReadyAt,0),shotReadyAt=finiteNumber(me.fireReadyAt[weapon],0),readyAt=Math.max(switchReadyAt,shotReadyAt);
      if(now<readyAt){const retryAfterMs=Math.max(1,Math.ceil(readyAt-now)),reason=switchReadyAt>=shotReadyAt?'weapon_switch':'cooldown';sendLoadout(socket,me,{action:'fire',accepted:false,reason,retryAfterMs});return;}
      if(!unlimited&&me.ammo[weapon]<=0){me.reloadAt=now+spec.reloadMs;me.reloadWeapon=weapon;socket.serializeAttachment(me);sendLoadout(socket,me,{action:'fire',accepted:false,reason:'empty'});this.broadcast({t:'reload',id:me.clientId,weapon,reloadAt:me.reloadAt},socket);return;}

      const reticle=safeShotAim(me,payload),flashPower=activeFlashPower(me,now);let shotYaw=reticle.yaw,shotPitch=reticle.pitch;
      if(flashPower>.02){const flashSpread=.035+flashPower*.22;shotYaw+=(Math.random()-.5)*2*flashSpread;shotPitch=clamp(shotPitch+(Math.random()-.5)*1.5*flashSpread,-1.4,1.4);me.ads=false;}
      const preShotHeat=decayedFireHeat(me,weapon,now),adsAmount=me.ads?clamp(finiteNumber(payload.adsAmount,1),0,1):0,airborne=me.serverGrounded===false;
      me.fireReadyAt[weapon]=now+spec.cooldownMs;if(!unlimited)me.ammo[weapon]-=1;storeFireHeat(me,weapon,now,preShotHeat);
      const autoReloadStarted=!unlimited&&me.ammo[weapon]===0;if(autoReloadStarted){me.reloadAt=now+spec.reloadMs;me.reloadWeapon=weapon;}
      socket.serializeAttachment(me);
      const spreadRadius=weaponSpreadRadians(weapon,me.moveSpeed,settings.movement.runSpeed,adsAmount,!!me.crouched,airborne,preShotHeat),pellets=Math.max(1,Math.floor(WEAPON_SPECS[weapon]?.pellets||1));
      const launcherPitchOffset=(Number(WEAPON_SPECS[weapon]?.launchPitchDeg)||0)*Math.PI/180;
      for(let i=0;i<pellets;i++){
        const a=spreadShotAngles(shotYaw,clamp(shotPitch+launcherPitchOffset,-1.4,1.4),spreadRadius),launch=shotLaunchPose(me,a.yaw,a.pitch,!!me.crouched,weapon);
        this.spawnBullet({ownerId:me.clientId,ownerTeam:safeTeam(me.team),damage:spec.damage,weapon,lifetimeMs:WEAPON_SPECS[weapon].lifetimeMs,x:launch.x,y:launch.y,z:launch.z,vx:launch.dx*spec.speed,vy:launch.dy*spec.speed,vz:launch.dz*spec.speed,now,consumeAmmo:i===0&&!unlimited,primaryShot:i===0});
      }
      sendLoadout(socket,me,{action:'fire',accepted:true,unlimited});if(autoReloadStarted)this.broadcast({t:'reload',id:me.clientId,weapon,reloadAt:me.reloadAt},socket);await this.stepSimulation(now,meta);return;
    }

    if(payload.t==='throw'){
      if(!matchAllowsCombat(meta.match)){sendJson(socket,{t:'throwAck',id:safeClientId(payload.id).slice(0,24),accepted:false,reason:'match_inactive'});return;}
      const kind=safeEquipmentKind(payload.kind),unlimited=!!me.godMode;
      const requestedId=safeClientId(payload.id).slice(0,24),id=requestedId&&!this.throwables.has(requestedId)?requestedId:crypto.randomUUID().replace(/-/g,'').slice(0,16);
      if(kind!==safeTactical(me.tactical)&&kind!==safeLethal(me.lethal)){sendJson(socket,{t:'throwAck',id:requestedId||id,accepted:false,reason:'loadout'});return;}
      if(me.hp<=0||now<me.wastedUntil||me.traversal||now<finiteNumber(me.equipmentReadyAt,0)||(!unlimited&&me.equipment[kind]<=0)){sendJson(socket,{t:'throwAck',id:requestedId||id,accepted:false});return;}
      me.yaw=finiteNumber(payload.yaw,me.yaw);me.pitch=clamp(finiteNumber(payload.pitch,me.pitch),-1.25,1.15);
      const flashPower=activeFlashPower(me,now);let throwYaw=me.yaw,throwPitch=me.pitch;
      if(flashPower>.02){const flashSpread=.025+flashPower*.16;throwYaw+=(Math.random()-.5)*2*flashSpread;throwPitch=clamp(throwPitch+(Math.random()-.5)*1.4*flashSpread,-1.25,1.15);me.ads=false;}
      const throwVelocity=tacticalThrowVelocity(throwYaw,throwPitch,TACTICAL_THROW_SPEED,TACTICAL_THROW_LOFT);
      me.equipmentReadyAt=now+360;if(!unlimited)me.equipment[kind]-=1;socket.serializeAttachment(me);sendJson(socket,{t:'equipment',equipment:me.equipment,unlimited});sendJson(socket,{t:'throwAck',id,accepted:true});
      const g={id,kind,ownerId:me.clientId,ownerTeam:safeTeam(me.team),x:me.x+throwVelocity.fx*.82,y:me.y+(me.crouched?CROUCH_HEIGHT:PLAYER_HEIGHT)-.22,z:me.z+throwVelocity.fz*.82,vx:throwVelocity.vx,vy:throwVelocity.vy,vz:throwVelocity.vz,born:now,lastAt:now,fuseAt:now+(kind==='sticky'?1850:kind==='frag'?2300:kind==='smoke'?1300:1650),stuck:false,rolling:false,lastBroadcast:now};
      this.throwables.set(id,g);this.broadcast({t:'throwable',...g,at:now});await this.stepSimulation(now,meta);return;
    }

    if (payload.t === "reload") {
      const requestedWeapon=safeWeapon(payload.weapon||me.weapon);
      if(requestedWeapon!==me.weapon){sendLoadout(socket,me,{action:'reload',accepted:false,reason:'weapon_mismatch'});return;}
      const weapon=safeWeapon(me.weapon),spec=settings.weapons[weapon];
      if(me.hp<=0||now<me.wastedUntil){sendLoadout(socket,me,{action:'reload',accepted:false,reason:'dead'});return;}
      if(me.traversal){sendLoadout(socket,me,{action:'reload',accepted:false,reason:'traversing'});return;}
      if(me.godMode){sendLoadout(socket,me,{action:'reload',accepted:true,reason:'unlimited',unlimited:true});return;}
      if(me.reloadAt){sendLoadout(socket,me,{action:'reload',accepted:true,reason:'already'});return;}
      if(me.ammo[weapon]>=WEAPON_SPECS[weapon].mag){sendLoadout(socket,me,{action:'reload',accepted:false,reason:'full'});return;}
      me.reloadAt=now+spec.reloadMs;me.reloadWeapon=weapon;socket.serializeAttachment(me);sendLoadout(socket,me,{action:'reload',accepted:true});this.broadcast({t:'reload',id:me.clientId,weapon,reloadAt:me.reloadAt},socket);return;
    }

    if (payload.t === "weapon") {
      if(me.hp<=0||now<me.wastedUntil){sendLoadout(socket,me,{action:'weapon',accepted:false,reason:'dead'});return;}
      if(me.traversal){sendLoadout(socket,me,{action:'weapon',accepted:false,reason:'traversing'});return;}
      const weapon=safeWeapon(payload.weapon);
      if(!playerCanEquip(me,weapon)){sendLoadout(socket,me,{action:'weapon',accepted:false,reason:'loadout'});return;}
      if(weapon!==me.weapon){me.weapon=weapon;me.reloadAt=0;me.reloadWeapon="";me.weaponReadyAt=now+WEAPON_SWITCH_LOCK_MS;socket.serializeAttachment(me);this.broadcast({t:'weapon',id:me.clientId,weapon},socket);}
      sendLoadout(socket,me,{action:'weapon',accepted:true,retryAfterMs:Math.max(0,Math.ceil(finiteNumber(me.weaponReadyAt,0)-now))});return;
    }

    if(payload.t==='loadout'){
      const next=normalizeLoadout(payload,{primaryWeapon:me.primaryWeapon,tactical:me.tactical,lethal:me.lethal});
      if(matchAllowsLobbyEdits(meta.match)){
        me.primaryWeapon=next.primaryWeapon;me.tactical=next.tactical;me.lethal=next.lethal;me.pendingLoadout=null;me.weapon=next.primaryWeapon;me.ammo=freshAmmo();me.equipment=freshEquipment(next.tactical,next.lethal);me.reloadAt=0;me.reloadWeapon='';me.weaponReadyAt=0;
        if(me.godMode)refreshUnlimitedResources(me);socket.serializeAttachment(me);sendLoadout(socket,me,{action:'loadout',accepted:true,pending:false});this.broadcast({t:'lobbyPlayer',player:publicPlayer(me)});return;
      }
      // CoD-style mid-match class change: preserve the current life exactly.
      // The queued class is consumed atomically by spawnedPlayerState on the
      // next respawn/round spawn, so editing a class can never refill resources.
      me.pendingLoadout=next;socket.serializeAttachment(me);sendLoadout(socket,me,{action:'loadout',accepted:true,pending:true,pendingLoadout:next});return;
    }

    if(payload.t==='lobbyMode'){
      if(!isRoomAdmin(meta,me.clientId)){sendJson(socket,{t:'notice',tone:'error',text:'Admin access required.'});return;}
      if(!matchAllowsLobbyEdits(meta.match)){sendJson(socket,{t:'notice',tone:'error',text:'Game mode can only be changed in the lobby.'});return;}
      const mode=normalizeGameMode(payload.mode),spec=gameModeSpec(mode);meta.match={...meta.match,mode,blueScore:0,redScore:0,scoreLimit:spec.scoreLimit,timeLimitMs:spec.timeLimitMs,winner:'',winnerId:'',winnerName:'',reason:'',updatedAt:now};
      for(const s of this.ctx.getWebSockets()){const p=s.deserializeAttachment()||{};if(!p.clientId||p.replaced)continue;p.pendingTeam='';s.serializeAttachment(p);}
      this.bots=reconcileBots(this.bots,meta.blueBots||0,meta.redBots||0,mode);await this.ctx.storage.put('bots',this.bots);
      await this.putMeta(meta);await this.updateDirectory(this.liveSockets().length,meta);this.broadcastMatch(meta,now,{rulesUpdated:true,by:me.clientId});this.broadcast({t:'bots',config:{blueBots:meta.blueBots||0,redBots:meta.redBots||0,difficulty:safeBotDifficulty(meta.botDifficulty)},bots:this.bots.map(publicBot)});return;
    }

    if(payload.t==='lobbyMinimap'){
      if(!isRoomAdmin(meta,me.clientId)){sendJson(socket,{t:'notice',tone:'error',text:'Admin access required.'});return;}
      if(!matchAllowsLobbyEdits(meta.match)){sendJson(socket,{t:'notice',tone:'error',text:'Minimap visibility can only be changed in the lobby.'});return;}
      meta.match={...meta.match,minimapRevealAll:!!payload.revealAll,updatedAt:now};
      await this.putMeta(meta);await this.updateDirectory(this.liveSockets().length,meta);this.broadcastMatch(meta,now,{rulesUpdated:true,by:me.clientId});return;
    }

    if(payload.t==='startMatch'){
      if(!isRoomAdmin(meta,me.clientId)){sendJson(socket,{t:'notice',tone:'error',text:'Only a lobby admin can start the match.'});return;}
      if(!matchAllowsLobbyEdits(meta.match)){sendJson(socket,{t:'notice',tone:'error',text:'Match has already started.'});return;}
      this.prepareRound(meta,now,{increment:false});await this.putMeta(meta);await this.ctx.storage.put('bots',this.bots);await this.updateDirectory(this.liveSockets().length,meta);return;
    }

    if (payload.t === "god") {
      if (!isRoomAdmin(meta, me.clientId)) {
        sendJson(socket,{t:"notice",tone:"error",text:"Admin access required for God Mode."});
        sendJson(socket,{t:"god",id:me.clientId,enabled:!!me.godMode});
        return;
      }
      me.godMode = !!payload.enabled;
      if(me.godMode)refreshUnlimitedResources(me);
      socket.serializeAttachment(me);
      await this.updateDirectory(this.liveSockets().length,meta);
      this.broadcast({ t: "god", id: me.clientId, enabled: me.godMode, custom:this.isCustomMatch(meta) });
      if(me.godMode)sendJson(socket,{t:'equipment',equipment:me.equipment,unlimited:true});
      sendLoadout(socket,me,{action:'god',accepted:true,unlimited:!!me.godMode});
      return;
    }

    if(payload.t==='team'){
      const mode=matchMode(meta.match),spec=gameModeSpec(mode),nextTeam=safeTeam(payload.team),currentTeam=safeTeam(me.team);
      if(!spec.teamBased){me.pendingTeam='';socket.serializeAttachment(me);sendLoadout(socket,me,{action:'team',accepted:false,reason:'free_for_all',pendingTeam:''});sendJson(socket,{t:'notice',text:'Free For All has no teams.'});return;}
      if(matchAllowsLobbyEdits(meta.match)){
        if(nextTeam!==currentTeam){const sameTeam=this.liveSockets(socket).filter(s=>safeTeam((s.deserializeAttachment()||{}).team)===nextTeam).length;const moved=spawnedPlayerState(me,spawnForTeam(nextTeam,sameTeam),nextTeam,now,{resetStats:false});moved.kills=me.kills;moved.deaths=me.deaths;me=moved;socket.serializeAttachment(me);}
        me.pendingTeam='';socket.serializeAttachment(me);sendLoadout(socket,me,{action:'team',accepted:true,pendingTeam:''});this.broadcast({t:'lobbyPlayer',player:publicPlayer(me)});await this.updateDirectory(this.liveSockets().length,meta);return;
      }
      if(nextTeam===currentTeam){me.pendingTeam='';socket.serializeAttachment(me);sendLoadout(socket,me,{action:'team',accepted:true,pendingTeam:''});sendJson(socket,{t:'teamQueued',id:me.clientId,team:currentTeam,pendingTeam:''});return;}
      me.pendingTeam=nextTeam;socket.serializeAttachment(me);sendLoadout(socket,me,{action:'team',accepted:true,pendingTeam:nextTeam});sendJson(socket,{t:'teamQueued',id:me.clientId,team:currentTeam,pendingTeam:nextTeam});return;
    }

    if (payload.t === "adminPlayer") {
      if (!isRoomAdmin(meta, me.clientId)) {
        sendJson(socket,{t:"notice",tone:"error",text:"Admin access required."});
        return;
      }
      const targetId = safeClientId(payload.targetId);
      const targetSocket = this.ctx.getWebSockets().find((s) => {
        const p = s.deserializeAttachment() || {};
        return p.clientId === targetId && !p.replaced;
      });
      if (!targetSocket) {
        sendJson(socket,{t:"notice",tone:"error",text:"Player is no longer connected."});
        return;
      }
      let target = targetSocket.deserializeAttachment() || {};
      const action = String(payload.action || "");
      if (action === "god") {
        target.godMode = !!payload.enabled;
        if (target.godMode) refreshUnlimitedResources(target);
        targetSocket.serializeAttachment(target);
        await this.updateDirectory(this.liveSockets().length, meta);
        this.broadcast({ t: "god", id: target.clientId, enabled: target.godMode, custom:this.isCustomMatch(meta) });
        if (target.godMode) {
          sendJson(targetSocket,{t:"equipment",equipment:target.equipment,unlimited:true});
        }
        sendLoadout(targetSocket, target, { action: "god", accepted: true, unlimited: !!target.godMode });
        return;
      }
      if (action === "admin") {
        const enabled = !!payload.enabled;
        if (targetId === me.clientId) {
          sendJson(socket,{t:"notice",tone:"error",text:"You cannot change your own admin role."});
          return;
        }
        if (targetId === meta.ownerClientId && !enabled) {
          sendJson(socket,{t:"notice",tone:"error",text:"The match owner cannot be demoted."});
          return;
        }
        const admins = new Set(meta.adminClientIds);
        if (enabled) admins.add(targetId); else admins.delete(targetId);
        admins.add(meta.ownerClientId);
        meta.adminClientIds = [...admins];
        await this.putMeta(meta);
        target.admin = isRoomAdmin(meta, targetId);
        const godDisabled=!target.admin&&target.godMode;
        if (godDisabled) target.godMode = false;
        targetSocket.serializeAttachment(target);
        await this.updateDirectory(this.liveSockets().length, meta);
        if(godDisabled){this.broadcast({ t: "god", id: targetId, enabled: false, custom:this.isCustomMatch(meta) });sendLoadout(targetSocket, target, { action: "god", accepted: true, unlimited: false });}
        this.broadcast({ t: "adminRole", id: targetId, enabled: target.admin, owner: targetId === meta.ownerClientId });
        return;
      }
      return;
    }

    if (payload.t === "adminSettings") {
      if (!isRoomAdmin(meta, me.clientId)) {
        sendJson(socket,{t:"notice",tone:"error",text:"Admin access required."});
        return;
      }
      const section = payload.section === 'advanced' ? 'advanced' : 'gameplay';
      const patch = payload.patch && typeof payload.patch === 'object' ? payload.patch : payload.settings && typeof payload.settings === 'object' ? payload.settings : {};
      const current = normalizeWorldSettings(meta.settings);
      const merged = section === 'advanced'
        ? { ...current, weapons:Object.fromEntries(WEAPON_ORDER.map(name=>[name,{...current.weapons[name],...(patch.weapons?.[name]||{})}])) }
        : { ...current, movement:{...current.movement,...(patch.movement||{})}, combat:{...current.combat,...(patch.combat||{})} };
      const nextSettings = normalizeWorldSettings(merged);
      meta.settings = nextSettings;
      await this.putMeta(meta);
      this.broadcast({ t: "settings", settings: nextSettings, section, by: me.clientId, custom:this.isCustomMatch(meta) });
      await this.updateDirectory(this.liveSockets().length, meta);
      return;
    }

    if (payload.t === "adminMatch") {
      if (!isRoomAdmin(meta, me.clientId)) {
        sendJson(socket,{t:"notice",tone:"error",text:"Admin access required."});
        return;
      }
      const rules=normalizeMatchRules({...payload.rules,mode:matchMode(meta.match),minimapRevealAll:!!meta.match.minimapRevealAll});
      const match=normalizeMatchState(meta.match,now,rules);
      match.scoreLimit=rules.scoreLimit;match.timeLimitMs=rules.timeLimitMs;
      if(matchAllowsCombat(match)&&match.startedAt)match.endsAt=match.timeLimitMs>0?match.startedAt+match.timeLimitMs:0;
      match.updatedAt = now; meta.match = match;
      this.matchDirty = true; await this.putMeta(meta); this.matchDirty = false;
      this.broadcastMatch(meta, now, {rulesUpdated:true,by:me.clientId}); await this.updateDirectory(this.liveSockets().length, meta);
      if(matchAllowsCombat(match)&&gameModeSpec(match.mode).scoreType==='team'&&(match.blueScore>=match.scoreLimit||match.redScore>=match.scoreLimit)){
        const winner=match.blueScore===match.redScore?'draw':match.blueScore>match.redScore?'blue':'red';this.finishMatch(meta,winner,'score',now);
      }else if(matchAllowsCombat(match)&&gameModeSpec(match.mode).scoreType==='player'){
        const leader=this.individualLeaders()[0];if(leader&&leader.kills>=match.scoreLimit)this.finishMatch(meta,{winnerId:leader.id,winnerName:leader.name},'score',now);
      }
      return;
    }


    if (payload.t === "adminBots") {
      if (!isRoomAdmin(meta, me.clientId)) {
        sendJson(socket,{t:"notice",tone:"error",text:"Admin access required."});
        return;
      }
      const blueBots = clamp(Math.floor(finiteNumber(payload.blueBots, meta.blueBots || 0)), 0, MAX_BOTS);
      const redBots = clamp(Math.floor(finiteNumber(payload.redBots, meta.redBots || 0)), 0, MAX_BOTS);
      if (blueBots + redBots > MAX_BOTS) {
        sendJson(socket,{t:"notice",tone:"error",text:`Maximum ${MAX_BOTS} bots per match.`});
        return;
      }
      meta.blueBots = blueBots;
      meta.redBots = redBots;
      meta.botDifficulty = safeBotDifficulty(payload.difficulty);
      await this.putMeta(meta);
      this.bots = reconcileBots(this.bots, blueBots, redBots, matchMode(meta.match));
      const activeBotIds = new Set(this.bots.map((bot) => bot.id));
      for (const [id, bullet] of [...this.bullets.entries()]) {
        if (String(bullet.ownerId || "").startsWith("bot-") && !activeBotIds.has(bullet.ownerId)) this.endBullet(id, "bot-removed");
      }
      await this.ctx.storage.put("bots", this.bots);
      const config = { blueBots, redBots, difficulty: meta.botDifficulty };
      this.broadcast({ t: "bots", config, bots: this.bots.map(publicBot) });
      const players = this.ctx.getWebSockets().filter((s) => { const p = s.deserializeAttachment() || {}; return p.clientId && !p.replaced; }).length;
      await this.updateDirectory(players, meta);
      return;
    }

    if (payload.t === "ping") {
      sendJson(socket,{t:"pong",at:now,clientAt:finiteNumber(payload.clientAt,0)});
      await this.stepSimulation(now, meta);
    }
  }

  solidActors(excludeId, now=Date.now()) {
    const out=[];
    for(const socket of this.ctx.getWebSockets()){
      const p=socket.deserializeAttachment()||{};
      if(!p.clientId||p.replaced||p.clientId===excludeId||p.hp<=0||now<(p.wastedUntil||0))continue;
      out.push(p);
    }
    for(const bot of this.bots||[]){
      if(!bot?.id||bot.id===excludeId||bot.hp<=0||now<(bot.wastedUntil||0))continue;
      out.push(bot);
    }
    return out;
  }

  actorBlocksAt(x,z,y,fromX,fromZ,actors,playerHeight=PLAYER_HEIGHT) {
    for(const actor of actors||[]){
      const ax=finiteNumber(actor.x,0),ay=finiteNumber(actor.y,terrainHeight(ax,finiteNumber(actor.z,0))),az=finiteNumber(actor.z,0),actorHeight=actor.crouched?CROUCH_HEIGHT:PLAYER_HEIGHT;
      if(y+playerHeight-.08<=ay||y>=ay+actorHeight-.08)continue;
      const minDist=PLAYER_RADIUS*2+.02,newDist=Math.hypot(x-ax,z-az),oldDist=Math.hypot(fromX-ax,fromZ-az);
      if(newDist<minDist&&(oldDist>=minDist||newDist<oldDist-.002))return true;
    }
    return false;
  }

  advanceTraversalState(me, now) {
    if(!me?.traversal)return me;
    const pose=traversalPose(me.traversal,now);if(!pose){return {...me,traversal:null};}
    const next={...me,x:pose.x,y:pose.y,z:pose.z,verticalVelocity:0,serverGrounded:false,moveSpeed:0,lastVerticalAt:now};
    if(pose.done){const finished=me.traversal;next.x=finished.endX;next.y=finished.endY;next.z=finished.endZ;next.traversal=null;next.serverGrounded=finished.endGrounded!==false;next.verticalVelocity=next.serverGrounded?0:(Number.isFinite(Number(finished.exitVelocityY))?Number(finished.exitVelocityY):-1.15);if(next.serverGrounded)next.lastGroundedAt=now;next.moveBudgetSec=MOVE_BUDGET_INITIAL_SEC;}
    return next;
  }

  validateHumanState(me, payload, now, settings) {
    const desiredX = clamp(finiteNumber(payload.x, me.x), -ARENA_LIMIT, ARENA_LIMIT);
    const desiredZ = clamp(finiteNumber(payload.z, me.z), -ARENA_LIMIT, ARENA_LIMIT);
    if(me.traversal){
      const desiredY=finiteNumber(payload.y,me.y),error=Math.hypot(desiredX-me.x,desiredY-me.y,desiredZ-me.z);
      return {corrected:error>.18,verticalCorrected:false,player:{...me,lastStateAt:now,yaw:finiteNumber(payload.yaw,me.yaw),pitch:clamp(finiteNumber(payload.pitch,me.pitch),-1.4,1.4),ads:false,moveSpeed:0}};
    }
    const elapsed = clamp((now - finiteNumber(me.lastStateAt, now)) / 1000, 0, 0.25);
    const flashPower = activeFlashPower(me, now);
    const ads = flashPower > 0.12 ? false : !!payload.ads;
    let crouched = !!payload.crouched;
    if (!crouched && me.crouched && worldHeightExpansionBlockedAt(me.x, me.z, me.y, CROUCH_HEIGHT, PLAYER_HEIGHT, PLAYER_RADIUS)) crouched = true;
    const playerHeight = crouched ? CROUCH_HEIGHT : PLAYER_HEIGHT;
    const baseSpeed = ads ? settings.movement.walkSpeed : settings.movement.runSpeed;
    const currentAllowedSpeed = baseSpeed * (crouched ? CROUCH_SPEED_MULTIPLIER : 1);
    const previousBaseSpeed = me.ads ? settings.movement.walkSpeed : settings.movement.runSpeed;
    const previousAllowedSpeed = previousBaseSpeed * (me.crouched ? CROUCH_SPEED_MULTIPLIER : 1);
    // A packet that changes ADS/crouch also contains movement from the previous
    // stance. Validate that interval against the faster of the two legitimate
    // states so pressing ADS/crouch cannot pull the player backward.
    const allowedSpeed = Math.max(currentAllowedSpeed, previousAllowedSpeed);

    let inputX = clamp(finiteNumber(payload.moveX, 0), -1, 1);
    let inputZ = clamp(finiteNumber(payload.moveZ, 0), -1, 1);
    const rawInputLength = Math.hypot(inputX, inputZ);
    if (rawInputLength > 1) { inputX /= rawInputLength; inputZ /= rawInputLength; }
    const inputMagnitude = Math.min(1, rawInputLength);
    const nextYaw = finiteNumber(payload.yaw, me.yaw);

    const knock = advanceKnockback(finiteNumber(me.knockVelocityX, 0), finiteNumber(me.knockVelocityZ, 0), elapsed);
    const knockDx = knock.dx;
    const knockDz = knock.dz;
    let knockVelocityX = knock.xVelocity;
    let knockVelocityZ = knock.zVelocity;

    // Client position is never allowed to increase the server movement budget.
    // It is only used to avoid applying a newly pressed input across time that
    // was actually spent idle, and to respect shorter predicted movement when
    // the local collision controller stopped against geometry.
    const reportedUserDx = desiredX - me.x - knockDx;
    const reportedUserDz = desiredZ - me.z - knockDz;
    const reportedUserDistance = Math.hypot(reportedUserDx, reportedUserDz);
    // A bounded server-time token budget absorbs normal WebSocket arrival jitter
    // without trusting client timestamps. Unused credit is capped, so long-term
    // movement speed remains server-authoritative and idle time cannot accumulate
    // an unlimited burst.
    let moveBudgetSec = clamp(finiteNumber(me.moveBudgetSec, MOVE_BUDGET_INITIAL_SEC) + elapsed, 0, MOVE_BUDGET_MAX_SEC);
    if(inputMagnitude<.05&&reportedUserDistance<.005)moveBudgetSec=Math.min(moveBudgetSec,MOVE_BUDGET_INITIAL_SEC);
    // Validate the displacement the client actually simulated, not the final
    // input sample in this packet. A release/turn packet can legitimately have
    // movement since the previous packet even though moveX/moveZ now changed or
    // reached zero. Reconstructing the whole interval from only that final input
    // was the main source of stop/turn rubber-banding. Speed, arena, world and
    // actor collision remain server-authoritative.
    const movementRate = allowedSpeed;
    const maxUserDistance = movementRate * moveBudgetSec;
    const userDistance = Math.min(maxUserDistance, reportedUserDistance);
    if (movementRate > 1e-6) moveBudgetSec = Math.max(0, moveBudgetSec - userDistance / movementRate);
    const reportedNorm = reportedUserDistance > 1e-6 ? reportedUserDistance : 1;
    const moveDx = reportedUserDistance > 1e-6 ? reportedUserDx / reportedNorm * userDistance : 0;
    const moveDz = reportedUserDistance > 1e-6 ? reportedUserDz / reportedNorm * userDistance : 0;

    const dx = moveDx + knockDx;
    const dz = moveDz + knockDz;
    const speedViolation = reportedUserDistance > maxUserDistance + 0.08;

    const startSupport = worldSupportHeight(me.x, me.z, me.y);
    const currentVerticalVelocity = finiteNumber(me.verticalVelocity, 0);
    let serverGrounded = me.serverGrounded !== false && Math.abs(me.y - startSupport) <= 0.28;
    if (!serverGrounded && currentVerticalVelocity <= 0 && Math.abs(me.y - startSupport) <= 0.08) serverGrounded = true;
    let lastGroundedAt=Math.max(0,finiteNumber(me.lastGroundedAt,serverGrounded?now:0));if(serverGrounded)lastGroundedAt=now;
    const solidActors = this.solidActors(me.clientId, now);
    const horizontal = sweepHorizontalMovement({
      x:me.x,y:me.y,z:me.z,dx,dz,grounded:serverGrounded,arenaLimit:ARENA_LIMIT,followDrop:GROUND_FOLLOW_DROP,
      supportHeight:(x,z,y)=>worldSupportHeight(x,z,y,crouched),
      stepUpHeight:(x,z,y,maxStep)=>worldStepUpHeight(x,z,y,maxStep,PLAYER_RADIUS),maxStepHeight:MAX_STEP_HEIGHT,
      blockedAt:(x,z,y,fromX,fromZ)=>worldMoveBlockedAt(x,z,y,fromX,fromZ,playerHeight,PLAYER_RADIUS)||this.actorBlocksAt(x,z,y,fromX,fromZ,solidActors,playerHeight),
    });
    let x=horizontal.x,z=horizontal.z,walkY=horizontal.y,followsSupport=horizontal.grounded;

    const rawRequestedY = finiteNumber(payload.y, me.y);
    const incomingJumpSeq = Math.max(0, Math.floor(finiteNumber(payload.jumpSeq, 0)));
    const previousJumpSeq = Math.max(0, Math.floor(finiteNumber(me.lastJumpSeq, 0)));
    const coyoteEligible=!followsSupport&&currentVerticalVelocity<=0&&now-lastGroundedAt<=SERVER_COYOTE_TIME_MS;
    const jumpRequested = incomingJumpSeq > previousJumpSeq && ((serverGrounded && followsSupport)||coyoteEligible);
    const gravity = settings.movement.gravity;
    const jumpSpeed = Math.sqrt(2 * gravity * settings.movement.jumpHeight);
    let y = followsSupport ? walkY : me.y;
    let verticalVelocity = followsSupport ? 0 : currentVerticalVelocity;
    let ceilingHit = false;

    if (jumpRequested) {
      y = followsSupport ? walkY : me.y;
      verticalVelocity = jumpSpeed;
      serverGrounded = false;
      followsSupport = false;
    } else if (serverGrounded && followsSupport) {
      y = walkY;
      verticalVelocity = 0;
      serverGrounded = true;lastGroundedAt=now;
    } else {
      serverGrounded = false;
      let verticalRemaining=clamp((now-finiteNumber(me.lastVerticalAt,now))/1000,0,SERVER_VERTICAL_MAX_CATCHUP_SEC);
      while(verticalRemaining>1e-6&&!serverGrounded){
        const step=Math.min(1/60,verticalRemaining),verticalStep=advanceVerticalMotion(y,verticalVelocity,gravity,step),ceiling=resolveCeilingCollision(y,verticalStep.y,x,z,playerHeight);
        y=ceiling.y;ceilingHit=ceilingHit||ceiling.hit;verticalVelocity=ceiling.hit&&verticalStep.velocity>0?0:verticalStep.velocity;verticalRemaining-=step;
        const support=worldSupportHeight(x,z,y);if(y<=support+.025&&verticalVelocity<=0){y=support;verticalVelocity=0;serverGrounded=true;lastGroundedAt=now;break;}
      }
      if(!serverGrounded){
        const ground=worldSupportHeight(x,z,y),clientGrounded=payload.grounded===true,closeEnoughToLand=clientGrounded&&verticalVelocity<=0&&rawRequestedY<=ground+.14&&y-ground<=GROUND_FOLLOW_DROP;
        if(closeEnoughToLand){y=ground;verticalVelocity=0;serverGrounded=true;lastGroundedAt=now;}
      }
    }

    const verticalError = Math.abs(y - rawRequestedY);
    const verticalCorrected = ceilingHit || verticalError > 0.28;
    const horizontalError = Math.hypot(x - desiredX, z - desiredZ);
    // Do not emit a correction merely because an internal sweep touched a wall.
    // If the client independently stopped at the same surface there is nothing
    // to reconcile. Only real position divergence is sent back.
    const corrected = speedViolation || verticalCorrected || horizontalError > 0.10;
    const actualTravel = Math.hypot(x - me.x, z - me.z);

    return {
      corrected,
      verticalCorrected,
      player: {
        ...me,
        x,
        y,
        z,
        ads,
        crouched,
        moveSpeed: elapsed > 0 ? actualTravel / elapsed : 0,
        moveBudgetSec,
        serverGrounded,
        lastGroundedAt,
        verticalVelocity,
        knockVelocityX,
        knockVelocityZ,
        lastVerticalAt: now,
        lastJumpSeq: Math.max(previousJumpSeq, incomingJumpSeq),
        lastStateAt: now,
        yaw: nextYaw,
        pitch: clamp(finiteNumber(payload.pitch, me.pitch), -1.4, 1.4),
      },
    };
  }

  advanceReloadState(me, now, settings) {
    if (!me?.reloadAt || now < me.reloadAt) return '';
    const weapon=safeWeapon(me.reloadWeapon||me.weapon);
    if (weapon === 'shotgun') {
      me.ammo.shotgun=Math.min(WEAPON_SPECS.shotgun.mag,me.ammo.shotgun+1);
      const continues=me.ammo.shotgun<WEAPON_SPECS.shotgun.mag;
      me.reloadAt=continues?now+settings.weapons.shotgun.reloadMs:0;
      me.reloadWeapon=continues?'shotgun':'';
      return 'reloadShell';
    }
    me.ammo[weapon]=WEAPON_SPECS[weapon].mag;me.reloadAt=0;me.reloadWeapon='';
    return 'reloadComplete';
  }

  advanceReloadForSocket(socket, me, now, settings) {
    const action=this.advanceReloadState(me,now,settings);
    if(!action)return me;
    socket.serializeAttachment(me);sendLoadout(socket,me,{action,accepted:true});
    if(action==='reloadShell')this.broadcast({t:'reloadShell',id:me.clientId,weapon:'shotgun',reloadAt:me.reloadAt||0},socket);
    return me;
  }

  advanceHumanReloads(now, settings) {
    for (const socket of this.ctx.getWebSockets()) {
      let player = socket.deserializeAttachment() || {};
      if (!player.clientId || player.replaced || player.godMode) continue;
      this.advanceReloadForSocket(socket, player, now, settings);
    }
  }

  spawnBullet({ ownerId, ownerTeam, damage, weapon, lifetimeMs, x, y, z, vx, vy, vz, now, consumeAmmo=true, primaryShot=consumeAmmo }) {
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const safe = safeWeapon(weapon);
    const weaponSpec=WEAPON_SPECS[safe],bullet = {
      id, ownerId, ownerTeam: safeTeam(ownerTeam), damage, weapon: safe,
      penetrationPower: safe === "sniper" ? Math.max(1, damage) : 0,
      gravity:Math.max(0,finiteNumber(weaponSpec.projectileGravity,0)),explosionRadius:Math.max(0,finiteNumber(weaponSpec.explosionRadius,0)),explosionDamage:Math.max(0,finiteNumber(weaponSpec.explosionDamage,0)),
      hitTargets: new Set(),traveledDistance: 0,
      lifetimeMs: lifetimeMs || weaponSpec.lifetimeMs, x, y, z, vx, vy, vz, born: now, lastAt: now, lastBroadcast: now,
      rpgBaseSpeed:safe==='rpg'?Math.max(1,Math.hypot(vx,vy,vz)):0,rpgBaseYaw:safe==='rpg'?Math.atan2(-vx,-vz):0,rpgBasePitch:safe==='rpg'?Math.asin(clamp(vy/Math.max(1,Math.hypot(vx,vy,vz)),-1,1)):0,rpgWanderPhase:safe==='rpg'?Math.random()*Math.PI*2:0,
    };
    this.bullets.set(id, bullet);
    this.broadcast({ t: "shot", id, ownerId, ownerTeam: bullet.ownerTeam, damage, weapon: safe, lifetimeMs: bullet.lifetimeMs, gravity:bullet.gravity, x, y, z, vx, vy, vz, consumeAmmo, primaryShot:!!primaryShot, at: now });
  }

  async stepSimulation(now, meta) {
    // Gameplay time is advanced from the server clock only. Bots use a fixed
    // 30 Hz accumulator so idle clients no longer slow the match, while a
    // bounded catch-up window prevents a long-suspended room from creating a
    // large CPU spike on the first packet back.
    const settings = meta.settings;
    this.stepMatch(now, meta);
    const match = meta.match;
    if (matchAllowsRespawn(match)) this.respawnExpiredHumans(now);
    if (this.matchDirty) { await this.putMeta(meta); this.matchDirty = false; }

    if (!this.lastSimAt) { this.lastSimAt = now; this.simAccumulatorMs = 0; return; }
    const simDeltaMs = Math.max(0, now - this.lastSimAt);
    if (simDeltaMs < SIM_MIN_STEP_MS) return;
    this.lastSimAt = now;
    this.simAccumulatorMs = Math.min(SIM_MAX_CATCHUP_MS, finiteNumber(this.simAccumulatorMs, 0) + simDeltaMs);

    const fixedSeconds = SIM_FIXED_STEP_MS / 1000;
    let simAt = now - this.simAccumulatorMs;
    let fixedSteps = 0;
    const maxFixedSteps = Math.ceil(SIM_MAX_CATCHUP_MS / SIM_FIXED_STEP_MS);
    while (this.simAccumulatorMs + 1e-6 >= SIM_FIXED_STEP_MS && fixedSteps < maxFixedSteps) {
      simAt += SIM_FIXED_STEP_MS;
      if (matchAllowsMovement(match)) this.stepBots(simAt, fixedSeconds, settings, meta);
      this.simAccumulatorMs -= SIM_FIXED_STEP_MS;
      fixedSteps += 1;
    }

    this.advanceHumanReloads(now, settings);
    if (matchAllowsCombat(match)) {
      this.stepThrowables(now, settings);
      this.stepBullets(now, settings);
      this.stepRegeneration(now, settings);
    }
    if (this.matchDirty) {
      await this.putMeta(meta); this.matchDirty = false;
      void this.updateDirectory(this.liveSockets().length, meta).catch(()=>{});
    }

    if (now - this.lastBotBroadcastAt >= 50) {
      this.lastBotBroadcastAt = now;
      if (this.bots.length) this.broadcast({ t: "botState", bots: this.bots.map(publicBot) });
    }
    if (now - this.lastPersistAt >= BOT_PERSIST_INTERVAL_MS) {
      this.lastPersistAt = now;
      try { await this.ctx.storage.put("bots", this.bots); } catch {}
    }
    if (now - this.lastDirectoryHeartbeatAt >= DIRECTORY_HEARTBEAT_MS) {
      this.lastDirectoryHeartbeatAt = now;
      void this.updateDirectory(this.liveSockets().length, meta).catch(()=>{});
    }
    if (now >= meta.expiresAt - 60_000) {
      meta.expiresAt = now + ROOM_MAX_LIFETIME_MS;
      await this.putMeta(meta);
      void this.updateDirectory(this.liveSockets().length, meta).catch(()=>{});
    }
  }

  respawnExpiredHumans(now) {
    for (const socket of this.ctx.getWebSockets()) {
      const player = socket.deserializeAttachment() || {};
      if (!player.clientId || player.replaced || player.hp > 0) continue;
      if (!player.wastedUntil || now < player.wastedUntil) continue;

      const team = player.pendingTeam ? safeTeam(player.pendingTeam) : safeTeam(player.team),mode=matchMode(this.metaCache?.match);
      const actors=[...this.ctx.getWebSockets().map(s=>s.deserializeAttachment()||{}),...(this.bots||[])];
      const spawn=this.selectSpawn(mode,team,actors,Math.floor(Math.random()*spawnPointCount(mode,team)),player.clientId,now);
      const respawned=spawnedPlayerState(player,spawn,team,now);
      socket.serializeAttachment(respawned);
      this.broadcast({ t: "respawn", player: publicPlayer(respawned) });
    }
  }

  stepRegeneration(now, settings) {
    if (settings.combat.regenPerSecond <= 0) return;
    for (const socket of this.ctx.getWebSockets()) {
      const player = socket.deserializeAttachment() || {};
      if (!player.clientId || player.replaced || player.hp <= 0 || player.hp >= 100 || now < (player.wastedUntil || 0)) continue;
      if (!player.regenAt) player.regenAt = now + settings.combat.regenDelayMs;
      if (now < player.regenAt) continue;
      const ticks = 1 + Math.floor((now - player.regenAt) / HEALTH_REGEN_TICK_MS);
      player.hp = Math.min(100, player.hp + ticks * settings.combat.regenPerSecond * (HEALTH_REGEN_TICK_MS / 1000));
      player.regenAt += ticks * HEALTH_REGEN_TICK_MS;
      socket.serializeAttachment(player);
      this.broadcast({ t: "health", id: player.clientId, hp: player.hp });
    }

    for (const bot of this.bots) {
      if (bot.hp <= 0 || bot.hp >= 100 || now < (bot.wastedUntil || 0)) continue;
      if (!bot.regenAt) bot.regenAt = now + settings.combat.regenDelayMs;
      if (now < bot.regenAt) continue;
      const ticks = 1 + Math.floor((now - bot.regenAt) / HEALTH_REGEN_TICK_MS);
      bot.hp = Math.min(100, bot.hp + ticks * settings.combat.regenPerSecond * (HEALTH_REGEN_TICK_MS / 1000));
      bot.regenAt += ticks * HEALTH_REGEN_TICK_MS;
      this.broadcast({ t: "health", id: bot.id, hp: bot.hp });
    }
  }

  stepBots(now, dt, settings, meta) {
    const humans = this.ctx.getWebSockets()
      .map((socket) => ({ kind: "human", socket, target: socket.deserializeAttachment() || {} }))
      .filter(({ target }) => target.clientId && !target.replaced && target.hp > 0 && now >= (target.wastedUntil || 0));
    const difficulty=safeBotDifficulty(meta?.botDifficulty),profile=BOT_DIFFICULTIES[difficulty];

    for (let i = 0; i < this.bots.length; i += 1) {
      const bot = this.bots[i];
      if (bot.hp <= 0) {
        if (now >= bot.wastedUntil) {
          const mode=matchMode(meta.match),actors=[...humans.map(({target})=>target),...this.bots],spawn=this.selectSpawn(mode,bot.team,actors,i+Math.floor(Math.random()*spawnPointCount(mode,bot.team)),bot.id,now),primary=safePrimaryWeapon(bot.primaryWeapon||bot.weapon);
          Object.assign(bot,spawn,{hp:100,wastedUntil:0,regenAt:0,weapon:primary,primaryWeapon:primary,ammo:freshAmmo(),reloadAt:0,reloadWeapon:'',flashUntil:0,flashSpin:0,traversal:null,lastSeenTargetId:'',lastSeenAt:0,lastKnownX:spawn.x,lastKnownZ:spawn.z,patrolX:spawn.x,patrolZ:spawn.z,patrolUntil:0,patrolNodeIndex:-1});
          this.broadcast({t:'respawn',player:publicBot(bot)});
        }
        continue;
      }
      if(bot.traversal){
        const pose=traversalPose(bot.traversal,now);
        if(pose){bot.x=pose.x;bot.y=pose.y;bot.z=pose.z;if(pose.done){bot.x=bot.traversal.endX;bot.y=bot.traversal.endY;bot.z=bot.traversal.endZ;bot.traversal=null;}else continue;}
        else bot.traversal=null;
      }

      const botWeapon=safePrimaryWeapon(bot.primaryWeapon||bot.weapon);bot.primaryWeapon=botWeapon;bot.weapon=botWeapon;
      if(bot.reloadAt&&now>=bot.reloadAt){
        if(botWeapon==='shotgun'){
          bot.ammo.shotgun=Math.min(WEAPON_SPECS.shotgun.mag,(bot.ammo.shotgun||0)+1);
          if(bot.ammo.shotgun<WEAPON_SPECS.shotgun.mag){bot.reloadAt=now+settings.weapons.shotgun.reloadMs;bot.reloadWeapon='shotgun';}
          else{bot.reloadAt=0;bot.reloadWeapon='';}
        }else{bot.ammo[botWeapon]=WEAPON_SPECS[botWeapon].mag;bot.reloadAt=0;bot.reloadWeapon='';}
      }
      if(now<finiteNumber(bot.flashUntil,0)){
        bot.yaw+=dt*(bot.flashSpin||2.2);
        const step=settings.movement.walkSpeed*.22*dt,dx=Math.sin(bot.yaw)*step,dz=Math.cos(bot.yaw)*step;
        if(!worldBlockedAt(bot.x+dx,bot.z+dz,bot.y,PLAYER_HEIGHT,.34)){bot.x+=dx;bot.z+=dz;bot.y=worldSupportHeight(bot.x,bot.z,bot.y);}
        continue;
      }

      const solidActors=this.solidActors(bot.id,now);
      const tryTraverse=(ax,az)=>{
        const len=Math.hypot(ax,az);if(len<.2||bot.traversal)return false;
        const dirX=ax/len,dirZ=az/len,candidate=findTraversalCandidate({x:bot.x,y:bot.y,z:bot.z,dirX,dirZ,height:PLAYER_HEIGHT,radius:PLAYER_RADIUS,airborne:false});
        if(!candidate||candidate.endGrounded===false||this.actorBlocksAt(candidate.endX,candidate.endZ,candidate.endY,bot.x,bot.z,solidActors,PLAYER_HEIGHT))return false;
        const plan=createTraversalPlan(candidate,bot.x,bot.y,bot.z,now,++bot.traverseSeq);if(!plan)return false;
        bot.traversal=plan;this.broadcast({t:'traverse',id:bot.id,accepted:true,...plan});return true;
      };
      const tryMove=(ax,az,step)=>{
        const fromX=bot.x,fromZ=bot.z;
        const out=sweepHorizontalMovement({
          x:bot.x,y:bot.y,z:bot.z,dx:ax*step,dz:az*step,grounded:true,arenaLimit:ARENA_LIMIT,followDrop:GROUND_FOLLOW_DROP,
          supportHeight:(x,z,y)=>worldSupportHeight(x,z,y,false,.34),
          stepUpHeight:(x,z,y,maxStep)=>worldStepUpHeight(x,z,y,maxStep,.34),maxStepHeight:MAX_STEP_HEIGHT,
          blockedAt:(x,z,y,fx,fz)=>worldMoveBlockedAt(x,z,y,fx,fz,PLAYER_HEIGHT,.34)||this.actorBlocksAt(x,z,y,fx,fz,solidActors,PLAYER_HEIGHT),
        });
        const moved=Math.hypot(out.x-fromX,out.z-fromZ)>.005;bot.x=out.x;bot.y=out.y;bot.z=out.z;return moved;
      };

      const targetCandidates=[];
      const consider=(kind,target,socket=null)=>{
        if(!target||target.hp<=0||combatantsAreFriendly(matchMode(meta.match),bot.id,bot.team,target.id||target.clientId,target.team)||target.id===bot.id||target.clientId===bot.id)return;
        const tx=finiteNumber(target.x,0),tz=finiteNumber(target.z,0),dx=tx-bot.x,dz=tz-bot.z,d2=dx*dx+dz*dz;targetCandidates.push({kind,target,socket,dx,dz,d2});
      };
      for(const h of humans)consider('human',h.target,h.socket);
      for(const other of this.bots){if(other===bot||now<(other.wastedUntil||0))continue;consider('bot',other,null);}
      targetCandidates.sort((a,b)=>a.d2-b.d2);
      let nearest=null;for(const candidate of targetCandidates){if(this.actorLineOfSight(bot,candidate.target,now)){nearest=candidate;break;}}

      if(!nearest){
        const memoryActive=bot.lastSeenAt&&now-bot.lastSeenAt<=BOT_TARGET_MEMORY_MS;
        if(!memoryActive&&(now>=finiteNumber(bot.patrolUntil,0)||Math.hypot(bot.patrolX-bot.x,bot.patrolZ-bot.z)<1.2)){
          let picked=false,bestNode=null;
          for(let nodeIndex=0;nodeIndex<COMBAT_FLOW_NODES.length;nodeIndex++){
            if(nodeIndex===bot.patrolNodeIndex)continue;
            const node=COMBAT_FLOW_NODES[nodeIndex],px=node.x,pz=node.z,py=worldSupportHeight(px,pz,bot.y),distance=Math.hypot(px-bot.x,pz-bot.z);
            if(distance<11||distance>62||worldBlockedAt(px,pz,py,PLAYER_HEIGHT,.34))continue;
            const visible=this.actorLineOfSight(bot,{x:px,y:py,z:pz},now);if(!visible)continue;
            const idealPenalty=Math.abs(distance-34),score=idealPenalty+Math.random()*5;
            if(!bestNode||score<bestNode.score)bestNode={score,nodeIndex,px,pz};
          }
          if(bestNode){bot.patrolX=bestNode.px;bot.patrolZ=bestNode.pz;bot.patrolNodeIndex=bestNode.nodeIndex;picked=true;}
          for(let attempt=0;attempt<8&&!picked;attempt++){
            const angle=Math.random()*Math.PI*2,distance=12+Math.random()*26,px=clamp(bot.x+Math.cos(angle)*distance,-ARENA_LIMIT+2,ARENA_LIMIT-2),pz=clamp(bot.z+Math.sin(angle)*distance,-ARENA_LIMIT+2,ARENA_LIMIT-2),py=worldSupportHeight(px,pz,bot.y);
            if(!worldBlockedAt(px,pz,py,PLAYER_HEIGHT,.34)){bot.patrolX=px;bot.patrolZ=pz;bot.patrolNodeIndex=-1;picked=true;}
          }
          bot.patrolUntil=now+BOT_PATROL_MIN_MS+Math.random()*(BOT_PATROL_MAX_MS-BOT_PATROL_MIN_MS);
        }
        const goalX=memoryActive?finiteNumber(bot.lastKnownX,bot.x):finiteNumber(bot.patrolX,bot.x),goalZ=memoryActive?finiteNumber(bot.lastKnownZ,bot.z):finiteNumber(bot.patrolZ,bot.z),dx=goalX-bot.x,dz=goalZ-bot.z,d=Math.hypot(dx,dz);
        if(d>.65){const ux=dx/d,uz=dz/d,speed=(memoryActive?settings.movement.runSpeed*.66:settings.movement.walkSpeed*.62)*profile.moveWalk,step=Math.min(d,speed*dt);bot.yaw=Math.atan2(-dx,-dz);if(!tryMove(ux,uz,step)&&!tryTraverse(ux,uz))tryMove(-uz,ux,step*.72)||tryMove(uz,-ux,step*.72);bot.y=worldSupportHeight(bot.x,bot.z,bot.y);}
        else if(memoryActive){bot.lastSeenAt=0;bot.lastSeenTargetId='';}
        continue;
      }

      const d=Math.sqrt(nearest.d2)||.001,target=nearest.target,targetId=String(target.clientId||target.id||'');bot.lastSeenTargetId=targetId;bot.lastSeenAt=now;bot.lastKnownX=finiteNumber(target.x,bot.x);bot.lastKnownZ=finiteNumber(target.z,bot.z);bot.yaw=Math.atan2(-nearest.dx,-nearest.dz);
      const ux=nearest.dx/d,uz=nearest.dz/d;
      let preferredRange=profile.preferredRange,engageRange=profile.range;
      if(botWeapon==='shotgun'||botWeapon==='semiShotgun'){preferredRange=Math.min(preferredRange,botWeapon==='shotgun'?5.2:6.2);engageRange=Math.min(botWeapon==='shotgun'?18:21,engageRange);}
      else if(botWeapon==='sniper'){preferredRange=Math.max(14,preferredRange*1.8);engageRange=Math.max(36,engageRange*1.18);}
      if(d>preferredRange){
        const speed=d>16?settings.movement.runSpeed*profile.moveRun:settings.movement.walkSpeed*profile.moveWalk,step=Math.min(d-preferredRange,speed*dt);
        if(!tryMove(ux,uz,step)&&!tryTraverse(ux,uz))tryMove(-uz,ux,step*.82)||tryMove(uz,-ux,step*.82);
      }else if(profile.strafe>0&&d<=engageRange){
        if(!bot.strafeUntil||now>=bot.strafeUntil){bot.strafeDir=Math.random()<.5?-1:1;bot.strafeUntil=now+650+Math.random()*850;}
        const sx=-uz*(bot.strafeDir||1),sz=ux*(bot.strafeDir||1),step=settings.movement.walkSpeed*profile.strafe*dt;
        if(!tryMove(sx,sz,step)){bot.strafeDir=-(bot.strafeDir||1);tryMove(-sx,-sz,step);}
      }
      bot.y=worldSupportHeight(bot.x,bot.z,bot.y);

      const weaponSettings=settings.weapons[botWeapon],fireScale=botWeapon==='sniper'?1.12:(botWeapon==='shotgun'||botWeapon==='semiShotgun')?.96:1,botFireDelay=Math.max(weaponSettings.cooldownMs*profile.fireScale*fireScale,70);
      if(d<=engageRange&&now>=finiteNumber(bot.nextShotAt,0)){
        if((bot.ammo[botWeapon]||0)<=0){if(!bot.reloadAt){bot.reloadAt=now+weaponSettings.reloadMs;bot.reloadWeapon=botWeapon;}continue;}
        bot.nextShotAt=now+botFireDelay+profile.reactionBase+Math.floor(Math.random()*profile.reactionJitter);bot.ammo[botWeapon]-=1;if(bot.ammo[botWeapon]===0){bot.reloadAt=now+weaponSettings.reloadMs;bot.reloadWeapon=botWeapon;}
        const tx=finiteNumber(target.x,0)-bot.x,ty=(finiteNumber(target.y,terrainHeight(target.x||0,target.z||0))+1.05)-(bot.y+1.28),tz=finiteNumber(target.z,0)-bot.z,dist=Math.hypot(tx,ty,tz)||1;
        const baseSpread=profile.spreadBase+Math.min(.09,d*profile.spreadDistance),spread=(botWeapon==='shotgun'||botWeapon==='semiShotgun')?Math.max(.052,baseSpread*2.15):botWeapon==='sniper'?baseSpread*.55:baseSpread,pellets=Math.max(1,Math.floor(WEAPON_SPECS[botWeapon]?.pellets||1));
        for(let pellet=0;pellet<pellets;pellet++){
          const fx=tx/dist+(Math.random()-.5)*spread,fy=ty/dist+(Math.random()-.5)*spread*.65,fz=tz/dist+(Math.random()-.5)*spread,norm=Math.hypot(fx,fy,fz)||1;
          this.spawnBullet({ownerId:bot.id,ownerTeam:safeTeam(bot.team),damage:weaponSettings.damage,weapon:botWeapon,lifetimeMs:WEAPON_SPECS[botWeapon].lifetimeMs,x:bot.x+(fx/norm)*.55,y:bot.y+1.25,z:bot.z+(fz/norm)*.55,vx:(fx/norm)*weaponSettings.speed,vy:(fy/norm)*weaponSettings.speed,vz:(fz/norm)*weaponSettings.speed,now,consumeAmmo:pellet===0});
        }
      }
    }
  }


  smokeBlocksSegment(a,b,now){
    for(const cloud of this.smokeClouds.values()){
      if(now>=cloud.expiresAt)continue;const ax=finiteNumber(a.x,0),ay=finiteNumber(a.y,0)+1.05,az=finiteNumber(a.z,0),bx=finiteNumber(b.x,0),by=finiteNumber(b.y,0)+1.05,bz=finiteNumber(b.z,0),vx=bx-ax,vy=by-ay,vz=bz-az,wx=cloud.x-ax,wy=cloud.y-ay,wz=cloud.z-az,len2=vx*vx+vy*vy+vz*vz||1,t=clamp((wx*vx+wy*vy+wz*vz)/len2,0,1),dx=ax+vx*t-cloud.x,dy=ay+vy*t-cloud.y,dz=az+vz*t-cloud.z;if(Math.hypot(dx,dy,dz)<=cloud.radius*.88)return true;
    }return false;
  }
  actorLineOfSight(a,b,now){return actorHasLineOfSight(a,b)&&!this.smokeBlocksSegment(a,b,now);}

  stepThrowables(now,settings){
    for(const [id,cloud] of this.smokeClouds)if(now>=cloud.expiresAt)this.smokeClouds.delete(id);
    for(const [id,g] of this.throwables){
      if(g.stuckTo){const a=this.findActorState(g.stuckTo);if(a){g.x=a.x;g.y=a.y+1.0;g.z=a.z;}else g.stuckTo='';}
      if(!g.stuck){
        // Tactical physics stay intentionally lightweight: the server owns the
        // path, collision and fuse, while flashbangs retain believable carry,
        // bounce and ground roll. Stickies remain sticky on first contact.
        const integrationEnd=Math.min(now,g.fuseAt),elapsed=Math.max(0,(integrationEnd-g.lastAt)/1000);g.lastAt=integrationEnd;const steps=Math.max(1,Math.ceil(elapsed/.012)),st=elapsed/steps;
        for(let i=0;i<steps&&!g.stuck;i++){
          const px=g.x,py=g.y,pz=g.z;
          if(g.kind!=='sticky'&&g.rolling){
            const nx=px+g.vx*st,nz=pz+g.vz*st,ny=terrainHeight(nx,nz)+.10,hitObj=segmentHitsObstacle(px,py,pz,nx,ny,nz);
            if(hitObj){
              const hitX=segmentHitsObstacle(px,py,pz,nx,py,pz),hitZ=segmentHitsObstacle(px,py,pz,px,py,nz),ambiguous=!hitX&&!hitZ;
              if(hitX||ambiguous)g.vx=-g.vx*.34;
              if(hitZ||ambiguous)g.vz=-g.vz*.34;
              g.vx*=.82;g.vz*=.82;
              this.broadcast({t:'throwableImpact',id:g.id,kind:g.kind,x:g.x,y:g.y,z:g.z,vx:g.vx,vy:0,vz:g.vz,stuck:false,rolling:true,at:now});
            }else{g.x=nx;g.y=ny;g.z=nz;}
            const groundFriction=Math.exp(-4.15*st);g.vx*=groundFriction;g.vz*=groundFriction;g.vy=0;
            if(Math.hypot(g.vx,g.vz)<.18){g.vx=g.vz=0;g.rolling=false;g.stuck=true;}
            continue;
          }

          g.vy-=TACTICAL_GRAVITY*st;
          const nx=px+g.vx*st,ny=py+g.vy*st,nz=pz+g.vz*st;
          g.x=nx;g.y=ny;g.z=nz;
          const actor=this.findStickyTarget(g);if(g.kind==='sticky'&&actor){g.stuck=true;g.stuckTo=actor;g.vx=g.vy=g.vz=0;break;}
          const groundY=terrainHeight(nx,nz)+.08,hitGround=ny<=groundY,hitObj=!hitGround&&segmentHitsObstacle(px,py,pz,nx,ny,nz);
          if(!hitGround&&!hitObj)continue;

          if(g.kind==='sticky'){
            g.x=px;g.y=Math.max(py,terrainHeight(px,pz)+.10);g.z=pz;g.vx=g.vy=g.vz=0;g.stuck=true;g.rolling=false;
          }else if(hitGround){
            // Preserve horizontal direction on a ground contact. High-energy
            // impacts bounce; low-energy impacts transition naturally to roll.
            const impact=Math.abs(g.vy),horizontal=Math.hypot(g.vx,g.vz);
            g.x=nx;g.y=terrainHeight(nx,nz)+.10;g.z=nz;g.vx*=.76;g.vz*=.76;
            if(impact>2.15){g.vy=impact*.29;g.rolling=false;}
            else{g.vy=0;g.rolling=horizontal>.24;if(!g.rolling){g.vx=g.vz=0;g.stuck=true;}}
          }else{
            // Reflect only the component that met a wall/solid rather than
            // reversing the entire throw direction on every contact.
            g.x=px;g.y=py;g.z=pz;
            const hitX=segmentHitsObstacle(px,py,pz,nx,ny,pz),hitZ=segmentHitsObstacle(px,py,pz,px,ny,nz),ambiguous=!hitX&&!hitZ;
            if(hitX||ambiguous)g.vx=-g.vx*.38;
            if(hitZ||ambiguous)g.vz=-g.vz*.38;
            g.vy*=.58;
            if(Math.abs(g.vy)<.55&&Math.hypot(g.vx,g.vz)<.35){g.vx=g.vy=g.vz=0;g.stuck=true;g.rolling=false;}
          }
          this.broadcast({t:'throwableImpact',id:g.id,kind:g.kind,x:g.x,y:g.y,z:g.z,vx:g.vx,vy:g.vy,vz:g.vz,stuck:g.stuck,rolling:!!g.rolling,at:now});
        }
      }
      if(now-g.lastBroadcast>=THROWABLE_BROADCAST_MS){g.lastBroadcast=now;this.broadcast({t:'throwableState',id:g.id,x:g.x,y:g.y,z:g.z,vx:g.vx,vy:g.vy,vz:g.vz,stuck:g.stuck,rolling:!!g.rolling,at:now});}
      if(now>=g.fuseAt){if(g.kind==='flash')this.detonateFlash(g,now);else if(g.kind==='smoke')this.detonateSmoke(g,now);else this.explodeThrowable(g,now,settings);this.throwables.delete(id);this.broadcast({t:'throwableEnd',id:g.id});}
    }
  }
  findActorState(id){for(const socket of this.ctx.getWebSockets()){const p=socket.deserializeAttachment()||{};if(p.clientId===id&&!p.replaced)return p;}return this.bots.find(b=>b.id===id)||null;}
  findStickyTarget(g){for(const socket of this.ctx.getWebSockets()){const p=socket.deserializeAttachment()||{};if(!p.clientId||p.replaced||p.clientId===g.ownerId||p.hp<=0||combatantsAreFriendly(matchMode(this.metaCache?.match),g.ownerId,g.ownerTeam,p.clientId,p.team))continue;if(Math.hypot(p.x-g.x,p.y+1-g.y,p.z-g.z)<.62)return p.clientId;}for(const b of this.bots){if(b.id===g.ownerId||b.hp<=0||combatantsAreFriendly(matchMode(this.metaCache?.match),g.ownerId,g.ownerTeam,b.id,b.team))continue;if(Math.hypot(b.x-g.x,b.y+1-g.y,b.z-g.z)<.62)return b.id;}return '';}
  detonateFlash(g,now){
    const radius=FLASH_RADIUS;this.broadcast({t:'flashDetonate',id:g.id,x:g.x,y:g.y,z:g.z,radius});
    for(const socket of this.ctx.getWebSockets()){
      const p=socket.deserializeAttachment()||{};if(!p.clientId||p.replaced||p.hp<=0)continue;
      const ex=p.x,ey=p.y+PLAYER_HEIGHT*.75,ez=p.z,dx=g.x-ex,dy=g.y-ey,dz=g.z-ez,dist=Math.hypot(dx,dy,dz);if(dist>radius)continue;
      if(!blastHasLineOfSight(g.x,g.y,g.z,ex,ey,ez))continue;
      const cp=Math.cos(p.pitch||0),fx=-Math.sin(p.yaw||0)*cp,fy=Math.sin(p.pitch||0),fz=-Math.cos(p.yaw||0)*cp,n=dist||1,dot=(fx*dx+fy*dy+fz*dz)/n,front=.12+.88*Math.max(0,(dot+1)/2),power=clamp((1-dist/radius)*front,0,1);if(power<.035)continue;
      const durationMs=Math.round(650+power*2850),existingPower=activeFlashPower(p,now);
      if(power>=existingPower){p.flashPower=power;p.flashDurationMs=durationMs;p.flashUntil=now+durationMs;}
      else p.flashUntil=Math.max(finiteNumber(p.flashUntil,0),now+durationMs);
      p.ads=false;socket.serializeAttachment(p);
      sendJson(socket,{t:'flashEffect',power,durationMs});
    }
    for(const b of this.bots){if(b.hp<=0)continue;const dx=b.x-g.x,dy=b.y+1.05-g.y,dz=b.z-g.z,dist=Math.hypot(dx,dy,dz);if(dist>radius||!blastHasLineOfSight(g.x,g.y,g.z,b.x,b.y+1.05,b.z))continue;const power=clamp(1-dist/radius,0,1);if(power<.05)continue;b.flashUntil=Math.max(finiteNumber(b.flashUntil,0),now+550+power*2600);b.flashSpin=(Math.random()<.5?-1:1)*(1.5+Math.random()*2.5);}
  }
  detonateSmoke(g,now){
    const cloud={id:g.id,x:g.x,y:g.y+.65,z:g.z,radius:SMOKE_RADIUS,expiresAt:now+SMOKE_DURATION_MS};this.smokeClouds.set(g.id,cloud);this.broadcast({t:'smokeDetonate',...cloud});
  }
  blastDamage(maxDamage,distance,radius,edgeScale=.18,innerScale=.30){
    const max=Math.max(1,finiteNumber(maxDamage,1)),r=Math.max(.1,finiteNumber(radius,.1)),d=Math.max(0,finiteNumber(distance,0));
    if(d>=r)return Math.max(1,Math.round(max*Math.max(.05,edgeScale)));
    const inner=r*Math.max(0,Math.min(.8,innerScale));if(d<=inner)return Math.round(max);
    const t=clamp((d-inner)/Math.max(.001,r-inner),0,1),scale=1-(1-Math.max(.05,edgeScale))*t;
    return Math.max(1,Math.round(max*scale));
  }

  explodeThrowable(g,now,settings){
    const frag=g.kind==='frag',radius=frag?FRAG_RADIUS:STICKY_RADIUS,maxDamage=frag?FRAG_MAX_DAMAGE:STICKY_MAX_DAMAGE,weapon=frag?'frag':'sticky';
    for(const socket of this.ctx.getWebSockets()){
      const p=socket.deserializeAttachment()||{};if(!p.clientId||p.replaced||p.hp<=0)continue;const self=p.clientId===g.ownerId;if(!self&&combatantsAreFriendly(matchMode(this.metaCache?.match),g.ownerId,g.ownerTeam,p.clientId,p.team))continue;
      const dx=p.x-g.x,dz=p.z-g.z,d=Math.hypot(dx,p.y+1-g.y,dz);if(d>radius||!blastHasLineOfSight(g.x,g.y,g.z,p.x,p.y+1,p.z))continue;
      let damage=this.blastDamage(maxDamage,d,radius,frag?.20:.18,frag?.30:.32);if(self)damage=Math.round(damage*(frag?.68:.72));const n=Math.hypot(dx,dz)||1;this.damageHuman(socket,p,g.ownerId,damage,weapon,{x:dx/n*5.4,z:dz/n*5.4,y:3.5},now,g.id,settings,{distance:d});
    }
    for(const b of this.bots){if(b.hp<=0||b.id===g.ownerId||combatantsAreFriendly(matchMode(this.metaCache?.match),g.ownerId,g.ownerTeam,b.id,b.team))continue;const dx=b.x-g.x,dz=b.z-g.z,d=Math.hypot(dx,b.y+1-g.y,dz);if(d>radius||!blastHasLineOfSight(g.x,g.y,g.z,b.x,b.y+1,b.z))continue;const damage=this.blastDamage(maxDamage,d,radius,frag?.20:.18,frag?.30:.32),n=Math.hypot(dx,dz)||1;this.damageBot(b,g.ownerId,damage,weapon,{x:dx/n*5.4,z:dz/n*5.4,y:3.5},now,g.id,settings,{distance:d});}
    this.broadcast({t:'explosion',id:g.id,x:g.x,y:g.y,z:g.z,kind:weapon,radius});
  }


  explodeProjectile(bullet,now,settings){
    const radius=Math.max(.1,finiteNumber(bullet.explosionRadius,0)),maxDamage=Math.max(1,finiteNumber(bullet.explosionDamage,0));if(radius<=.1)return;
    const apply=(target,socket=null,isBot=false)=>{if(!target||target.hp<=0)return;const targetId=target.clientId||target.id,self=targetId===bullet.ownerId;if(!self&&combatantsAreFriendly(matchMode(this.metaCache?.match),bullet.ownerId,bullet.ownerTeam,targetId,target.team))return;const tx=target.x,ty=target.y+1,tz=target.z,dx=tx-bullet.x,dy=ty-bullet.y,dz=tz-bullet.z,d=Math.hypot(dx,dy,dz);if(d>radius||!blastHasLineOfSight(bullet.x,bullet.y,bullet.z,tx,ty,tz))return;let damage=this.blastDamage(maxDamage,d,radius,bullet.weapon==='rpg'?.22:.20,bullet.weapon==='rpg'?.34:.30);if(self)damage=Math.round(damage*.65);const horizontal=Math.hypot(dx,dz)||1,knockback={x:dx/horizontal*6.2,z:dz/horizontal*6.2,y:3.8};if(isBot)this.damageBot(target,bullet.ownerId,damage,bullet.weapon,knockback,now,bullet.id,settings,{distance:d});else this.damageHuman(socket,target,bullet.ownerId,damage,bullet.weapon,knockback,now,bullet.id,settings,{distance:d});};
    for(const socket of this.ctx.getWebSockets()){const p=socket.deserializeAttachment()||{};if(!p.clientId||p.replaced)continue;apply(p,socket,false);}for(const bot of this.bots)apply(bot,null,true);
    this.broadcast({t:'explosion',id:bullet.id,x:bullet.x,y:bullet.y,z:bullet.z,kind:bullet.weapon,radius});
  }

  applyRpgWander(bullet,at){
    if(bullet?.weapon!=='rpg'||!(bullet.rpgBaseSpeed>0))return;
    const age=Math.max(0,(at-bullet.born)/1000),ramp=clamp((age-.08)/.32,0,1),phase=finiteNumber(bullet.rpgWanderPhase,0);
    // Very small motor/fin wander, intentionally below the weapon's accuracy
    // cone. The rocket visibly hunts a little in flight without turning into
    // random bloom or disconnecting the reticle from the shot.
    const yawOffset=ramp*(Math.sin(age*5.7+phase)*.0062+Math.sin(age*2.4+phase*1.61)*.0023),pitchOffset=ramp*(Math.sin(age*4.4+phase*.73)*.0027);
    const yaw=finiteNumber(bullet.rpgBaseYaw,0)+yawOffset,pitch=clamp(finiteNumber(bullet.rpgBasePitch,0)+pitchOffset,-1.35,1.35),cp=Math.cos(pitch),speed=bullet.rpgBaseSpeed;
    bullet.vx=-Math.sin(yaw)*cp*speed;bullet.vy=Math.sin(pitch)*speed;bullet.vz=-Math.cos(yaw)*cp*speed;
  }

  stepBullets(now, settings) {
    const humans = this.ctx.getWebSockets().map((socket) => ({ socket, player: socket.deserializeAttachment() || {} }));
    for (const [id, bullet] of this.bullets) {
      const lifeEnd = bullet.born + bullet.lifetimeMs;
      const targetAt = Math.min(now, lifeEnd);
      if (targetAt <= bullet.lastAt) {
        if (now >= lifeEnd) this.endBullet(id, "expired");
        continue;
      }

      let remaining = Math.max(0, (targetAt - bullet.lastAt) / 1000);
      bullet.lastAt = targetAt;
      let ended = false;
      const speed = Math.max(1, Math.hypot(bullet.vx, bullet.vy, bullet.vz));
      const maxStepSeconds = BULLET_MAX_SEGMENT_DISTANCE / speed;

      while (remaining > 1e-8 && !ended) {
        const step = Math.min(maxStepSeconds, remaining);
        remaining -= step;
        const segmentAt=targetAt-remaining*1000;this.applyRpgWander(bullet,segmentAt);
        const gravity=Math.max(0,finiteNumber(bullet.gravity,0));
        const segmentEndX = bullet.x + bullet.vx * step;
        const segmentEndY = bullet.y + bullet.vy * step - .5*gravity*step*step;
        const segmentEndZ = bullet.z + bullet.vz * step;

        // Swept collision means the server no longer needs the legacy 24 cm
        // projectile substeps. Within each coarse travel segment, resolve the
        // nearest player/world hit and let a sniper continue from that exact
        // impact point when it still has penetration power.
        let segmentDone = false;
        while (!segmentDone && !ended) {
          const previousX = bullet.x, previousY = bullet.y, previousZ = bullet.z;
          const segmentDistance = Math.hypot(segmentEndX-previousX,segmentEndY-previousY,segmentEndZ-previousZ);
          if (segmentDistance <= 1e-7) { segmentDone = true; break; }

          if (Math.abs(previousX) > ARENA_LIMIT + 2 || Math.abs(previousZ) > ARENA_LIMIT + 2) {
            this.endBullet(id, "world"); ended = true; break;
          }

          const worldT = segmentFirstWorldHitT(previousX,previousY,previousZ,segmentEndX,segmentEndY,segmentEndZ);
          let nearest = null;
          const consider = (kind, target, socket = null) => {
            const hit = projectileSegmentHitZone(target,previousX,previousY,previousZ,segmentEndX,segmentEndY,segmentEndZ);
            if (!hit || bullet.hitTargets.has(target.clientId || target.id)) return;
            if (!nearest || hit.t < nearest.hit.t) nearest = { kind, target, socket, hit };
          };
          for (const h of humans) {
            const target = h.player;
            if (!target.clientId || target.replaced || target.clientId === bullet.ownerId || target.hp <= 0 || now < (target.wastedUntil || 0) || combatantsAreFriendly(matchMode(this.metaCache?.match),bullet.ownerId,bullet.ownerTeam,target.clientId,target.team) || bullet.hitTargets.has(target.clientId)) continue;
            consider('human', target, h.socket);
          }
          for (const bot of this.bots) {
            if (bot.id === bullet.ownerId || bot.hp <= 0 || now < bot.wastedUntil || combatantsAreFriendly(matchMode(this.metaCache?.match),bullet.ownerId,bullet.ownerTeam,bot.id,bot.team) || bullet.hitTargets.has(bot.id)) continue;
            consider('bot', bot);
          }

          const targetFirst = nearest && (worldT == null || nearest.hit.t < worldT - 1e-6);
          if (!targetFirst) {
            if (worldT != null) {
              bullet.x=previousX+(segmentEndX-previousX)*worldT;bullet.y=previousY+(segmentEndY-previousY)*worldT;bullet.z=previousZ+(segmentEndZ-previousZ)*worldT;bullet.traveledDistance+=segmentDistance*worldT;
              if(bullet.explosionRadius>0)this.explodeProjectile(bullet,now,settings);
              this.endBullet(id, "world"); ended = true; break;
            }
            bullet.x=segmentEndX;bullet.y=segmentEndY;bullet.z=segmentEndZ;bullet.traveledDistance+=segmentDistance;
            segmentDone = true;
            break;
          }

          const impactT=nearest.hit.t;
          bullet.x=previousX+(segmentEndX-previousX)*impactT;bullet.y=previousY+(segmentEndY-previousY)*impactT;bullet.z=previousZ+(segmentEndZ-previousZ)*impactT;
          bullet.traveledDistance+=segmentDistance*impactT;
          const target=nearest.target,targetId=target.clientId||target.id;
          if(bullet.explosionRadius>0){
            // Launchers retain a small direct-impact component, then resolve the
            // authoritative splash at the exact contact point. This keeps the
            // admin Damage control meaningful without turning splash into a
            // client-side special case.
            const horizontal=Math.hypot(bullet.vx,bullet.vz)||1,directDamage=Math.max(0,finiteNumber(bullet.damage,0));
            if(directDamage>0){const knockback={x:bullet.vx/horizontal*2.2,z:bullet.vz/horizontal*2.2,y:1.4};if(nearest.kind==='human')this.damageHuman(nearest.socket,target,bullet.ownerId,directDamage,bullet.weapon,knockback,now,bullet.id,settings,{distance:bullet.traveledDistance,directImpact:true});else this.damageBot(target,bullet.ownerId,directDamage,bullet.weapon,knockback,now,bullet.id,settings,{distance:bullet.traveledDistance,directImpact:true});}
            this.explodeProjectile(bullet,now,settings);this.endBullet(id,'hit');ended=true;break;
          }
          bullet.hitTargets.add(targetId);
          const horizontal = Math.hypot(bullet.vx, bullet.vz) || 1;
          const targetHpBefore = Math.max(1, finiteNumber(target.hp, 100));
          const baseDamage = bullet.weapon === "sniper" ? Math.max(1, bullet.penetrationPower) : bullet.damage;
          const headshot = nearest.hit.zone === "head";
          const hitDamage = weaponDamageAtDistance(bullet.weapon,baseDamage,bullet.traveledDistance,headshot);
          const knockback={x:bullet.vx/horizontal*2.4,z:bullet.vz/horizontal*2.4,y:headshot?1.45:1.1};
          let applied=true;
          if(nearest.kind==='human')applied=this.damageHuman(nearest.socket,target,bullet.ownerId,hitDamage,bullet.weapon,knockback,now,bullet.id,settings,{headshot,distance:bullet.traveledDistance});
          else this.damageBot(target,bullet.ownerId,hitDamage,bullet.weapon,knockback,now,bullet.id,settings,{headshot,distance:bullet.traveledDistance});

          if(!applied || bullet.weapon !== 'sniper'){
            this.endBullet(id,applied?'hit':'blocked');ended=true;break;
          }
          bullet.penetrationPower=Math.max(0,bullet.penetrationPower-targetHpBefore);
          if(bullet.penetrationPower<=0){this.endBullet(id,'spent');ended=true;break;}

          // Advance a couple of millimeters beyond the actor surface before
          // looking for the next target/world hit in this same coarse segment.
          const epsilonT=Math.min(1,impactT+Math.min(.002/segmentDistance,.01));
          const epsilonDistance=segmentDistance*(epsilonT-impactT);
          bullet.x=previousX+(segmentEndX-previousX)*epsilonT;bullet.y=previousY+(segmentEndY-previousY)*epsilonT;bullet.z=previousZ+(segmentEndZ-previousZ)*epsilonT;
          bullet.traveledDistance+=epsilonDistance;
          if(epsilonT>=1)segmentDone=true;
        }
        if(!ended&&gravity>0)bullet.vy-=gravity*step;
      }

      if(!ended&&bullet.explosionRadius>0&&now-bullet.lastBroadcast>=EXPLOSIVE_PROJECTILE_BROADCAST_MS){
        bullet.lastBroadcast=now;this.broadcast({t:'projectileState',id:bullet.id,weapon:bullet.weapon,x:bullet.x,y:bullet.y,z:bullet.z,vx:bullet.vx,vy:bullet.vy,vz:bullet.vz,gravity:bullet.gravity,at:now});
      }
      if (!ended && now >= lifeEnd) this.endBullet(id, "expired");
    }
  }

  awardKill(attackerId, victimId, now) {
    if (!attackerId || attackerId === victimId) return 0;
    const updateChain = (p) => {
      const last = finiteNumber(p.lastKillAt, 0);
      p.multiKillCount = last > 0 && now - last <= MULTI_KILL_WINDOW_MS ? Math.max(1, Math.floor(finiteNumber(p.multiKillCount, 1))) + 1 : 1;
      p.lastKillAt = now;
      return p.multiKillCount;
    };
    for (const socket of this.ctx.getWebSockets()) {
      const p = socket.deserializeAttachment() || {};
      if (p.clientId !== attackerId || p.replaced) continue;
      p.kills = Math.max(0, Math.floor(finiteNumber(p.kills, 0))) + 1;
      const multiKill = updateChain(p);
      socket.serializeAttachment(p);
      this.recordMatchKill(attackerId, victimId, now);
      return multiKill;
    }
    const bot = this.bots.find((b) => b.id === attackerId);
    if (bot) {
      bot.kills = Math.max(0, Math.floor(finiteNumber(bot.kills, 0))) + 1;
      const multiKill = updateChain(bot);
      this.recordMatchKill(attackerId, victimId, now);
      return multiKill;
    }
    return 0;
  }

  damageHuman(socket, target, attackerId, damage, weapon, knockback, now, bulletId = "", settings = DEFAULT_WORLD_SETTINGS, hitMeta = {}) {
    if (target.godMode) {
      this.broadcast({ t: "blocked", attacker: attackerId, target: target.clientId, weapon, bulletId, godMode: true });
      return false;
    }
    target.hp = Math.max(0, target.hp - damage);
    target.knockVelocityX = clamp(finiteNumber(target.knockVelocityX, 0) + finiteNumber(knockback.x, 0), -12, 12);
    target.knockVelocityZ = clamp(finiteNumber(target.knockVelocityZ, 0) + finiteNumber(knockback.z, 0), -12, 12);
    if (finiteNumber(knockback.y, 0) > 0) {
      target.verticalVelocity = Math.max(finiteNumber(target.verticalVelocity, 0), finiteNumber(knockback.y, 0));
      target.serverGrounded = false;
      target.lastVerticalAt = now;
    }
    target.regenAt = now + settings.combat.regenDelayMs;
    const wasted = target.hp <= 0;
    let multiKill = 0;
    if (wasted) {
      this.noteDeath(target,now);
      target.traversal = null;
      target.wastedUntil = now + settings.combat.respawnMs;
      target.deaths = Math.max(0, Math.floor(finiteNumber(target.deaths, 0))) + 1;
      target.multiKillCount = 0;
      target.lastKillAt = 0;
      multiKill = this.awardKill(attackerId, target.clientId, now);
    }
    const headshot = !!hitMeta.headshot;
    const distance = Math.max(0, finiteNumber(hitMeta.distance, 0));
    socket.serializeAttachment(target);
    this.broadcast({
      t: "hit", attacker: attackerId, target: target.clientId, hp: target.hp, damage, weapon, bulletId, headshot, distance,
      wasted, respawnAt: target.wastedUntil || 0,
      knockback: wasted ? { x: knockback.x * 1.35, z: knockback.z * 1.35, y: Math.max(3.8, knockback.y) } : knockback,
    });
    if (wasted) this.broadcast(this.killEvent(attackerId, target.clientId, weapon, now, { headshot, distance, multiKill }));
    return true;
  }

  damageBot(bot, attackerId, damage, weapon, knockback, now, bulletId = "", settings = DEFAULT_WORLD_SETTINGS, hitMeta = {}) {
    bot.hp = Math.max(0, bot.hp - damage);
    bot.regenAt = now + settings.combat.regenDelayMs;
    const wasted = bot.hp <= 0;
    let multiKill = 0;
    if (wasted) {
      this.noteDeath(bot,now);
      bot.traversal = null;
      bot.wastedUntil = now + settings.combat.respawnMs;
      bot.deaths = Math.max(0, Math.floor(finiteNumber(bot.deaths, 0))) + 1;
      bot.multiKillCount = 0;
      bot.lastKillAt = 0;
      multiKill = this.awardKill(attackerId, bot.id, now);
    }
    const headshot = !!hitMeta.headshot;
    const distance = Math.max(0, finiteNumber(hitMeta.distance, 0));
    this.broadcast({
      t: "hit", attacker: attackerId, target: bot.id, hp: bot.hp, damage, weapon, bulletId, headshot, distance,
      wasted, respawnAt: bot.wastedUntil || 0, knockback,
    });
    if (wasted) this.broadcast(this.killEvent(attackerId, bot.id, weapon, now, { headshot, distance, multiKill }));
  }

  findCombatant(id) {
    for (const socket of this.ctx.getWebSockets()) {
      const p = socket.deserializeAttachment() || {};
      if (!p.clientId || p.replaced) continue;
      if (p.clientId === id) return {
        id, name: p.name || "Player", team: safeTeam(p.team), bot: false, godMode:!!p.godMode,
        kills: Math.max(0, Math.floor(finiteNumber(p.kills, 0))),
        deaths: Math.max(0, Math.floor(finiteNumber(p.deaths, 0))),
      };
    }
    const bot = this.bots.find((b) => b.id === id);
    if (bot) return {
      id, name: bot.name || "Bot", team: safeTeam(bot.team), bot: true, godMode:false,
      kills: Math.max(0, Math.floor(finiteNumber(bot.kills, 0))),
      deaths: Math.max(0, Math.floor(finiteNumber(bot.deaths, 0))),
    };
    return { id, name: "Player", team: "blue", bot: false, kills: 0, deaths: 0 };
  }

  killEvent(attackerId, victimId, weapon, now, meta = {}) {
    const attacker = this.findCombatant(attackerId);
    const victim = this.findCombatant(victimId);
    return {
      t: "kill", at: now, weapon: (weapon === "sticky" || weapon === "frag") ? weapon : safeWeapon(weapon), attacker, victim,
      headshot: !!meta.headshot, distance: Math.max(0, finiteNumber(meta.distance, 0)),
      multiKill: Math.max(0, Math.floor(finiteNumber(meta.multiKill, 0))),
    };
  }

  endBullet(id, reason) {
    if (!this.bullets.has(id)) return;
    this.bullets.delete(id);
    this.broadcast({ t: "bulletEnd", id, reason });
  }

  async webSocketClose(socket) {
    const attachment = socket.deserializeAttachment() || {};
    if (!attachment.replaced && attachment.clientId) {
      await this.ctx.storage.put(`reconnect:${attachment.clientId}`, {
        attachment,
        expiresAt: Date.now() + RECONNECT_GRACE_MS,
      });
      this.broadcast({ t: "leave", id: attachment.clientId }, socket);
    }

    const live = this.liveSockets(socket);
    const meta = await this.getMeta();
    if (!meta) {
      try { await this.ctx.storage.deleteAlarm(); } catch {}
      return;
    }

    if (live.length === 0) {
      const now = Date.now();
      await this.ctx.storage.put("emptySince", now);
      const expiresAt = finiteNumber(meta.expiresAt, 0);
      const cleanupAt = Math.min(expiresAt > 0 ? expiresAt : now, now + EMPTY_ROOM_GRACE_MS);
      await this.updateDirectory(0, meta, attachment.replaced ? "" : (attachment.clientId || ""));
      if (cleanupAt <= now + ALARM_MIN_FUTURE_MS) {
        await this.cleanupRoom(meta);
        return;
      }
      await this.scheduleRoomAlarm(cleanupAt);
      return;
    }

    await this.ctx.storage.delete("emptySince");
    let expiresAt = finiteNumber(meta.expiresAt, 0);
    const now = Date.now();
    if (expiresAt <= now + ALARM_MIN_FUTURE_MS) {
      meta.expiresAt = now + ROOM_MAX_LIFETIME_MS;
      expiresAt = meta.expiresAt;
      await this.putMeta(meta);
    }
    await this.scheduleRoomAlarm(expiresAt);
    await this.updateDirectory(live.length, meta, attachment.replaced ? "" : (attachment.clientId || ""));
    if(!attachment.replaced&&attachment.godMode)this.broadcastMatch(meta,now);
  }

  async webSocketError(socket) {
    try { socket.close(1011, "WebSocket error"); } catch {}
  }

  async alarm() {
    // Fail-safe alarm handler: never leave a past-due alarm scheduled and never
    // throw an exception that can turn a bad state into rapid automatic retries.
    try {
      const meta = await this.getMeta();
      if (!meta) {
        await this.ctx.storage.deleteAlarm();
        return;
      }

      const now = Date.now();
      const live = this.liveSockets();
      const expiresAt = finiteNumber(meta.expiresAt, 0);

      if (live.length === 0) {
        let emptySince = finiteNumber(await this.ctx.storage.get("emptySince"), 0);
        if (emptySince <= 0 || emptySince > now) {
          emptySince = now;
          await this.ctx.storage.put("emptySince", emptySince);
        }

        const cleanupAt = Math.min(expiresAt > 0 ? expiresAt : now, emptySince + EMPTY_ROOM_GRACE_MS);
        if (cleanupAt <= now + ALARM_MIN_FUTURE_MS) {
          await this.cleanupRoom(meta);
          return;
        }

        // Empty rooms get exactly one future cleanup alarm. No active-room TTL
        // alarm is allowed to overwrite it with an expired timestamp.
        await this.scheduleRoomAlarm(cleanupAt);
        return;
      }

      // A live room may extend its TTL, but the newly scheduled timestamp must
      // always be safely in the future.
      if (expiresAt <= now + ALARM_MIN_FUTURE_MS) {
        meta.expiresAt = now + ROOM_MAX_LIFETIME_MS;
        await this.putMeta(meta);
        await this.updateDirectory(live.length, meta);
      }
      await this.scheduleRoomAlarm(meta.expiresAt);
    } catch (error) {
      console.error("GameRoom alarm failed; disabling alarm to prevent retry loops", error);
      try { await this.ctx.storage.deleteAlarm(); } catch {}
      // Do not rethrow. A future room request/connection will schedule the next
      // legitimate alarm, while a broken stale room remains dormant.
    }
  }

  broadcast(payload, exceptSocket = null) {
    const message = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === exceptSocket) continue;
      const attachment = socket.deserializeAttachment() || {};
      if (!attachment.clientId || attachment.replaced) continue;
      try { socket.send(message); } catch {}
    }
  }

  async updateDirectory(players, meta, excludeClientId = "") {
    if (players <= 0) {
      await this.removeDirectory(meta.code);
      return;
    }
    let blue = 0, red = 0;
    for (const socket of this.ctx.getWebSockets()) {
      const p = socket.deserializeAttachment() || {};
      if (!p.clientId || p.replaced || p.clientId === excludeClientId) continue;
      if (safeTeam(p.team) === "red") red += 1; else blue += 1;
    }
    for (const bot of this.bots || []) {
      if (safeTeam(bot.team) === "red") red += 1; else blue += 1;
    }
    const match = meta.match;
    try {
      const directory = await directoryStub(this.env);
      await directory.fetch("https://directory.internal/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: meta.code,
          protocol: PROTOCOL_VERSION,
          players,
          blueBots: (this.bots || []).filter((bot) => safeTeam(bot.team) === "blue").length,
          redBots: (this.bots || []).filter((bot) => safeTeam(bot.team) === "red").length,
          botDifficulty: safeBotDifficulty(meta.botDifficulty),
          mode: matchMode(match),
          blue,
          red,
          custom: this.isCustomMatch(meta),
          matchStatus: match.status,
          blueScore: match.blueScore,
          redScore: match.redScore,
          scoreLimit: match.scoreLimit,
          createdAt: meta.createdAt,
          expiresAt: meta.expiresAt,
        }),
      });
    } catch {}
  }

  async removeDirectory(code) {
    try {
      const directory = await directoryStub(this.env);
      await directory.fetch("https://directory.internal/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
    } catch {}
  }
}
