import { PLAYER_HEIGHT, PLAYER_RADIUS, ARENA_LIMIT, MAX_STEP_HEIGHT } from './world-geometry.js';
import * as HighlandsGeometry from './world-geometry.js';
import * as DepotGeometry from './world-geometry-depot.js';
import * as YardGeometry from './world-geometry-yard.js';
import * as RigGeometry from './world-geometry-rig.js';
import {
  APP_VERSION, PROTOCOL_VERSION, ROOM_CODE_LENGTH, MAX_PLAYERS, MAX_BOTS, TEAM_COLORS, DEFAULT_MAP_ID, normalizeMapId, mapSpec,
  WEAPON_ORDER, PRIMARY_WEAPONS, SECONDARY_WEAPONS, WEAPON_SPECS, normalizeWeaponAttachments, resolveWeaponSpec, weaponSpreadRadians, weaponHeatAfterDelay, weaponHeatAfterShot, weaponDamageAtDistance, weaponZoneDamageScale, CROUCH_HEIGHT, CROUCH_SPEED_MULTIPLIER, EQUIPMENT_CAPS, EQUIPMENT_SPECS, TACTICAL_EQUIPMENT, LETHAL_EQUIPMENT, normalizeTactical, normalizeLethal, equipmentForLoadout, LOADOUT_CLASS_COUNT, LOADOUT_CLASS_IDS, normalizeLoadoutClassId, normalizeLoadoutClassName, normalizeLoadoutDefinition, defaultLoadoutClasses, normalizeLoadoutClasses, loadoutClassById, DEFAULT_WORLD_SETTINGS, normalizeWorldSettings, MOVEMENT_FEEL, WEAPON_SWITCH_MS, EQUIPMENT_WEAPON_RECOVER_MS,
  DEFAULT_MATCH_RULES, GAME_MODES, normalizeGameMode, gameModeSpec, MATCH_WARMUP_MS, MATCH_END_MS, TACTICAL_THROW_SPEED, TACTICAL_THROW_LOFT, TACTICAL_GRAVITY, equipmentCollisionRadius, FLASH_RADIUS, STICKY_RADIUS, STICKY_MAX_DAMAGE, FRAG_RADIUS, FRAG_MAX_DAMAGE, SMOKE_RADIUS, SMOKE_DURATION_MS, SMOKE_LOS_RADIUS_SCALE, SMOKE_GROW_MS, SMOKE_START_SCALE, GROUND_FOLLOW_DROP
} from './game-config.js';
import { normalizeMatchRules, defaultMatchState, normalizeMatchState, publicMatchState, matchRulesAreDefault } from './match-model.js';
import { MATCH_STATUS, matchAllowsLobbyEdits, matchAllowsMovement, matchAllowsCombat, matchAllowsRespawn, matchPreservesReconnectPosition } from './gameplay-phase.js';
import * as HighlandsSpawns from './spawn-director.js';
import * as DepotSpawns from './spawn-director-depot.js';
import * as YardSpawns from './spawn-director-yard.js';
import * as RigSpawns from './spawn-director-rig.js';
import { MAX_PLAYER_PHYSICS_STEP_SEC, advanceVerticalMotion, advanceKnockback, sweepHorizontalMovement, createTraversalPlan, traversalPose, tacticalThrowVelocity, LADDER_CLIMB_SPEED, ladderById, ladderClimbPoint, ladderBottomExitPoint, ladderTopExitPoint, findLadderEntry, ladderClimbStep } from './movement-model.js';
import * as HighlandsServerCollision from './server-collision.js';
import * as DepotServerCollision from './server-collision-depot.js';
import * as YardServerCollision from './server-collision-yard.js';
import * as RigServerCollision from './server-collision-rig.js';
import * as HighlandsWorldCollision from './world-collision.js';
import * as DepotWorldCollision from './world-collision-depot.js';
import * as YardWorldCollision from './world-collision-yard.js';
import * as RigWorldCollision from './world-collision-rig.js';
import { BOT_WEAPONS, BOT_DIFFICULTIES, safeBotDifficulty, approachAngle as botApproachAngle, approachValue as botApproachValue, botWeaponRole, chooseVisibleBotTarget, botReactionDelay, botBurstSize, botBurstPause, botEquipmentDelay, botAimNoiseRadians, botAimToleranceRadians } from './bot-ai.js';

const GAME_VERSION = APP_VERSION;

const WORLD_BUNDLES = Object.freeze({
  highlands:Object.freeze({id:'highlands',geometry:HighlandsGeometry,spawns:HighlandsSpawns,worldCollision:HighlandsWorldCollision,serverCollision:HighlandsServerCollision}),
  depot:Object.freeze({id:'depot',geometry:DepotGeometry,spawns:DepotSpawns,worldCollision:DepotWorldCollision,serverCollision:DepotServerCollision}),
  yard:Object.freeze({id:'yard',geometry:YardGeometry,spawns:YardSpawns,worldCollision:YardWorldCollision,serverCollision:YardServerCollision}),
  rig:Object.freeze({id:'rig',geometry:RigGeometry,spawns:RigSpawns,worldCollision:RigWorldCollision,serverCollision:RigServerCollision}),
});
function worldBundle(value){return WORLD_BUNDLES[normalizeMapId(value)]||WORLD_BUNDLES[DEFAULT_MAP_ID];}
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
const LADDER_BUDGET_INITIAL_SEC = 0.09;
const MOVE_BUDGET_MAX_SEC = 0.18;
const SPRINT_SPEED_MULTIPLIER = MOVEMENT_FEEL.sprintSpeedMultiplier;
const SPRINT_MIN_FORWARD = MOVEMENT_FEEL.sprintMinForward;
const SPRINT_MIN_INPUT = MOVEMENT_FEEL.sprintMinInput;
const SLIDE_START_SPEED_MULTIPLIER = MOVEMENT_FEEL.slideStartSpeedMultiplier;
const SLIDE_SERVER_GRACE_MS = MOVEMENT_FEEL.slideServerGraceMs;
const MAX_STATE_ELAPSED_SEC = 0.40;
const BOT_PERSIST_INTERVAL_MS = 10 * 1000;
const BULLET_MAX_SEGMENT_DISTANCE = 6;
const COMBAT_HISTORY_WINDOW_MS = 650;
const COMBAT_HISTORY_MAX_SAMPLES = 40;
const COMBAT_HISTORY_EXTRAPOLATION_MS = 70;
const MAX_LAG_COMPENSATION_MS = 240;
const MAX_TARGET_REWIND_MS = 220;
const MAX_CLIENT_COMBAT_CLOCK_LEAD_MS = 35;
const MIN_PLAYER_PENETRATION_ENERGY = .12;
const THROWABLE_BROADCAST_MS = 33;
const EXPLOSIVE_PROJECTILE_BROADCAST_MS = 45;
const SERVER_VERTICAL_MAX_CATCHUP_SEC = .40;
const SERVER_COYOTE_TIME_MS = MOVEMENT_FEEL.coyoteTimeMs + 5;
const BOT_TARGET_MEMORY_MS = 3200;
const BOT_PATROL_MIN_MS = 1800;
const BOT_PATROL_MAX_MS = 4200;
const RECONNECT_GRACE_MS = 45 * 1000;
const HEALTH_REGEN_TICK_MS = 100;
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

function safeChatText(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
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
function safeBotWeapon(value) {
  const weapon = safeWeapon(value);
  return BOT_WEAPONS.includes(weapon) ? weapon : 'assault';
}
function safeSecondaryWeapon(value){const weapon=safeWeapon(value);return SECONDARY_WEAPONS.includes(weapon)?weapon:'pistol';}
function playerCanEquip(player, weapon) {
  const safe = safeWeapon(weapon);
  return safe === safeSecondaryWeapon(player?.secondaryWeapon) || safe === safePrimaryWeapon(player?.primaryWeapon);
}

function safeEquipmentKind(value){return Object.prototype.hasOwnProperty.call(EQUIPMENT_CAPS,value)?value:'flash';}
function safeTactical(value){return normalizeTactical(value);}
function safeLethal(value){return normalizeLethal(value);}
function normalizeLoadout(value,fallback={primaryWeapon:'assault',secondaryWeapon:'pistol',primaryAttachments:{},secondaryAttachments:{},tactical:'flash',lethal:'sticky'}){return normalizeLoadoutDefinition(value,fallback);}
function attachmentsForPlayerWeapon(player,weapon){const safe=safeWeapon(weapon);return safe===safePrimaryWeapon(player?.primaryWeapon)?normalizeWeaponAttachments(safe,player?.primaryAttachments):safe===safeSecondaryWeapon(player?.secondaryWeapon)?normalizeWeaponAttachments(safe,player?.secondaryAttachments):normalizeWeaponAttachments(safe,{});}
function effectiveWeaponRules(settings,player,weapon){const safe=safeWeapon(weapon),base=WEAPON_SPECS[safe],resolved=resolveWeaponSpec(safe,attachmentsForPlayerWeapon(player,safe)),rules=settings?.weapons?.[safe]||DEFAULT_WORLD_SETTINGS.weapons[safe];return{...rules,spec:resolved,damage:finiteNumber(rules.damage,base.damage)*(resolved.damage/base.damage),speed:finiteNumber(rules.speed,base.bulletSpeed)*(resolved.bulletSpeed/base.bulletSpeed),reloadMs:finiteNumber(rules.reloadMs,base.reloadMs)*(resolved.reloadMs/base.reloadMs),cooldownMs:finiteNumber(rules.cooldownMs,base.cooldownMs)*(resolved.cooldownMs/base.cooldownMs)};}
function freshAmmo(player=null){return Object.fromEntries(WEAPON_ORDER.map(name=>[name,resolveWeaponSpec(name,player?attachmentsForPlayerWeapon(player,name):{}).mag]));}
function normalizeFireReady(value){const v=value&&typeof value==='object'?value:{},out=Object.fromEntries(WEAPON_ORDER.map(name=>[name,Math.max(0,finiteNumber(v[name],0))]));out.akimbo1887Left=Math.max(0,finiteNumber(v.akimbo1887Left,0));out.akimbo1887Right=Math.max(0,finiteNumber(v.akimbo1887Right,0));return out;}
function normalizeAmmo(value,player=null){const v=value&&typeof value==="object"?value:{};return Object.fromEntries(WEAPON_ORDER.map(name=>{const mag=resolveWeaponSpec(name,player?attachmentsForPlayerWeapon(player,name):{}).mag;return[name,clamp(Math.floor(finiteNumber(v[name],mag)),0,mag)]}));}
function freshEquipment(tactical='flash',lethal='sticky'){return equipmentForLoadout(safeTactical(tactical),safeLethal(lethal));}
function normalizeEquipment(v){v=v&&typeof v==="object"?v:{};return Object.fromEntries(Object.entries(EQUIPMENT_CAPS).map(([name,cap])=>[name,clamp(Math.floor(finiteNumber(v[name],cap)),0,cap)]));}
function refreshUnlimitedResources(me){
  if(!me?.godMode)return;
  me.ammo=freshAmmo(me);me.equipment=freshEquipment(me.tactical,me.lethal);me.reloadAt=0;me.reloadWeapon='';
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

function shotgunPelletAngles(yaw,pitch,radius,index,pellets,rotation=0){
  if(index<=0||!(radius>0)||pellets<=1)return{yaw,pitch};
  // Stable center-weighted pattern: one guaranteed center pellet, three inner
  // pellets, then the remaining pellets on an outer ring. A random rotation
  // keeps successive blasts organic without letting RNG decide whether a
  // perfectly centered close-range pump shot registers enough pellets to kill.
  const innerCount=Math.min(3,Math.max(0,pellets-1)),outerCount=Math.max(1,pellets-1-innerCount);
  let radial,angle;
  if(index<=innerCount){radial=.34*radius;angle=rotation+(index-1)*(Math.PI*2/innerCount);}
  else{const outerIndex=index-innerCount-1;radial=.72*radius;angle=rotation+Math.PI/4+outerIndex*(Math.PI*2/outerCount);}
  const yawScale=Math.max(.32,Math.cos(pitch));
  return{yaw:yaw+Math.cos(angle)*radial/yawScale,pitch:clamp(pitch+Math.sin(angle)*radial,-1.4,1.4)};
}
function sanitizeCombatTimestamp(value,now){return clamp(finiteNumber(value,now),now-MAX_LAG_COMPENSATION_MS,now+MAX_CLIENT_COMBAT_CLOCK_LEAD_MS);}

function normalizeAngle(value){let angle=Number(value)||0;while(angle>Math.PI)angle-=Math.PI*2;while(angle<-Math.PI)angle+=Math.PI*2;return angle;}
function safeShotAim(me,payload){
  // Movement/body state and combat aim are deliberately separate. The client
  // sends its exact camera/recoil ray with the fire request; sanitise it here
  // without feeding recoil back into the movement state machine. This keeps
  // bullets aligned with the visible sight while preserving stable movement.
  const baseYaw=finiteNumber(me.yaw,0),basePitch=clamp(finiteNumber(me.pitch,0),-1.4,1.4);
  return{yaw:normalizeAngle(finiteNumber(payload.yaw,baseYaw)),pitch:clamp(finiteNumber(payload.pitch,basePitch),-1.4,1.4)};
}
function shotVector(yaw,pitch){const cp=Math.cos(pitch);return{x:-Math.sin(yaw)*cp,y:Math.sin(pitch),z:-Math.cos(yaw)*cp};}
function shotLaunchPose(me,yaw,pitch,crouched=false,weapon='pistol',segmentFirstWorldHitTFn=HighlandsServerCollision.segmentFirstWorldHitT,projectileRadius=0){
  const dir=shotVector(yaw,pitch),eyeHeight=(crouched?CROUCH_HEIGHT:PLAYER_HEIGHT),eye={x:me.x,y:me.y+eyeHeight,z:me.z},ballistic={x:eye.x+dir.x*.18,y:eye.y+dir.y*.18,z:eye.z+dir.z*.18};
  // Hitscan/small-arms fire remains reticle-authoritative. Launchers instead
  // originate at the physical tube/barrel and converge toward the reticle ray.
  // This preserves center-screen intent at range while nearby cover can block
  // the actual projectile body before it clears the weapon.
  if(weapon!=='grenadeLauncher'&&weapon!=='rpg')return{x:ballistic.x,y:ballistic.y,z:ballistic.z,dx:dir.x,dy:dir.y,dz:dir.z,muzzleBlocked:false};
  const r=Math.max(0,finiteNumber(projectileRadius,0)),right={x:Math.cos(yaw),z:-Math.sin(yaw)},forward={x:-Math.sin(yaw),z:-Math.cos(yaw)},rpg=weapon==='rpg',side=rpg?.20:.23,forwardOffset=rpg?.58:.47,down=rpg?.14:.20;
  const muzzle={x:me.x+right.x*side+forward.x*forwardOffset,y:eye.y-down,z:me.z+right.z*side+forward.z*forwardOffset},far={x:eye.x+dir.x*120,y:eye.y+dir.y*120,z:eye.z+dir.z*120};
  const eyeHit=segmentFirstWorldHitTFn(eye.x,eye.y,eye.z,far.x,far.y,far.z,0),aimT=eyeHit==null?1:Math.max(.002,eyeHit),aim={x:eye.x+(far.x-eye.x)*aimT,y:eye.y+(far.y-eye.y)*aimT,z:eye.z+(far.z-eye.z)*aimT};
  let dx=aim.x-muzzle.x,dy=aim.y-muzzle.y,dz=aim.z-muzzle.z,len=Math.hypot(dx,dy,dz);if(len<.001){dx=dir.x;dy=dir.y;dz=dir.z;len=1;}dx/=len;dy/=len;dz/=len;
  const clear={x:muzzle.x+dx*.42,y:muzzle.y+dy*.42,z:muzzle.z+dz*.42},blocked=segmentFirstWorldHitTFn(muzzle.x,muzzle.y,muzzle.z,clear.x,clear.y,clear.z,r)!=null;
  return{x:muzzle.x,y:muzzle.y,z:muzzle.z,dx,dy,dz,muzzleBlocked:blocked};
}
function decayedFireHeat(me,weapon,now){const heats=me.fireHeat&&typeof me.fireHeat==='object'?me.fireHeat:{},times=me.fireHeatAt&&typeof me.fireHeatAt==='object'?me.fireHeatAt:{},last=Math.max(0,finiteNumber(times[weapon],0));return weaponHeatAfterDelay(weapon,finiteNumber(heats[weapon],0),last?now-last:0);}
function storeFireHeat(me,weapon,now,preShotHeat){me.fireHeat={...(me.fireHeat&&typeof me.fireHeat==='object'?me.fireHeat:{}),[weapon]:weaponHeatAfterShot(weapon,preShotHeat)};me.fireHeatAt={...(me.fireHeatAt&&typeof me.fireHeatAt==='object'?me.fireHeatAt:{}),[weapon]:now};}

function publicLadderState(value){
  const ladder=value&&typeof value==='object'?value:null;if(!ladder||!ladder.id)return null;
  return {id:String(ladder.id),seq:Math.max(0,Math.floor(finiteNumber(ladder.seq,0))),phase:'climb',entry:ladder.entry==='top'?'top':'bottom'};
}

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
    sprinting: !!attachment.sprinting,
    sliding: !!attachment.sliding,
    weapon: safeWeapon(attachment.weapon),
    primaryWeapon: safePrimaryWeapon(attachment.primaryWeapon),
    secondaryWeapon: safeSecondaryWeapon(attachment.secondaryWeapon),
    primaryAttachments: normalizeWeaponAttachments(safePrimaryWeapon(attachment.primaryWeapon),attachment.primaryAttachments),
    secondaryAttachments: normalizeWeaponAttachments(safeSecondaryWeapon(attachment.secondaryWeapon),attachment.secondaryAttachments),
    tactical: safeTactical(attachment.tactical),
    lethal: safeLethal(attachment.lethal),
    activeClassId: normalizeLoadoutClassId(attachment.activeClassId),
    pendingClassId: attachment.pendingClassId ? normalizeLoadoutClassId(attachment.pendingClassId) : '',
    pendingLoadout: attachment.pendingLoadout ? normalizeLoadout(attachment.pendingLoadout,{primaryWeapon:attachment.primaryWeapon,secondaryWeapon:attachment.secondaryWeapon,primaryAttachments:attachment.primaryAttachments,secondaryAttachments:attachment.secondaryAttachments,tactical:attachment.tactical,lethal:attachment.lethal}) : null,
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
    traversal: attachment.traversal ? {mode:attachment.traversal.mode,role:attachment.traversal.role||'',seq:attachment.traversal.seq,startX:attachment.traversal.startX,startY:attachment.traversal.startY,startZ:attachment.traversal.startZ,endX:attachment.traversal.endX,endY:attachment.traversal.endY,endZ:attachment.traversal.endZ,peakY:attachment.traversal.peakY,startedAt:attachment.traversal.startedAt,durationMs:attachment.traversal.durationMs,endGrounded:attachment.traversal.endGrounded!==false,exitVelocityY:Number(attachment.traversal.exitVelocityY)||0,portalId:String(attachment.traversal.portalId||''),viewMaxY:Number.isFinite(Number(attachment.traversal.viewMaxY))?Number(attachment.traversal.viewMaxY):null} : null,
    ladder: publicLadderState(attachment.ladder),
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
    pitch: clamp(finiteNumber(bot.aimPitch,0),-1.4,1.4),
    weapon: safeBotWeapon(bot.weapon||bot.primaryWeapon),
    primaryWeapon: safeBotWeapon(bot.primaryWeapon||bot.weapon),
    secondaryWeapon: SECONDARY_WEAPONS.includes(safeBotWeapon(bot.weapon||bot.primaryWeapon))?safeBotWeapon(bot.weapon||bot.primaryWeapon):'pistol',
    tactical:safeTactical(bot.tactical),lethal:safeLethal(bot.lethal),pendingLoadout:null,
    ads: !!bot.ads,
    sprinting: !!bot.sprinting,
    crouched: false,
    sliding: false,
    reloadAt: bot.reloadAt || 0,
    reloadWeapon: bot.reloadWeapon || "",
    kills: Math.max(0, Math.floor(finiteNumber(bot.kills, 0))),
    deaths: Math.max(0, Math.floor(finiteNumber(bot.deaths, 0))),
    traversal: bot.traversal ? {mode:bot.traversal.mode,role:bot.traversal.role||'',seq:bot.traversal.seq,startX:bot.traversal.startX,startY:bot.traversal.startY,startZ:bot.traversal.startZ,endX:bot.traversal.endX,endY:bot.traversal.endY,endZ:bot.traversal.endZ,peakY:bot.traversal.peakY,startedAt:bot.traversal.startedAt,durationMs:bot.traversal.durationMs,endGrounded:bot.traversal.endGrounded!==false,exitVelocityY:Number(bot.traversal.exitVelocityY)||0,portalId:String(bot.traversal.portalId||''),viewMaxY:Number.isFinite(Number(bot.traversal.viewMaxY))?Number(bot.traversal.viewMaxY):null} : null,
    ladder: publicLadderState(bot.ladder),
  };
}

function sendLoadout(socket, me, extra = {}) { const base=normalizeLoadout(me),includeClasses=extra.action==='loadout'||extra.includeClasses===true,payload={t:'loadout',weapon:safeWeapon(me.weapon),primaryWeapon:safePrimaryWeapon(me.primaryWeapon),secondaryWeapon:safeSecondaryWeapon(me.secondaryWeapon),primaryAttachments:normalizeWeaponAttachments(safePrimaryWeapon(me.primaryWeapon),me.primaryAttachments),secondaryAttachments:normalizeWeaponAttachments(safeSecondaryWeapon(me.secondaryWeapon),me.secondaryAttachments),tactical:safeTactical(me.tactical),lethal:safeLethal(me.lethal),pendingLoadout:me.pendingLoadout?normalizeLoadout(me.pendingLoadout,base):null,ammo:me.ammo,equipment:me.equipment,reloadAt:me.reloadAt||0,reloadWeapon:me.reloadWeapon||'',...extra};if(includeClasses)Object.assign(payload,{loadoutClasses:normalizeLoadoutClasses(me.loadoutClasses,base),activeClassId:normalizeLoadoutClassId(me.activeClassId),pendingClassId:me.pendingClassId?normalizeLoadoutClassId(me.pendingClassId):''});sendJson(socket,payload); }

function spawnForTeam(world,team,index){return world.spawns.spawnForMode('tdm',safeTeam(team),index,world.geometry.terrainHeight);}
function spawnForMode(world,mode,team,index){return world.spawns.spawnForMode(normalizeGameMode(mode),safeTeam(team),index,world.geometry.terrainHeight);}
function spawnedPlayerState(player,spawn,team,now,{resetStats=false}={}){
  const classes=normalizeLoadoutClasses(player?.loadoutClasses,player),nextClassId=player?.pendingClassId?normalizeLoadoutClassId(player.pendingClassId):normalizeLoadoutClassId(player?.activeClassId),classLoadout=loadoutClassById(classes,nextClassId,player),active=normalizeLoadout(player?.pendingLoadout||classLoadout,player);
  const next={
    ...player,...spawn,team,yaw:finiteNumber(spawn?.yaw,finiteNumber(player?.yaw,0)),pitch:0,spawnProtectedUntil:Math.max(0,finiteNumber(spawn?.spawnProtectedUntil,0)),pendingTeam:'',loadoutClasses:classes,activeClassId:nextClassId,pendingClassId:'',pendingLoadout:null,primaryWeapon:active.primaryWeapon,secondaryWeapon:active.secondaryWeapon,primaryAttachments:active.primaryAttachments,secondaryAttachments:active.secondaryAttachments,tactical:active.tactical,lethal:active.lethal,hp:100,wastedUntil:0,regenAt:0,
    weapon:active.primaryWeapon,ammo:freshAmmo(active),equipment:freshEquipment(active.tactical,active.lethal),reloadAt:0,reloadWeapon:'',
    fireReadyAt:normalizeFireReady(),weaponReadyAt:0,equipmentReadyAt:0,combatAction:'ready',combatActionKind:'',combatReadyAt:0,sprintFireReadyAt:0,ads:false,adsAmount:0,crouched:false,sprinting:false,sliding:false,slideUntil:0,moveSpeed:0,
    verticalVelocity:0,serverGrounded:true,lastGroundedAt:now,lastVerticalAt:now,lastStateAt:now,movementClockAt:now,lastMovementClientAt:now,lastStateSeq:0,moveBudgetSec:MOVE_BUDGET_INITIAL_SEC,
    flashUntil:0,flashPower:0,flashDurationMs:0,fireHeat:{},fireHeatAt:{},knockVelocityX:0,knockVelocityZ:0,velocityX:0,velocityZ:0,traversal:null,lastTraverseSeq:0,ladder:null,lastLadderSeq:0,
  };
  if(resetStats)Object.assign(next,{kills:0,deaths:0,multiKillCount:0,lastKillAt:0});
  return next;
}

function makeBot(world,team, teamIndex, mode='tdm', spawnIndex=teamIndex, spawnOverride=null) {
  team = safeTeam(team);
  const spawn = spawnOverride || spawnForMode(world,mode, team, spawnIndex),ffa=normalizeGameMode(mode)==='ffa',roleIndex=ffa?Math.abs(spawnIndex):Math.abs(teamIndex),primaryWeapon=BOT_WEAPONS[roleIndex%BOT_WEAPONS.length]||'assault';
  const label = team === "red" ? "Red" : "Blue",tactical=roleIndex%3===0?'smoke':'flash',lethal=roleIndex%2===0?'frag':'sticky';
  return {
    id: `bot-${team}-${teamIndex + 1}`,
    name: ffa?`Bot ${spawnIndex + 1}`:`${label} Bot ${teamIndex + 1}`,
    team,
    ...spawn,
    yaw: finiteNumber(spawn.yaw,0),
    aimYaw: finiteNumber(spawn.yaw,0),
    aimPitch: 0,
    hp: 100,
    wastedUntil: 0,
    spawnProtectedUntil: Math.max(0,finiteNumber(spawn.spawnProtectedUntil,0)),
    velocityX:0,velocityZ:0,moveSpeed:0,sprinting:false,ads:false,
    nextShotAt: 0,
    ammo: freshAmmo(),
    reloadAt: 0,
    reloadWeapon: "",
    weapon: primaryWeapon,
    primaryWeapon,
    tactical,lethal,equipment:freshEquipment(tactical,lethal),
    regenAt: 0,
    kills: 0,
    deaths: 0,
    traversal: null,
    traverseSeq: 0,
    ladder: null,
    ladderSeq: 0,
    targetId:'',targetLockUntil:0,reactionReadyAt:0,aimNoiseYaw:0,aimNoisePitch:0,aimNoiseUntil:0,
    burstShotsLeft:0,burstPauseUntil:0,fireHeat:0,fireHeatAt:0,combatRecoverUntil:0,nextEquipmentAt:0,
    navX:spawn.x,navZ:spawn.z,navUntil:0,navNodeIndex:-1,lastMovedAt:0,
    lastSeenTargetId:'',lastSeenAt:0,lastKnownX:spawn.x,lastKnownZ:spawn.z,patrolX:spawn.x,patrolZ:spawn.z,patrolUntil:0,patrolNodeIndex:-1,
  };
}
function makeBots(world,blueBots, redBots, mode='tdm') {
  blueBots = clamp(Math.floor(finiteNumber(blueBots, 0)), 0, MAX_BOTS);
  redBots = clamp(Math.floor(finiteNumber(redBots, 0)), 0, MAX_BOTS);
  const bots = [];let spawnIndex=0;
  for (let i = 0; i < blueBots; i += 1) bots.push(makeBot(world,"blue", i, mode, spawnIndex++));
  for (let i = 0; i < redBots; i += 1) bots.push(makeBot(world,"red", i, mode, spawnIndex++));
  return bots;
}
function reconcileBots(world,existing, blueBots, redBots, mode='tdm') {
  const prior = new Map((Array.isArray(existing) ? existing : []).map((bot) => [bot.id, bot]));
  return makeBots(world,blueBots, redBots, mode).map((fresh) => {
    const old = prior.get(fresh.id);
    if (!old) return fresh;
    const previousWeapon=safeBotWeapon(old.primaryWeapon||old.weapon||fresh.primaryWeapon),primaryWeapon=safeBotWeapon(fresh.primaryWeapon),weaponChanged=previousWeapon!==primaryWeapon,candidateX=clamp(finiteNumber(old.x,fresh.x),-ARENA_LIMIT,ARENA_LIMIT),candidateZ=clamp(finiteNumber(old.z,fresh.z),-ARENA_LIMIT,ARENA_LIMIT),candidateY=world.geometry.worldSupportHeight(candidateX,candidateZ,finiteNumber(old.y,fresh.y),false,.34),poseValid=!world.worldCollision.worldBlockedAt(candidateX,candidateZ,candidateY,PLAYER_HEIGHT,.34),x=poseValid?candidateX:fresh.x,z=poseValid?candidateZ:fresh.z,y=poseValid?candidateY:fresh.y;
    return {
      ...fresh,
      ...old,
      id: fresh.id,
      name: fresh.name,
      team: fresh.team,
      x,y,z,
      yaw: finiteNumber(old.yaw,fresh.yaw),aimYaw:finiteNumber(old.aimYaw,finiteNumber(old.yaw,fresh.aimYaw)),aimPitch:clamp(finiteNumber(old.aimPitch,0),-1.2,1.2),
      ammo: weaponChanged?freshAmmo():normalizeAmmo(old.ammo),
      equipment: normalizeEquipment(fresh.equipment),
      tactical:safeTactical(fresh.tactical),lethal:safeLethal(fresh.lethal),
      weapon: primaryWeapon,
      primaryWeapon,
      traversal:poseValid?old.traversal:null,ladder:poseValid?old.ladder:null,
      navX:x,navZ:z,navUntil:0,navNodeIndex:-1,lastMovedAt:0,
    };
  });
}
function botCountsFromMeta(meta) {
  const blueBots = clamp(Math.floor(finiteNumber(meta?.blueBots, 0)), 0, MAX_BOTS);
  const redBots = clamp(Math.floor(finiteNumber(meta?.redBots, 0)), 0, MAX_BOTS);
  return { blueBots, redBots, botCount: Math.min(MAX_BOTS, blueBots + redBots) };
}
function botRosterMatchesConfig(world,existing, blueBots, redBots, mode='tdm') {
  if (!Array.isArray(existing)) return false;
  const expected = makeBots(world,blueBots, redBots, mode);
  if (existing.length !== expected.length) return false;
  const actual = new Map(existing.map((bot) => [String(bot?.id || ''), bot]));
  if (actual.size !== expected.length) return false;
  return expected.every((bot) => {
    const saved = actual.get(bot.id);
    return !!saved && String(saved.team || '').toLowerCase() === bot.team;
  });
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
      if (protocol !== PROTOCOL_VERSION) return json(request, env, { error: `CLIENT UPDATE REQUIRED`, protocol: PROTOCOL_VERSION }, 409);
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
        if (limiter.status === 429) return json(request, env, { error: "MATCH CREATE RATE LIMITED" }, 429);
        if (!limiter.ok) return json(request, env, { error: "MATCH CREATE UNAVAILABLE" }, 503);
      } catch {
        return json(request, env, { error: "MATCH CREATE UNAVAILABLE" }, 503);
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
      return json(request, env, { error: "MATCH CREATE FAILED" }, 503);
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
        mapId: normalizeMapId(body.mapId),
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
    this.recentGunfire = [];
    this.recentExplosions = [];
    this.combatHistory = new Map();
    this.world = worldBundle(DEFAULT_MAP_ID);
  }

  recordCombatPose(actor, at=Date.now()) {
    const id=actor?.clientId||actor?.id;if(!id)return;
    const sample={at:finiteNumber(at,Date.now()),x:finiteNumber(actor.x,0),y:finiteNumber(actor.y,0),z:finiteNumber(actor.z,0),yaw:finiteNumber(actor.yaw,0),crouched:!!actor.crouched};
    let history=this.combatHistory.get(id);if(!history){history=[];this.combatHistory.set(id,history);}
    const last=history[history.length-1];
    if(last&&sample.at<last.at-2)return;
    if(last&&Math.abs(sample.at-last.at)<1)history[history.length-1]=sample;else history.push(sample);
    const cutoff=sample.at-COMBAT_HISTORY_WINDOW_MS;while(history.length>2&&history[0].at<cutoff)history.shift();
    if(history.length>COMBAT_HISTORY_MAX_SAMPLES)history.splice(0,history.length-COMBAT_HISTORY_MAX_SAMPLES);
  }

  combatPoseAt(actor, at) {
    const id=actor?.clientId||actor?.id,history=id?this.combatHistory.get(id):null;
    if(!history?.length)return actor;
    const targetAt=finiteNumber(at,history[history.length-1].at);
    if(targetAt<=history[0].at)return{...actor,...history[0]};
    const last=history[history.length-1];
    if(targetAt>=last.at){
      if(history.length<2)return{...actor,...last};
      const prev=history[history.length-2],sampleDt=Math.max(.008,(last.at-prev.at)/1000),extraMs=Math.min(COMBAT_HISTORY_EXTRAPOLATION_MS,Math.max(0,targetAt-last.at)),extra=extraMs/1000;let vx=(last.x-prev.x)/sampleDt,vz=(last.z-prev.z)/sampleDt,vy=(last.y-prev.y)/sampleDt,planar=Math.hypot(vx,vz);
      if(planar>16){const scale=16/planar;vx*=scale;vz*=scale;}vy=clamp(vy,-13,9);const yawRate=clamp(normalizeAngle(last.yaw-prev.yaw)/sampleDt,-7,7);
      return{...actor,...last,at:last.at+extraMs,x:last.x+vx*extra,y:last.y+vy*extra,z:last.z+vz*extra,yaw:last.yaw+yawRate*extra};
    }
    for(let i=1;i<history.length;i++){
      const b=history[i];if(targetAt>b.at)continue;const a=history[i-1],span=Math.max(1,b.at-a.at),t=clamp((targetAt-a.at)/span,0,1),yawDelta=normalizeAngle(b.yaw-a.yaw);
      return{...actor,x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,yaw:a.yaw+yawDelta*t,crouched:t<.5?a.crouched:b.crouched};
    }
    return actor;
  }

  async getMeta() {
    if (this.metaCache) return this.metaCache;
    const meta = await this.ctx.storage.get("meta");
    if (meta) {
      meta.adminClientIds = normalizeAdminIds(meta);
      meta.clientAuthHashes = normalizeClientAuthHashes(meta);
      meta.settings = normalizeWorldSettings(meta.settings);
      meta.mapId = normalizeMapId(meta.mapId);
      this.world = worldBundle(meta.mapId);
      const legacyRules=meta.match||{...DEFAULT_MATCH_RULES,mode:normalizeGameMode(meta.mode)};
      meta.match=normalizeMatchState(meta.match,Date.now(),legacyRules);
      delete meta.mode;delete meta.custom;
      this.metaCache=meta;
    }
    return meta || null;
  }

  async putMeta(meta) {
    meta.adminClientIds = normalizeAdminIds(meta);
    meta.clientAuthHashes=normalizeClientAuthHashes(meta);meta.mapId=normalizeMapId(meta.mapId);this.world=worldBundle(meta.mapId);delete meta.mode;delete meta.custom;
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
    const config = type === '__all__' ? { rate: 100, burst: 260 }
      : type === 'state' ? { rate: 55, burst: 220 }
      : type === 'simTick' ? { rate: 40, burst: 180 }
      : type === 'fire' ? { rate: 24, burst: 72 }
      : ['equipmentAction','throw','reload','weapon','loadout','team','god','startMatch','returnLobby','adminPlayer','adminSettings','adminBots'].includes(type) ? { rate: 14, burst: 22 }
      : type === 'ping' ? { rate: 8, burst: 12 }
      : type === 'chat' ? { rate: 1.5, burst: 4 }
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
    // Sequenced movement/heartbeat messages can legitimately arrive in a burst
    // after a mobile/WebSocket stall. The global bucket still protects the
    // socket from sustained spam, but a drained per-type bucket must not close
    // an otherwise healthy match connection just because buffered samples flush.
    if(type==='state'||type==='simTick')return false;
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
    const counts = botCountsFromMeta(meta), mode = matchMode(meta.match);
    const stored = await this.ctx.storage.get("bots");
    const rosterValid = botRosterMatchesConfig(this.world,stored, counts.blueBots, counts.redBots, mode);
    this.bots = reconcileBots(this.world,stored, counts.blueBots, counts.redBots, mode);
    if (!rosterValid) await this.ctx.storage.put("bots", this.bots);
    this.lastSimAt = Date.now();
    this.simAccumulatorMs = 0;
  }

  pruneSpawnHistory(now=Date.now()){
    const cutoff=now-12_000;
    this.recentDeaths=this.recentDeaths.filter(item=>finiteNumber(item?.at,0)>=cutoff).slice(-48);
    this.recentSpawns=this.recentSpawns.filter(item=>finiteNumber(item?.at,0)>=cutoff).slice(-48);
    this.recentGunfire=this.recentGunfire.filter(item=>finiteNumber(item?.at,0)>=now-4_000).slice(-64);
    this.recentExplosions=this.recentExplosions.filter(item=>finiteNumber(item?.at,0)>=now-6_000).slice(-32);
  }

  noteDeath(actor,now=Date.now()){
    if(!actor)return;this.pruneSpawnHistory(now);
    this.recentDeaths.push({x:finiteNumber(actor.x,0),z:finiteNumber(actor.z,0),team:safeTeam(actor.team),id:String(actor.clientId||actor.id||''),at:now});
  }

  noteSpawn(spawn,team,id,now=Date.now()){
    if(!spawn)return;this.pruneSpawnHistory(now);
    this.recentSpawns.push({x:finiteNumber(spawn.x,0),z:finiteNumber(spawn.z,0),team:safeTeam(team),id:String(id||''),cluster:String(spawn.cluster||''),at:now});
  }

  noteGunfire(shot,now=Date.now()){
    if(!shot)return;this.pruneSpawnHistory(now);
    this.recentGunfire.push({x:finiteNumber(shot.x,0),z:finiteNumber(shot.z,0),team:safeTeam(shot.team),id:String(shot.id||''),weapon:safeWeapon(shot.weapon),at:now});
  }

  noteExplosion(event,now=Date.now()){
    if(!event)return;this.pruneSpawnHistory(now);
    this.recentExplosions.push({x:finiteNumber(event.x,0),z:finiteNumber(event.z,0),team:safeTeam(event.team),id:String(event.id||''),kind:String(event.kind||'').slice(0,24),at:now});
  }

  selectSpawn(mode,team,actors=[],index=0,excludeId='',now=Date.now()){
    this.pruneSpawnHistory(now);
    const result=this.world.spawns.chooseSafeSpawn({
      mode:normalizeGameMode(mode),team:safeTeam(team),actors,index,excludeId,now,
      recentDeaths:this.recentDeaths,recentSpawns:this.recentSpawns,recentGunfire:this.recentGunfire,recentExplosions:this.recentExplosions,
      projectiles:[...this.bullets.values()],throwables:[...this.throwables.values()],
      terrainHeight:this.world.geometry.terrainHeight,
      blockedAt:(x,z,y)=>this.world.worldCollision.worldBlockedAt(x,z,y,PLAYER_HEIGHT,PLAYER_RADIUS),
      lineOfSight:(spawn,actor)=>this.actorLineOfSight(spawn,actor,now),
    });
    const protectionMs=result.emergency?Math.max(0,finiteNumber(this.world.spawns.SPAWN_POLICY?.emergencyProtectionMs,0)):0;
    const spawn={x:result.x,y:result.y,z:result.z,yaw:finiteNumber(result.yaw,0),cluster:String(result.cluster||''),spawnProtectedUntil:protectionMs?now+protectionMs:0};this.noteSpawn(spawn,team,excludeId,now);return spawn;
  }

  freezeHumanState(player,now=Date.now()){
    const support=this.world.geometry.worldSupportHeight(player.x,player.z,player.y,false);
    return {...player,y:support,ads:false,adsAmount:0,crouched:false,sprinting:false,sliding:false,slideUntil:0,moveSpeed:0,verticalVelocity:0,serverGrounded:true,lastGroundedAt:now,lastVerticalAt:now,lastStateAt:now,movementClockAt:now,lastMovementClientAt:now,lastStateSeq:0,moveBudgetSec:MOVE_BUDGET_INITIAL_SEC,traversal:null,ladder:null,knockVelocityX:0,knockVelocityZ:0,velocityX:0,velocityZ:0,reloadAt:0,reloadWeapon:'',weaponReadyAt:0,equipmentReadyAt:0,combatAction:'ready',combatActionKind:'',combatReadyAt:0,sprintFireReadyAt:0,fireReadyAt:normalizeFireReady()};
  }

  broadcastMatch(meta,now=Date.now(),extra={}){this.broadcast({t:'match',match:publicMatchState(meta.match,now),custom:this.isCustomMatch(meta),...extra});}

  finishMatch(meta,winner,reason,now=Date.now()){
    const match=meta.match;if(match.status==='ended')return false;
    const result=winner&&typeof winner==='object'?winner:{winner:winner||'draw'};
    Object.assign(match,{status:MATCH_STATUS.ENDED,endedAt:now,restartAt:now+MATCH_END_MS,winner:['blue','red','draw'].includes(result.winner)?result.winner:'',winnerId:safeClientId(result.winnerId||''),winnerName:String(result.winnerName||'').slice(0,24),reason:String(reason||'').slice(0,24),updatedAt:now});
    this.bullets.clear();this.throwables.clear();this.smokeClouds.clear();
    for(const socket of this.ctx.getWebSockets()){const p=socket.deserializeAttachment()||{};if(!p.clientId||p.replaced)continue;socket.serializeAttachment(this.freezeHumanState(p,now));}
    for(const bot of this.bots||[]){bot.traversal=null;bot.reloadAt=0;bot.reloadWeapon='';bot.moveSpeed=0;bot.y=this.world.geometry.worldSupportHeight(bot.x,bot.z,bot.y,false);}
    meta.match=match;this.matchDirty=true;this.broadcastMatch(meta,now);return true;
  }

  individualLeaders(){
    const rows=[];
    for(const socket of this.ctx.getWebSockets()){const p=socket.deserializeAttachment()||{};if(p.clientId&&!p.replaced)rows.push(this.findCombatant(p.clientId));}
    for(const bot of this.bots)rows.push(this.findCombatant(bot.id));
    rows.sort((a,b)=>(b.kills-a.kills)||(a.deaths-b.deaths)||a.name.localeCompare(b.name));return rows;
  }

  prepareRound(meta,now=Date.now()){
    const old=meta.match,mode=matchMode(old);
    meta.match={...defaultMatchState(now,old),round:1,status:MATCH_STATUS.WARMUP,warmupEndsAt:now+MATCH_WARMUP_MS,mode,scoreLimit:old.scoreLimit,timeLimitMs:old.timeLimitMs,minimapRevealAll:!!old.minimapRevealAll,minimapDirectional:!!old.minimapDirectional};
    this.bullets.clear();this.throwables.clear();this.smokeClouds.clear();this.recentDeaths=[];this.recentSpawns=[];this.recentGunfire=[];this.recentExplosions=[];const players=[],assigned=[];let index=0;
    for(const socket of this.ctx.getWebSockets()){
      const p=socket.deserializeAttachment()||{};if(!p.clientId||p.replaced)continue;
      const team=matchUsesTeams(mode)&&p.pendingTeam?safeTeam(p.pendingTeam):safeTeam(p.team),spawn=this.selectSpawn(mode,team,assigned,index++,p.clientId,now);
      const reset=spawnedPlayerState(p,spawn,team,now,{resetStats:true});socket.serializeAttachment(reset);players.push(publicPlayer(reset));assigned.push(reset);
    }
    this.bots=[];let botSpawnIndex=index;
    for(const [team,count] of [['blue',meta.blueBots||0],['red',meta.redBots||0]])for(let i=0;i<count;i++){
      const spawn=this.selectSpawn(mode,team,[...assigned,...this.bots],botSpawnIndex,`bot-${team}-${i+1}`,now);
      this.bots.push(makeBot(this.world,team,i,mode,botSpawnIndex++,spawn));
    }
    this.matchDirty=true;
    this.broadcast({t:'matchReset',match:publicMatchState(meta.match,now),players,bots:this.bots.map(publicBot),mapId:meta.mapId,settings:normalizeWorldSettings(meta.settings),botConfig:{blueBots:meta.blueBots||0,redBots:meta.redBots||0,difficulty:safeBotDifficulty(meta.botDifficulty)},custom:this.isCustomMatch(meta)});
    return true;
  }

  returnMatchToLobby(meta,now=Date.now()){
    const old=meta.match,mode=matchMode(old),players=[];
    meta.match={...defaultMatchState(now,old),round:1,status:MATCH_STATUS.WAITING,mode,scoreLimit:old.scoreLimit,timeLimitMs:old.timeLimitMs,minimapRevealAll:!!old.minimapRevealAll,minimapDirectional:!!old.minimapDirectional};
    this.bullets.clear();this.throwables.clear();this.smokeClouds.clear();this.recentDeaths=[];this.recentSpawns=[];this.recentGunfire=[];this.recentExplosions=[];
    for(const socket of this.ctx.getWebSockets()){
      const p=socket.deserializeAttachment()||{};if(!p.clientId||p.replaced)continue;
      const team=matchUsesTeams(mode)&&p.pendingTeam?safeTeam(p.pendingTeam):safeTeam(p.team),support=this.world.geometry.worldSupportHeight(p.x,p.z,p.y,false);
      const reset=spawnedPlayerState(p,{x:p.x,y:support,z:p.z},team,now,{resetStats:true});socket.serializeAttachment(reset);players.push(publicPlayer(reset));
    }
    this.matchDirty=true;
    this.broadcast({t:'matchLobby',match:publicMatchState(meta.match,now),players,bots:(this.bots||[]).map(publicBot),custom:this.isCustomMatch(meta)});
    void this.updateDirectory(this.liveSockets().length,meta).catch(()=>{});
    return true;
  }

  stepMatch(now,meta){
    const match=meta.match,mode=matchMode(match),spec=gameModeSpec(mode);
    if(match.status===MATCH_STATUS.WAITING)return;
    if(match.status===MATCH_STATUS.WARMUP&&match.warmupEndsAt&&now>=match.warmupEndsAt){
      Object.assign(match,{status:MATCH_STATUS.ACTIVE,startedAt:now,endsAt:spec.timeLimitMs>0?now+match.timeLimitMs:0,warmupEndsAt:0,winner:'',winnerId:'',winnerName:'',reason:'',updatedAt:now});
      for(const socket of this.ctx.getWebSockets()){const p=socket.deserializeAttachment()||{};if(!p.clientId||p.replaced)continue;socket.serializeAttachment({...p,lastStateAt:now,lastVerticalAt:now,lastGroundedAt:now,movementClockAt:now,moveBudgetSec:MOVE_BUDGET_INITIAL_SEC,moveSpeed:0,verticalVelocity:0,serverGrounded:true,knockVelocityX:0,knockVelocityZ:0,traversal:null,ladder:null});}
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
    if(match.status===MATCH_STATUS.ENDED&&match.restartAt&&now>=match.restartAt)this.returnMatchToLobby(meta,now);
  }

  recordMatchKill(attackerId,victimId,now=Date.now()){
    const meta=this.metaCache;if(!meta)return;const match=meta.match,mode=matchMode(match),spec=gameModeSpec(mode);
    if(!matchAllowsCombat(match)||spec.scoreType==='none'||!attackerId||attackerId===victimId)return;
    const attacker=this.findCombatant(attackerId),victim=this.findCombatant(victimId);
    if(!attacker?.id||!victim?.id||combatantsAreFriendly(mode,attacker.id,attacker.team,victim.id,victim.team))return;
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
    const secondaryWeapon = safeSecondaryWeapon(body?.secondaryWeapon);
    const primaryAttachments=normalizeWeaponAttachments(primaryWeapon,body?.primaryAttachments),secondaryAttachments=normalizeWeaponAttachments(secondaryWeapon,body?.secondaryAttachments);
    const tactical = safeTactical(body?.tactical);
    const lethal = safeLethal(body?.lethal);
    const baseLoadout=normalizeLoadout({primaryWeapon,secondaryWeapon,primaryAttachments,secondaryAttachments,tactical,lethal}),loadoutClasses=normalizeLoadoutClasses(body?.loadoutClasses,baseLoadout),activeClassId=normalizeLoadoutClassId(body?.activeClassId),activeClass=normalizeLoadout(loadoutClassById(loadoutClasses,activeClassId,baseLoadout),baseLoadout);
    if (!clientId) return { status: 400, data: { error: "Missing client ID." } };
    if (clientAuth.length < 32) return { status: 401, data: { error: "Missing client credential." } };
    if (!this.allowJoinTicketRequest(clientId, now)) return { status: 429, data: { error: "Too many join attempts. Try again shortly." } };
    const clientAuthHash = await sha256Hex(clientAuth);
    const expected = meta.clientAuthHashes[clientId] || "";
    if (expected && expected !== clientAuthHash) return { status: 403, data: { error: "Client credential rejected." } };
    const tickets = await this.loadJoinTickets(now);
    const ticket = makeJoinTicket();
    tickets[ticket] = { clientId, clientAuthHash, name, team, ...activeClass, loadoutClasses, activeClassId, issuedAt: now, expiresAt: now + JOIN_TICKET_TTL_MS };
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
        mapId: DEFAULT_MAP_ID,
        settings: normalizeWorldSettings(),
        match,
        createdAt: now,
        expiresAt: now + ROOM_MAX_LIFETIME_MS,
      };
      await this.putMeta(meta);
      this.world=worldBundle(meta.mapId);
      this.bots = makeBots(this.world,blueBots, redBots, mode);
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
    const requestedSecondary = safeSecondaryWeapon(join.secondaryWeapon);
    const requestedPrimaryAttachments=normalizeWeaponAttachments(requestedPrimary,join.primaryAttachments),requestedSecondaryAttachments=normalizeWeaponAttachments(requestedSecondary,join.secondaryAttachments);
    const requestedTactical = safeTactical(join.tactical);
    const requestedLethal = safeLethal(join.lethal);
    const requestedBase=normalizeLoadout({primaryWeapon:requestedPrimary,secondaryWeapon:requestedSecondary,primaryAttachments:requestedPrimaryAttachments,secondaryAttachments:requestedSecondaryAttachments,tactical:requestedTactical,lethal:requestedLethal}),requestedClasses=normalizeLoadoutClasses(join.loadoutClasses,requestedBase),requestedClassId=normalizeLoadoutClassId(join.activeClassId);
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
    const spawn = preservePosition?preserved:(matchAllowsLobbyEdits(meta.match)?spawnForMode(this.world,mode,joinTeam,mode==='ffa'?liveMembers.length:requestedTeamCount):this.selectSpawn(mode,joinTeam,spawnActors,liveMembers.length,clientId,fetchNow));
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
      y: finiteNumber(spawn.y, this.world.geometry.terrainHeight(spawn.x || 0, spawn.z || 0)),
      z: clamp(finiteNumber(spawn.z, 0), -ARENA_LIMIT, ARENA_LIMIT),
      yaw: finiteNumber(spawn.yaw, 0),
      pitch: clamp(finiteNumber(spawn.pitch, 0), -1.4, 1.4),
      hp: clamp(Math.floor(finiteNumber(spawn.hp, 100)), 0, 100),
      wastedUntil: finiteNumber(spawn.wastedUntil, 0),
      spawnProtectedUntil: Math.max(0,finiteNumber(spawn.spawnProtectedUntil,0)),
      velocityX:0,velocityZ:0,
      fireReadyAt: normalizeFireReady(spawn.fireReadyAt),
      regenAt: finiteNumber(spawn.regenAt, 0),
      loadoutClasses: normalizeLoadoutClasses(preserved?.loadoutClasses||requestedClasses,preserved||requestedBase),
      activeClassId: normalizeLoadoutClassId(preserved?.activeClassId||requestedClassId),
      pendingClassId: preserved?.pendingClassId ? normalizeLoadoutClassId(preserved.pendingClassId) : '',
      primaryWeapon: safePrimaryWeapon(preserved?.primaryWeapon || requestedPrimary),
      secondaryWeapon: safeSecondaryWeapon(preserved?.secondaryWeapon || requestedSecondary),
      primaryAttachments: normalizeWeaponAttachments(safePrimaryWeapon(preserved?.primaryWeapon || requestedPrimary),preserved?.primaryAttachments||requestedPrimaryAttachments),
      secondaryAttachments: normalizeWeaponAttachments(safeSecondaryWeapon(preserved?.secondaryWeapon || requestedSecondary),preserved?.secondaryAttachments||requestedSecondaryAttachments),
      tactical: safeTactical(preserved?.tactical || requestedTactical),
      lethal: safeLethal(preserved?.lethal || requestedLethal),
      pendingLoadout: preserved?.pendingLoadout ? normalizeLoadout(preserved.pendingLoadout,{primaryWeapon:preserved.primaryWeapon,secondaryWeapon:preserved.secondaryWeapon,primaryAttachments:preserved.primaryAttachments,secondaryAttachments:preserved.secondaryAttachments,tactical:preserved.tactical,lethal:preserved.lethal}) : null,
      weapon: preserved && playerCanEquip({ primaryWeapon: preserved?.primaryWeapon || requestedPrimary, secondaryWeapon:preserved?.secondaryWeapon || requestedSecondary }, preserved.weapon)
        ? safeWeapon(preserved.weapon)
        : safePrimaryWeapon(preserved?.primaryWeapon || requestedPrimary),
      ammo: normalizeAmmo(spawn.ammo),
      equipment: preserved ? normalizeEquipment(spawn.equipment) : freshEquipment(requestedTactical,requestedLethal),
      reloadAt: finiteNumber(spawn.reloadAt, 0),
      reloadWeapon: safeWeapon(spawn.reloadWeapon || spawn.weapon),
      weaponReadyAt: Math.max(0, finiteNumber(spawn.weaponReadyAt, 0)),
      equipmentReadyAt: Math.max(0, finiteNumber(spawn.equipmentReadyAt, 0)),
      combatAction:'ready',combatActionKind:'',combatReadyAt:0,
      kills: Math.max(0, Math.floor(finiteNumber(spawn.kills, 0))),
      deaths: Math.max(0, Math.floor(finiteNumber(spawn.deaths, 0))),
      godMode: preserved ? !!preserved.godMode : false,
      pendingTeam: preserved?.pendingTeam ? safeTeam(preserved.pendingTeam) : '',
      admin: isRoomAdmin(meta, clientId),
      ads: false,
      crouched: !!preserved?.crouched,
      sprinting: false,
      sliding: false,
      slideUntil: 0,
      moveSpeed: 0,
      flashUntil: Math.max(0, finiteNumber(preserved?.flashUntil, 0)),
      flashPower: clamp(finiteNumber(preserved?.flashPower, 0), 0, 1),
      flashDurationMs: Math.max(0, finiteNumber(preserved?.flashDurationMs, 0)),
      verticalVelocity: finiteNumber(preserved?.verticalVelocity, 0),
      serverGrounded: preserved?.serverGrounded !== false,
      lastGroundedAt: preserved?.serverGrounded !== false ? Date.now() : Math.max(0,finiteNumber(preserved?.lastGroundedAt,0)),
      lastJumpSeq: Math.max(0, Math.floor(finiteNumber(preserved?.lastJumpSeq, 0))),
      traversal:null,lastTraverseSeq:Math.max(0,Math.floor(finiteNumber(preserved?.lastTraverseSeq,0))),ladder:null,lastLadderSeq:Math.max(0,Math.floor(finiteNumber(preserved?.lastLadderSeq,0))),
      lastVerticalAt: Date.now(),
      lastStateAt: Date.now(),
      movementClockAt: Date.now(),
      moveBudgetSec: MOVE_BUDGET_INITIAL_SEC,
      knockVelocityX: 0, knockVelocityZ: 0,
    };
    attachment.ammo=normalizeAmmo(spawn.ammo,attachment);

    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server);
    await this.ctx.storage.delete("emptySince");
    await this.ctx.storage.delete(`reconnect:${clientId}`);
    await this.scheduleRoomAlarm(meta.expiresAt);

    const currentPlayers = liveMembers.map(({ attachment: a }) => publicPlayer(a));
    sendJson(server,{
      t: "welcome",
      self: {...publicPlayer(attachment),loadoutClasses:normalizeLoadoutClasses(attachment.loadoutClasses,attachment),activeClassId:normalizeLoadoutClassId(attachment.activeClassId),pendingClassId:attachment.pendingClassId?normalizeLoadoutClassId(attachment.pendingClassId):''},
      players: currentPlayers,
      bots: this.bots.map(publicBot),
      code: meta.code,
      maxPlayers: MAX_PLAYERS,
      botConfig: { blueBots: meta.blueBots || 0, redBots: meta.redBots || 0, difficulty: safeBotDifficulty(meta.botDifficulty) },
      isAdmin: isRoomAdmin(meta, clientId),
      ownerClientId: meta.ownerClientId,
      settings: meta.settings,
      mapId: normalizeMapId(meta.mapId),
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
    if(!['ready','equipmentAim','recover'].includes(me.combatAction))me={...me,combatAction:'ready',combatActionKind:'',combatReadyAt:0};
    const settings = meta.settings;

    me = this.advanceReloadForSocket(socket, me, now, settings);
    if(me.combatAction==='recover'&&now>=finiteNumber(me.combatReadyAt,0))me={...me,combatAction:'ready',combatActionKind:'',combatReadyAt:0};
    if(matchAllowsMovement(meta.match)){me=this.advanceTraversalState(me,now);me=this.advanceLadderState(me,now);}
    else if(me.traversal||me.ladder)me={...me,traversal:null,ladder:null,verticalVelocity:0,moveSpeed:0};
    socket.serializeAttachment(me);

    if (payload.t === "state") {
      if (me.hp > 0 || now >= me.wastedUntil) {
        if (!matchAllowsMovement(meta.match)) {
          const requestedX=clamp(finiteNumber(payload.x,me.x),-ARENA_LIMIT,ARENA_LIMIT),requestedY=finiteNumber(payload.y,me.y),requestedZ=clamp(finiteNumber(payload.z,me.z),-ARENA_LIMIT,ARENA_LIMIT);
          const corrected=Math.hypot(requestedX-me.x,requestedZ-me.z)>.01||Math.abs(requestedY-me.y)>.05||!!payload.crouched||!!payload.ads;
          const support=this.world.geometry.worldSupportHeight(me.x,me.z,me.y,false),incomingJumpSeq=Math.max(0,Math.floor(finiteNumber(payload.jumpSeq,me.lastJumpSeq||0)));
          me={...me,y:support,yaw:finiteNumber(payload.yaw,me.yaw),pitch:clamp(finiteNumber(payload.pitch,me.pitch),-1.4,1.4),ads:false,adsAmount:0,crouched:false,sprinting:false,sliding:false,slideUntil:0,moveSpeed:0,verticalVelocity:0,serverGrounded:true,lastGroundedAt:now,lastVerticalAt:now,lastStateAt:now,movementClockAt:now,lastMovementClientAt:now,moveBudgetSec:MOVE_BUDGET_INITIAL_SEC,lastJumpSeq:incomingJumpSeq,traversal:null,ladder:null,knockVelocityX:0,knockVelocityZ:0};
          socket.serializeAttachment(me);
          const stateSeq=Math.max(0,Math.floor(finiteNumber(payload.seq,0))),stateAt=Math.min(now,sanitizeCombatTimestamp(payload.at,now));
          this.broadcast({t:'state',id:me.clientId,at:stateAt,x:me.x,y:me.y,z:me.z,yaw:me.yaw,pitch:me.pitch,ads:false,adsAmount:0,crouched:false,sprinting:false,sliding:false,traversal:'',ladderId:'',ladderPhase:''},socket);
          if(corrected)sendJson(socket,{t:'correction',seq:stateSeq,x:me.x,y:me.y,z:me.z,vertical:false,verticalVelocity:0,grounded:true,crouched:false,reason:'movement_locked'});
        } else {
          const previousStateAt=finiteNumber(me.lastStateAt,now),serverStateGapMs=clamp(now-previousStateAt,0,10000);
          const next = this.validateHumanState(me, payload, now, settings),combatAt=Math.min(now,sanitizeCombatTimestamp(payload.at,now)),stateSeq=Math.max(0,Math.floor(finiteNumber(payload.seq,0)));
          me = {...next.player,lastCombatStateAt:combatAt,diagLastStateGapMs:serverStateGapMs,diagMaxStateGapMs:Math.max(finiteNumber(me.diagMaxStateGapMs,0),serverStateGapMs)};
          socket.serializeAttachment(me);
          this.recordCombatPose(me,combatAt);
          const state = { t: "state", id: me.clientId, at:combatAt, x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch, ads: !!me.ads, crouched: !!me.crouched, sprinting:!!me.sprinting, sliding:!!me.sliding, traversal:me.traversal?.mode||'', ladderId:me.ladder?.id||'', ladderPhase:me.ladder?.phase||'' };
          this.broadcast(state, socket);
          if (next.corrected) sendJson(socket,{
            t:"correction",seq:stateSeq,x:me.x,y:me.y,z:me.z,vertical:next.verticalCorrected,
            verticalVelocity:finiteNumber(me.verticalVelocity,0),grounded:me.serverGrounded!==false,crouched:!!me.crouched,reason:next.reason||'position',horizontalError:round3(next.horizontalError||0),verticalError:round3(next.verticalError||0),speedViolation:!!next.speedViolation,
          });
        }
      }
      await this.stepSimulation(now, meta);
      return;
    }


    if (payload.t === "ladder") {
      const action=String(payload.action||''),seq=Math.max(0,Math.floor(finiteNumber(payload.seq,0))),previousSeq=Math.max(0,Math.floor(finiteNumber(me.lastLadderSeq,0)));
      const reject=(reason='invalid')=>sendJson(socket,{t:'ladder',id:me.clientId,seq,accepted:false,action,reason,x:me.x,y:me.y,z:me.z,ladder:publicLadderState(me.ladder)});
      if(!matchAllowsMovement(meta.match)||me.hp<=0||now<me.wastedUntil||me.traversal){reject('unavailable');return;}
      if(action==='attach'){
        if(seq<=previousSeq||me.ladder){reject('sequence');return;}
        let dirX=clamp(finiteNumber(payload.dirX,0),-1,1),dirZ=clamp(finiteNumber(payload.dirZ,0),-1,1),len=Math.hypot(dirX,dirZ);if(len<.35){reject('input');return;}dirX/=len;dirZ/=len;
        const faceX=-Math.sin(me.yaw),faceZ=-Math.cos(me.yaw),entry=findLadderEntry({ladders:this.world.geometry.LADDERS,x:me.x,y:me.y,z:me.z,dirX,dirZ,faceX,faceZ,radius:PLAYER_RADIUS,grounded:me.serverGrounded!==false});
        if(!entry||String(payload.ladderId||'')!==entry.ladderId){reject('entry');return;}
        const solidActors=this.solidActors(me.clientId,now);if(this.actorBlocksAt(entry.attachX,entry.attachZ,entry.attachY,me.x,me.z,solidActors,PLAYER_HEIGHT)){reject('actor_blocked');return;}
        const ladder={id:String(entry.ladderId),seq,phase:'climb',entry:entry.entry==='top'?'top':'bottom'};
        me={...me,x:entry.attachX,y:entry.attachY,z:entry.attachZ,ladder,lastLadderSeq:seq,traversal:null,verticalVelocity:0,serverGrounded:false,ads:false,adsAmount:0,crouched:false,sprinting:false,sliding:false,slideUntil:0,moveSpeed:0,movementClockAt:now,moveBudgetSec:LADDER_BUDGET_INITIAL_SEC,combatAction:'ready',combatActionKind:'',combatReadyAt:0};socket.serializeAttachment(me);
        const event={t:'ladder',id:me.clientId,seq,accepted:true,action:'attach',x:me.x,y:me.y,z:me.z,ladder:publicLadderState(ladder)};sendJson(socket,event);this.broadcast(event,socket);return;
      }
      if(action==='dismount'){
        if(!me.ladder||seq<=previousSeq){reject('sequence');return;}const ladder=ladderById(this.world.geometry.LADDERS,me.ladder.id);if(!ladder){me={...me,ladder:null};socket.serializeAttachment(me);reject('missing');return;}
        const end=payload.end==='top'?'top':'bottom',nearEnd=end==='top'?me.y>=ladder.topY-.30:me.y<=ladder.bottomY+.20;if(!nearEnd){reject('range');return;}
        const target=end==='top'?ladderTopExitPoint(ladder,PLAYER_RADIUS):ladderBottomExitPoint(ladder,PLAYER_RADIUS),solidActors=this.solidActors(me.clientId,now);
        if(this.world.worldCollision.worldBlockedAt(target.x,target.z,target.y,PLAYER_HEIGHT,PLAYER_RADIUS)||this.actorBlocksAt(target.x,target.z,target.y,me.x,me.z,solidActors,PLAYER_HEIGHT)){reject('blocked');return;}
        me={...me,x:target.x,y:target.y,z:target.z,ladder:null,lastLadderSeq:seq,verticalVelocity:0,serverGrounded:true,lastGroundedAt:now,lastVerticalAt:now,moveSpeed:0,movementClockAt:now,moveBudgetSec:MOVE_BUDGET_INITIAL_SEC};socket.serializeAttachment(me);
        const event={t:'ladder',id:me.clientId,seq,accepted:true,action:'dismount',end,x:me.x,y:me.y,z:me.z,ladder:null};sendJson(socket,event);this.broadcast(event,socket);return;
      }
      if(action==='detach'){
        if(!me.ladder||seq<=previousSeq){reject('sequence');return;}const ladder=ladderById(this.world.geometry.LADDERS,me.ladder.id);if(!ladder){reject('missing');return;}const cp=ladderClimbPoint(ladder,PLAYER_RADIUS),x=cp.x+Number(ladder.nx)*.24,z=cp.z+Number(ladder.nz)*.24,solidActors=this.solidActors(me.clientId,now);
        if(this.world.worldCollision.worldBlockedAt(x,z,me.y,PLAYER_HEIGHT,PLAYER_RADIUS)||this.actorBlocksAt(x,z,me.y,me.x,me.z,solidActors,PLAYER_HEIGHT)){reject('blocked');return;}
        me={...me,x,z,ladder:null,lastLadderSeq:seq,verticalVelocity:2.15,serverGrounded:false,lastVerticalAt:now,movementClockAt:now,moveBudgetSec:MOVE_BUDGET_INITIAL_SEC};socket.serializeAttachment(me);
        const event={t:'ladder',id:me.clientId,seq,accepted:true,action:'detach',x:me.x,y:me.y,z:me.z,verticalVelocity:me.verticalVelocity,ladder:null};sendJson(socket,event);this.broadcast(event,socket);return;
      }
      reject('action');return;
    }

    if (payload.t === "traverse") {
      const seq=Math.max(0,Math.floor(finiteNumber(payload.seq,0))),previousSeq=Math.max(0,Math.floor(finiteNumber(me.lastTraverseSeq,0)));
      if(seq<=previousSeq||me.traversal||me.ladder||!matchAllowsMovement(meta.match)||me.hp<=0||now<me.wastedUntil){sendJson(socket,{t:'traverse',id:me.clientId,seq,accepted:false,reason:'unavailable',x:me.x,y:me.y,z:me.z});return;}
      let dirX=clamp(finiteNumber(payload.dirX,0),-1,1),dirZ=clamp(finiteNumber(payload.dirZ,0),-1,1),dirLen=Math.hypot(dirX,dirZ);
      if(dirLen<.35){sendJson(socket,{t:'traverse',id:me.clientId,seq,accepted:false,reason:'input',x:me.x,y:me.y,z:me.z});return;}dirX/=dirLen;dirZ/=dirLen;
      const playerHeight=me.crouched?CROUCH_HEIGHT:PLAYER_HEIGHT,candidate=this.world.worldCollision.findTraversalCandidate({x:me.x,y:me.y,z:me.z,dirX,dirZ,height:playerHeight,radius:PLAYER_RADIUS,airborne:me.serverGrounded===false});
      const solidActors=this.solidActors(me.clientId,now);
      if(!candidate||this.actorBlocksAt(candidate.endX,candidate.endZ,candidate.endY,me.x,me.z,solidActors,playerHeight)){sendJson(socket,{t:'traverse',id:me.clientId,seq,accepted:false,reason:!candidate?'no_candidate':'actor_blocked',x:me.x,y:me.y,z:me.z});return;}
      const requestedAt=sanitizeCombatTimestamp(payload.at,now),stateAt=finiteNumber(me.lastCombatStateAt,requestedAt),traversalAt=clamp(requestedAt,stateAt-12,Math.min(now,stateAt+40)),plan=createTraversalPlan(candidate,me.x,me.y,me.z,traversalAt,seq);if(!plan){sendJson(socket,{t:'traverse',id:me.clientId,seq,accepted:false,reason:'plan',x:me.x,y:me.y,z:me.z});return;}
      me={...me,traversal:plan,lastTraverseSeq:seq,verticalVelocity:0,serverGrounded:false,ads:false,adsAmount:0,moveSpeed:0,combatAction:'ready',combatActionKind:'',combatReadyAt:0};socket.serializeAttachment(me);
      const event={t:'traverse',id:me.clientId,accepted:true,...plan};sendJson(socket,event);this.broadcast(event,socket);return;
    }

    if (payload.t === "simTick") { await this.stepSimulation(now, meta); return; }

    if (payload.t === "chat") {
      const text = safeChatText(payload.text);
      if (!text) return;
      this.broadcast({ t:"chat", id:me.clientId, name:safeName(me.name), team:safeTeam(me.team), text, at:now });
      return;
    }

    if(payload.t==='equipmentAction'){
      const action=String(payload.action||''),kind=safeEquipmentKind(payload.kind),unlimited=!!me.godMode;
      const validKind=kind===safeTactical(me.tactical)||kind===safeLethal(me.lethal);
      if(action==='begin'){
        if(!matchAllowsCombat(meta.match)||!validKind||me.hp<=0||now<me.wastedUntil||me.traversal||me.ladder||now<finiteNumber(me.equipmentReadyAt,0)||(!unlimited&&me.equipment[kind]<=0)||me.combatAction!=='ready'){
          const reason=!matchAllowsCombat(meta.match)?'match_inactive':!validKind?'loadout':me.hp<=0||now<me.wastedUntil?'dead':me.traversal||me.ladder?'traversing':now<finiteNumber(me.equipmentReadyAt,0)?'cooldown':(!unlimited&&me.equipment[kind]<=0)?'empty':'busy';
          sendJson(socket,{t:'equipmentAction',action:'begin',kind,accepted:false,reason});return;
        }
        if(me.reloadAt){me.reloadAt=0;me.reloadWeapon='';this.broadcast({t:'reload',id:me.clientId,weapon:me.weapon,reloadAt:0},socket);}
        me={...me,combatAction:'equipmentAim',combatActionKind:kind,combatReadyAt:0,ads:false,adsAmount:0,sprinting:false};socket.serializeAttachment(me);
        sendJson(socket,{t:'equipmentAction',action:'begin',kind,accepted:true});return;
      }
      if(action==='cancel'){
        if(me.combatAction==='equipmentAim'&&(!kind||kind===me.combatActionKind)){me={...me,combatAction:'ready',combatActionKind:'',combatReadyAt:0};socket.serializeAttachment(me);}
        sendJson(socket,{t:'equipmentAction',action:'cancel',kind,accepted:true});return;
      }
      sendJson(socket,{t:'equipmentAction',action,kind,accepted:false,reason:'action'});return;
    }

    if (payload.t === "fire") {
      if(!matchAllowsCombat(meta.match)){sendLoadout(socket,me,{action:'fire',accepted:false,reason:'match_inactive'});return;}
      const requestedWeapon=safeWeapon(payload.weapon||me.weapon);
      if(requestedWeapon!==me.weapon){sendLoadout(socket,me,{action:'fire',accepted:false,reason:'weapon_mismatch'});return;}
      const weapon=safeWeapon(me.weapon),attachments=attachmentsForPlayerWeapon(me,weapon),spec=effectiveWeaponRules(settings,me,weapon),resolvedSpec=spec.spec,unlimited=!!me.godMode,hand=weapon==='akimbo1887'?(payload.hand==='left'?'left':'right'):'';
      if(me.hp<=0||now<me.wastedUntil){sendLoadout(socket,me,{action:'fire',accepted:false,reason:'dead'});return;}
      if(me.traversal){sendLoadout(socket,me,{action:'fire',accepted:false,reason:'traversing'});return;}
      if(me.combatAction!=='ready'||now<finiteNumber(me.combatReadyAt,0)){sendLoadout(socket,me,{action:'fire',accepted:false,reason:'equipment',retryAfterMs:Math.max(0,Math.ceil(finiteNumber(me.combatReadyAt,0)-now))});return;}
      const interruptShotgunReload=!unlimited&&!!me.reloadAt&&weapon==='shotgun'&&me.ammo.shotgun>0;
      if(!unlimited&&me.reloadAt&&!interruptShotgunReload){sendLoadout(socket,me,{action:'fire',accepted:false,reason:'reloading'});return;}
      if(interruptShotgunReload){me.reloadAt=0;me.reloadWeapon='';this.broadcast({t:'reload',id:me.clientId,weapon:'shotgun',reloadAt:0},socket);}
      const switchReadyAt=finiteNumber(me.weaponReadyAt,0),fireKey=weapon==='akimbo1887'?(hand==='left'?'akimbo1887Left':'akimbo1887Right'):weapon,shotReadyAt=finiteNumber(me.fireReadyAt[fireKey],0),sprintReadyAt=finiteNumber(me.sprintFireReadyAt,0),readyAt=Math.max(switchReadyAt,shotReadyAt,sprintReadyAt);
      if(now<readyAt){const retryAfterMs=Math.max(1,Math.ceil(readyAt-now)),reason=sprintReadyAt>=switchReadyAt&&sprintReadyAt>=shotReadyAt?'sprint_out':switchReadyAt>=shotReadyAt?'weapon_switch':'cooldown';sendLoadout(socket,me,{action:'fire',accepted:false,reason,retryAfterMs});return;}
      if(!unlimited&&me.ammo[weapon]<=0){me.reloadAt=now+spec.reloadMs;me.reloadWeapon=weapon;socket.serializeAttachment(me);sendLoadout(socket,me,{action:'fire',accepted:false,reason:'empty'});this.broadcast({t:'reload',id:me.clientId,weapon,reloadAt:me.reloadAt},socket);return;}

      const requestedShotAt=sanitizeCombatTimestamp(payload.shotAt,now),stateAt=finiteNumber(me.lastCombatStateAt,requestedShotAt),shotAt=clamp(requestedShotAt,stateAt-12,Math.min(now,stateAt+40)),shooterPose=this.combatPoseAt(me,shotAt),reticle=safeShotAim(me,payload),flashPower=activeFlashPower(me,now),targetRewindMs=(weapon==='grenadeLauncher'||weapon==='rpg')?0:clamp(finiteNumber(payload.viewDelayMs,0),0,MAX_TARGET_REWIND_MS);let shotYaw=reticle.yaw,shotPitch=reticle.pitch;
      if(flashPower>.02){const flashSpread=.035+flashPower*.22;shotYaw+=(Math.random()-.5)*2*flashSpread;shotPitch=clamp(shotPitch+(Math.random()-.5)*1.5*flashSpread,-1.4,1.4);me.ads=false;}
      if(weapon==='akimbo1887')me.ads=false;
      const preShotHeat=decayedFireHeat(me,weapon,now),adsAmount=me.ads?clamp(finiteNumber(payload.adsAmount,1),0,1):0,airborne=me.serverGrounded===false;
      me.spawnProtectedUntil=0;
      me.fireReadyAt[fireKey]=now+spec.cooldownMs;if(!unlimited)me.ammo[weapon]-=1;storeFireHeat(me,weapon,now,preShotHeat);
      const autoReloadStarted=!unlimited&&me.ammo[weapon]===0;if(autoReloadStarted){me.reloadAt=now+spec.reloadMs;me.reloadWeapon=weapon;}
      socket.serializeAttachment(me);
      const spreadRadius=weaponSpreadRadians(weapon,me.moveSpeed,settings.movement.runSpeed,adsAmount,!!me.crouched,airborne,preShotHeat,!!me.sliding,attachments),pellets=Math.max(1,Math.floor(resolvedSpec.pellets||1)),shotgunPattern=weapon==='shotgun'||weapon==='semiShotgun'||weapon==='akimbo1887',patternRotation=Math.random()*Math.PI*2;
      const launcherPitchOffset=(Number(resolvedSpec.launchPitchDeg)||0)*Math.PI/180,basePitch=clamp(shotPitch+launcherPitchOffset,-1.4,1.4);
      for(let i=0;i<pellets;i++){
        const a=shotgunPattern?shotgunPelletAngles(shotYaw,basePitch,spreadRadius,i,pellets,patternRotation):spreadShotAngles(shotYaw,basePitch,spreadRadius),launch=shotLaunchPose(shooterPose,a.yaw,a.pitch,!!shooterPose.crouched,weapon,this.world.serverCollision.segmentFirstWorldHitT,resolvedSpec.projectileRadius),centerScale=i===0?Math.max(1,finiteNumber(resolvedSpec.centerPelletDamageScale,1)):1;
        this.spawnBullet({ownerId:me.clientId,hand,ownerTeam:safeTeam(me.team),damage:spec.damage*centerScale,weapon,attachments,lifetimeMs:resolvedSpec.lifetimeMs,x:launch.x,y:launch.y,z:launch.z,vx:launch.dx*spec.speed,vy:launch.dy*spec.speed,vz:launch.dz*spec.speed,now,shotAt,targetRewindMs,consumeAmmo:i===0&&!unlimited,primaryShot:i===0});
      }
      sendLoadout(socket,me,{action:'fire',accepted:true,unlimited});if(autoReloadStarted)this.broadcast({t:'reload',id:me.clientId,weapon,reloadAt:me.reloadAt},socket);await this.stepSimulation(now,meta);return;
    }

    if(payload.t==='throw'){
      if(!matchAllowsCombat(meta.match)){sendJson(socket,{t:'throwAck',id:safeClientId(payload.id).slice(0,24),accepted:false,reason:'match_inactive'});return;}
      const kind=safeEquipmentKind(payload.kind),unlimited=!!me.godMode;
      const requestedId=safeClientId(payload.id).slice(0,24),id=requestedId&&!this.throwables.has(requestedId)?requestedId:crypto.randomUUID().replace(/-/g,'').slice(0,16);
      if(kind!==safeTactical(me.tactical)&&kind!==safeLethal(me.lethal)){sendJson(socket,{t:'throwAck',id:requestedId||id,accepted:false,reason:'loadout'});return;}
      if(me.hp<=0||now<me.wastedUntil||me.traversal||me.ladder||now<finiteNumber(me.equipmentReadyAt,0)||(!unlimited&&me.equipment[kind]<=0)||me.combatAction!=='equipmentAim'||me.combatActionKind!==kind){if(me.combatAction==='equipmentAim'){me={...me,combatAction:'ready',combatActionKind:'',combatReadyAt:0};socket.serializeAttachment(me);}sendJson(socket,{t:'throwAck',id:requestedId||id,accepted:false,reason:'equipment_state'});return;}
      me.yaw=finiteNumber(payload.yaw,me.yaw);me.pitch=clamp(finiteNumber(payload.pitch,me.pitch),-1.25,1.15);
      const flashPower=activeFlashPower(me,now);let throwYaw=me.yaw,throwPitch=me.pitch;
      if(flashPower>.02){const flashSpread=.025+flashPower*.16;throwYaw+=(Math.random()-.5)*2*flashSpread;throwPitch=clamp(throwPitch+(Math.random()-.5)*1.4*flashSpread,-1.25,1.15);me.ads=false;}
      const throwVelocity=tacticalThrowVelocity(throwYaw,throwPitch,TACTICAL_THROW_SPEED,TACTICAL_THROW_LOFT);
      me.spawnProtectedUntil=0;me.equipmentReadyAt=now+Math.max(360,EQUIPMENT_WEAPON_RECOVER_MS);me.combatAction='recover';me.combatActionKind=kind;me.combatReadyAt=now+EQUIPMENT_WEAPON_RECOVER_MS;me.weaponReadyAt=Math.max(finiteNumber(me.weaponReadyAt,0),me.combatReadyAt);if(!unlimited)me.equipment[kind]-=1;socket.serializeAttachment(me);sendJson(socket,{t:'equipment',equipment:me.equipment,unlimited});sendJson(socket,{t:'throwAck',id,accepted:true,recoverMs:EQUIPMENT_WEAPON_RECOVER_MS});
      const g={id,kind,ownerId:me.clientId,ownerTeam:safeTeam(me.team),radius:equipmentCollisionRadius(kind),x:me.x+throwVelocity.fx*.82,y:me.y+(me.crouched?CROUCH_HEIGHT:PLAYER_HEIGHT)-.22,z:me.z+throwVelocity.fz*.82,vx:throwVelocity.vx,vy:throwVelocity.vy,vz:throwVelocity.vz,born:now,lastAt:now,fuseAt:now+(kind==='sticky'?1850:kind==='frag'?2300:kind==='smoke'?1300:1650),stuck:false,rolling:false,lastBroadcast:now};
      this.throwables.set(id,g);this.broadcast({t:'throwable',...g,at:now});await this.stepSimulation(now,meta);return;
    }

    if (payload.t === "reload") {
      const requestedWeapon=safeWeapon(payload.weapon||me.weapon);
      if(requestedWeapon!==me.weapon){sendLoadout(socket,me,{action:'reload',accepted:false,reason:'weapon_mismatch'});return;}
      const weapon=safeWeapon(me.weapon),spec=effectiveWeaponRules(settings,me,weapon),resolvedSpec=spec.spec;
      if(me.hp<=0||now<me.wastedUntil){sendLoadout(socket,me,{action:'reload',accepted:false,reason:'dead'});return;}
      if(me.traversal||me.ladder){sendLoadout(socket,me,{action:'reload',accepted:false,reason:'traversing'});return;}
      if(me.combatAction!=='ready'||now<finiteNumber(me.combatReadyAt,0)){sendLoadout(socket,me,{action:'reload',accepted:false,reason:'equipment'});return;}
      if(me.godMode){sendLoadout(socket,me,{action:'reload',accepted:true,reason:'unlimited',unlimited:true});return;}
      if(me.reloadAt){sendLoadout(socket,me,{action:'reload',accepted:true,reason:'already'});return;}
      if(me.ammo[weapon]>=resolvedSpec.mag){sendLoadout(socket,me,{action:'reload',accepted:false,reason:'full'});return;}
      me.reloadAt=now+spec.reloadMs;me.reloadWeapon=weapon;socket.serializeAttachment(me);sendLoadout(socket,me,{action:'reload',accepted:true});this.broadcast({t:'reload',id:me.clientId,weapon,reloadAt:me.reloadAt},socket);return;
    }

    if (payload.t === "weapon") {
      if(me.hp<=0||now<me.wastedUntil){sendLoadout(socket,me,{action:'weapon',accepted:false,reason:'dead'});return;}
      if(me.traversal||me.ladder){sendLoadout(socket,me,{action:'weapon',accepted:false,reason:'traversing'});return;}
      if(me.combatAction!=='ready'||now<finiteNumber(me.combatReadyAt,0)){sendLoadout(socket,me,{action:'weapon',accepted:false,reason:'equipment',retryAfterMs:Math.max(0,Math.ceil(finiteNumber(me.combatReadyAt,0)-now))});return;}
      const weapon=safeWeapon(payload.weapon);
      if(!playerCanEquip(me,weapon)){sendLoadout(socket,me,{action:'weapon',accepted:false,reason:'loadout'});return;}
      if(weapon!==me.weapon){me.weapon=weapon;me.reloadAt=0;me.reloadWeapon="";me.weaponReadyAt=now+WEAPON_SWITCH_LOCK_MS;socket.serializeAttachment(me);this.broadcast({t:'weapon',id:me.clientId,weapon},socket);}
      sendLoadout(socket,me,{action:'weapon',accepted:true,retryAfterMs:Math.max(0,Math.ceil(finiteNumber(me.weaponReadyAt,0)-now))});return;
    }

    if(payload.t==='loadout'){
      const rev=Math.max(0,Math.floor(finiteNumber(payload.rev,0))),base=normalizeLoadout(me),classes=normalizeLoadoutClasses(payload.loadoutClasses??me.loadoutClasses,base),classId=normalizeLoadoutClassId(payload.classId??me.activeClassId),classLoadout=loadoutClassById(classes,classId,base),next=normalizeLoadout(payload,classLoadout);
      const classIndex=classes.findIndex(item=>item.id===classId);if(classIndex>=0)classes[classIndex]={...classes[classIndex],...next,id:classId,name:normalizeLoadoutClassName(classes[classIndex].name,classIndex)};me.loadoutClasses=classes;
      if(payload.classesOnly===true){socket.serializeAttachment(me);sendLoadout(socket,me,{action:'loadout',accepted:true,pending:!!me.pendingLoadout,rev});return;}
      if(matchAllowsLobbyEdits(meta.match)||me.godMode){
        me.activeClassId=classId;me.pendingClassId='';me.primaryWeapon=next.primaryWeapon;me.secondaryWeapon=next.secondaryWeapon;me.primaryAttachments=next.primaryAttachments;me.secondaryAttachments=next.secondaryAttachments;me.tactical=next.tactical;me.lethal=next.lethal;me.pendingLoadout=null;me.weapon=next.primaryWeapon;me.ammo=freshAmmo(me);me.equipment=freshEquipment(next.tactical,next.lethal);me.reloadAt=0;me.reloadWeapon='';me.weaponReadyAt=0;me.combatAction='ready';me.combatActionKind='';me.combatReadyAt=0;
        if(me.godMode)refreshUnlimitedResources(me);socket.serializeAttachment(me);sendLoadout(socket,me,{action:'loadout',accepted:true,pending:false,rev});this.broadcast({t:'lobbyPlayer',player:publicPlayer(me),rev});return;
      }
      me.pendingClassId=classId;me.pendingLoadout=next;socket.serializeAttachment(me);sendLoadout(socket,me,{action:'loadout',accepted:true,pending:true,pendingLoadout:next,rev});return;
    }

    if(payload.t==='startMatch'){
      if(!isRoomAdmin(meta,me.clientId)){sendJson(socket,{t:'notice',tone:'error',text:'ADMIN REQUIRED'});return;}
      if(!matchAllowsLobbyEdits(meta.match)){sendJson(socket,{t:'notice',tone:'error',text:'MATCH ALREADY STARTED'});return;}
      const setup=payload.setup&&typeof payload.setup==='object'?payload.setup:null;
      if(!setup||!setup.rules||!setup.bots||!setup.minimap||!setup.settings){sendJson(socket,{t:'notice',tone:'error',text:'MATCH SETUP INCOMPLETE'});return;}
      const mode=normalizeGameMode(setup.mode),rules=normalizeMatchRules({mode,scoreLimit:setup.rules.scoreLimit,timeLimitMs:setup.rules.timeLimitMs,minimapRevealAll:!!setup.minimap.revealAll,minimapDirectional:!!setup.minimap.directional});
      const blueBots=clamp(Math.floor(finiteNumber(setup.bots.blueBots,0)),0,MAX_BOTS),redBots=clamp(Math.floor(finiteNumber(setup.bots.redBots,0)),0,MAX_BOTS);
      if(blueBots+redBots>MAX_BOTS){sendJson(socket,{t:'notice',tone:'error',text:`Maximum ${MAX_BOTS} bots per match.`});return;}
      meta.mapId=normalizeMapId(setup.mapId);this.world=worldBundle(meta.mapId);meta.settings=normalizeWorldSettings(setup.settings);meta.blueBots=blueBots;meta.redBots=redBots;meta.botDifficulty=safeBotDifficulty(setup.bots.difficulty);meta.match=defaultMatchState(now,rules);
      if(setup.loadout&&typeof setup.loadout==='object'){const base=normalizeLoadout(me),classes=normalizeLoadoutClasses(setup.loadoutClasses??me.loadoutClasses,base),classId=normalizeLoadoutClassId(setup.classId??me.activeClassId),next=normalizeLoadout(setup.loadout,loadoutClassById(classes,classId,base)),idx=classes.findIndex(item=>item.id===classId);if(idx>=0)classes[idx]={...classes[idx],...next};me.loadoutClasses=classes;me.pendingClassId=classId;me.pendingLoadout=next;socket.serializeAttachment(me);}
      this.prepareRound(meta,now);await this.putMeta(meta);await this.ctx.storage.put('bots',this.bots);await this.updateDirectory(this.liveSockets().length,meta);return;
    }

    if(payload.t==='returnLobby'){
      // Returning the room to its lobby is a match-wide action. Only an admin
      // may end everybody's current match; guests leave their own session from
      // the client instead of being able to interrupt the room for all players.
      if(!isRoomAdmin(meta,me.clientId)){sendJson(socket,{t:'notice',tone:'error',text:'ADMIN REQUIRED'});return;}
      if(matchAllowsLobbyEdits(meta.match)){sendJson(socket,{t:'notice',text:'ALREADY IN LOBBY'});return;}
      this.returnMatchToLobby(meta,now);await this.putMeta(meta);await this.ctx.storage.put('bots',this.bots);return;
    }

    if (payload.t === "god") {
      if (!isRoomAdmin(meta, me.clientId)) {
        sendJson(socket,{t:"notice",tone:"error",text:"ADMIN REQUIRED"});
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
      if(!spec.teamBased){me.pendingTeam='';socket.serializeAttachment(me);sendLoadout(socket,me,{action:'team',accepted:false,reason:'free_for_all',pendingTeam:''});sendJson(socket,{t:'notice',text:'TEAMS DISABLED IN FFA'});return;}
      if(matchAllowsLobbyEdits(meta.match)){
        if(nextTeam!==currentTeam){const sameTeam=this.liveSockets(socket).filter(s=>safeTeam((s.deserializeAttachment()||{}).team)===nextTeam).length;const moved=spawnedPlayerState(me,spawnForTeam(this.world,nextTeam,sameTeam),nextTeam,now,{resetStats:false});moved.kills=me.kills;moved.deaths=me.deaths;me=moved;socket.serializeAttachment(me);}
        me.pendingTeam='';socket.serializeAttachment(me);sendLoadout(socket,me,{action:'team',accepted:true,pendingTeam:''});this.broadcast({t:'lobbyPlayer',player:publicPlayer(me)});await this.updateDirectory(this.liveSockets().length,meta);return;
      }
      // God Mode is an explicit live-edit state: team changes take effect in place
      // instead of killing/respawning or waiting for the next life.
      if(me.godMode){
        me.team=nextTeam;me.pendingTeam='';socket.serializeAttachment(me);
        sendLoadout(socket,me,{action:'team',accepted:true,pendingTeam:''});
        this.broadcast({t:'lobbyPlayer',player:publicPlayer(me)});
        await this.updateDirectory(this.liveSockets().length,meta);return;
      }
      if(nextTeam===currentTeam){me.pendingTeam='';socket.serializeAttachment(me);sendLoadout(socket,me,{action:'team',accepted:true,pendingTeam:''});sendJson(socket,{t:'teamQueued',id:me.clientId,team:currentTeam,pendingTeam:''});return;}
      me.pendingTeam=nextTeam;socket.serializeAttachment(me);sendLoadout(socket,me,{action:'team',accepted:true,pendingTeam:nextTeam});sendJson(socket,{t:'teamQueued',id:me.clientId,team:currentTeam,pendingTeam:nextTeam});return;
    }

    if (payload.t === "adminPlayer") {
      if (!isRoomAdmin(meta, me.clientId)) {
        sendJson(socket,{t:"notice",tone:"error",text:"ADMIN REQUIRED"});
        return;
      }
      const targetId = safeClientId(payload.targetId);
      const targetSocket = this.ctx.getWebSockets().find((s) => {
        const p = s.deserializeAttachment() || {};
        return p.clientId === targetId && !p.replaced;
      });
      if (!targetSocket) {
        sendJson(socket,{t:"notice",tone:"error",text:"PLAYER DISCONNECTED"});
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
          sendJson(socket,{t:"notice",tone:"error",text:"CANNOT CHANGE OWN ROLE"});
          return;
        }
        if (targetId === meta.ownerClientId && !enabled) {
          sendJson(socket,{t:"notice",tone:"error",text:"HOST ROLE LOCKED"});
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
      if (matchAllowsLobbyEdits(meta.match)) {sendJson(socket,{t:'notice',tone:'error',text:'APPLIES ON START'});return;}
      if (!isRoomAdmin(meta, me.clientId)) {
        sendJson(socket,{t:"notice",tone:"error",text:"ADMIN REQUIRED"});
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

    if (payload.t === "adminBots") {
      if (matchAllowsLobbyEdits(meta.match)) {sendJson(socket,{t:'notice',tone:'error',text:'APPLIES ON START'});return;}
      if (!isRoomAdmin(meta, me.clientId)) {
        sendJson(socket,{t:"notice",tone:"error",text:"ADMIN REQUIRED"});
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
      this.bots = reconcileBots(this.world,this.bots, blueBots, redBots, matchMode(meta.match));
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
      const diag=payload.diag===1?{stateAgeMs:Math.max(0,now-finiteNumber(me.lastStateAt,now)),lastStateGapMs:Math.max(0,finiteNumber(me.diagLastStateGapMs,0)),maxStateGapMs:Math.max(0,finiteNumber(me.diagMaxStateGapMs,0)),moveBudgetMs:Math.round(Math.max(0,finiteNumber(me.moveBudgetSec,0))*1000)}:undefined;
      sendJson(socket,{t:"pong",at:now,clientAt:finiteNumber(payload.clientAt,0),net:diag});
      if(diag){me={...me,diagMaxStateGapMs:finiteNumber(me.diagLastStateGapMs,0)};socket.serializeAttachment(me);}
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
      const ax=finiteNumber(actor.x,0),ay=finiteNumber(actor.y,this.world.geometry.terrainHeight(ax,finiteNumber(actor.z,0))),az=finiteNumber(actor.z,0),actorHeight=actor.crouched?CROUCH_HEIGHT:PLAYER_HEIGHT;
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
    if(pose.done){const finished=me.traversal;next.x=finished.endX;next.y=finished.endY;next.z=finished.endZ;next.traversal=null;next.serverGrounded=finished.endGrounded!==false;next.verticalVelocity=next.serverGrounded?0:(Number.isFinite(Number(finished.exitVelocityY))?Number(finished.exitVelocityY):-1.15);if(next.serverGrounded)next.lastGroundedAt=now;next.movementClockAt=now;next.moveBudgetSec=LADDER_BUDGET_INITIAL_SEC;}
    return next;
  }

  advanceLadderState(me, now) {
    if(!me?.ladder)return me;
    const ladder=ladderById(this.world.geometry.LADDERS,me.ladder.id);if(!ladder)return {...me,ladder:null};
    const cp=ladderClimbPoint(ladder,PLAYER_RADIUS);
    return {...me,x:cp.x,z:cp.z,y:clamp(finiteNumber(me.y,ladder.bottomY),ladder.bottomY,ladder.topY-.10),verticalVelocity:0,serverGrounded:false,moveSpeed:0,lastVerticalAt:now};
  }

  validateHumanState(me, payload, now, settings) {
    const desiredX = clamp(finiteNumber(payload.x, me.x), -ARENA_LIMIT, ARENA_LIMIT);
    const desiredZ = clamp(finiteNumber(payload.z, me.z), -ARENA_LIMIT, ARENA_LIMIT);
    // Preserve server-time authority, but also honor the monotonic sample clock
    // of already-sequenced movement snapshots. WebSocket can queue several
    // legitimate 33 ms samples during a network stall and deliver them in a
    // burst. Using arrival time alone makes that burst look like a speed hack.
    // The client clock cannot mint extra long-term movement time: it starts at
    // the server clock, may never move backward, and is capped at the current
    // server time plus the same small lead allowed for combat timestamps.
    const previousMovementClock=finiteNumber(me.movementClockAt,finiteNumber(me.lastStateAt,now));
    const elapsed=clamp((now-previousMovementClock)/1000,0,MAX_STATE_ELAPSED_SEC),movementClockAt=Math.max(previousMovementClock,now);
    const previousClientClock=finiteNumber(me.lastMovementClientAt,previousMovementClock);
    const requestedClientClock=finiteNumber(payload.at,previousClientClock);
    const movementClientAt=clamp(requestedClientClock,previousClientClock,now+MAX_CLIENT_COMBAT_CLOCK_LEAD_MS);
    const clientElapsed=clamp((movementClientAt-previousClientClock)/1000,0,MAX_STATE_ELAPSED_SEC);
    const budgetElapsed=Math.max(elapsed,clientElapsed);
    if(me.traversal){
      const desiredY=finiteNumber(payload.y,me.y),error=Math.hypot(desiredX-me.x,desiredY-me.y,desiredZ-me.z);
      return {corrected:error>.18,verticalCorrected:false,reason:error>.18?'traversal_divergence':'',horizontalError:error,verticalError:0,speedViolation:false,player:{...me,lastStateAt:now,movementClockAt,lastMovementClientAt:movementClientAt,yaw:finiteNumber(payload.yaw,me.yaw),pitch:clamp(finiteNumber(payload.pitch,me.pitch),-1.4,1.4),ads:false,adsAmount:0,moveSpeed:0}};
    }
    if(me.ladder){
      const ladder=ladderById(this.world.geometry.LADDERS,me.ladder.id);
      if(!ladder)return {corrected:true,verticalCorrected:true,reason:'ladder_missing',horizontalError:0,verticalError:0,speedViolation:false,player:{...me,ladder:null,lastStateAt:now,movementClockAt,lastMovementClientAt:movementClientAt}};
      const desiredY=finiteNumber(payload.y,me.y),cp=ladderClimbPoint(ladder,PLAYER_RADIUS);
      const ladderMove=clamp(finiteNumber(payload.ladderMove,0),-1,1),reportedDeltaY=desiredY-me.y,reportedDistance=Math.abs(reportedDeltaY);
      // Ladder movement uses the same monotonic server-time token budget as
      // horizontal movement. The client reports the position it actually
      // simulated at this packet's sample time; the server accepts only the
      // portion reachable at LADDER_CLIMB_SPEED. This keeps local prediction
      // aligned under latency/turns without ever trusting client timestamps to
      // mint climb time or allowing a forged y-position to increase speed.
      let moveBudgetSec=clamp(finiteNumber(me.moveBudgetSec,LADDER_BUDGET_INITIAL_SEC)+budgetElapsed,0,MOVE_BUDGET_MAX_SEC);
      if(Math.abs(ladderMove)<.05&&reportedDistance<.005)moveBudgetSec=Math.min(moveBudgetSec,LADDER_BUDGET_INITIAL_SEC);
      const maxDistance=LADDER_CLIMB_SPEED*moveBudgetSec,acceptedDistance=Math.min(maxDistance,reportedDistance),acceptedDelta=reportedDistance>1e-7?Math.sign(reportedDeltaY)*acceptedDistance:0;
      if(LADDER_CLIMB_SPEED>1e-6)moveBudgetSec=Math.max(0,moveBudgetSec-acceptedDistance/LADDER_CLIMB_SPEED);
      const nextY=clamp(me.y+acceptedDelta,ladder.bottomY,ladder.topY-.10),speedViolation=reportedDistance>maxDistance+.06,horizontalError=Math.hypot(desiredX-cp.x,desiredZ-cp.z);
      return {corrected:speedViolation||horizontalError>.10,verticalCorrected:speedViolation,reason:speedViolation?'ladder_speed':horizontalError>.10?'ladder_horizontal':'',horizontalError,verticalError:Math.abs(nextY-desiredY),speedViolation,player:{...me,x:cp.x,y:nextY,z:cp.z,lastStateAt:now,lastVerticalAt:now,movementClockAt,lastMovementClientAt:movementClientAt,yaw:finiteNumber(payload.yaw,me.yaw),pitch:clamp(finiteNumber(payload.pitch,me.pitch),-1.4,1.4),ads:false,adsAmount:0,crouched:false,moveSpeed:Math.abs(ladderMove)*LADDER_CLIMB_SPEED,verticalVelocity:0,serverGrounded:false,moveBudgetSec}};
    }
    const flashPower = activeFlashPower(me, now);
    const ads = flashPower > 0.12 || me.combatAction!=='ready' ? false : !!payload.ads;
    const adsAmount = ads ? clamp(finiteNumber(payload.adsAmount, 1), 0, 1) : 0;
    let crouched = !!payload.crouched;
    if (!crouched && me.crouched && this.world.worldCollision.worldHeightExpansionBlockedAt(me.x, me.z, me.y, CROUCH_HEIGHT, PLAYER_HEIGHT, PLAYER_RADIUS)) crouched = true;

    let inputX = clamp(finiteNumber(payload.moveX, 0), -1, 1);
    let inputZ = clamp(finiteNumber(payload.moveZ, 0), -1, 1);
    const rawInputLength = Math.hypot(inputX, inputZ);
    if (rawInputLength > 1) { inputX /= rawInputLength; inputZ /= rawInputLength; }
    const inputMagnitude = Math.min(1, rawInputLength);
    const nextYaw = finiteNumber(payload.yaw, me.yaw);

    const requestedSprint=me.combatAction==='ready'&&!!payload.sprinting&&!ads&&!crouched&&me.serverGrounded!==false&&inputMagnitude>=SPRINT_MIN_INPUT&&inputZ<=-SPRINT_MIN_FORWARD;
    const requestedSlide=!!payload.sliding&&crouched&&me.serverGrounded!==false;
    const canStartSlide=requestedSlide&&!me.sliding&&inputMagnitude>=SPRINT_MIN_INPUT&&inputZ<=-SPRINT_MIN_FORWARD&&(!!me.sprinting||finiteNumber(me.moveSpeed,0)>=settings.movement.runSpeed*.72);
    let slideUntil=Math.max(0,finiteNumber(me.slideUntil,0));if(canStartSlide)slideUntil=now+SLIDE_SERVER_GRACE_MS;
    const sliding=requestedSlide&&(!!me.sliding||canStartSlide)&&now<=slideUntil;
    const sprinting=!sliding&&requestedSprint;
    if(!sliding)slideUntil=0;
    let sprintFireReadyAt=Math.max(0,finiteNumber(me.sprintFireReadyAt,0));if(me.sprinting&&!sprinting&&!sliding){const sprintOutMs=Math.max(0,finiteNumber(resolveWeaponSpec(safeWeapon(me.weapon),attachmentsForPlayerWeapon(me,me.weapon))?.sprintOutMs,0));sprintFireReadyAt=Math.max(sprintFireReadyAt,now+sprintOutMs);}

    const playerHeight = crouched ? CROUCH_HEIGHT : PLAYER_HEIGHT;
    const movementWeaponSpec=resolveWeaponSpec(safeWeapon(me.weapon),attachmentsForPlayerWeapon(me,me.weapon)),adsMoveSpeedScale=clamp(finiteNumber(movementWeaponSpec.adsMoveSpeedScale,1),.5,1),adsWalkSpeed=settings.movement.walkSpeed*adsMoveSpeedScale,adsMoveAmount=adsAmount*adsAmount*(3-2*adsAmount);
    const baseSpeed = settings.movement.runSpeed + (adsWalkSpeed-settings.movement.runSpeed)*adsMoveAmount;
    const currentAllowedSpeed = sliding ? settings.movement.runSpeed*SLIDE_START_SPEED_MULTIPLIER : baseSpeed * (sprinting?SPRINT_SPEED_MULTIPLIER:1) * (crouched ? CROUCH_SPEED_MULTIPLIER : 1);
    const previousAdsAmount = me.ads ? clamp(finiteNumber(me.adsAmount,1),0,1) : 0,previousAdsMoveAmount=previousAdsAmount*previousAdsAmount*(3-2*previousAdsAmount);
    const previousBaseSpeed = settings.movement.runSpeed + (adsWalkSpeed-settings.movement.runSpeed)*previousAdsMoveAmount;
    const previousAllowedSpeed = me.sliding ? settings.movement.runSpeed*SLIDE_START_SPEED_MULTIPLIER : previousBaseSpeed * (me.sprinting?SPRINT_SPEED_MULTIPLIER:1) * (me.crouched ? CROUCH_SPEED_MULTIPLIER : 1);
    // A packet that changes stance/movement mode also contains movement from
    // the previous state. Validate that interval against the faster legitimate
    // state so sprint/slide transitions do not cause correction snaps.
    const allowedSpeed = Math.max(currentAllowedSpeed, previousAllowedSpeed);

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
    let moveBudgetSec = clamp(finiteNumber(me.moveBudgetSec, MOVE_BUDGET_INITIAL_SEC) + budgetElapsed, 0, MOVE_BUDGET_MAX_SEC);
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

    const startSupport = this.world.geometry.worldSupportHeight(me.x, me.z, me.y);
    const currentVerticalVelocity = finiteNumber(me.verticalVelocity, 0);
    let serverGrounded = me.serverGrounded !== false && Math.abs(me.y - startSupport) <= 0.28;
    if (!serverGrounded && currentVerticalVelocity <= 0 && Math.abs(me.y - startSupport) <= 0.08) serverGrounded = true;
    let lastGroundedAt=Math.max(0,finiteNumber(me.lastGroundedAt,serverGrounded?now:0));if(serverGrounded)lastGroundedAt=now;
    const solidActors = this.solidActors(me.clientId, now);
    const horizontal = sweepHorizontalMovement({
      x:me.x,y:me.y,z:me.z,dx,dz,grounded:serverGrounded,arenaLimit:ARENA_LIMIT,followDrop:GROUND_FOLLOW_DROP,
      supportHeight:(x,z,y)=>this.world.geometry.worldSupportHeight(x,z,y,crouched),
      stepUpHeight:(x,z,y,maxStep)=>this.world.geometry.worldStepUpHeight(x,z,y,maxStep,PLAYER_RADIUS),maxStepHeight:MAX_STEP_HEIGHT,
      blockedAt:(x,z,y,fromX,fromZ,fromY)=>this.world.worldCollision.worldMoveBlockedAt(x,z,y,fromX,fromZ,playerHeight,PLAYER_RADIUS,fromY)||this.actorBlocksAt(x,z,y,fromX,fromZ,solidActors,playerHeight),
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
        const step=Math.min(1/60,verticalRemaining),verticalStep=advanceVerticalMotion(y,verticalVelocity,gravity,step),ceiling=this.world.geometry.resolveCeilingCollision(y,verticalStep.y,x,z,playerHeight);
        y=ceiling.y;ceilingHit=ceilingHit||ceiling.hit;verticalVelocity=ceiling.hit&&verticalStep.velocity>0?0:verticalStep.velocity;verticalRemaining-=step;
        const support=this.world.geometry.worldSupportHeight(x,z,y);if(y<=support+.025&&verticalVelocity<=0){y=support;verticalVelocity=0;serverGrounded=true;lastGroundedAt=now;break;}
      }
      if(!serverGrounded){
        const ground=this.world.geometry.worldSupportHeight(x,z,y),clientGrounded=payload.grounded===true,closeEnoughToLand=clientGrounded&&verticalVelocity<=0&&rawRequestedY<=ground+.14&&y-ground<=GROUND_FOLLOW_DROP;
        if(closeEnoughToLand){y=ground;verticalVelocity=0;serverGrounded=true;lastGroundedAt=now;}
      }
    }

    const verticalError = Math.abs(y - rawRequestedY);
    const verticalCorrected = ceilingHit || verticalError > 0.28;
    const horizontalError = Math.hypot(x - desiredX, z - desiredZ);
    // Do not emit a correction merely because an internal sweep touched a wall.
    // If the client independently stopped at the same surface there is nothing
    // to reconcile. Only real position divergence is sent back.
    const corrected = verticalCorrected || horizontalError > 0.10 || (speedViolation && horizontalError > 0.10);
    const actualTravel = Math.hypot(x - me.x, z - me.z);
    const sampleElapsed=Math.max(elapsed,clientElapsed);

    return {
      corrected,
      verticalCorrected,
      reason:verticalCorrected?(ceilingHit?'ceiling':'vertical'):horizontalError>.10?(speedViolation?'speed_horizontal':'horizontal'):'',
      horizontalError,
      verticalError,
      speedViolation,
      player: {
        ...me,
        x,
        y,
        z,
        ads,
        adsAmount,
        crouched,
        sprinting,
        sliding,
        slideUntil,
        sprintFireReadyAt,
        moveSpeed: sampleElapsed > 1e-4 ? actualTravel / sampleElapsed : 0,
        velocityX: sampleElapsed > 1e-4 ? (x-me.x)/sampleElapsed : 0,
        velocityZ: sampleElapsed > 1e-4 ? (z-me.z)/sampleElapsed : 0,
        moveBudgetSec,
        serverGrounded,
        lastGroundedAt,
        verticalVelocity,
        knockVelocityX,
        knockVelocityZ,
        lastVerticalAt: now,
        lastJumpSeq: Math.max(previousJumpSeq, incomingJumpSeq),
        lastStateAt: now,
        movementClockAt,
        lastMovementClientAt: movementClientAt,
        yaw: nextYaw,
        pitch: clamp(finiteNumber(payload.pitch, me.pitch), -1.4, 1.4),
      },
    };
  }

  advanceReloadState(me, now, settings) {
    if (!me?.reloadAt || now < me.reloadAt) return '';
    const weapon=safeWeapon(me.reloadWeapon||me.weapon);
    if (weapon === 'shotgun') {
      const rules=effectiveWeaponRules(settings,me,'shotgun'),mag=rules.spec.mag;me.ammo.shotgun=Math.min(mag,me.ammo.shotgun+1);
      const continues=me.ammo.shotgun<mag;
      me.reloadAt=continues?now+rules.reloadMs:0;
      me.reloadWeapon=continues?'shotgun':'';
      return 'reloadShell';
    }
    me.ammo[weapon]=resolveWeaponSpec(weapon,attachmentsForPlayerWeapon(me,weapon)).mag;me.reloadAt=0;me.reloadWeapon='';
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

  spawnBullet({ ownerId, ownerTeam, damage, weapon, attachments={}, hand='', lifetimeMs, x, y, z, vx, vy, vz, now, shotAt=now, targetRewindMs=0, consumeAmmo=true, primaryShot=consumeAmmo }) {
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const safe = safeWeapon(weapon),bornAt=Math.min(now,sanitizeCombatTimestamp(shotAt,now));
    const normalizedAttachments=normalizeWeaponAttachments(safe,attachments),weaponSpec=resolveWeaponSpec(safe,normalizedAttachments),bullet = {
      id, ownerId, ownerTeam: safeTeam(ownerTeam), damage, weapon: safe, attachments:normalizedAttachments, suppressed:normalizedAttachments.muzzle==='suppressor', hand:hand==='left'?'left':hand==='right'?'right':'',
      penetrationEnergy:1,targetRewindMs:clamp(finiteNumber(targetRewindMs,0),0,MAX_TARGET_REWIND_MS),
      gravity:Math.max(0,finiteNumber(weaponSpec.projectileGravity,0)),projectileRadius:Math.max(0,finiteNumber(weaponSpec.projectileRadius,0)),explosionRadius:Math.max(0,finiteNumber(weaponSpec.explosionRadius,0)),explosionDamage:Math.max(0,finiteNumber(weaponSpec.explosionDamage,0)),
      hitTargets: new Set(),traveledDistance: 0,
      lifetimeMs: lifetimeMs || weaponSpec.lifetimeMs, x, y, z, vx, vy, vz, born: bornAt, lastAt: bornAt, lastBroadcast: now,
      rpgBaseSpeed:safe==='rpg'?Math.max(1,Math.hypot(vx,vy,vz)):0,rpgBaseYaw:safe==='rpg'?Math.atan2(-vx,-vz):0,rpgBasePitch:safe==='rpg'?Math.asin(clamp(vy/Math.max(1,Math.hypot(vx,vy,vz)),-1,1)):0,rpgWanderPhase:safe==='rpg'?Math.random()*Math.PI*2:0,
    };
    this.bullets.set(id, bullet);
    if(primaryShot&&!bullet.suppressed)this.noteGunfire({x,y,z,team:bullet.ownerTeam,id:ownerId,weapon:safe},now);
    this.broadcast({ t: "shot", id, ownerId, ownerTeam: bullet.ownerTeam, damage, weapon: safe, hand:bullet.hand, suppressed:bullet.suppressed, lifetimeMs: bullet.lifetimeMs, gravity:bullet.gravity, x, y, z, vx, vy, vz, consumeAmmo, primaryShot:!!primaryShot, at: bornAt });
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
      if (this.bots.length) this.broadcast({ t: "botState", at:now, bots: this.bots.map(publicBot) });
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
      const spawn=this.selectSpawn(mode,team,actors,Math.floor(Math.random()*this.world.spawns.spawnPointCount(mode,team)),player.clientId,now);
      const respawned=spawnedPlayerState(player,spawn,team,now);
      socket.serializeAttachment(respawned);this.recordCombatPose(respawned,now);
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
    const difficulty=safeBotDifficulty(meta?.botDifficulty),profile=BOT_DIFFICULTIES[difficulty],mode=matchMode(meta.match),flowNodes=Array.isArray(this.world.geometry.COMBAT_FLOW_NODES)?this.world.geometry.COMBAT_FLOW_NODES:[];
    const eyeY=(actor)=>finiteNumber(actor?.y,this.world.geometry.terrainHeight(actor?.x||0,actor?.z||0))+(actor?.crouched?CROUCH_HEIGHT*.67:1.05);
    const botEyeY=(bot)=>bot.y+1.28;
    const startReload=(bot,weapon,weaponSettings)=>{if(bot.reloadAt)return;bot.reloadAt=now+weaponSettings.reloadMs;bot.reloadWeapon=weapon;bot.ads=false;bot.sprinting=false;};

    for (let i = 0; i < this.bots.length; i += 1) {
      const bot = this.bots[i];
      bot.velocityX=0;bot.velocityZ=0;bot.moveSpeed=0;bot.sprinting=false;
      if (bot.hp <= 0) {
        if (now >= bot.wastedUntil) {
          const actors=[...humans.map(({target})=>target),...this.bots],spawn=this.selectSpawn(mode,bot.team,actors,i+Math.floor(Math.random()*this.world.spawns.spawnPointCount(mode,bot.team)),bot.id,now),primary=safeBotWeapon(bot.primaryWeapon||bot.weapon),tactical=safeTactical(bot.tactical),lethal=safeLethal(bot.lethal);
          Object.assign(bot,spawn,{hp:100,wastedUntil:0,regenAt:0,velocityX:0,velocityZ:0,moveSpeed:0,sprinting:false,ads:false,weapon:primary,primaryWeapon:primary,ammo:freshAmmo(),equipment:freshEquipment(tactical,lethal),tactical,lethal,reloadAt:0,reloadWeapon:'',flashUntil:0,flashSpin:0,traversal:null,ladder:null,targetId:'',targetLockUntil:0,reactionReadyAt:0,aimYaw:finiteNumber(spawn.yaw,0),aimPitch:0,aimNoiseYaw:0,aimNoisePitch:0,aimNoiseUntil:0,burstShotsLeft:0,burstPauseUntil:0,fireHeat:0,fireHeatAt:0,combatRecoverUntil:0,nextEquipmentAt:now+botEquipmentDelay(profile),navX:spawn.x,navZ:spawn.z,navUntil:0,navNodeIndex:-1,lastMovedAt:now,lastSeenTargetId:'',lastSeenAt:0,lastKnownX:spawn.x,lastKnownZ:spawn.z,patrolX:spawn.x,patrolZ:spawn.z,patrolUntil:0,patrolNodeIndex:-1});
          this.broadcast({t:'respawn',player:publicBot(bot)});
        }
        continue;
      }
      if(!finiteNumber(bot.nextEquipmentAt,0))bot.nextEquipmentAt=now+botEquipmentDelay(profile);
      if(!Number.isFinite(Number(bot.aimYaw)))bot.aimYaw=finiteNumber(bot.yaw,0);
      if(!Number.isFinite(Number(bot.aimPitch)))bot.aimPitch=0;

      if(bot.traversal){
        bot.ads=false;bot.sprinting=false;
        const pose=traversalPose(bot.traversal,now);
        if(pose){bot.x=pose.x;bot.y=pose.y;bot.z=pose.z;if(pose.done){bot.x=bot.traversal.endX;bot.y=bot.traversal.endY;bot.z=bot.traversal.endZ;bot.traversal=null;bot.lastMovedAt=now;}else continue;}
        else bot.traversal=null;
      }

      if(bot.ladder){
        bot.ads=false;bot.sprinting=false;
        const ladder=ladderById(this.world.geometry.LADDERS,bot.ladder.id);
        if(!ladder)bot.ladder=null;
        else{
          const cp=ladderClimbPoint(ladder,.34),dir=Number(bot.ladder.climbDir)||1;bot.x=cp.x;bot.z=cp.z;bot.y=ladderClimbStep(ladder,bot.y,dir,dt);bot.moveSpeed=LADDER_CLIMB_SPEED;
          if(dir>0&&bot.y>=ladder.topY-.105){const target=ladderTopExitPoint(ladder,.34),seq=++bot.ladderSeq;bot.x=target.x;bot.y=target.y;bot.z=target.z;bot.ladder=null;bot.moveSpeed=0;bot.lastMovedAt=now;this.broadcast({t:'ladder',id:bot.id,seq,accepted:true,action:'dismount',end:'top',x:bot.x,y:bot.y,z:bot.z,ladder:null});}
          else if(dir<0&&bot.y<=ladder.bottomY+.005){const target=ladderBottomExitPoint(ladder,.34),seq=++bot.ladderSeq;bot.x=target.x;bot.y=target.y;bot.z=target.z;bot.ladder=null;bot.moveSpeed=0;bot.lastMovedAt=now;this.broadcast({t:'ladder',id:bot.id,seq,accepted:true,action:'dismount',end:'bottom',x:bot.x,y:bot.y,z:bot.z,ladder:null});}
          if(bot.ladder)continue;
        }
      }

      const botWeapon=safeBotWeapon(bot.primaryWeapon||bot.weapon);bot.primaryWeapon=botWeapon;bot.weapon=botWeapon;
      const weaponSettings=settings.weapons[botWeapon],resolvedWeapon=WEAPON_SPECS[botWeapon]||WEAPON_SPECS.assault;
      if(bot.reloadAt&&now>=bot.reloadAt){if(botWeapon==='shotgun'){bot.ammo.shotgun=Math.min(resolvedWeapon.mag,(bot.ammo.shotgun||0)+1);if(bot.ammo.shotgun<resolvedWeapon.mag){bot.reloadAt=now+weaponSettings.reloadMs;bot.reloadWeapon='shotgun';}else{bot.reloadAt=0;bot.reloadWeapon='';}}else{bot.ammo[botWeapon]=resolvedWeapon.mag;bot.reloadAt=0;bot.reloadWeapon='';}}
      if(now<finiteNumber(bot.flashUntil,0)){
        bot.ads=false;bot.yaw=normalizeAngle(bot.yaw+dt*(bot.flashSpin||2.2));bot.aimYaw=bot.yaw;
        const step=settings.movement.walkSpeed*.22*dt,dx=Math.sin(bot.yaw)*step,dz=Math.cos(bot.yaw)*step;
        if(!this.world.worldCollision.worldBlockedAt(bot.x+dx,bot.z+dz,bot.y,PLAYER_HEIGHT,.34)){bot.x+=dx;bot.z+=dz;bot.y=this.world.geometry.worldSupportHeight(bot.x,bot.z,bot.y);bot.lastMovedAt=now;}
        continue;
      }

      const solidActors=this.solidActors(bot.id,now);
      const tryTraverse=(ax,az)=>{
        const len=Math.hypot(ax,az);if(len<.2||bot.traversal||bot.ladder)return false;
        const dirX=ax/len,dirZ=az/len,ladderEntry=findLadderEntry({ladders:this.world.geometry.LADDERS,x:bot.x,y:bot.y,z:bot.z,dirX,dirZ,radius:.34,grounded:true});
        if(ladderEntry&&!this.actorBlocksAt(ladderEntry.attachX,ladderEntry.attachZ,ladderEntry.attachY,bot.x,bot.z,solidActors,PLAYER_HEIGHT)){
          const seq=++bot.ladderSeq;bot.x=ladderEntry.attachX;bot.y=ladderEntry.attachY;bot.z=ladderEntry.attachZ;bot.ladder={id:String(ladderEntry.ladderId),seq,phase:'climb',entry:ladderEntry.entry==='top'?'top':'bottom',climbDir:ladderEntry.entry==='top'?-1:1};bot.ads=false;bot.sprinting=false;this.broadcast({t:'ladder',id:bot.id,seq,accepted:true,action:'attach',x:bot.x,y:bot.y,z:bot.z,ladder:publicLadderState(bot.ladder)});return true;
        }
        const candidate=this.world.worldCollision.findTraversalCandidate({x:bot.x,y:bot.y,z:bot.z,dirX,dirZ,height:PLAYER_HEIGHT,radius:PLAYER_RADIUS,airborne:false});
        if(!candidate||candidate.endGrounded===false||this.actorBlocksAt(candidate.endX,candidate.endZ,candidate.endY,bot.x,bot.z,solidActors,PLAYER_HEIGHT))return false;
        const plan=createTraversalPlan(candidate,bot.x,bot.y,bot.z,now,++bot.traverseSeq);if(!plan)return false;
        bot.traversal=plan;bot.ads=false;bot.sprinting=false;this.broadcast({t:'traverse',id:bot.id,accepted:true,...plan});return true;
      };
      const tryMove=(ax,az,step)=>{
        const fromX=bot.x,fromZ=bot.z;
        const out=sweepHorizontalMovement({x:bot.x,y:bot.y,z:bot.z,dx:ax*step,dz:az*step,grounded:true,arenaLimit:ARENA_LIMIT,followDrop:GROUND_FOLLOW_DROP,supportHeight:(x,z,y)=>this.world.geometry.worldSupportHeight(x,z,y,false,.34),stepUpHeight:(x,z,y,maxStep)=>this.world.geometry.worldStepUpHeight(x,z,y,maxStep,.34),maxStepHeight:MAX_STEP_HEIGHT,blockedAt:(x,z,y,fx,fz,fromY)=>this.world.worldCollision.worldMoveBlockedAt(x,z,y,fx,fz,PLAYER_HEIGHT,.34,fromY)||this.actorBlocksAt(x,z,y,fx,fz,solidActors,PLAYER_HEIGHT)});
        if(!out.grounded){bot.velocityX=0;bot.velocityZ=0;bot.moveSpeed=0;return false;}
        const moved=Math.hypot(out.x-fromX,out.z-fromZ)>.005;bot.x=out.x;bot.y=out.y;bot.z=out.z;
        if(dt>1e-6){bot.velocityX=(out.x-fromX)/dt;bot.velocityZ=(out.z-fromZ)/dt;bot.moveSpeed=Math.hypot(bot.velocityX,bot.velocityZ);}else{bot.velocityX=0;bot.velocityZ=0;bot.moveSpeed=0;}
        if(moved)bot.lastMovedAt=now;return moved;
      };
      const chooseRouteNode=(goalX,goalZ)=>{
        let best=null;
        for(let nodeIndex=0;nodeIndex<flowNodes.length;nodeIndex++){
          if(nodeIndex===bot.navNodeIndex)continue;
          const node=flowNodes[nodeIndex],px=finiteNumber(node?.x,0),pz=finiteNumber(node?.z,0),py=this.world.geometry.worldSupportHeight(px,pz,bot.y),fromDist=Math.hypot(px-bot.x,pz-bot.z),goalDist=Math.hypot(goalX-px,goalZ-pz);
          if(fromDist<3||fromDist>58||this.world.worldCollision.worldBlockedAt(px,pz,py,PLAYER_HEIGHT,.34))continue;
          if(!this.world.serverCollision.actorHasLineOfSight({x:bot.x,y:bot.y,z:bot.z},{x:px,y:py,z:pz}))continue;
          const directGoal=Math.hypot(goalX-bot.x,goalZ-bot.z),progress=Math.max(-8,directGoal-goalDist),score=fromDist*.34+goalDist-progress*1.25+Math.random()*2.5;
          if(!best||score<best.score)best={score,nodeIndex,x:px,z:pz};
        }
        return best;
      };
      const moveToward=(goalX,goalZ,speed,stopDistance=.65)=>{
        let targetX=goalX,targetZ=goalZ,usingNav=false;
        if(now<finiteNumber(bot.navUntil,0)&&Math.hypot(bot.navX-bot.x,bot.navZ-bot.z)>.9){targetX=bot.navX;targetZ=bot.navZ;usingNav=true;}else if(bot.navUntil){bot.navUntil=0;bot.navNodeIndex=-1;}
        let dx=targetX-bot.x,dz=targetZ-bot.z,d=Math.hypot(dx,dz);if(d<=stopDistance)return true;
        const effectiveSpeed=bot.ads?speed*Math.max(.5,Math.min(1.25,finiteNumber(resolvedWeapon.adsMoveSpeedScale,1))):speed,ux=dx/d,uz=dz/d,step=Math.min(Math.max(0,d-stopDistance),effectiveSpeed*dt);bot.moveFacingYaw=Math.atan2(-dx,-dz);bot.sprinting=effectiveSpeed>settings.movement.walkSpeed*1.08&&!bot.ads;
        if(tryMove(ux,uz,step)||tryTraverse(ux,uz))return true;
        const side=bot.strafeDir||1,sx=-uz*side,sz=ux*side;if(tryMove(sx,sz,step*.76))return true;if(tryMove(-sx,-sz,step*.76)){bot.strafeDir=-side;return true;}
        if(usingNav){bot.navUntil=0;bot.navNodeIndex=-1;}
        const route=chooseRouteNode(goalX,goalZ);if(route){bot.navX=route.x;bot.navZ=route.z;bot.navUntil=now+2300;bot.navNodeIndex=route.nodeIndex;dx=route.x-bot.x;dz=route.z-bot.z;d=Math.hypot(dx,dz);if(d>.2){const rx=dx/d,rz=dz/d;bot.moveFacingYaw=Math.atan2(-dx,-dz);if(tryMove(rx,rz,Math.min(d,effectiveSpeed*dt))||tryTraverse(rx,rz))return true;}}
        return false;
      };

      const targetCandidates=[];
      const consider=(kind,target,socket=null)=>{
        if(!target||target.hp<=0||combatantsAreFriendly(mode,bot.id,bot.team,target.id||target.clientId,target.team)||target.id===bot.id||target.clientId===bot.id)return;
        const tx=finiteNumber(target.x,0),tz=finiteNumber(target.z,0),dx=tx-bot.x,dz=tz-bot.z,d2=dx*dx+dz*dz,id=String(target.clientId||target.id||'');targetCandidates.push({kind,target,socket,id,dx,dz,d2,botX:bot.x,botZ:bot.z,visible:this.actorLineOfSight(bot,target,now)});
      };
      for(const h of humans)consider('human',h.target,h.socket);
      for(const other of this.bots){if(other===bot||other.hp<=0||now<(other.wastedUntil||0))continue;consider('bot',other,null);}
      const nearest=chooseVisibleBotTarget(targetCandidates,bot.targetId,bot.targetLockUntil,now);

      if(!nearest){
        bot.ads=false;
        const memoryActive=bot.lastSeenAt&&now-bot.lastSeenAt<=BOT_TARGET_MEMORY_MS;
        if(!memoryActive){bot.targetId='';bot.reactionReadyAt=0;bot.burstShotsLeft=0;if((bot.ammo[botWeapon]||0)<resolvedWeapon.mag*.42&&!bot.reloadAt)startReload(bot,botWeapon,weaponSettings);}
        if(!memoryActive&&(now>=finiteNumber(bot.patrolUntil,0)||Math.hypot(bot.patrolX-bot.x,bot.patrolZ-bot.z)<1.2)){
          let picked=false,bestNode=null;
          for(let nodeIndex=0;nodeIndex<flowNodes.length;nodeIndex++){
            if(nodeIndex===bot.patrolNodeIndex)continue;
            const node=flowNodes[nodeIndex],px=node.x,pz=node.z,py=this.world.geometry.worldSupportHeight(px,pz,bot.y),distance=Math.hypot(px-bot.x,pz-bot.z);
            if(distance<11||distance>62||this.world.worldCollision.worldBlockedAt(px,pz,py,PLAYER_HEIGHT,.34))continue;
            if(!this.world.serverCollision.actorHasLineOfSight(bot,{x:px,y:py,z:pz}))continue;
            const score=Math.abs(distance-34)+Math.random()*5;if(!bestNode||score<bestNode.score)bestNode={score,nodeIndex,px,pz};
          }
          if(bestNode){bot.patrolX=bestNode.px;bot.patrolZ=bestNode.pz;bot.patrolNodeIndex=bestNode.nodeIndex;picked=true;}
          for(let attempt=0;attempt<8&&!picked;attempt++){
            const angle=Math.random()*Math.PI*2,distance=12+Math.random()*26,px=clamp(bot.x+Math.cos(angle)*distance,-ARENA_LIMIT+2,ARENA_LIMIT-2),pz=clamp(bot.z+Math.sin(angle)*distance,-ARENA_LIMIT+2,ARENA_LIMIT-2),py=this.world.geometry.worldSupportHeight(px,pz,bot.y);
            if(!this.world.worldCollision.worldBlockedAt(px,pz,py,PLAYER_HEIGHT,.34)){bot.patrolX=px;bot.patrolZ=pz;bot.patrolNodeIndex=-1;picked=true;}
          }
          bot.patrolUntil=now+BOT_PATROL_MIN_MS+Math.random()*(BOT_PATROL_MAX_MS-BOT_PATROL_MIN_MS);
        }
        const goalX=memoryActive?finiteNumber(bot.lastKnownX,bot.x):finiteNumber(bot.patrolX,bot.x),goalZ=memoryActive?finiteNumber(bot.lastKnownZ,bot.z):finiteNumber(bot.patrolZ,bot.z),distance=Math.hypot(goalX-bot.x,goalZ-bot.z),speed=(memoryActive?settings.movement.runSpeed*.72:settings.movement.walkSpeed*.68)*profile.moveWalk;
        if(distance>.65)moveToward(goalX,goalZ,speed,.65);else if(memoryActive){bot.lastSeenAt=0;bot.lastSeenTargetId='';bot.targetId='';}
        const desiredBody=Number.isFinite(Number(bot.moveFacingYaw))?bot.moveFacingYaw:bot.yaw;bot.yaw=botApproachAngle(bot.yaw,desiredBody,Math.PI*2.2*dt);bot.aimYaw=botApproachAngle(bot.aimYaw,bot.yaw,Math.PI*1.8*dt);bot.aimPitch=botApproachValue(bot.aimPitch,0,1.7*dt);
        continue;
      }

      const target=nearest.target,targetId=nearest.id,d=Math.sqrt(nearest.d2)||.001,role=botWeaponRole(botWeapon,profile),ux=nearest.dx/d,uz=nearest.dz/d;
      if(targetId!==bot.targetId){bot.targetId=targetId;bot.targetLockUntil=now+700+Math.random()*650;bot.reactionReadyAt=now+botReactionDelay(profile);bot.burstShotsLeft=0;bot.burstPauseUntil=0;bot.aimNoiseUntil=0;}
      bot.lastSeenTargetId=targetId;bot.lastSeenAt=now;bot.lastKnownX=finiteNumber(target.x,bot.x);bot.lastKnownZ=finiteNumber(target.z,bot.z);

      if(d>role.preferred*1.12){const speed=d>16?settings.movement.runSpeed*profile.moveRun:settings.movement.walkSpeed*profile.moveWalk;moveToward(target.x,target.z,speed,role.preferred);}
      else if(role.retreatBelow&&d<role.retreatBelow){moveToward(bot.x-ux*6,bot.z-uz*6,settings.movement.walkSpeed*profile.moveWalk,.5);}
      else if(profile.strafe>0&&d<=role.engage){
        if(!bot.strafeUntil||now>=bot.strafeUntil){bot.strafeDir=Math.random()<.5?-1:1;bot.strafeUntil=now+650+Math.random()*850;}
        const sx=-uz*(bot.strafeDir||1),sz=ux*(bot.strafeDir||1),step=settings.movement.walkSpeed*profile.strafe*dt;bot.moveFacingYaw=Math.atan2(-nearest.dx,-nearest.dz);
        if(!tryMove(sx,sz,step)){bot.strafeDir=-(bot.strafeDir||1);tryMove(-sx,-sz,step);}
      }

      const wantsAds=now>=finiteNumber(bot.reactionReadyAt,0)&&d>=role.adsMin&&d<=role.engage&&!bot.sprinting&&!bot.reloadAt;bot.ads=!!wantsAds;
      if(now>=finiteNumber(bot.aimNoiseUntil,0)){
        const noise=botAimNoiseRadians(profile,bot.ads);bot.aimNoiseYaw=(Math.random()*2-1)*noise;bot.aimNoisePitch=(Math.random()*2-1)*noise*.68;bot.aimNoiseUntil=now+320+Math.random()*360;
      }
      const tx=finiteNumber(target.x,0)-bot.x,ty=eyeY(target)-botEyeY(bot),tz=finiteNumber(target.z,0)-bot.z,dist3=Math.hypot(tx,ty,tz)||1,trueYaw=Math.atan2(-tx,-tz),truePitch=Math.asin(clamp(ty/dist3,-1,1)),desiredYaw=normalizeAngle(trueYaw+finiteNumber(bot.aimNoiseYaw,0)),desiredPitch=clamp(truePitch+finiteNumber(bot.aimNoisePitch,0),-1.2,1.2),turnStep=profile.aimTurnDegPerSec*Math.PI/180*dt;
      if(now>=finiteNumber(bot.reactionReadyAt,0)){bot.aimYaw=botApproachAngle(bot.aimYaw,desiredYaw,turnStep);bot.aimPitch=botApproachValue(bot.aimPitch,desiredPitch,turnStep*.72);}
      const bodyTarget=bot.ads?bot.aimYaw:(Number.isFinite(Number(bot.moveFacingYaw))?bot.moveFacingYaw:bot.aimYaw);bot.yaw=botApproachAngle(bot.yaw,bodyTarget,Math.PI*2.8*dt);

      const liveAllies=mode==='ffa'?[]:[...humans.map(({target})=>target),...this.bots].filter(actor=>actor&&actor!==bot&&actor.hp>0&&safeTeam(actor.team)===safeTeam(bot.team));
      if(now>=finiteNumber(bot.nextEquipmentAt,0)&&now>=finiteNumber(bot.reactionReadyAt,0)&&!bot.reloadAt&&now>=finiteNumber(bot.combatRecoverUntil,0)){
        let kind='';if((bot.equipment?.[bot.lethal]||0)>0&&d>=9&&d<=23)kind=bot.lethal;else if((bot.equipment?.[bot.tactical]||0)>0&&d>=8&&d<=20)kind=bot.tactical;
        if(kind){
          const explosive=kind==='frag'||kind==='sticky',dangerRadius=explosive?8:5,targetX=kind==='smoke'&&bot.hp<55?(bot.x+target.x)*.5:finiteNumber(target.x,bot.x),targetZ=kind==='smoke'&&bot.hp<55?(bot.z+target.z)*.5:finiteNumber(target.z,bot.z),friendlyNear=liveAllies.some(actor=>Math.hypot(finiteNumber(actor.x)-targetX,finiteNumber(actor.z)-targetZ)<dangerRadius);
          if(!friendlyNear){const throwYaw=Math.atan2(-(targetX-bot.x),-(targetZ-bot.z)),throwPitch=clamp((d-12)*.006,-.02,.08),throwVelocity=tacticalThrowVelocity(throwYaw,throwPitch,TACTICAL_THROW_SPEED,TACTICAL_THROW_LOFT),id=`b${String(bot.id).replace(/[^a-z0-9]/gi,'').slice(-8)}${Math.floor(now%1e8).toString(36)}`.slice(0,24),g={id,kind,ownerId:bot.id,ownerTeam:safeTeam(bot.team),radius:equipmentCollisionRadius(kind),x:bot.x+throwVelocity.fx*.82,y:bot.y+PLAYER_HEIGHT-.22,z:bot.z+throwVelocity.fz*.82,vx:throwVelocity.vx,vy:throwVelocity.vy,vz:throwVelocity.vz,born:now,lastAt:now,fuseAt:now+(kind==='sticky'?1850:kind==='frag'?2300:kind==='smoke'?1300:1650),stuck:false,rolling:false,lastBroadcast:now};this.throwables.set(id,g);bot.equipment[kind]=Math.max(0,(bot.equipment[kind]||0)-1);bot.combatRecoverUntil=now+EQUIPMENT_WEAPON_RECOVER_MS;bot.nextEquipmentAt=now+botEquipmentDelay(profile);bot.ads=false;this.broadcast({t:'throwable',...g,at:now});}
          else bot.nextEquipmentAt=now+1200;
        }else bot.nextEquipmentAt=now+1000;
      }

      const aimError=Math.hypot(normalizeAngle(trueYaw-bot.aimYaw),truePitch-bot.aimPitch),tolerance=botAimToleranceRadians(profile,bot.ads),automatic=!!resolvedWeapon.automatic;
      const reloadAllowsFire=!bot.reloadAt||(botWeapon==='shotgun'&&(bot.ammo.shotgun||0)>0);
      if(d<=role.engage&&reloadAllowsFire&&now>=finiteNumber(bot.reactionReadyAt,0)&&now>=finiteNumber(bot.combatRecoverUntil,0)&&aimError<=tolerance&&(botWeapon!=='sniper'||bot.ads)&&now>=finiteNumber(bot.nextShotAt,0)&&now>=finiteNumber(bot.burstPauseUntil,0)){
        if((bot.ammo[botWeapon]||0)<=0){startReload(bot,botWeapon,weaponSettings);continue;}if(botWeapon==='shotgun'&&bot.reloadAt){bot.reloadAt=0;bot.reloadWeapon='';}
        if(automatic&&finiteNumber(bot.burstShotsLeft,0)<=0)bot.burstShotsLeft=botBurstSize(profile,d,botWeapon);
        bot.spawnProtectedUntil=0;bot.nextShotAt=now+Math.max(70,weaponSettings.cooldownMs*profile.fireScale+(automatic?0:Math.random()*55));bot.ammo[botWeapon]-=1;if(bot.ammo[botWeapon]===0)startReload(bot,botWeapon,weaponSettings);
        const elapsedHeat=Math.max(0,now-finiteNumber(bot.fireHeatAt,now)),preShotHeat=weaponHeatAfterDelay(botWeapon,bot.fireHeat,elapsedHeat);bot.fireHeatAt=now;bot.fireHeat=weaponHeatAfterShot(botWeapon,preShotHeat);
        const adsAmount=bot.ads?1:0,weaponSpread=weaponSpreadRadians(botWeapon,bot.moveSpeed,settings.movement.runSpeed,adsAmount,false,false,preShotHeat,false,{}),skillSpread=botAimNoiseRadians(profile,bot.ads)*.18,pellets=Math.max(1,Math.floor(resolvedWeapon.pellets||1)),shotgunPattern=botWeapon==='shotgun'||botWeapon==='semiShotgun',baseYaw=normalizeAngle(bot.aimYaw+(Math.random()-.5)*skillSpread),basePitch=clamp(bot.aimPitch+(Math.random()-.5)*skillSpread*.65,-1.2,1.2),patternRotation=Math.random()*Math.PI*2;
        for(let pellet=0;pellet<pellets;pellet++){
          let shotYaw=baseYaw,shotPitch=basePitch;if(shotgunPattern){const a=shotgunPelletAngles(baseYaw,basePitch,weaponSpread,pellet,pellets,patternRotation);shotYaw=a.yaw;shotPitch=a.pitch;}else if(weaponSpread>0){const a=spreadShotAngles(baseYaw,basePitch,weaponSpread);shotYaw=a.yaw;shotPitch=a.pitch;}
          const v=shotVector(shotYaw,shotPitch),centerScale=pellet===0?Math.max(1,finiteNumber(resolvedWeapon.centerPelletDamageScale,1)):1;
          this.spawnBullet({ownerId:bot.id,ownerTeam:safeTeam(bot.team),damage:weaponSettings.damage*centerScale,weapon:botWeapon,lifetimeMs:resolvedWeapon.lifetimeMs,x:bot.x+v.x*.55,y:bot.y+1.25,z:bot.z+v.z*.55,vx:v.x*weaponSettings.speed,vy:v.y*weaponSettings.speed,vz:v.z*weaponSettings.speed,now,consumeAmmo:pellet===0});
        }
        bot.aimPitch=clamp(bot.aimPitch+finiteNumber(resolvedWeapon.recoilPitch,0)*(.55+Math.random()*.32),-1.2,1.2);bot.aimYaw=normalizeAngle(bot.aimYaw+(Math.random()-.5)*finiteNumber(resolvedWeapon.recoilYaw,0)*1.25);
        if(automatic){bot.burstShotsLeft=Math.max(0,Math.floor(finiteNumber(bot.burstShotsLeft,1))-1);if(bot.burstShotsLeft<=0)bot.burstPauseUntil=now+botBurstPause(profile);}
      }
    }
    for(const bot of this.bots||[])this.recordCombatPose(bot,now);
  }


  smokeBlocksSegment(a,b,now){
    for(const cloud of this.smokeClouds.values()){
      if(now>=cloud.expiresAt)continue;
      const grow=clamp((now-finiteNumber(cloud.bornAt,now))/SMOKE_GROW_MS,0,1),visibleScale=SMOKE_START_SCALE+(1-SMOKE_START_SCALE)*grow,effectiveRadius=cloud.radius*visibleScale*SMOKE_LOS_RADIUS_SCALE;
      const ax=finiteNumber(a.x,0),ay=finiteNumber(a.y,0)+1.05,az=finiteNumber(a.z,0),bx=finiteNumber(b.x,0),by=finiteNumber(b.y,0)+1.05,bz=finiteNumber(b.z,0),vx=bx-ax,vy=by-ay,vz=bz-az,wx=cloud.x-ax,wy=cloud.y-ay,wz=cloud.z-az,len2=vx*vx+vy*vy+vz*vz||1,t=clamp((wx*vx+wy*vy+wz*vz)/len2,0,1),dx=ax+vx*t-cloud.x,dy=ay+vy*t-cloud.y,dz=az+vz*t-cloud.z;if(Math.hypot(dx,dy,dz)<=effectiveRadius)return true;
    }return false;
  }
  actorLineOfSight(a,b,now){return this.world.serverCollision.actorHasLineOfSight(a,b)&&!this.smokeBlocksSegment(a,b,now);}

  stepThrowables(now,settings){
    for(const [id,cloud] of this.smokeClouds)if(now>=cloud.expiresAt)this.smokeClouds.delete(id);
    for(const [id,g] of this.throwables){
      if(g.stuckTo){const a=this.findActorState(g.stuckTo);if(a){g.x=a.x;g.y=a.y+1.0;g.z=a.z;}else g.stuckTo='';}
      if(!g.stuck){
        // Tactical physics stay intentionally lightweight: the server owns the
        // path, collision and fuse, while flashbangs retain believable carry,
        // bounce and ground roll. Stickies remain sticky on first contact.
        const integrationStart=g.lastAt,integrationEnd=Math.min(now,g.fuseAt),elapsed=Math.max(0,(integrationEnd-integrationStart)/1000);g.lastAt=integrationEnd;const steps=Math.max(1,Math.ceil(elapsed/.012)),st=elapsed/steps;
        for(let i=0;i<steps&&!g.stuck;i++){
          const stepAt=integrationStart+(i+1)*st*1000,px=g.x,py=g.y,pz=g.z;
          if(g.kind!=='sticky'&&g.rolling){
            const nx=px+g.vx*st,nz=pz+g.vz*st,ny=this.world.geometry.terrainHeight(nx,nz)+Math.max(.08,g.radius||.10);
            const actorHit=this.findThrowableActorHit(g,px,py,pz,nx,ny,nz,stepAt),worldT=this.world.serverCollision.segmentFirstWorldHitT(px,py,pz,nx,ny,nz,g.radius);
            if(actorHit&&(worldT==null||actorHit.t<worldT-.0001)){this.resolveThrowableActorHit(g,actorHit,px,py,pz,nx,ny,nz,stepAt);continue;}
            const hitObj=this.world.serverCollision.segmentHitsObstacle(px,py,pz,nx,ny,nz,g.radius);
            if(hitObj){
              const hitX=this.world.serverCollision.segmentHitsObstacle(px,py,pz,nx,py,pz,g.radius),hitZ=this.world.serverCollision.segmentHitsObstacle(px,py,pz,px,py,nz,g.radius),ambiguous=!hitX&&!hitZ;
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
          const actorHit=this.findThrowableActorHit(g,px,py,pz,nx,ny,nz,stepAt),worldT=this.world.serverCollision.segmentFirstWorldHitT(px,py,pz,nx,ny,nz,g.radius);
          if(actorHit&&(worldT==null||actorHit.t<worldT-.0001)){this.resolveThrowableActorHit(g,actorHit,px,py,pz,nx,ny,nz,stepAt);continue;}
          g.x=nx;g.y=ny;g.z=nz;
          const groundY=this.world.geometry.terrainHeight(nx,nz)+Math.max(.08,g.radius||.10),hitGround=ny<=groundY,hitObj=!hitGround&&this.world.serverCollision.segmentHitsObstacle(px,py,pz,nx,ny,nz,g.radius);
          if(!hitGround&&!hitObj)continue;

          if(g.kind==='sticky'){
            g.x=px;g.y=Math.max(py,this.world.geometry.terrainHeight(px,pz)+Math.max(.08,g.radius||.10));g.z=pz;g.vx=g.vy=g.vz=0;g.stuck=true;g.rolling=false;
          }else if(hitGround){
            // Preserve horizontal direction on a ground contact. High-energy
            // impacts bounce; low-energy impacts transition naturally to roll.
            const impact=Math.abs(g.vy),horizontal=Math.hypot(g.vx,g.vz);
            g.x=nx;g.y=this.world.geometry.terrainHeight(nx,nz)+Math.max(.08,g.radius||.10);g.z=nz;g.vx*=.76;g.vz*=.76;
            if(impact>2.15){g.vy=impact*.29;g.rolling=false;}
            else{g.vy=0;g.rolling=horizontal>.24;if(!g.rolling){g.vx=g.vz=0;g.stuck=true;}}
          }else{
            // Reflect only the component that met a wall/solid rather than
            // reversing the entire throw direction on every contact.
            g.x=px;g.y=py;g.z=pz;
            const hitX=this.world.serverCollision.segmentHitsObstacle(px,py,pz,nx,ny,pz,g.radius),hitZ=this.world.serverCollision.segmentHitsObstacle(px,py,pz,px,ny,nz,g.radius),ambiguous=!hitX&&!hitZ;
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
  findThrowableActorHit(g,x1,y1,z1,x2,y2,z2,at){
    let best=null;
    const consider=(actor,id,team)=>{
      if(!id||actor?.hp<=0)return;
      // Ignore the thrower only while the equipment is leaving the hand/body.
      // It may collide with the owner normally if it bounces back later.
      if(id===g.ownerId&&at-g.born<260)return;
      if(id===g.lastActorHitId&&at-g.lastActorHitAt<85)return;
      const hit=this.world.serverCollision.projectileSegmentHitZone(actor,x1,y1,z1,x2,y2,z2,g.radius);
      if(hit&&(best==null||hit.t<best.t))best={actor,id,team,t:hit.t};
    };
    for(const socket of this.ctx.getWebSockets()){const p=socket.deserializeAttachment()||{};if(!p.clientId||p.replaced)continue;consider(p,p.clientId,p.team);}
    for(const b of this.bots)consider(b,b.id,b.team);
    return best;
  }
  resolveThrowableActorHit(g,hit,x1,y1,z1,x2,y2,z2,at){
    const t=clamp(finiteNumber(hit?.t,0),0,1),cx=x1+(x2-x1)*t,cy=y1+(y2-y1)*t,cz=z1+(z2-z1)*t;
    const friendly=combatantsAreFriendly(matchMode(this.metaCache?.match),g.ownerId,g.ownerTeam,hit.id,hit.team);
    if(g.kind==='sticky'&&hit.id!==g.ownerId&&!friendly){
      g.stuck=true;g.stuckTo=hit.id;g.x=hit.actor.x;g.y=hit.actor.y+1.0;g.z=hit.actor.z;g.vx=g.vy=g.vz=0;g.rolling=false;
    }else{
      const centerY=finiteNumber(hit.actor?.y,0)+(hit.actor?.crouched?CROUCH_HEIGHT*.52:PLAYER_HEIGHT*.52);
      let nx=cx-finiteNumber(hit.actor?.x,0),ny=cy-centerY,nz=cz-finiteNumber(hit.actor?.z,0),nl=Math.hypot(nx,ny,nz);
      if(nl<.001){const vl=Math.hypot(g.vx,g.vy,g.vz)||1;nx=-g.vx/vl;ny=-g.vy/vl;nz=-g.vz/vl;nl=1;}else{nx/=nl;ny/=nl;nz/=nl;}
      const dot=g.vx*nx+g.vy*ny+g.vz*nz,restitution=.34;
      if(dot<0){g.vx-=(1+restitution)*dot*nx;g.vy-=(1+restitution)*dot*ny;g.vz-=(1+restitution)*dot*nz;}
      g.vx*=.76;g.vy*=.76;g.vz*=.76;g.x=cx+nx*.07;g.y=cy+ny*.07;g.z=cz+nz*.07;g.rolling=false;
    }
    g.lastActorHitId=hit.id;g.lastActorHitAt=at;
    this.broadcast({t:'throwableImpact',id:g.id,kind:g.kind,x:g.x,y:g.y,z:g.z,vx:g.vx,vy:g.vy,vz:g.vz,stuck:g.stuck,rolling:!!g.rolling,at});
  }
  detonateFlash(g,now){
    const radius=FLASH_RADIUS;this.broadcast({t:'flashDetonate',id:g.id,x:g.x,y:g.y,z:g.z,radius});
    for(const socket of this.ctx.getWebSockets()){
      const p=socket.deserializeAttachment()||{};if(!p.clientId||p.replaced||p.hp<=0)continue;
      const ex=p.x,ey=p.y+PLAYER_HEIGHT*.75,ez=p.z,dx=g.x-ex,dy=g.y-ey,dz=g.z-ez,dist=Math.hypot(dx,dy,dz);if(dist>radius)continue;
      if(!this.world.serverCollision.blastHasLineOfSight(g.x,g.y,g.z,ex,ey,ez))continue;
      const cp=Math.cos(p.pitch||0),fx=-Math.sin(p.yaw||0)*cp,fy=Math.sin(p.pitch||0),fz=-Math.cos(p.yaw||0)*cp,n=dist||1,dot=(fx*dx+fy*dy+fz*dz)/n,front=.12+.88*Math.max(0,(dot+1)/2),power=clamp((1-dist/radius)*front,0,1);if(power<.035)continue;
      const durationMs=Math.round(650+power*2850),existingPower=activeFlashPower(p,now);
      if(power>=existingPower){p.flashPower=power;p.flashDurationMs=durationMs;p.flashUntil=now+durationMs;}
      else p.flashUntil=Math.max(finiteNumber(p.flashUntil,0),now+durationMs);
      p.ads=false;socket.serializeAttachment(p);
      sendJson(socket,{t:'flashEffect',power,durationMs});
    }
    for(const b of this.bots){if(b.hp<=0)continue;const dx=b.x-g.x,dy=b.y+1.05-g.y,dz=b.z-g.z,dist=Math.hypot(dx,dy,dz);if(dist>radius||!this.world.serverCollision.blastHasLineOfSight(g.x,g.y,g.z,b.x,b.y+1.05,b.z))continue;const power=clamp(1-dist/radius,0,1);if(power<.05)continue;b.flashUntil=Math.max(finiteNumber(b.flashUntil,0),now+550+power*2600);b.flashSpin=(Math.random()<.5?-1:1)*(1.5+Math.random()*2.5);}
  }
  detonateSmoke(g,now){
    const cloud={id:g.id,x:g.x,y:g.y+.65,z:g.z,radius:SMOKE_RADIUS,bornAt:now,expiresAt:now+SMOKE_DURATION_MS};this.smokeClouds.set(g.id,cloud);this.broadcast({t:'smokeDetonate',...cloud});
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
      const dx=p.x-g.x,dz=p.z-g.z,d=Math.hypot(dx,p.y+1-g.y,dz);if(d>radius||!this.world.serverCollision.blastHasLineOfSight(g.x,g.y,g.z,p.x,p.y+1,p.z))continue;
      let damage=this.blastDamage(maxDamage,d,radius,frag?.20:.18,frag?.30:.32);if(self)damage=Math.round(damage*(frag?.68:.72));const n=Math.hypot(dx,dz)||1,force=.28+.72*Math.sqrt(clamp(damage/maxDamage,0,1));this.damageHuman(socket,p,g.ownerId,damage,weapon,{x:dx/n*5.4*force,z:dz/n*5.4*force,y:1.1+2.4*force},now,g.id,settings,{distance:d,blast:true});
    }
    for(const b of this.bots){if(b.hp<=0||b.id===g.ownerId||combatantsAreFriendly(matchMode(this.metaCache?.match),g.ownerId,g.ownerTeam,b.id,b.team))continue;const dx=b.x-g.x,dz=b.z-g.z,d=Math.hypot(dx,b.y+1-g.y,dz);if(d>radius||!this.world.serverCollision.blastHasLineOfSight(g.x,g.y,g.z,b.x,b.y+1,b.z))continue;const damage=this.blastDamage(maxDamage,d,radius,frag?.20:.18,frag?.30:.32),n=Math.hypot(dx,dz)||1,force=.28+.72*Math.sqrt(clamp(damage/maxDamage,0,1));this.damageBot(b,g.ownerId,damage,weapon,{x:dx/n*5.4*force,z:dz/n*5.4*force,y:1.1+2.4*force},now,g.id,settings,{distance:d,blast:true});}
    this.noteExplosion({x:g.x,z:g.z,team:g.ownerTeam,id:g.id,kind:weapon},now);
    this.broadcast({t:'explosion',id:g.id,x:g.x,y:g.y,z:g.z,kind:weapon,radius});
  }


  explodeProjectile(bullet,now,settings){
    const radius=Math.max(.1,finiteNumber(bullet.explosionRadius,0)),maxDamage=Math.max(1,finiteNumber(bullet.explosionDamage,0));if(radius<=.1)return;
    const apply=(target,socket=null,isBot=false)=>{if(!target||target.hp<=0)return;const targetId=target.clientId||target.id,self=targetId===bullet.ownerId;if(!self&&combatantsAreFriendly(matchMode(this.metaCache?.match),bullet.ownerId,bullet.ownerTeam,targetId,target.team))return;const tx=target.x,ty=target.y+1,tz=target.z,dx=tx-bullet.x,dy=ty-bullet.y,dz=tz-bullet.z,d=Math.hypot(dx,dy,dz);if(d>radius||!this.world.serverCollision.blastHasLineOfSight(bullet.x,bullet.y,bullet.z,tx,ty,tz))return;let damage=this.blastDamage(maxDamage,d,radius,bullet.weapon==='rpg'?.22:.20,bullet.weapon==='rpg'?.34:.30);if(self)damage=Math.round(damage*.65);const horizontal=Math.hypot(dx,dz)||1,force=.28+.72*Math.sqrt(clamp(damage/maxDamage,0,1)),knockback={x:dx/horizontal*6.2*force,z:dz/horizontal*6.2*force,y:1.15+2.65*force};if(isBot)this.damageBot(target,bullet.ownerId,damage,bullet.weapon,knockback,now,bullet.id,settings,{distance:d,blast:true});else this.damageHuman(socket,target,bullet.ownerId,damage,bullet.weapon,knockback,now,bullet.id,settings,{distance:d,blast:true});};
    for(const socket of this.ctx.getWebSockets()){const p=socket.deserializeAttachment()||{};if(!p.clientId||p.replaced)continue;apply(p,socket,false);}for(const bot of this.bots)apply(bot,null,true);
    this.noteExplosion({x:bullet.x,z:bullet.z,team:bullet.ownerTeam,id:bullet.id,kind:bullet.weapon},now);
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

          const worldT = this.world.serverCollision.segmentFirstWorldHitT(previousX,previousY,previousZ,segmentEndX,segmentEndY,segmentEndZ,bullet.projectileRadius);
          let nearest = null;
          const consider = (kind, target, socket = null) => {
            const collisionTarget=this.combatPoseAt(target,segmentAt-finiteNumber(bullet.targetRewindMs,0)),hit=this.world.serverCollision.projectileSegmentHitZone(collisionTarget,previousX,previousY,previousZ,segmentEndX,segmentEndY,segmentEndZ,bullet.projectileRadius);
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
              else this.broadcast({t:'bulletImpact',id:bullet.id,ownerId:bullet.ownerId,weapon:bullet.weapon,kind:'world',x:bullet.x,y:bullet.y,z:bullet.z});
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
          const horizontal = Math.hypot(bullet.vx, bullet.vz) || 1,energy=clamp(finiteNumber(bullet.penetrationEnergy,1),0,1),hitZone=String(nearest.hit.zone||'upper');
          const zoneScale=weaponZoneDamageScale(bullet.weapon,hitZone),baseDamage=Math.max(0,finiteNumber(bullet.damage,0))*energy*zoneScale,headshot=hitZone === 'head',hitDamage=weaponDamageAtDistance(bullet.weapon,baseDamage,bullet.traveledDistance,headshot,bullet.attachments);
          const knockback={x:bullet.vx/horizontal*2.4*energy,z:bullet.vz/horizontal*2.4*energy,y:(headshot?1.45:1.1)*Math.max(.35,energy)};
          const damageApplied=nearest.kind==='human'?this.damageHuman(nearest.socket,target,bullet.ownerId,hitDamage,bullet.weapon,knockback,now,bullet.id,settings,{headshot,hitZone,distance:bullet.traveledDistance,penetrationEnergy:energy}):this.damageBot(target,bullet.ownerId,hitDamage,bullet.weapon,knockback,now,bullet.id,settings,{headshot,hitZone,distance:bullet.traveledDistance,penetrationEnergy:energy});
          this.broadcast({t:'bulletImpact',id:bullet.id,ownerId:bullet.ownerId,targetId,weapon:bullet.weapon,kind:damageApplied?'player':'blocked',headshot,x:bullet.x,y:bullet.y,z:bullet.z});

          // Every firearm uses the same player-penetration model. Energy loss is
          // determined by the weapon, never by the victim's remaining HP. World
          // geometry still hard-stops projectiles; material penetration is a
          // separate feature and intentionally remains disabled here.
          const retention=clamp(finiteNumber(resolveWeaponSpec(bullet.weapon,bullet.attachments)?.playerPenetrationRetention,0),0,1);
          bullet.penetrationEnergy=energy*retention;
          if(retention<=0||bullet.penetrationEnergy<MIN_PLAYER_PENETRATION_ENERGY){this.endBullet(id,'spent');ended=true;break;}

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
    if(attackerId!==target.clientId&&now<finiteNumber(target.spawnProtectedUntil,0))return false;
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
      target.ladder = null;
      target.spawnProtectedUntil=0;
      target.ads=false;target.adsAmount=0;target.crouched=false;target.sprinting=false;target.sliding=false;target.slideUntil=0;target.moveSpeed=0;
      target.reloadAt=0;target.reloadWeapon='';target.weaponReadyAt=0;target.equipmentReadyAt=0;target.combatAction='ready';target.combatActionKind='';target.combatReadyAt=0;target.sprintFireReadyAt=0;
      target.wastedUntil = now + settings.combat.respawnMs;
      target.deaths = Math.max(0, Math.floor(finiteNumber(target.deaths, 0))) + 1;
      target.multiKillCount = 0;
      target.lastKillAt = 0;
      // Publish the victim's authoritative death count before awardKill builds
      // the kill event snapshot. This keeps the scoreboard/KD state in sync
      // during the death screen instead of correcting only after respawn.
      socket.serializeAttachment(target);
      multiKill = this.awardKill(attackerId, target.clientId, now);
    }
    const headshot = !!hitMeta.headshot;
    const distance = Math.max(0, finiteNumber(hitMeta.distance, 0));
    socket.serializeAttachment(target);
    this.broadcast({
      t: "hit", attacker: attackerId, target: target.clientId, hp: target.hp, damage, weapon, bulletId, headshot, distance, blast:!!hitMeta.blast, directImpact:!!hitMeta.directImpact,
      wasted, respawnAt: target.wastedUntil || 0,
      knockback: wasted ? { x: knockback.x * 1.35, z: knockback.z * 1.35, y: Math.max(3.8, knockback.y) } : knockback,
    });
    if (wasted) this.broadcast(this.killEvent(attackerId, target.clientId, weapon, now, { headshot, distance, multiKill }));
    return true;
  }

  damageBot(bot, attackerId, damage, weapon, knockback, now, bulletId = "", settings = DEFAULT_WORLD_SETTINGS, hitMeta = {}) {
    if(attackerId!==bot.id&&now<finiteNumber(bot.spawnProtectedUntil,0))return false;
    bot.hp = Math.max(0, bot.hp - damage);
    bot.regenAt = now + settings.combat.regenDelayMs;
    const wasted = bot.hp <= 0;
    let multiKill = 0;
    if (wasted) {
      this.noteDeath(bot,now);
      bot.traversal = null;
      bot.ladder = null;
      bot.spawnProtectedUntil=0;
      bot.reloadAt=0;bot.reloadWeapon='';bot.moveSpeed=0;bot.velocityX=0;bot.velocityZ=0;
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
    return true;
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
          mapId: normalizeMapId(meta.mapId),
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
