import {
  PLAYER_HEIGHT, PLAYER_RADIUS, ARENA_LIMIT, STATIC_BOXES, BUILDINGS, PYRAMIDS, NATURAL_OBSTACLES,
  terrainHeight, naturalGroundBase, worldSupportHeight, resolveCeilingCollision, MAX_STEP_HEIGHT, BUILDING_PARTS
} from './world-geometry.js';

const PROTOCOL_VERSION = 27;
const GAME_VERSION = "1.15.25";
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 4;
const MAX_PLAYERS = 8;
const MAX_BOTS = 8;
const MAX_MESSAGE_BYTES = 24 * 1024;
const ROOM_MAX_LIFETIME_MS = 12 * 60 * 60 * 1000;
const EMPTY_ROOM_GRACE_MS = 10 * 60 * 1000;
const ALARM_MIN_FUTURE_MS = 5 * 1000;
const DIRECTORY_LEASE_MS = 15 * 1000;
const DIRECTORY_HEARTBEAT_MS = 5 * 1000;
const SIM_MIN_STEP_MS = 16;
const COLLISION_CELL_SIZE = 8;
const COLLISION_CELL_HEIGHT = 3;
const RECONNECT_GRACE_MS = 45 * 1000;
const HEALTH_REGEN_TICK_MS = 500;
const HEADSHOT_MULTIPLIER = 2;
const MULTI_KILL_WINDOW_MS = 4500;
const WEAPONS = {
  pistol: { mag: 12, lifetimeMs: 3200 },
  assault: { mag: 12, lifetimeMs: 3400 },
  shotgun: { mag: 6, lifetimeMs: 1800 },
  sniper: { mag: 12, lifetimeMs: 3600 },
};
const DEFAULT_WORLD_SETTINGS = Object.freeze({
  movement: Object.freeze({ runSpeed: 8.4, walkSpeed: 4.6, jumpHeight: 1.6, gravity: 23 }),
  combat: Object.freeze({ regenDelayMs: 5000, regenPerSecond: 8, respawnMs: 2800 }),
  weapons: Object.freeze({
    pistol: Object.freeze({ damage: 34, speed: 42, reloadMs: 475, cooldownMs: 190 }),
    assault: Object.freeze({ damage: 26, speed: 82, reloadMs: 650, cooldownMs: 105 }),
    shotgun: Object.freeze({ damage: 18, speed: 68, reloadMs: 980, cooldownMs: 760 }),
    sniper: Object.freeze({ damage: 120, speed: 180, reloadMs: 1100, cooldownMs: 950 }),
  }),
});
const TEAM_COLORS = { blue: "#46a7ff", red: "#ff5c6c" };
const PLAYER_COLORS = [
  "#4cc9f0", "#f72585", "#80ed99", "#ffd166",
  "#b388ff", "#ff8c42", "#90e0ef", "#f28482",
];
const BOT_COLORS = ["#78baff", "#ff8290"];
const BOT_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ moveRun: .44, moveWalk: .58, strafe: .08, preferredRange: 9.5, range: 19, fireScale: 1.48, reactionBase: 480, reactionJitter: 430, spreadBase: .098, spreadDistance: .0028 }),
  normal: Object.freeze({ moveRun: .72, moveWalk: .86, strafe: .38, preferredRange: 8.0, range: 30, fireScale: .82, reactionBase: 105, reactionJitter: 160, spreadBase: .022, spreadDistance: .00105 }),
  hard: Object.freeze({ moveRun: .94, moveWalk: 1.02, strafe: .72, preferredRange: 7.0, range: 38, fireScale: .56, reactionBase: 42, reactionJitter: 70, spreadBase: .0085, spreadDistance: .00048 }),
  elite: Object.freeze({ moveRun: 1.06, moveWalk: 1.10, strafe: .96, preferredRange: 6.3, range: 46, fireScale: .42, reactionBase: 12, reactionJitter: 28, spreadBase: .0038, spreadDistance: .00022 }),
});
function safeBotDifficulty(value) {
  const key = String(value || "normal").toLowerCase();
  return Object.prototype.hasOwnProperty.call(BOT_DIFFICULTIES, key) ? key : "normal";
}

const WORLD_OBSTACLES = [
  ...STATIC_BOXES.map(o=>({type:'box',...o,playerSolid:true,projectileSolid:true,supportTop:true})),
  ...PYRAMIDS.map(o=>({type:'pyramid',...o,playerSolid:false,projectileSolid:true})),
  ...NATURAL_OBSTACLES.map(o=>({...o,playerSolid:true,projectileSolid:true})),
  ...BUILDING_PARTS.filter(p=>p.playerSolid||p.projectileSolid).map(p=>({
    type:'box',x:p.x,z:p.z,w:p.w,d:p.d,minY:p.bottomY,maxY:p.topY,
    playerSolid:p.playerSolid,projectileSolid:p.projectileSolid,supportTop:p.supportTop,role:p.role
  })),
];

function safeOrigin(request, env) {
  const configured = String(env.GAME_ORIGIN || "*").trim();
  const origin = request.headers.get("Origin") || "";
  if (configured === "*") return "*";
  return origin === configured ? origin : configured;
}

function corsHeaders(request, env) {
  return {
    "access-control-allow-origin": safeOrigin(request, env),
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "cache-control": "no-store",
    vary: "Origin",
  };
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
function isRoomAdmin(meta, clientId) {
  const id = safeClientId(clientId);
  return !!id && normalizeAdminIds(meta).includes(id);
}

function safeWeapon(value) {
  return Object.prototype.hasOwnProperty.call(WEAPONS, value) ? value : "pistol";
}

const EQUIPMENT_CAPS = Object.freeze({ flash: 2, sticky: 2 });
function safeEquipmentKind(value){return Object.prototype.hasOwnProperty.call(EQUIPMENT_CAPS,value)?value:'flash';}
function freshAmmo(){return Object.fromEntries(Object.entries(WEAPONS).map(([name,spec])=>[name,spec.mag]));}
function normalizeAmmo(value){
  const v=value&&typeof value==="object"?value:{};
  return Object.fromEntries(Object.entries(WEAPONS).map(([name,spec])=>[name,clamp(Math.floor(finiteNumber(v[name],spec.mag)),0,spec.mag)]));
}
function freshEquipment(){return {...EQUIPMENT_CAPS};}
function normalizeEquipment(v){v=v&&typeof v==="object"?v:{};return Object.fromEntries(Object.entries(EQUIPMENT_CAPS).map(([name,cap])=>[name,clamp(Math.floor(finiteNumber(v[name],cap)),0,cap)]));}
function refreshUnlimitedResources(me){
  if(!me?.godMode)return;
  me.ammo=freshAmmo();me.equipment=freshEquipment();me.reloadAt=0;me.reloadWeapon='';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeWorldSettings(value) {
  const v = value && typeof value === "object" ? value : {};
  const mv = v.movement && typeof v.movement === "object" ? v.movement : {};
  const cv = v.combat && typeof v.combat === "object" ? v.combat : {};
  const wv = v.weapons && typeof v.weapons === "object" ? v.weapons : {};
  const weapon = (name) => {
    const src = wv[name] && typeof wv[name] === "object" ? wv[name] : {};
    const def = DEFAULT_WORLD_SETTINGS.weapons[name];
    return {
      damage: clamp(finiteNumber(src.damage, def.damage), 1, 400),
      speed: clamp(finiteNumber(src.speed, def.speed), 10, 400),
      reloadMs: clamp(Math.round(finiteNumber(src.reloadMs, def.reloadMs)), 100, 5000),
      cooldownMs: clamp(Math.round(finiteNumber(src.cooldownMs, def.cooldownMs)), 50, 2500),
    };
  };
  return {
    movement: (() => {
      const runSpeed = clamp(finiteNumber(mv.runSpeed, DEFAULT_WORLD_SETTINGS.movement.runSpeed), 3, 16);
      const walkSpeed = Math.min(runSpeed, clamp(finiteNumber(mv.walkSpeed, DEFAULT_WORLD_SETTINGS.movement.walkSpeed), 1.5, 9));
      return {
        runSpeed,
        walkSpeed,
        jumpHeight: clamp(finiteNumber(mv.jumpHeight, DEFAULT_WORLD_SETTINGS.movement.jumpHeight), 0.4, 5),
        gravity: clamp(finiteNumber(mv.gravity, DEFAULT_WORLD_SETTINGS.movement.gravity), 8, 40),
      };
    })(),
    combat: {
      regenDelayMs: clamp(Math.round(finiteNumber(cv.regenDelayMs, DEFAULT_WORLD_SETTINGS.combat.regenDelayMs)), 0, 15000),
      regenPerSecond: clamp(finiteNumber(cv.regenPerSecond, DEFAULT_WORLD_SETTINGS.combat.regenPerSecond), 0, 30),
      respawnMs: clamp(Math.round(finiteNumber(cv.respawnMs, DEFAULT_WORLD_SETTINGS.combat.respawnMs)), 1000, 10000),
    },
    weapons: { pistol: weapon("pistol"), assault: weapon("assault"), shotgun: weapon("shotgun"), sniper: weapon("sniper") },
  };
}

function obstacleBaseY(o){
  if(Number.isFinite(o.minY))return o.minY;
  if(o.type==='tree'||o.type==='bush'||o.type==='rock')return naturalGroundBase(o.type,o.x,o.z,o.r);
  return terrainHeight(o.x,o.z);
}

function projectileHitZone(target, bullet) {
  const tx = finiteNumber(target?.x, 0);
  const ty = finiteNumber(target?.y, terrainHeight(tx, finiteNumber(target?.z, 0)));
  const tz = finiteNumber(target?.z, 0);
  const dx = tx - bullet.x;
  const dz = tz - bullet.z;
  const headDy = ty + 1.66 - bullet.y;
  if (dx * dx + headDy * headDy + dz * dz <= 0.31 * 0.31) return "head";
  const bodyDy = ty + 0.95 - bullet.y;
  if (dx * dx + bodyDy * bodyDy + dz * dz <= 0.62 * 0.62) return "body";
  return "";
}

function collisionCellKey(cx,cy,cz) { return `${cx},${cy},${cz}`; }
let COLLISION_INDEX = null;
function ensureCollisionIndex() {
  if (COLLISION_INDEX) return COLLISION_INDEX;
  const grid = new Map();
  const entries = [];
  for (const o of WORLD_OBSTACLES) {
    const baseY = obstacleBaseY(o);
    let minX, maxX, minZ, maxZ;
    if (o.type === 'box') {
      minX = o.x - o.w / 2; maxX = o.x + o.w / 2;
      minZ = o.z - o.d / 2; maxZ = o.z + o.d / 2;
    } else if (o.type === 'pyramid') {
      minX = o.x - o.base / 2; maxX = o.x + o.base / 2;
      minZ = o.z - o.base / 2; maxZ = o.z + o.base / 2;
    } else {
      minX = o.x - o.r; maxX = o.x + o.r;
      minZ = o.z - o.r; maxZ = o.z + o.r;
    }
    const entry = { o, baseY, maxY: Number.isFinite(o.maxY)?o.maxY:baseY + o.h + .15, minX, maxX, minZ, maxZ };
    entries.push(entry);
    const minCX = Math.floor(minX / COLLISION_CELL_SIZE), maxCX = Math.floor(maxX / COLLISION_CELL_SIZE);
    const minCY = Math.floor(baseY / COLLISION_CELL_HEIGHT), maxCY = Math.floor(entry.maxY / COLLISION_CELL_HEIGHT);
    const minCZ = Math.floor(minZ / COLLISION_CELL_SIZE), maxCZ = Math.floor(maxZ / COLLISION_CELL_SIZE);
    for (let cx = minCX; cx <= maxCX; cx += 1) for (let cy = minCY; cy <= maxCY; cy += 1) for (let cz = minCZ; cz <= maxCZ; cz += 1) {
      const key = collisionCellKey(cx,cy,cz);
      let list = grid.get(key);
      if (!list) { list = []; grid.set(key, list); }
      list.push(entry);
    }
  }
  COLLISION_INDEX = { grid, entries };
  return COLLISION_INDEX;
}
function collisionCandidates(minX,maxX,minY,maxY,minZ,maxZ) {
  const { grid } = ensureCollisionIndex();
  const minCX = Math.floor(minX / COLLISION_CELL_SIZE), maxCX = Math.floor(maxX / COLLISION_CELL_SIZE);
  const minCY = Math.floor(minY / COLLISION_CELL_HEIGHT), maxCY = Math.floor(maxY / COLLISION_CELL_HEIGHT);
  const minCZ = Math.floor(minZ / COLLISION_CELL_SIZE), maxCZ = Math.floor(maxZ / COLLISION_CELL_SIZE);
  const out = [], seen = new Set();
  for (let cx = minCX; cx <= maxCX; cx += 1) for (let cy = minCY; cy <= maxCY; cy += 1) for (let cz = minCZ; cz <= maxCZ; cz += 1) {
    const list = grid.get(collisionCellKey(cx,cy,cz));
    if (!list) continue;
    for (const entry of list) if (!seen.has(entry)) { seen.add(entry); out.push(entry); }
  }
  return out;
}

function worldBlocked(x,z,radius=.38,y=terrainHeight(x,z)){
  if(Math.abs(x)>ARENA_LIMIT||Math.abs(z)>ARENA_LIMIT)return true;
  for(const entry of collisionCandidates(x-radius,x+radius,y,y+PLAYER_HEIGHT*.92,z-radius,z+radius)){
    const o=entry.o;if(o.playerSolid===false||o.type==='pyramid')continue;
    if(y+PLAYER_HEIGHT*.92<=entry.baseY||y>=entry.maxY-.04)continue;
    if(o.supportTop&&entry.maxY<=y+MAX_STEP_HEIGHT)continue;
    if(o.type==='box'){
      if(x>entry.minX-radius&&x<entry.maxX+radius&&z>entry.minZ-radius&&z<entry.maxZ+radius)return true;
    }else if(Math.hypot(x-o.x,z-o.z)<o.r+radius)return true;
  }
  return false;
}
function pointHitsObstacle(x,y,z){
  for(const entry of collisionCandidates(x,x,y,y,z,z)){
    const o=entry.o;if(o.projectileSolid===false||y<entry.baseY||y>entry.maxY)continue;
    if(o.type==='box'){
      if(x>=entry.minX&&x<=entry.maxX&&z>=entry.minZ&&z<=entry.maxZ)return true;
    }else if(o.type==='pyramid'){
      const t=clamp((y-entry.baseY)/o.h,0,1),half=o.base/2*(1-t);
      if(Math.abs(x-o.x)<=half&&Math.abs(z-o.z)<=half)return true;
    }else if(Math.hypot(x-o.x,z-o.z)<=o.r)return true;
  }
  return false;
}
function segmentHitsObstacle(x1, y1, z1, x2, y2, z2) {
  const distance = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
  const steps = Math.max(1, Math.ceil(distance / .10));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    if (pointHitsObstacle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, z1 + (z2 - z1) * t)) return true;
  }
  return false;
}
function actorHasLineOfSight(from, to) {
  const fx = finiteNumber(from?.x, 0), fz = finiteNumber(from?.z, 0);
  const tx = finiteNumber(to?.x, 0), tz = finiteNumber(to?.z, 0);
  const fy = finiteNumber(from?.y, terrainHeight(fx, fz)) + 1.28;
  const ty = finiteNumber(to?.y, terrainHeight(tx, tz)) + 1.08;
  return !segmentHitsObstacle(fx, fy, fz, tx, ty, tz);
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
    weapon: safeWeapon(attachment.weapon),
    ammo: normalizeAmmo(attachment.ammo),
    equipment: normalizeEquipment(attachment.equipment),
    reloadAt: attachment.reloadAt || 0,
    reloadWeapon: attachment.reloadWeapon || "",
    combatRev: Math.max(0, Math.floor(finiteNumber(attachment.combatRev, 0))),
    kills: Math.max(0, Math.floor(finiteNumber(attachment.kills, 0))),
    deaths: Math.max(0, Math.floor(finiteNumber(attachment.deaths, 0))),
    godMode: !!attachment.godMode,
    admin: !!attachment.admin,
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
    weapon: "assault",
    ads: false,
    reloadAt: bot.reloadAt || 0,
    reloadWeapon: bot.reloadWeapon || "",
    kills: Math.max(0, Math.floor(finiteNumber(bot.kills, 0))),
    deaths: Math.max(0, Math.floor(finiteNumber(bot.deaths, 0))),
  };
}

function sendLoadout(socket, me, extra = {}) {
  try { socket.send(JSON.stringify({ t:'loadout', weapon:safeWeapon(me.weapon), ammo:normalizeAmmo(me.ammo), reloadAt:me.reloadAt||0, reloadWeapon:me.reloadWeapon||'', rev:Math.max(0,Math.floor(finiteNumber(me.combatRev,0))), ...extra })); } catch {}
}

const TEAM_SPAWNS = {
  blue: [[-92,-82],[-98,74],[-104,0],[-66,24],[-28,-96],[-76,-48]],
  red: [[92,82],[98,-74],[104,0],[66,-24],[28,96],[76,48]],
};
function spawnForTeam(team,index){
  team=safeTeam(team);const points=TEAM_SPAWNS[team],p=points[Math.abs(index)%points.length];
  return {x:p[0],y:terrainHeight(p[0],p[1]),z:p[1]};
}
function spawnFor(index){const team=index%2===0?'blue':'red';return spawnForTeam(team,Math.floor(index/2));}
function makeBot(index, team, teamIndex) {
  team = safeTeam(team);
  const spawn = spawnForTeam(team, teamIndex);
  const label = team === "red" ? "Red" : "Blue";
  return {
    id: `bot-${team}-${teamIndex + 1}`,
    name: `${label} Bot ${teamIndex + 1}`,
    team,
    color: TEAM_COLORS[team],
    ...spawn,
    yaw: 0,
    hp: 100,
    wastedUntil: 0,
    lastShot: 0,
    nextShotDelay: 800 + Math.floor(Math.random() * 450),
    ammo: freshAmmo(),
    reloadAt: 0,
    reloadWeapon: "",
    weapon: "assault",
    lastHitAt: 0,
    regenAt: 0,
    kills: 0,
    deaths: 0,
  };
}
function makeBots(blueBots, redBots) {
  blueBots = clamp(Math.floor(finiteNumber(blueBots, 0)), 0, MAX_BOTS);
  redBots = clamp(Math.floor(finiteNumber(redBots, 0)), 0, MAX_BOTS);
  const bots = [];
  for (let i = 0; i < blueBots; i += 1) bots.push(makeBot(bots.length, "blue", i));
  for (let i = 0; i < redBots; i += 1) bots.push(makeBot(bots.length, "red", i));
  return bots;
}
function reconcileBots(existing, blueBots, redBots) {
  const prior = new Map((Array.isArray(existing) ? existing : []).map((bot) => [bot.id, bot]));
  return makeBots(blueBots, redBots).map((fresh) => {
    const old = prior.get(fresh.id);
    if (!old) return fresh;
    return {
      ...fresh,
      ...old,
      id: fresh.id,
      name: fresh.name,
      team: fresh.team,
      color: fresh.color,
      x: clamp(finiteNumber(old.x, fresh.x), -ARENA_LIMIT, ARENA_LIMIT),
      z: clamp(finiteNumber(old.z, fresh.z), -ARENA_LIMIT, ARENA_LIMIT),
      y: terrainHeight(clamp(finiteNumber(old.x, fresh.x), -ARENA_LIMIT, ARENA_LIMIT), clamp(finiteNumber(old.z, fresh.z), -ARENA_LIMIT, ARENA_LIMIT)),
      ammo: normalizeAmmo(old.ammo),
      weapon: "assault",
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
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (url.pathname === "/health") {
      return json(request, env, {
        ok: true,
        service: "punch-world-online",
        protocol: PROTOCOL_VERSION,
        version: PROTOCOL_VERSION,
        game: GAME_VERSION,
        mode: "durable-object-team-sandbox-bots-difficulty-directional-damage",
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
      const protocol = Math.floor(finiteNumber(body.protocol, 0));
      if (protocol !== PROTOCOL_VERSION) return json(request, env, { error: `Client protocol ${protocol || "missing"} is incompatible. Update the game client.`, protocol: PROTOCOL_VERSION }, 409);
      const name = safeName(body.name);
      const blueBots = clamp(Math.floor(finiteNumber(body.blueBots, 0)), 0, MAX_BOTS);
      const redBots = clamp(Math.floor(finiteNumber(body.redBots, 0)), 0, MAX_BOTS);
      const botCount = blueBots + redBots;
      const botDifficulty = safeBotDifficulty(body.botDifficulty);
      if (!clientId) return json(request, env, { error: "Missing client ID." }, 400);
      if (botCount > MAX_BOTS) return json(request, env, { error: `Maximum ${MAX_BOTS} bots per world.` }, 400);

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const code = makeRoomCode();
        const room = env.ROOMS.get(env.ROOMS.idFromName(code));
        const created = await room.fetch(
          `https://room.internal/create?code=${code}&owner=${encodeURIComponent(clientId)}&name=${encodeURIComponent(name)}&blueBots=${blueBots}&redBots=${redBots}&botDifficulty=${encodeURIComponent(botDifficulty)}`,
          { method: "POST" },
        );
        if (created.status === 201) {
          return json(request, env, { code, maxPlayers: MAX_PLAYERS, bots: botCount, blueBots, redBots, botDifficulty }, 201);
        }
      }
      return json(request, env, { error: "Could not create a world. Try again." }, 503);
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
      rooms[code] = {
        code,
        protocol: PROTOCOL_VERSION,
        players: clamp(Math.floor(finiteNumber(body.players, 0)), 0, MAX_PLAYERS),
        bots: clamp(Math.floor(finiteNumber(body.bots, 0)), 0, MAX_BOTS),
        blueBots: clamp(Math.floor(finiteNumber(body.blueBots, 0)), 0, MAX_BOTS),
        redBots: clamp(Math.floor(finiteNumber(body.redBots, 0)), 0, MAX_BOTS),
        botDifficulty: safeBotDifficulty(body.botDifficulty),
        blue: clamp(Math.floor(finiteNumber(body.blue, 0)), 0, MAX_PLAYERS + MAX_BOTS),
        red: clamp(Math.floor(finiteNumber(body.red, 0)), 0, MAX_PLAYERS + MAX_BOTS),
        maxPlayers: MAX_PLAYERS,
        createdAt: finiteNumber(body.createdAt, now),
        updatedAt: now,
        expiresAt: finiteNumber(body.expiresAt, now + ROOM_MAX_LIFETIME_MS),
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
    this.lastSimAt = 0;
    this.lastBotBroadcastAt = 0;
    this.lastPersistAt = 0;
    this.lastDirectoryHeartbeatAt = 0;
    this.metaCache = null;
  }

  async getMeta() {
    if (this.metaCache) return this.metaCache;
    const meta = await this.ctx.storage.get("meta");
    if (meta) {
      meta.adminClientIds = normalizeAdminIds(meta);
      this.metaCache = meta;
    }
    return meta || null;
  }

  async putMeta(meta) {
    meta.adminClientIds = normalizeAdminIds(meta);
    this.metaCache = meta;
    await this.ctx.storage.put("meta", meta);
  }

  liveSockets(exceptSocket = null) {
    return this.ctx.getWebSockets().filter((socket) => {
      if (socket === exceptSocket) return false;
      const attachment = socket.deserializeAttachment() || {};
      return !!attachment.clientId && !attachment.replaced;
    });
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
    // Explicitly clear the alarm before storage. deleteAll() also clears alarms
    // with our compatibility date, but doing both makes cleanup unambiguous.
    try { await this.ctx.storage.deleteAlarm(); } catch {}
    await this.ctx.storage.deleteAll();
  }

  async ensureSimulation(meta) {
    if (this.bots) return;
    const counts = botCountsFromMeta(meta);
    const stored = await this.ctx.storage.get("bots");
    if (Array.isArray(stored) && stored.length === counts.botCount) this.bots = stored;
    else {
      this.bots = makeBots(counts.blueBots, counts.redBots);
      await this.ctx.storage.put("bots", this.bots);
    }
    this.lastSimAt = Date.now();
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/create" && request.method === "POST") {
      const existing = await this.getMeta();
      if (existing) return json(request, this.env, { error: "World already exists." }, 409);

      const code = normalizeRoomCode(url.searchParams.get("code"));
      const ownerClientId = safeClientId(url.searchParams.get("owner"));
      if (!ownerClientId) return json(request, this.env, { error: "Missing world owner." }, 400);
      const blueBots = clamp(Math.floor(finiteNumber(url.searchParams.get("blueBots"), 0)), 0, MAX_BOTS);
      const redBots = clamp(Math.floor(finiteNumber(url.searchParams.get("redBots"), 0)), 0, MAX_BOTS);
      const botCount = blueBots + redBots;
      const botDifficulty = safeBotDifficulty(url.searchParams.get("botDifficulty"));
      if (botCount > MAX_BOTS) return json(request, this.env, { error: `Maximum ${MAX_BOTS} bots per world.` }, 400);
      const now = Date.now();
      const meta = { code, protocol: PROTOCOL_VERSION, ownerClientId, adminClientIds: [ownerClientId], botCount, blueBots, redBots, botDifficulty, settings: normalizeWorldSettings(), createdAt: now, expiresAt: now + ROOM_MAX_LIFETIME_MS };
      await this.putMeta(meta);
      this.bots = makeBots(blueBots, redBots);
      await this.ctx.storage.put("bots", this.bots);
      await this.scheduleRoomAlarm(meta.expiresAt);
      await this.updateDirectory(0, meta);
      return json(request, this.env, { ok: true }, 201);
    }

    let meta = await this.getMeta();
    if (!meta) return json(request, this.env, { error: "World not found." }, 404);
    if (Math.floor(finiteNumber(meta.protocol, 0)) !== PROTOCOL_VERSION) return json(request, this.env, { error: "This world was created by an older game version. Create a new world.", protocol: PROTOCOL_VERSION }, 409);
    const fetchNow = Date.now();
    if (fetchNow >= finiteNumber(meta.expiresAt, 0)) return json(request, this.env, { error: "World expired." }, 410);
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

    const clientId = safeClientId(url.searchParams.get("client"));
    const name = safeName(url.searchParams.get("name"));
    const requestedTeam = safeTeam(url.searchParams.get("team"));
    const requestedGodMode = String(url.searchParams.get("god") || "") === "1";
    if (!clientId) return json(request, this.env, { error: "Missing client ID." }, 400);

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
      return json(request, this.env, { error: "World is full." }, 409);
    }

    const requestedTeamCount = liveMembers.filter(({attachment:a}) => safeTeam(a.team) === requestedTeam).length;
    const spawn = preserved || spawnForTeam(requestedTeam, requestedTeamCount);
    const colorIndex = preserved?.colorIndex ?? (liveMembers.length % PLAYER_COLORS.length);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const attachment = {
      clientId,
      name,
      team: preserved?.team || requestedTeam,
      colorIndex,
      color: TEAM_COLORS[preserved?.team || requestedTeam],
      connectedAt: Date.now(),
      replaced: false,
      x: clamp(finiteNumber(spawn.x, 0), -ARENA_LIMIT, ARENA_LIMIT),
      y: finiteNumber(spawn.y, terrainHeight(spawn.x || 0, spawn.z || 0)),
      z: clamp(finiteNumber(spawn.z, 0), -ARENA_LIMIT, ARENA_LIMIT),
      yaw: finiteNumber(spawn.yaw, 0),
      pitch: clamp(finiteNumber(spawn.pitch, 0), -1.4, 1.4),
      hp: clamp(Math.floor(finiteNumber(spawn.hp, 100)), 0, 100),
      wastedUntil: finiteNumber(spawn.wastedUntil, 0),
      lastShot: 0,
      lastHitAt: finiteNumber(spawn.lastHitAt, 0),
      regenAt: finiteNumber(spawn.regenAt, 0),
      weapon: safeWeapon(spawn.weapon),
      ammo: normalizeAmmo(spawn.ammo),
      equipment: normalizeEquipment(spawn.equipment),
      reloadAt: finiteNumber(spawn.reloadAt, 0),
      reloadWeapon: safeWeapon(spawn.reloadWeapon || spawn.weapon),
      combatRev: Math.max(0, Math.floor(finiteNumber(spawn.combatRev, 0))),
      kills: Math.max(0, Math.floor(finiteNumber(spawn.kills, 0))),
      deaths: Math.max(0, Math.floor(finiteNumber(spawn.deaths, 0))),
      godMode: requestedGodMode,
      admin: isRoomAdmin(meta, clientId),
      ads: false,
      lastStateAt: Date.now(),
      moveCredit: normalizeWorldSettings(meta.settings).movement.runSpeed * 0.04,
    };

    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server);
    await this.ctx.storage.delete("emptySince");
    await this.ctx.storage.delete(`reconnect:${clientId}`);
    await this.scheduleRoomAlarm(meta.expiresAt);

    const currentPlayers = liveMembers.map(({ attachment: a }) => publicPlayer(a));
    server.send(JSON.stringify({
      t: "welcome",
      self: publicPlayer(attachment),
      players: currentPlayers,
      bots: this.bots.map(publicBot),
      code: meta.code,
      maxPlayers: MAX_PLAYERS,
      botCount: meta.botCount,
      botConfig: { blueBots: meta.blueBots || 0, redBots: meta.redBots || 0, difficulty: safeBotDifficulty(meta.botDifficulty) },
      isAdmin: isRoomAdmin(meta, clientId),
      ownerClientId: meta.ownerClientId,
      settings: normalizeWorldSettings(meta.settings),
      serverTime: Date.now(),
      protocol: PROTOCOL_VERSION,
      gameVersion: GAME_VERSION,
    }));

    this.broadcast({ t: "join", player: publicPlayer(attachment) }, server);
    await this.updateDirectory(liveMembers.length + 1, meta);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, message) {
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
    const meta = await this.getMeta();
    if (!meta) return;
    await this.ensureSimulation(meta);

    let me = socket.deserializeAttachment() || {};
    if (!me.clientId || me.replaced) return;
    const now = Date.now();
    const settings = normalizeWorldSettings(meta.settings);

    if(me.godMode)refreshUnlimitedResources(me);
    if (me.reloadAt && now >= me.reloadAt) {
      const weapon = safeWeapon(me.reloadWeapon || me.weapon);
      me.reloadAt = 0; me.reloadWeapon = ""; me.ammo = normalizeAmmo(me.ammo); me.ammo[weapon] = WEAPONS[weapon].mag; me.combatRev = Math.max(0,finiteNumber(me.combatRev,0)) + 1;
      socket.serializeAttachment(me); sendLoadout(socket, me, { action:'reloadComplete', accepted:true });
    }

    if (payload.t === "state") {
      if (me.hp > 0 || now >= me.wastedUntil) {
        const next = this.validateHumanState(me, payload, now, settings);
        me = next.player;
        socket.serializeAttachment(me);
        const state = { t: "state", id: me.clientId, x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch, ads: !!me.ads };
        this.broadcast(state, socket);
        if (next.corrected) {
          try { socket.send(JSON.stringify({ t: "correction", x: me.x, y: me.y, z: me.z, vertical: next.verticalCorrected })); } catch {}
        }
      }
      await this.stepSimulation(now, meta);
      return;
    }


    if (payload.t === "combatSync") { sendLoadout(socket, me, { action:'sync', accepted:true }); return; }

    if (payload.t === "fire") {
      const seq=Math.max(0,Math.floor(finiteNumber(payload.seq,0)));const requestedWeapon=safeWeapon(payload.weapon||me.weapon);
      if(requestedWeapon!==me.weapon){me.weapon=requestedWeapon;me.reloadAt=0;me.reloadWeapon="";me.combatRev=Math.max(0,finiteNumber(me.combatRev,0))+1;this.broadcast({t:'weapon',id:me.clientId,weapon:requestedWeapon},socket);}
      me.yaw=finiteNumber(payload.yaw,me.yaw);me.pitch=clamp(finiteNumber(payload.pitch,me.pitch),-1.4,1.4);
      const weapon=safeWeapon(me.weapon),spec=settings.weapons[weapon],unlimited=!!me.godMode;me.ammo=normalizeAmmo(me.ammo);
      if(unlimited)refreshUnlimitedResources(me);
      if(me.hp<=0||now<me.wastedUntil){socket.serializeAttachment(me);sendLoadout(socket,me,{action:'fire',seq,accepted:false,reason:'dead'});return;}
      if(!unlimited&&me.reloadAt){socket.serializeAttachment(me);sendLoadout(socket,me,{action:'fire',seq,accepted:false,reason:'reloading'});return;}
      if(now-me.lastShot<spec.cooldownMs){const retryAfterMs=Math.max(1,Math.ceil(spec.cooldownMs-(now-me.lastShot)));socket.serializeAttachment(me);sendLoadout(socket,me,{action:'fire',seq,accepted:false,reason:'cooldown',retryAfterMs});return;}
      if(!unlimited&&me.ammo[weapon]<=0){me.reloadAt=now+spec.reloadMs;me.reloadWeapon=weapon;me.combatRev=Math.max(0,finiteNumber(me.combatRev,0))+1;socket.serializeAttachment(me);sendLoadout(socket,me,{action:'fire',seq,accepted:false,reason:'empty'});this.broadcast({t:'reload',id:me.clientId,weapon,reloadAt:me.reloadAt},socket);return;}
      me.lastShot=now;if(!unlimited)me.ammo[weapon]-=1;const autoReloadStarted=!unlimited&&me.ammo[weapon]===0;if(autoReloadStarted){me.reloadAt=now+spec.reloadMs;me.reloadWeapon=weapon;}me.combatRev=Math.max(0,finiteNumber(me.combatRev,0))+1;socket.serializeAttachment(me);
      const cp=Math.cos(me.pitch),sp=Math.sin(me.pitch),fx=-Math.sin(me.yaw)*cp,fy=sp,fz=-Math.cos(me.yaw)*cp,pellets=weapon==='shotgun'?8:1;
      for(let i=0;i<pellets;i++){let sx=fx,sy=fy,sz=fz;if(weapon==='shotgun'){const spread=.075;sx+=(Math.random()-.5)*spread;sy+=(Math.random()-.5)*spread*.75;sz+=(Math.random()-.5)*spread;const n=Math.hypot(sx,sy,sz)||1;sx/=n;sy/=n;sz/=n;}this.spawnBullet({ownerId:me.clientId,ownerTeam:safeTeam(me.team),damage:spec.damage,weapon,lifetimeMs:WEAPONS[weapon].lifetimeMs,x:me.x+sx*.62,y:me.y+PLAYER_HEIGHT-.18+sy*.25,z:me.z+sz*.62,vx:sx*spec.speed,vy:sy*spec.speed,vz:sz*spec.speed,now,consumeAmmo:i===0&&!unlimited});}
      sendLoadout(socket,me,{action:'fire',seq,accepted:true,unlimited});if(autoReloadStarted)this.broadcast({t:'reload',id:me.clientId,weapon,reloadAt:me.reloadAt},socket);await this.stepSimulation(now,meta);return;
    }

    if(payload.t==='throw'){
      const kind=safeEquipmentKind(payload.kind),unlimited=!!me.godMode;me.equipment=normalizeEquipment(me.equipment);if(unlimited)refreshUnlimitedResources(me);
      if(me.hp<=0||now<me.wastedUntil||now-finiteNumber(me.lastThrow,0)<360||(!unlimited&&me.equipment[kind]<=0))return;
      me.yaw=finiteNumber(payload.yaw,me.yaw);me.pitch=clamp(finiteNumber(payload.pitch,me.pitch),-1.25,1.15);
      const charge=clamp(finiteNumber(payload.charge,1),0,1),throwSpeed=19+charge*10.5,loft=5.0+charge*2.2;
      me.lastThrow=now;if(!unlimited)me.equipment[kind]-=1;socket.serializeAttachment(me);try{socket.send(JSON.stringify({t:'equipment',equipment:me.equipment,unlimited}));}catch{}
      const cp=Math.cos(me.pitch),fx=-Math.sin(me.yaw)*cp,fy=Math.sin(me.pitch),fz=-Math.cos(me.yaw)*cp;
      const id=crypto.randomUUID().replace(/-/g,'').slice(0,12),g={id,kind,ownerId:me.clientId,ownerTeam:safeTeam(me.team),x:me.x+fx*.82,y:me.y+PLAYER_HEIGHT-.22,z:me.z+fz*.82,vx:fx*throwSpeed,vy:fy*throwSpeed+loft,vz:fz*throwSpeed,born:now,lastAt:now,fuseAt:now+(kind==='sticky'?1850:1650),stuck:false,lastBroadcast:0};
      this.throwables.set(id,g);this.broadcast({t:'throwable',...g});await this.stepSimulation(now,meta);return;
    }

    if (payload.t === "reload") {
      const seq=Math.max(0,Math.floor(finiteNumber(payload.seq,0)));const requestedWeapon=safeWeapon(payload.weapon||me.weapon);
      if(requestedWeapon!==me.weapon){me.weapon=requestedWeapon;me.reloadAt=0;me.reloadWeapon="";me.combatRev=Math.max(0,finiteNumber(me.combatRev,0))+1;this.broadcast({t:'weapon',id:me.clientId,weapon:requestedWeapon},socket);}
      const weapon=safeWeapon(me.weapon),spec=settings.weapons[weapon];me.ammo=normalizeAmmo(me.ammo);
      if(me.hp<=0||now<me.wastedUntil){socket.serializeAttachment(me);sendLoadout(socket,me,{action:'reload',seq,accepted:false,reason:'dead'});return;}
      if(me.godMode){refreshUnlimitedResources(me);socket.serializeAttachment(me);sendLoadout(socket,me,{action:'reload',seq,accepted:true,reason:'unlimited',unlimited:true});return;}
      if(me.reloadAt){socket.serializeAttachment(me);sendLoadout(socket,me,{action:'reload',seq,accepted:true,reason:'already'});return;}
      if(me.ammo[weapon]>=WEAPONS[weapon].mag){socket.serializeAttachment(me);sendLoadout(socket,me,{action:'reload',seq,accepted:false,reason:'full'});return;}
      me.reloadAt=now+spec.reloadMs;me.reloadWeapon=weapon;me.combatRev=Math.max(0,finiteNumber(me.combatRev,0))+1;socket.serializeAttachment(me);sendLoadout(socket,me,{action:'reload',seq,accepted:true});this.broadcast({t:'reload',id:me.clientId,weapon,reloadAt:me.reloadAt},socket);return;
    }

    if (payload.t === "weapon") {
      if(me.hp<=0||now<me.wastedUntil){sendLoadout(socket,me,{action:'weapon',seq:Math.max(0,Math.floor(finiteNumber(payload.seq,0))),accepted:false,reason:'dead'});return;}
      const weapon=safeWeapon(payload.weapon),seq=Math.max(0,Math.floor(finiteNumber(payload.seq,0)));
      if(weapon!==me.weapon){me.weapon=weapon;me.reloadAt=0;me.reloadWeapon="";me.ammo=normalizeAmmo(me.ammo);me.combatRev=Math.max(0,finiteNumber(me.combatRev,0))+1;socket.serializeAttachment(me);this.broadcast({t:'weapon',id:me.clientId,weapon},socket);}
      sendLoadout(socket,me,{action:'weapon',seq,accepted:true});return;
    }

    if (payload.t === "god") {
      me.godMode = !!payload.enabled;
      if(me.godMode)refreshUnlimitedResources(me);
      me.combatRev=Math.max(0,finiteNumber(me.combatRev,0))+1;
      socket.serializeAttachment(me);
      this.broadcast({ t: "god", id: me.clientId, enabled: me.godMode });
      if(me.godMode){try{socket.send(JSON.stringify({t:'equipment',equipment:me.equipment,unlimited:true}));}catch{}sendLoadout(socket,me,{action:'god',accepted:true,unlimited:true});}
      return;
    }

    if (payload.t === "team") {
      const nextTeam = safeTeam(payload.team);
      if (nextTeam === safeTeam(me.team)) return;
      const spawn = spawnForTeam(nextTeam, Math.floor(Math.random() * TEAM_SPAWNS[nextTeam].length));
      me = {
        ...me, ...spawn, team: nextTeam, hp: 100, wastedUntil: 0, lastHitAt: 0, regenAt: 0,
        weapon: "pistol", ammo: freshAmmo(), equipment: freshEquipment(), reloadAt: 0, reloadWeapon: "",
        lastShot: 0, lastThrow: 0, ads: false, combatRev: Math.max(0, finiteNumber(me.combatRev, 0)) + 1,
        moveCredit: settings.movement.runSpeed * 0.04,
      };
      if (me.godMode) refreshUnlimitedResources(me);
      socket.serializeAttachment(me);
      this.broadcast({ t: "teamChange", player: publicPlayer(me) });
      sendLoadout(socket, me, { action: "team", accepted: true, unlimited: !!me.godMode });
      try { socket.send(JSON.stringify({ t: "equipment", equipment: me.equipment, unlimited: !!me.godMode })); } catch {}
      const players = this.liveSockets().length;
      await this.updateDirectory(players, meta);
      return;
    }

    if (payload.t === "adminPlayer") {
      if (!isRoomAdmin(meta, me.clientId)) {
        try { socket.send(JSON.stringify({ t: "notice", tone: "error", text: "Admin access required." })); } catch {}
        return;
      }
      const targetId = safeClientId(payload.targetId);
      const targetSocket = this.ctx.getWebSockets().find((s) => {
        const p = s.deserializeAttachment() || {};
        return p.clientId === targetId && !p.replaced;
      });
      if (!targetSocket) {
        try { socket.send(JSON.stringify({ t: "notice", tone: "error", text: "Player is no longer connected." })); } catch {}
        return;
      }
      let target = targetSocket.deserializeAttachment() || {};
      const action = String(payload.action || "");
      if (action === "god") {
        target.godMode = !!payload.enabled;
        if (target.godMode) refreshUnlimitedResources(target);
        target.combatRev = Math.max(0, finiteNumber(target.combatRev, 0)) + 1;
        targetSocket.serializeAttachment(target);
        this.broadcast({ t: "god", id: target.clientId, enabled: target.godMode });
        if (target.godMode) {
          try { targetSocket.send(JSON.stringify({ t: "equipment", equipment: target.equipment, unlimited: true })); } catch {}
        }
        sendLoadout(targetSocket, target, { action: "god", accepted: true, unlimited: !!target.godMode });
        return;
      }
      if (action === "admin") {
        const enabled = !!payload.enabled;
        if (targetId === meta.ownerClientId && !enabled) {
          try { socket.send(JSON.stringify({ t: "notice", tone: "error", text: "The world owner cannot be demoted." })); } catch {}
          return;
        }
        const admins = new Set(normalizeAdminIds(meta));
        if (enabled) admins.add(targetId); else admins.delete(targetId);
        admins.add(meta.ownerClientId);
        meta.adminClientIds = [...admins];
        await this.putMeta(meta);
        target.admin = isRoomAdmin(meta, targetId);
        targetSocket.serializeAttachment(target);
        this.broadcast({ t: "adminRole", id: targetId, enabled: target.admin, owner: targetId === meta.ownerClientId });
        return;
      }
      return;
    }

    if (payload.t === "adminSettings") {
      if (!isRoomAdmin(meta, me.clientId)) {
        try { socket.send(JSON.stringify({ t: "notice", tone: "error", text: "Admin access required." })); } catch {}
        return;
      }
      const nextSettings = normalizeWorldSettings(payload.settings);
      meta.settings = nextSettings;
      await this.putMeta(meta);
      this.broadcast({ t: "settings", settings: nextSettings, by: me.clientId });
      return;
    }


    if (payload.t === "adminBots") {
      if (!isRoomAdmin(meta, me.clientId)) {
        try { socket.send(JSON.stringify({ t: "notice", tone: "error", text: "Admin access required." })); } catch {}
        return;
      }
      const blueBots = clamp(Math.floor(finiteNumber(payload.blueBots, meta.blueBots || 0)), 0, MAX_BOTS);
      const redBots = clamp(Math.floor(finiteNumber(payload.redBots, meta.redBots || 0)), 0, MAX_BOTS);
      if (blueBots + redBots > MAX_BOTS) {
        try { socket.send(JSON.stringify({ t: "notice", tone: "error", text: `Maximum ${MAX_BOTS} bots per world.` })); } catch {}
        return;
      }
      meta.blueBots = blueBots;
      meta.redBots = redBots;
      meta.botCount = blueBots + redBots;
      meta.botDifficulty = safeBotDifficulty(payload.difficulty);
      await this.putMeta(meta);
      this.bots = reconcileBots(this.bots, blueBots, redBots);
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

    if (payload.t === "respawn") {
      // v1.9.0 clients may still send this. The server owns the transition now.
      this.respawnExpiredHumans(now, settings);
      return;
    }

    if (payload.t === "ping") {
      try { socket.send(JSON.stringify({ t: "pong", at: now, clientAt: finiteNumber(payload.clientAt, 0) })); } catch {}
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

  actorBlocksAt(x,z,y,fromX,fromZ,actors) {
    for(const actor of actors||[]){
      const ax=finiteNumber(actor.x,0),ay=finiteNumber(actor.y,terrainHeight(ax,finiteNumber(actor.z,0))),az=finiteNumber(actor.z,0);
      if(y+PLAYER_HEIGHT-.08<=ay||y>=ay+PLAYER_HEIGHT-.08)continue;
      const minDist=PLAYER_RADIUS*2+.02,newDist=Math.hypot(x-ax,z-az),oldDist=Math.hypot(fromX-ax,fromZ-az);
      if(newDist<minDist&&(oldDist>=minDist||newDist<oldDist-.002))return true;
    }
    return false;
  }

  validateHumanState(me, payload, now, settings) {
    const desiredX = clamp(finiteNumber(payload.x, me.x), -ARENA_LIMIT, ARENA_LIMIT);
    const desiredZ = clamp(finiteNumber(payload.z, me.z), -ARENA_LIMIT, ARENA_LIMIT);
    const serverElapsed = clamp((now - finiteNumber(me.lastStateAt, now)) / 1000, 0.016, 0.75);
    const clientAt = finiteNumber(payload.clientAt, 0);
    const previousClientAt = finiteNumber(me.lastClientStateAt, 0);
    const clientElapsed = clientAt > previousClientAt && previousClientAt > 0 ? clamp((clientAt - previousClientAt) / 1000, 0.016, 0.15) : 0;
    const elapsed = Math.max(serverElapsed, clientElapsed);
    const ads = !!payload.ads;
    const allowedSpeed = ads ? settings.movement.walkSpeed : settings.movement.runSpeed;
    const creditCap = allowedSpeed * 0.25 + 0.12;
    const priorCredit = clamp(finiteNumber(me.moveCredit, allowedSpeed * 0.04), 0, creditCap);
    const availableCredit = Math.min(creditCap, priorCredit + allowedSpeed * elapsed);
    const maxDistance = availableCredit + 0.04;
    let dx = desiredX - me.x, dz = desiredZ - me.z;
    const requestedDistance = Math.hypot(dx, dz);
    let corrected = requestedDistance > maxDistance + 0.001;
    if (requestedDistance > maxDistance && requestedDistance > 0) {
      const scale = maxDistance / requestedDistance;
      dx *= scale; dz *= scale;
    }

    let x = me.x, z = me.z, walkY = me.y;
    const startSupport=worldSupportHeight(me.x,me.z,me.y),startedGrounded=Math.abs(me.y-startSupport)<=.24;
    const travel = Math.hypot(dx, dz),solidActors=this.solidActors(me.clientId,now);
    const steps = Math.max(1, Math.ceil(travel / 0.16));
    const sx = dx / steps, sz = dz / steps;
    for (let i = 0; i < steps; i += 1) {
      const fromX=x,fromZ=z,tryX = clamp(x + sx, -ARENA_LIMIT, ARENA_LIMIT);
      if (!worldBlocked(tryX, z, PLAYER_RADIUS, walkY)&&!this.actorBlocksAt(tryX,z,walkY,fromX,fromZ,solidActors)) x = tryX; else corrected = true;
      if(startedGrounded)walkY=worldSupportHeight(x,z,walkY);
      const beforeZx=x,beforeZz=z,tryZ = clamp(z + sz, -ARENA_LIMIT, ARENA_LIMIT);
      if (!worldBlocked(x, tryZ, PLAYER_RADIUS, walkY)&&!this.actorBlocksAt(x,tryZ,walkY,beforeZx,beforeZz,solidActors)) z = tryZ; else corrected = true;
      if(startedGrounded)walkY=worldSupportHeight(x,z,walkY);
    }

    const rawRequestedY = finiteNumber(payload.y, me.y);
    // Grounded stair movement changes Y because the support surface rises, not
    // because the player jumped. Accept the swept tread height before applying
    // ceiling logic so a delayed packet cannot be mistaken for a jump through a stair.
    const followsWalkSurface=startedGrounded&&Math.abs(rawRequestedY-walkY)<=.34;
    const ceiling=followsWalkSurface?{y:walkY,hit:false}:resolveCeilingCollision(me.y,rawRequestedY,x,z);
    const requestedY=ceiling.y;
    const ground = worldSupportHeight(x,z,Math.max(walkY,requestedY));
    const maxAirHeight = ground + settings.movement.jumpHeight + 0.45;
    const y = clamp(requestedY, ground, maxAirHeight);
    const verticalCorrected = ceiling.hit||Math.abs(y - rawRequestedY) > 0.02;
    if (verticalCorrected || Math.hypot(x - desiredX, z - desiredZ) > 0.08) corrected = true;
    const actualTravel = Math.hypot(x - me.x, z - me.z);

    return {
      corrected,
      verticalCorrected,
      player: {
        ...me, x, y, z, ads, lastStateAt: now, lastClientStateAt: clientAt > 0 ? clientAt : previousClientAt,
        moveCredit: Math.max(0, availableCredit - actualTravel),
        yaw: finiteNumber(payload.yaw, me.yaw),
        pitch: clamp(finiteNumber(payload.pitch, me.pitch), -1.4, 1.4),
      },
    };
  }


  spawnBullet({ ownerId, ownerTeam, damage, weapon, lifetimeMs, x, y, z, vx, vy, vz, now, consumeAmmo=true }) {
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const safe = safeWeapon(weapon);
    const bullet = {
      id, ownerId, ownerTeam: safeTeam(ownerTeam), damage, weapon: safe,
      penetrationPower: safe === "sniper" ? Math.max(1, damage) : 0,
      hitTargets: new Set(),
      traveledDistance: 0,
      lifetimeMs: lifetimeMs || WEAPONS[safe].lifetimeMs, x, y, z, vx, vy, vz, born: now, lastAt: now,
    };
    this.bullets.set(id, bullet);
    this.broadcast({ t: "shot", id, ownerId, ownerTeam: bullet.ownerTeam, damage, weapon: safe, lifetimeMs: bullet.lifetimeMs, x, y, z, vx, vy, vz, consumeAmmo, at: now });
  }

  async stepSimulation(now, meta) {
    // Human respawn is server-authoritative. Never depend on a dead client
    // sending a one-shot respawn request. Any room activity advances expired
    // human respawns, which also keeps all clients on the same life state.
    const settings = normalizeWorldSettings(meta.settings);
    this.respawnExpiredHumans(now, settings);

    if (!this.lastSimAt) { this.lastSimAt = now; return; }
    const simDeltaMs = now - this.lastSimAt;
    if (simDeltaMs < SIM_MIN_STEP_MS) return;
    const elapsed = Math.min(0.12, Math.max(0, simDeltaMs / 1000));
    this.lastSimAt = now;
    if (elapsed <= 0) return;

    this.stepBots(now, elapsed, settings, meta);
    this.stepThrowables(now,elapsed,settings);
    this.stepBullets(now, settings);
    this.stepRegeneration(now, settings);

    if (now - this.lastBotBroadcastAt >= 100) {
      this.lastBotBroadcastAt = now;
      if (this.bots.length) this.broadcast({ t: "botState", bots: this.bots.map(publicBot) });
    }
    if (now - this.lastPersistAt >= 2000) {
      this.lastPersistAt = now;
      try { await this.ctx.storage.put("bots", this.bots); } catch {}
    }
    if (now - this.lastDirectoryHeartbeatAt >= DIRECTORY_HEARTBEAT_MS) {
      this.lastDirectoryHeartbeatAt = now;
      await this.updateDirectory(this.ctx.getWebSockets().length, meta);
    }
    if (now >= meta.expiresAt - 60_000) {
      meta.expiresAt = now + ROOM_MAX_LIFETIME_MS;
      await this.putMeta(meta);
      await this.updateDirectory(this.ctx.getWebSockets().length, meta);
    }
  }

  respawnExpiredHumans(now, settings = normalizeWorldSettings()) {
    for (const socket of this.ctx.getWebSockets()) {
      const player = socket.deserializeAttachment() || {};
      if (!player.clientId || player.replaced || player.hp > 0) continue;
      if (!player.wastedUntil || now < player.wastedUntil) continue;

      const team = safeTeam(player.team);
      const spawn = spawnForTeam(
        team,
        Math.floor(Math.random() * TEAM_SPAWNS[team].length),
      );
      const respawned = {
        ...player,
        ...spawn,
        hp: 100,
        wastedUntil: 0,
        lastHitAt: 0,
        regenAt: 0,
        weapon: "pistol",
        ammo: freshAmmo(),
        equipment: freshEquipment(),
        reloadAt: 0,
        reloadWeapon: "",
        combatRev: Math.max(0, finiteNumber(player.combatRev, 0)) + 1,
        ads: false,
        lastStateAt: now,
        moveCredit: settings.movement.runSpeed * 0.04,
      };
      socket.serializeAttachment(respawned);
      this.broadcast({ t: "respawn", player: publicPlayer(respawned) });
    }
  }

  stepRegeneration(now, settings) {
    if (settings.combat.regenPerSecond <= 0) return;
    for (const socket of this.ctx.getWebSockets()) {
      const player = socket.deserializeAttachment() || {};
      if (!player.clientId || player.replaced || player.hp <= 0 || player.hp >= 100 || now < (player.wastedUntil || 0)) continue;
      if (!player.regenAt) player.regenAt = (player.lastHitAt || now) + settings.combat.regenDelayMs;
      if (now < player.regenAt) continue;
      const ticks = 1 + Math.floor((now - player.regenAt) / HEALTH_REGEN_TICK_MS);
      player.hp = Math.min(100, player.hp + ticks * settings.combat.regenPerSecond * (HEALTH_REGEN_TICK_MS / 1000));
      player.regenAt += ticks * HEALTH_REGEN_TICK_MS;
      socket.serializeAttachment(player);
      this.broadcast({ t: "health", id: player.clientId, hp: player.hp });
    }

    for (const bot of this.bots) {
      if (bot.hp <= 0 || bot.hp >= 100 || now < (bot.wastedUntil || 0)) continue;
      if (!bot.regenAt) bot.regenAt = (bot.lastHitAt || now) + settings.combat.regenDelayMs;
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

    for (let i = 0; i < this.bots.length; i += 1) {
      const bot = this.bots[i];
      if (bot.hp <= 0) {
        if (now >= bot.wastedUntil) {
          const spawn = spawnForTeam(bot.team, i + Math.floor(Math.random() * TEAM_SPAWNS[safeTeam(bot.team)].length));
          Object.assign(bot, spawn, { hp: 100, wastedUntil: 0, regenAt: 0, weapon: "assault", ammo: freshAmmo(), reloadAt: 0, reloadWeapon: "", lastHitAt: 0, flashUntil: 0, flashSpin: 0 });
          this.broadcast({ t: "respawn", player: publicBot(bot) });
        }
        continue;
      }
      if (bot.reloadAt && now >= bot.reloadAt) {
        bot.reloadAt = 0;
        bot.reloadWeapon = "";
        bot.ammo = normalizeAmmo(bot.ammo);
        bot.ammo.assault = WEAPONS.assault.mag;
      }
      if(now<finiteNumber(bot.flashUntil,0)){
        bot.yaw+=dt*(bot.flashSpin||2.2);
        const step=settings.movement.walkSpeed*.22*dt,dx=Math.sin(bot.yaw)*step,dz=Math.cos(bot.yaw)*step;
        if(!worldBlocked(bot.x+dx,bot.z+dz,.34)){bot.x+=dx;bot.z+=dz;bot.y=worldSupportHeight(bot.x,bot.z,bot.y);}
        continue;
      }

      const targetCandidates = [];
      const consider = (kind, target, socket = null) => {
        if (!target || target.hp <= 0 || safeTeam(target.team) === safeTeam(bot.team) || target.id === bot.id || target.clientId === bot.id) return;
        const tx = finiteNumber(target.x, 0), tz = finiteNumber(target.z, 0);
        const dx = tx - bot.x, dz = tz - bot.z, d2 = dx * dx + dz * dz;
        targetCandidates.push({ kind, target, socket, dx, dz, d2 });
      };
      for (const h of humans) consider("human", h.target, h.socket);
      for (const other of this.bots) {
        if (other === bot || now < (other.wastedUntil || 0)) continue;
        consider("bot", other, null);
      }
      targetCandidates.sort((a,b)=>a.d2-b.d2);
      let nearest = null;
      for (const candidate of targetCandidates) { if (actorHasLineOfSight(bot, candidate.target)) { nearest = candidate; break; } }
      if (!nearest) continue;

      const d = Math.sqrt(nearest.d2) || 0.001;
      const difficulty = safeBotDifficulty(meta?.botDifficulty);
      const profile = BOT_DIFFICULTIES[difficulty];
      bot.yaw = Math.atan2(-nearest.dx, -nearest.dz);
      {
        const ux = nearest.dx / d, uz = nearest.dz / d, solidActors=this.solidActors(bot.id,now);
        const tryMove=(ax,az,step)=>{
          const fromX=bot.x,fromZ=bot.z,nx=bot.x+ax*step,nz=bot.z+az*step;
          if(!worldBlocked(nx,bot.z,.34)&&!this.actorBlocksAt(nx,bot.z,bot.y,fromX,fromZ,solidActors)&&!worldBlocked(nx,nz,.34)&&!this.actorBlocksAt(nx,nz,bot.y,fromX,fromZ,solidActors)){bot.x=nx;bot.z=nz;return true;}
          if(!worldBlocked(bot.x,nz,.34)&&!this.actorBlocksAt(bot.x,nz,bot.y,fromX,fromZ,solidActors)){bot.z=nz;return true;}
          return false;
        };
        if(d>profile.preferredRange){
          const speed=d>16?settings.movement.runSpeed*profile.moveRun:settings.movement.walkSpeed*profile.moveWalk;
          const step=Math.min(d-profile.preferredRange,speed*dt);
          if(!tryMove(ux,uz,step))tryMove(-uz,ux,step*.82)||tryMove(uz,-ux,step*.82);
        }else if(profile.strafe>0&&d<=profile.range){
          if(!bot.strafeUntil||now>=bot.strafeUntil){bot.strafeDir=Math.random()<.5?-1:1;bot.strafeUntil=now+650+Math.random()*850;}
          const sx=-uz*(bot.strafeDir||1),sz=ux*(bot.strafeDir||1),step=settings.movement.walkSpeed*profile.strafe*dt;
          if(!tryMove(sx,sz,step)){bot.strafeDir=-(bot.strafeDir||1);tryMove(-sx,-sz,step);}
        }
        bot.y=worldSupportHeight(bot.x,bot.z,bot.y);
      }

      const target = nearest.target;
      const botFireDelay = Math.max(settings.weapons.assault.cooldownMs * profile.fireScale, 70);
      if (d <= profile.range && now - bot.lastShot >= Math.max(bot.nextShotDelay || 0, botFireDelay)) {
        bot.ammo = normalizeAmmo(bot.ammo);
        if (bot.ammo.assault <= 0) {
          if (!bot.reloadAt) { bot.reloadAt = now + settings.weapons.assault.reloadMs; bot.reloadWeapon = "assault"; }
          continue;
        }
        bot.lastShot = now;
        bot.nextShotDelay = botFireDelay + profile.reactionBase + Math.floor(Math.random() * profile.reactionJitter);
        bot.ammo.assault -= 1;
        if (bot.ammo.assault === 0) { bot.reloadAt = now + settings.weapons.assault.reloadMs; bot.reloadWeapon = "assault"; }
        const tx = finiteNumber(target.x, 0) - bot.x;
        const ty = (finiteNumber(target.y, terrainHeight(target.x || 0, target.z || 0)) + 1.05) - (bot.y + 1.28);
        const tz = finiteNumber(target.z, 0) - bot.z;
        const dist = Math.hypot(tx, ty, tz) || 1;
        const spread = profile.spreadBase + Math.min(0.09, d * profile.spreadDistance);
        const fx = tx / dist + (Math.random() - 0.5) * spread;
        const fy = ty / dist + (Math.random() - 0.5) * spread * 0.65;
        const fz = tz / dist + (Math.random() - 0.5) * spread;
        const norm = Math.hypot(fx, fy, fz) || 1;
        this.spawnBullet({
          ownerId: bot.id, ownerTeam: safeTeam(bot.team), damage: settings.weapons.assault.damage, weapon: "assault",
          lifetimeMs: WEAPONS.assault.lifetimeMs,
          x: bot.x + (fx / norm) * 0.55, y: bot.y + 1.25, z: bot.z + (fz / norm) * 0.55,
          vx: (fx / norm) * settings.weapons.assault.speed, vy: (fy / norm) * settings.weapons.assault.speed, vz: (fz / norm) * settings.weapons.assault.speed, now,
        });
      }
    }
  }

  stepThrowables(now,dt,settings){for(const [id,g] of this.throwables){if(g.stuckTo){const a=this.findActorState(g.stuckTo);if(a){g.x=a.x;g.y=a.y+1.0;g.z=a.z;}else g.stuckTo='';}if(!g.stuck){const elapsed=Math.min(.12,Math.max(0,(now-g.lastAt)/1000));g.lastAt=now;const steps=Math.max(1,Math.ceil(elapsed/.018));for(let i=0;i<steps&&!g.stuck;i++){const st=elapsed/steps;g.vy-=18*st;const px=g.x,py=g.y,pz=g.z;g.x+=g.vx*st;g.y+=g.vy*st;g.z+=g.vz*st;const actor=this.findStickyTarget(g);if(g.kind==='sticky'&&actor){g.stuck=true;g.stuckTo=actor;break;}const hitGround=g.y<=terrainHeight(g.x,g.z)+.08,hitObj=segmentHitsObstacle(px,py,pz,g.x,g.y,g.z);if(hitGround||hitObj){this.broadcast({t:'throwableImpact',id:g.id,kind:g.kind,x:px,y:py,z:pz});if(g.kind==='sticky'){g.x=px;g.y=Math.max(py,terrainHeight(px,pz)+.10);g.z=pz;g.vx=g.vy=g.vz=0;g.stuck=true;}else{g.x=px;g.y=Math.max(py,terrainHeight(px,pz)+.12);g.z=pz;g.vy=Math.abs(g.vy)*.42;g.vx*=-.42;g.vz*=-.42;if(Math.hypot(g.vx,g.vy,g.vz)<2)g.stuck=true;}}}}if(now-g.lastBroadcast>75){g.lastBroadcast=now;this.broadcast({t:'throwableState',id:g.id,x:g.x,y:g.y,z:g.z,vx:g.vx,vy:g.vy,vz:g.vz,stuck:g.stuck});}if(now>=g.fuseAt){if(g.kind==='flash')this.detonateFlash(g,now);else this.explodeSticky(g,now,settings);this.throwables.delete(id);this.broadcast({t:'throwableEnd',id:g.id});}}}
  findActorState(id){for(const socket of this.ctx.getWebSockets()){const p=socket.deserializeAttachment()||{};if(p.clientId===id&&!p.replaced)return p;}return this.bots.find(b=>b.id===id)||null;}
  findStickyTarget(g){for(const socket of this.ctx.getWebSockets()){const p=socket.deserializeAttachment()||{};if(!p.clientId||p.replaced||p.clientId===g.ownerId||p.hp<=0||safeTeam(p.team)===g.ownerTeam)continue;if(Math.hypot(p.x-g.x,p.y+1-g.y,p.z-g.z)<.62)return p.clientId;}for(const b of this.bots){if(b.id===g.ownerId||b.hp<=0||safeTeam(b.team)===g.ownerTeam)continue;if(Math.hypot(b.x-g.x,b.y+1-g.y,b.z-g.z)<.62)return b.id;}return '';}
  detonateFlash(g,now){
    const radius=22;this.broadcast({t:'flashDetonate',id:g.id,x:g.x,y:g.y,z:g.z,radius});
    for(const socket of this.ctx.getWebSockets()){
      const p=socket.deserializeAttachment()||{};if(!p.clientId||p.replaced||p.hp<=0)continue;
      const ex=p.x,ey=p.y+PLAYER_HEIGHT*.75,ez=p.z,dx=g.x-ex,dy=g.y-ey,dz=g.z-ez,dist=Math.hypot(dx,dy,dz);if(dist>radius)continue;
      if(segmentHitsObstacle(g.x,g.y,g.z,ex,ey,ez))continue;
      const cp=Math.cos(p.pitch||0),fx=-Math.sin(p.yaw||0)*cp,fy=Math.sin(p.pitch||0),fz=-Math.cos(p.yaw||0)*cp,n=dist||1,dot=(fx*dx+fy*dy+fz*dz)/n,front=.12+.88*Math.max(0,(dot+1)/2),power=clamp((1-dist/radius)*front,0,1);if(power<.035)continue;
      try{socket.send(JSON.stringify({t:'flashEffect',power,durationMs:Math.round(650+power*2850)}));}catch{}
    }
    for(const b of this.bots){if(b.hp<=0)continue;const dx=b.x-g.x,dy=b.y+1.05-g.y,dz=b.z-g.z,dist=Math.hypot(dx,dy,dz);if(dist>radius||segmentHitsObstacle(g.x,g.y,g.z,b.x,b.y+1.05,b.z))continue;const power=clamp(1-dist/radius,0,1);if(power<.05)continue;b.flashUntil=Math.max(finiteNumber(b.flashUntil,0),now+550+power*2600);b.flashSpin=(Math.random()<.5?-1:1)*(1.5+Math.random()*2.5);}
  }
  explodeSticky(g,now,settings){
    const radius=8.5,maxDamage=150;
    for(const socket of this.ctx.getWebSockets()){
      const p=socket.deserializeAttachment()||{};if(!p.clientId||p.replaced||p.hp<=0)continue;const self=p.clientId===g.ownerId;if(!self&&safeTeam(p.team)===g.ownerTeam)continue;
      const dx=p.x-g.x,dz=p.z-g.z,d=Math.hypot(dx,p.y+1-g.y,dz);if(d>radius||segmentHitsObstacle(g.x,g.y,g.z,p.x,p.y+1,p.z))continue;
      let damage=Math.max(12,Math.round(maxDamage*(1-d/radius)));if(self)damage=Math.round(damage*.72);const n=Math.hypot(dx,dz)||1;this.damageHuman(socket,p,g.ownerId,damage,'sticky',{x:dx/n*5.4,z:dz/n*5.4,y:3.5},now,g.id,settings,{distance:d});
    }
    for(const b of this.bots){if(b.hp<=0||b.id===g.ownerId||safeTeam(b.team)===g.ownerTeam)continue;const dx=b.x-g.x,dz=b.z-g.z,d=Math.hypot(dx,b.y+1-g.y,dz);if(d>radius||segmentHitsObstacle(g.x,g.y,g.z,b.x,b.y+1,b.z))continue;const damage=Math.max(12,Math.round(maxDamage*(1-d/radius))),n=Math.hypot(dx,dz)||1;this.damageBot(b,g.ownerId,damage,'sticky',{x:dx/n*5.4,z:dz/n*5.4,y:3.5},now,g.id,settings,{distance:d});}
    this.broadcast({t:'explosion',id:g.id,x:g.x,y:g.y,z:g.z,kind:'sticky',radius});
  }

  stepBullets(now, settings) {
    const humans = this.ctx.getWebSockets().map((socket) => ({ socket, player: socket.deserializeAttachment() || {} }));
    for (const [id, bullet] of this.bullets) {
      if (now - bullet.born > bullet.lifetimeMs) {
        this.endBullet(id, "expired");
        continue;
      }
      const elapsed = Math.max(0, (now - bullet.lastAt) / 1000);
      let remaining = Math.min(0.22, elapsed);
      bullet.lastAt += remaining * 1000;
      let ended = false;
      const speed = Math.max(1, Math.hypot(bullet.vx, bullet.vy, bullet.vz));
      const collisionStep = Math.min(0.01, 0.24 / speed);
      while (remaining > 0 && !ended) {
        const step = Math.min(collisionStep, remaining);
        remaining -= step;
        const previousX = bullet.x, previousY = bullet.y, previousZ = bullet.z;
        bullet.x += bullet.vx * step;
        bullet.y += bullet.vy * step;
        bullet.z += bullet.vz * step;
        bullet.traveledDistance += speed * step;

        if (Math.abs(bullet.x) > ARENA_LIMIT + 2 || Math.abs(bullet.z) > ARENA_LIMIT + 2 || bullet.y <= terrainHeight(bullet.x, bullet.z) + 0.06 || segmentHitsObstacle(previousX, previousY, previousZ, bullet.x, bullet.y, bullet.z)) {
          this.endBullet(id, "world");
          ended = true;
          break;
        }

        for (const h of humans) {
          const target = h.player;
          if (!target.clientId || target.replaced || target.clientId === bullet.ownerId || target.hp <= 0 || now < (target.wastedUntil || 0) || safeTeam(target.team) === bullet.ownerTeam || bullet.hitTargets.has(target.clientId)) continue;
          const hitZone = projectileHitZone(target, bullet);
          if (hitZone) {
            bullet.hitTargets.add(target.clientId);
            const horizontal = Math.hypot(bullet.vx, bullet.vz) || 1;
            const targetHpBefore = Math.max(1, finiteNumber(target.hp, 100));
            const baseDamage = bullet.weapon === "sniper" ? Math.max(1, bullet.penetrationPower) : bullet.damage;
            const headshot = hitZone === "head";
            const hitDamage = headshot ? (bullet.weapon === "assault" ? Math.max(100, baseDamage * HEADSHOT_MULTIPLIER) : bullet.weapon === "shotgun" ? baseDamage*1.25 : baseDamage * HEADSHOT_MULTIPLIER) : baseDamage;
            const applied = this.damageHuman(h.socket, target, bullet.ownerId, hitDamage, bullet.weapon, {
              x: bullet.vx / horizontal * 2.4,
              z: bullet.vz / horizontal * 2.4,
              y: headshot ? 1.45 : 1.1,
            }, now, bullet.id, settings, { headshot, distance: bullet.traveledDistance });
            if (!applied || bullet.weapon !== "sniper") {
              this.endBullet(id, applied ? "hit" : "blocked");
              ended = true;
              break;
            }
            bullet.penetrationPower = Math.max(0, bullet.penetrationPower - targetHpBefore);
            if (bullet.penetrationPower <= 0) {
              this.endBullet(id, "spent");
              ended = true;
              break;
            }
          }
        }
        if (ended) break;

        for (const bot of this.bots) {
          if (bot.id === bullet.ownerId || bot.hp <= 0 || now < bot.wastedUntil || safeTeam(bot.team) === bullet.ownerTeam || bullet.hitTargets.has(bot.id)) continue;
          const hitZone = projectileHitZone(bot, bullet);
          if (hitZone) {
            bullet.hitTargets.add(bot.id);
            const horizontal = Math.hypot(bullet.vx, bullet.vz) || 1;
            const targetHpBefore = Math.max(1, finiteNumber(bot.hp, 100));
            const baseDamage = bullet.weapon === "sniper" ? Math.max(1, bullet.penetrationPower) : bullet.damage;
            const headshot = hitZone === "head";
            const hitDamage = headshot ? (bullet.weapon === "assault" ? Math.max(100, baseDamage * HEADSHOT_MULTIPLIER) : bullet.weapon === "shotgun" ? baseDamage*1.25 : baseDamage * HEADSHOT_MULTIPLIER) : baseDamage;
            this.damageBot(bot, bullet.ownerId, hitDamage, bullet.weapon, {
              x: bullet.vx / horizontal * 2.4,
              z: bullet.vz / horizontal * 2.4,
              y: headshot ? 1.45 : 1.1,
            }, now, bullet.id, settings, { headshot, distance: bullet.traveledDistance });
            if (bullet.weapon !== "sniper") {
              this.endBullet(id, "hit");
              ended = true;
              break;
            }
            bullet.penetrationPower = Math.max(0, bullet.penetrationPower - targetHpBefore);
            if (bullet.penetrationPower <= 0) {
              this.endBullet(id, "spent");
              ended = true;
              break;
            }
          }
        }
      }
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
      return multiKill;
    }
    const bot = this.bots.find((b) => b.id === attackerId);
    if (bot) {
      bot.kills = Math.max(0, Math.floor(finiteNumber(bot.kills, 0))) + 1;
      return updateChain(bot);
    }
    return 0;
  }

  damageHuman(socket, target, attackerId, damage, weapon, knockback, now, bulletId = "", settings = normalizeWorldSettings(), hitMeta = {}) {
    if (target.godMode) {
      this.broadcast({ t: "blocked", attacker: attackerId, target: target.clientId, weapon, bulletId, godMode: true });
      return false;
    }
    target.hp = Math.max(0, target.hp - damage);
    target.moveCredit = Math.max(finiteNumber(target.moveCredit, 0), Math.hypot(knockback.x || 0, knockback.z || 0) * 0.75);
    target.lastHitAt = now;
    target.regenAt = now + settings.combat.regenDelayMs;
    const wasted = target.hp <= 0;
    let multiKill = 0;
    if (wasted) {
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

  damageBot(bot, attackerId, damage, weapon, knockback, now, bulletId = "", settings = normalizeWorldSettings(), hitMeta = {}) {
    bot.hp = Math.max(0, bot.hp - damage);
    bot.lastHitAt = now;
    bot.regenAt = now + settings.combat.regenDelayMs;
    const wasted = bot.hp <= 0;
    let multiKill = 0;
    if (wasted) {
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
      if (p.clientId === id) return {
        id, name: p.name || "Player", team: safeTeam(p.team), bot: false,
        kills: Math.max(0, Math.floor(finiteNumber(p.kills, 0))),
        deaths: Math.max(0, Math.floor(finiteNumber(p.deaths, 0))),
      };
    }
    const bot = this.bots.find((b) => b.id === id);
    if (bot) return {
      id, name: bot.name || "Bot", team: safeTeam(bot.team), bot: true,
      kills: Math.max(0, Math.floor(finiteNumber(bot.kills, 0))),
      deaths: Math.max(0, Math.floor(finiteNumber(bot.deaths, 0))),
    };
    return { id, name: "Player", team: "blue", bot: false, kills: 0, deaths: 0 };
  }

  killEvent(attackerId, victimId, weapon, now, meta = {}) {
    const attacker = this.findCombatant(attackerId);
    const victim = this.findCombatant(victimId);
    return {
      t: "kill", at: now, weapon: weapon === "sticky" ? "sticky" : safeWeapon(weapon), attacker, victim,
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
      try { socket.send(message); } catch {}
    }
  }

  async updateDirectory(players, meta, excludeClientId = "") {
    if (players <= 0) {
      await this.removeDirectory(meta.code);
      return;
    }
    const directory = await directoryStub(this.env);
    let blue = 0, red = 0;
    for (const socket of this.ctx.getWebSockets()) {
      const p = socket.deserializeAttachment() || {};
      if (!p.clientId || p.replaced || p.clientId === excludeClientId) continue;
      if (safeTeam(p.team) === "red") red += 1; else blue += 1;
    }
    for (const bot of this.bots || []) {
      if (safeTeam(bot.team) === "red") red += 1; else blue += 1;
    }
    try {
      await directory.fetch("https://directory.internal/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: meta.code,
          protocol: PROTOCOL_VERSION,
          players,
          bots: (this.bots || []).length,
          blueBots: (this.bots || []).filter((bot) => safeTeam(bot.team) === "blue").length,
          redBots: (this.bots || []).filter((bot) => safeTeam(bot.team) === "red").length,
          botDifficulty: safeBotDifficulty(meta.botDifficulty),
          blue,
          red,
          createdAt: meta.createdAt,
          expiresAt: meta.expiresAt,
        }),
      });
    } catch {}
  }

  async removeDirectory(code) {
    const directory = await directoryStub(this.env);
    try {
      await directory.fetch("https://directory.internal/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
    } catch {}
  }
}
