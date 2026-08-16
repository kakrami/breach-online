const PROTOCOL_VERSION = 13;
const GAME_VERSION = "1.15.7";
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 4;
const MAX_PLAYERS = 8;
const MAX_BOTS = 8;
const MAX_MESSAGE_BYTES = 24 * 1024;
const ROOM_MAX_LIFETIME_MS = 12 * 60 * 60 * 1000;
const EMPTY_ROOM_GRACE_MS = 10 * 60 * 1000;
const RECONNECT_GRACE_MS = 45 * 1000;
const HEALTH_REGEN_TICK_MS = 500;
const WEAPONS = {
  pistol: { mag: 12, lifetimeMs: 3200 },
  assault: { mag: 12, lifetimeMs: 3400 },
  sniper: { mag: 12, lifetimeMs: 3600 },
};
const DEFAULT_WORLD_SETTINGS = Object.freeze({
  movement: Object.freeze({ runSpeed: 8.4, walkSpeed: 4.6, jumpHeight: 1.6, gravity: 23 }),
  combat: Object.freeze({ regenDelayMs: 5000, regenPerSecond: 8, respawnMs: 2800 }),
  weapons: Object.freeze({
    pistol: Object.freeze({ damage: 34, speed: 42, reloadMs: 475, cooldownMs: 190 }),
    assault: Object.freeze({ damage: 26, speed: 82, reloadMs: 650, cooldownMs: 105 }),
    sniper: Object.freeze({ damage: 120, speed: 180, reloadMs: 1100, cooldownMs: 950 }),
  }),
});
const TEAM_COLORS = { blue: "#46a7ff", red: "#ff5c6c" };
const PLAYER_HEIGHT = 1.7;
const ARENA_LIMIT = 120;
const PLAYER_COLORS = [
  "#4cc9f0", "#f72585", "#80ed99", "#ffd166",
  "#b388ff", "#ff8c42", "#90e0ef", "#f28482",
];
const BOT_COLORS = ["#78baff", "#ff8290"];
const BOT_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ moveRun: .42, moveWalk: .55, range: 18, fireScale: 1.55, reactionBase: 520, reactionJitter: 480, spreadBase: .105, spreadDistance: .0030 }),
  normal: Object.freeze({ moveRun: .58, moveWalk: .72, range: 24, fireScale: 1.00, reactionBase: 170, reactionJitter: 260, spreadBase: .032, spreadDistance: .0016 }),
  hard: Object.freeze({ moveRun: .72, moveWalk: .86, range: 30, fireScale: .78, reactionBase: 95, reactionJitter: 150, spreadBase: .018, spreadDistance: .0010 }),
  elite: Object.freeze({ moveRun: .88, moveWalk: .96, range: 36, fireScale: .62, reactionBase: 45, reactionJitter: 85, spreadBase: .009, spreadDistance: .00055 }),
});
function safeBotDifficulty(value) {
  const key = String(value || "normal").toLowerCase();
  return Object.prototype.hasOwnProperty.call(BOT_DIFFICULTIES, key) ? key : "normal";
}

const WORLD_OBSTACLES = [
  { type: "box", x: 0, z: 0, w: 8, d: 8, h: 3.2 },
  { type: "box", x: -24, z: -14, w: 12, d: 5, h: 3.0 },
  { type: "box", x: 28, z: 19, w: 11, d: 6, h: 3.8 },
  { type: "box", x: -42, z: 34, w: 7, d: 13, h: 4.2 },
  { type: "box", x: 46, z: -36, w: 9, d: 9, h: 3.4 },
  { type: "box", x: 6, z: 48, w: 14, d: 5, h: 2.8 },
  { type: "box", x: -8, z: -52, w: 6, d: 15, h: 3.1 },
  { type: "pyramid", x: -34, z: -40, base: 12, h: 8 },
  { type: "pyramid", x: 38, z: 42, base: 14, h: 10 },
  { type: "pyramid", x: 52, z: 4, base: 11, h: 7 },
  { type: "pyramid", x: -55, z: 2, base: 13, h: 9 },
  { type: "pyramid", x: 18, z: -24, base: 9, h: 6 },
  { type: "tree", x: -72, z: -28, r: .75, h: 7.5 }, { type: "tree", x: -58, z: 56, r: .82, h: 8.2 }, { type: "tree", x: -38, z: 72, r: .70, h: 7.0 }, { type: "tree", x: -18, z: -78, r: .78, h: 7.8 },
  { type: "tree", x: 16, z: 72, r: .76, h: 8.0 }, { type: "tree", x: 34, z: -66, r: .82, h: 8.4 }, { type: "tree", x: 62, z: 58, r: .75, h: 7.6 }, { type: "tree", x: 74, z: -30, r: .86, h: 8.6 },
  { type: "tree", x: -80, z: 18, r: .72, h: 7.2 }, { type: "tree", x: 82, z: 16, r: .78, h: 8.0 }, { type: "tree", x: -48, z: -66, r: .76, h: 7.7 }, { type: "tree", x: 50, z: 76, r: .72, h: 7.4 },
  { type: "bush", x: -62, z: -6, r: 1.7, h: 1.5 }, { type: "bush", x: -31, z: 51, r: 1.9, h: 1.6 }, { type: "bush", x: -12, z: -34, r: 1.6, h: 1.4 }, { type: "bush", x: 10, z: 31, r: 1.8, h: 1.5 },
  { type: "bush", x: 31, z: -45, r: 1.7, h: 1.5 }, { type: "bush", x: 57, z: 23, r: 1.9, h: 1.6 }, { type: "bush", x: 76, z: -58, r: 1.6, h: 1.4 }, { type: "bush", x: -78, z: 62, r: 1.8, h: 1.5 },
  { type: "rock", x: -54, z: 20, r: 2.2, h: 2.7 }, { type: "rock", x: -22, z: 16, r: 1.8, h: 2.2 }, { type: "rock", x: 15, z: -58, r: 2.1, h: 2.5 }, { type: "rock", x: 44, z: 54, r: 2.3, h: 2.8 },
  { type: "rock", x: 68, z: -4, r: 1.9, h: 2.3 }, { type: "rock", x: -70, z: -52, r: 2.0, h: 2.4 }, { type: "rock", x: 8, z: 82, r: 1.8, h: 2.1 }, { type: "rock", x: 86, z: 46, r: 2.1, h: 2.6 },
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

function safeWeapon(value) {
  return value === "sniper" || value === "assault" ? value : "pistol";
}

function freshAmmo() {
  return { pistol: WEAPONS.pistol.mag, assault: WEAPONS.assault.mag, sniper: WEAPONS.sniper.mag };
}

function normalizeAmmo(value) {
  const v = value && typeof value === "object" ? value : {};
  return {
    pistol: clamp(Math.floor(finiteNumber(v.pistol, WEAPONS.pistol.mag)), 0, WEAPONS.pistol.mag),
    assault: clamp(Math.floor(finiteNumber(v.assault, WEAPONS.assault.mag)), 0, WEAPONS.assault.mag),
    sniper: clamp(Math.floor(finiteNumber(v.sniper, WEAPONS.sniper.mag)), 0, WEAPONS.sniper.mag),
  };
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
    weapons: { pistol: weapon("pistol"), assault: weapon("assault"), sniper: weapon("sniper") },
  };
}

function terrainHeight(x, z) {
  // Deterministic large-scale terrain shared by server physics and the client mesh.
  const rolling =
    0.55 +
    1.15 * Math.sin(x * 0.031) * Math.cos(z * 0.027) +
    0.72 * Math.sin((x + z) * 0.021) +
    0.48 * Math.cos((x - z) * 0.018);
  const westRidge = 8.8 * Math.exp(-((x + 62) ** 2) / 1150) * Math.exp(-((z - 20) ** 2) / 6200);
  const northHill = 10.5 * Math.exp(-((x - 34) ** 2 + (z - 68) ** 2) / 1450);
  const southHill = 7.2 * Math.exp(-((x + 20) ** 2 + (z + 67) ** 2) / 1200);
  const eastRise = 6.5 * Math.exp(-((x - 78) ** 2 + (z + 10) ** 2) / 1750);
  const centerKnoll = 4.4 * Math.exp(-((x - 8) ** 2 + (z - 4) ** 2) / 900);
  const valley = 4.0 * Math.exp(-((x + 12) ** 2 + (z - 34) ** 2) / 1050);
  return clamp(rolling + westRidge + northHill + southHill + eastRise + centerKnoll - valley, -2.4, 13.8);
}

function worldBlocked(x, z, radius = 0.38) {
  if (Math.abs(x) > ARENA_LIMIT || Math.abs(z) > ARENA_LIMIT) return true;
  for (const o of WORLD_OBSTACLES) {
    if (o.type === "box") {
      if (Math.abs(x - o.x) < o.w / 2 + radius && Math.abs(z - o.z) < o.d / 2 + radius) return true;
    } else if (o.type === "pyramid") {
      if (Math.hypot(x - o.x, z - o.z) < o.base * 0.52 + radius) return true;
    } else {
      if (Math.hypot(x - o.x, z - o.z) < o.r + radius) return true;
    }
  }
  return false;
}

function pointHitsObstacle(x, y, z) {
  for (const o of WORLD_OBSTACLES) {
    const baseY = terrainHeight(o.x, o.z);
    if (y < baseY || y > baseY + o.h + 0.15) continue;
    if (o.type === "box") {
      if (Math.abs(x - o.x) <= o.w / 2 && Math.abs(z - o.z) <= o.d / 2) return true;
    } else if (o.type === "pyramid") {
      const t = clamp((y - baseY) / o.h, 0, 1);
      const r = o.base * 0.52 * (1 - t);
      if (Math.hypot(x - o.x, z - o.z) <= r) return true;
    } else {
      if (Math.hypot(x - o.x, z - o.z) <= o.r) return true;
    }
  }
  return false;
}

function segmentHitsObstacle(x1, y1, z1, x2, y2, z2) {
  const distance = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
  const steps = Math.max(1, Math.ceil(distance / 0.18));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (pointHitsObstacle(
      x1 + (x2 - x1) * t,
      y1 + (y2 - y1) * t,
      z1 + (z2 - z1) * t,
    )) return true;
  }
  return false;
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
    weapon: safeWeapon(attachment.weapon),
    ammo: normalizeAmmo(attachment.ammo),
    reloadAt: attachment.reloadAt || 0,
    reloadWeapon: attachment.reloadWeapon || "",
    kills: Math.max(0, Math.floor(finiteNumber(attachment.kills, 0))),
    deaths: Math.max(0, Math.floor(finiteNumber(attachment.deaths, 0))),
    godMode: !!attachment.godMode,
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
    kills: Math.max(0, Math.floor(finiteNumber(bot.kills, 0))),
    deaths: Math.max(0, Math.floor(finiteNumber(bot.deaths, 0))),
  };
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
        if (!room || room.expiresAt <= now) {
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
    this.lastSimAt = 0;
    this.lastBotBroadcastAt = 0;
    this.lastPersistAt = 0;
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
      const existing = await this.ctx.storage.get("meta");
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
      const meta = { code, protocol: PROTOCOL_VERSION, ownerClientId, botCount, blueBots, redBots, botDifficulty, settings: normalizeWorldSettings(), createdAt: now, expiresAt: now + ROOM_MAX_LIFETIME_MS };
      await this.ctx.storage.put("meta", meta);
      this.bots = makeBots(blueBots, redBots);
      await this.ctx.storage.put("bots", this.bots);
      await this.ctx.storage.setAlarm(meta.expiresAt);
      await this.updateDirectory(0, meta);
      return json(request, this.env, { ok: true }, 201);
    }

    const meta = await this.ctx.storage.get("meta");
    if (!meta) return json(request, this.env, { error: "World not found." }, 404);
    if (Math.floor(finiteNumber(meta.protocol, 0)) !== PROTOCOL_VERSION) return json(request, this.env, { error: "This world was created by an older game version. Create a new world.", protocol: PROTOCOL_VERSION }, 409);
    if (Date.now() >= meta.expiresAt) return json(request, this.env, { error: "World expired." }, 410);
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
      reloadAt: finiteNumber(spawn.reloadAt, 0),
      reloadWeapon: safeWeapon(spawn.reloadWeapon || spawn.weapon),
      kills: Math.max(0, Math.floor(finiteNumber(spawn.kills, 0))),
      deaths: Math.max(0, Math.floor(finiteNumber(spawn.deaths, 0))),
      godMode: requestedGodMode,
      ads: false,
      lastStateAt: Date.now(),
      moveCredit: normalizeWorldSettings(meta.settings).movement.runSpeed * 0.04,
    };

    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server);
    await this.ctx.storage.delete("emptySince");
    await this.ctx.storage.delete(`reconnect:${clientId}`);
    await this.ctx.storage.setAlarm(meta.expiresAt);

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
      isAdmin: clientId === meta.ownerClientId,
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
    const meta = await this.ctx.storage.get("meta");
    if (!meta) return;
    await this.ensureSimulation(meta);

    let me = socket.deserializeAttachment() || {};
    if (!me.clientId || me.replaced) return;
    const now = Date.now();
    const settings = normalizeWorldSettings(meta.settings);

    if (me.reloadAt && now >= me.reloadAt) {
      const weapon = safeWeapon(me.reloadWeapon || me.weapon);
      me.reloadAt = 0;
      me.reloadWeapon = "";
      me.ammo = normalizeAmmo(me.ammo);
      me.ammo[weapon] = WEAPONS[weapon].mag;
      socket.serializeAttachment(me);
      try { socket.send(JSON.stringify({ t: "loadout", weapon: me.weapon, ammo: me.ammo, reloadAt: 0, reloadWeapon: "" })); } catch {}
    }

    if (payload.t === "state") {
      if (me.hp > 0 || now >= me.wastedUntil) {
        const next = this.validateHumanState(me, payload, now, settings);
        me = next.player;
        socket.serializeAttachment(me);
        const state = { t: "state", id: me.clientId, x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch };
        this.broadcast(state, socket);
        if (next.corrected) {
          try { socket.send(JSON.stringify({ t: "correction", x: me.x, y: me.y, z: me.z, vertical: next.verticalCorrected })); } catch {}
        }
      }
      await this.stepSimulation(now, meta);
      return;
    }


    if (payload.t === "fire") {
      const weapon = safeWeapon(me.weapon);
      const spec = settings.weapons[weapon];
      me.ammo = normalizeAmmo(me.ammo);
      if (me.hp <= 0 || now < me.wastedUntil || me.reloadAt || now - me.lastShot < spec.cooldownMs) return;
      if (me.ammo[weapon] <= 0) {
        try { socket.send(JSON.stringify({ t: "loadout", weapon, ammo: me.ammo, reloadAt: me.reloadAt || 0, reloadWeapon: me.reloadWeapon || "" })); } catch {}
        return;
      }
      me.lastShot = now;
      me.ammo[weapon] -= 1;
      if (me.ammo[weapon] === 0) { me.reloadAt = now + spec.reloadMs; me.reloadWeapon = weapon; }
      socket.serializeAttachment(me);
      const cp = Math.cos(me.pitch), sp = Math.sin(me.pitch);
      const fx = -Math.sin(me.yaw) * cp;
      const fy = sp;
      const fz = -Math.cos(me.yaw) * cp;
      this.spawnBullet({
        ownerId: me.clientId,
        ownerTeam: safeTeam(me.team),
        damage: spec.damage,
        weapon,
        lifetimeMs: WEAPONS[weapon].lifetimeMs,
        x: me.x + fx * 0.62,
        y: me.y + PLAYER_HEIGHT - 0.18 + fy * 0.25,
        z: me.z + fz * 0.62,
        vx: fx * spec.speed,
        vy: fy * spec.speed,
        vz: fz * spec.speed,
        now,
      });
      try { socket.send(JSON.stringify({ t: "loadout", weapon, ammo: me.ammo, reloadAt: me.reloadAt || 0, reloadWeapon: me.reloadWeapon || "" })); } catch {}
      await this.stepSimulation(now, meta);
      return;
    }

    if (payload.t === "reload") {
      const weapon = safeWeapon(me.weapon);
      const spec = settings.weapons[weapon];
      me.ammo = normalizeAmmo(me.ammo);
      if (me.hp <= 0 || me.reloadAt || me.ammo[weapon] >= WEAPONS[weapon].mag) return;
      me.reloadAt = now + spec.reloadMs;
      me.reloadWeapon = weapon;
      socket.serializeAttachment(me);
      try { socket.send(JSON.stringify({ t: "loadout", weapon, ammo: me.ammo, reloadAt: me.reloadAt, reloadWeapon: weapon })); } catch {}
      return;
    }

    if (payload.t === "weapon") {
      if (me.hp <= 0 || now < me.wastedUntil) return;
      const weapon = safeWeapon(payload.weapon);
      if (weapon === me.weapon) return;
      me.weapon = weapon;
      me.reloadAt = 0;
      me.reloadWeapon = "";
      me.ammo = normalizeAmmo(me.ammo);
      socket.serializeAttachment(me);
      try { socket.send(JSON.stringify({ t: "loadout", weapon, ammo: me.ammo, reloadAt: 0, reloadWeapon: "" })); } catch {}
      this.broadcast({ t: "weapon", id: me.clientId, weapon }, socket);
      return;
    }

    if (payload.t === "god") {
      me.godMode = !!payload.enabled;
      socket.serializeAttachment(me);
      this.broadcast({ t: "god", id: me.clientId, enabled: me.godMode });
      return;
    }

    if (payload.t === "adminSettings") {
      if (me.clientId !== meta.ownerClientId) {
        try { socket.send(JSON.stringify({ t: "notice", tone: "error", text: "Admin access required." })); } catch {}
        return;
      }
      const nextSettings = normalizeWorldSettings(payload.settings);
      meta.settings = nextSettings;
      await this.ctx.storage.put("meta", meta);
      this.broadcast({ t: "settings", settings: nextSettings, by: me.clientId });
      return;
    }


    if (payload.t === "adminBots") {
      if (me.clientId !== meta.ownerClientId) {
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
      await this.ctx.storage.put("meta", meta);
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

  validateHumanState(me, payload, now, settings) {
    const desiredX = clamp(finiteNumber(payload.x, me.x), -ARENA_LIMIT, ARENA_LIMIT);
    const desiredZ = clamp(finiteNumber(payload.z, me.z), -ARENA_LIMIT, ARENA_LIMIT);
    const elapsed = clamp((now - finiteNumber(me.lastStateAt, now)) / 1000, 0.016, 0.75);
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

    let x = me.x, z = me.z;
    const travel = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(travel / 0.28));
    const sx = dx / steps, sz = dz / steps;
    for (let i = 0; i < steps; i += 1) {
      const tryX = clamp(x + sx, -ARENA_LIMIT, ARENA_LIMIT);
      if (!worldBlocked(tryX, z)) x = tryX; else corrected = true;
      const tryZ = clamp(z + sz, -ARENA_LIMIT, ARENA_LIMIT);
      if (!worldBlocked(x, tryZ)) z = tryZ; else corrected = true;
    }

    const ground = terrainHeight(x, z);
    const requestedY = finiteNumber(payload.y, me.y);
    const maxAirHeight = ground + settings.movement.jumpHeight + 0.45;
    const y = clamp(requestedY, ground, maxAirHeight);
    const verticalCorrected = Math.abs(y - requestedY) > 0.02;
    if (verticalCorrected || Math.hypot(x - desiredX, z - desiredZ) > 0.08) corrected = true;
    const actualTravel = Math.hypot(x - me.x, z - me.z);

    return {
      corrected,
      verticalCorrected,
      player: {
        ...me, x, y, z, ads, lastStateAt: now,
        moveCredit: Math.max(0, availableCredit - actualTravel),
        yaw: finiteNumber(payload.yaw, me.yaw),
        pitch: clamp(finiteNumber(payload.pitch, me.pitch), -1.4, 1.4),
      },
    };
  }


  spawnBullet({ ownerId, ownerTeam, damage, weapon, lifetimeMs, x, y, z, vx, vy, vz, now }) {
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const safe = safeWeapon(weapon);
    const bullet = {
      id, ownerId, ownerTeam: safeTeam(ownerTeam), damage, weapon: safe,
      penetrationPower: safe === "sniper" ? Math.max(1, damage) : 0,
      hitTargets: new Set(),
      lifetimeMs: lifetimeMs || WEAPONS[safe].lifetimeMs, x, y, z, vx, vy, vz, born: now, lastAt: now,
    };
    this.bullets.set(id, bullet);
    this.broadcast({ t: "shot", id, ownerId, ownerTeam: bullet.ownerTeam, damage, weapon: safe, lifetimeMs: bullet.lifetimeMs, x, y, z, vx, vy, vz, at: now });
  }

  async stepSimulation(now, meta) {
    // Human respawn is server-authoritative. Never depend on a dead client
    // sending a one-shot respawn request. Any room activity advances expired
    // human respawns, which also keeps all clients on the same life state.
    const settings = normalizeWorldSettings(meta.settings);
    this.respawnExpiredHumans(now, settings);

    const elapsed = this.lastSimAt ? Math.min(0.12, Math.max(0, (now - this.lastSimAt) / 1000)) : 0;
    this.lastSimAt = now;
    if (elapsed <= 0) return;

    this.stepBots(now, elapsed, settings, meta);
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
    if (now >= meta.expiresAt - 60_000) {
      meta.expiresAt = now + ROOM_MAX_LIFETIME_MS;
      await this.ctx.storage.put("meta", meta);
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
        reloadAt: 0,
        reloadWeapon: "",
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
          Object.assign(bot, spawn, { hp: 100, wastedUntil: 0, regenAt: 0, weapon: "assault", ammo: freshAmmo(), reloadAt: 0, reloadWeapon: "", lastHitAt: 0 });
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

      let nearest = null;
      const consider = (kind, target, socket = null) => {
        if (!target || target.hp <= 0 || safeTeam(target.team) === safeTeam(bot.team) || target.id === bot.id || target.clientId === bot.id) return;
        const tx = finiteNumber(target.x, 0), tz = finiteNumber(target.z, 0);
        const dx = tx - bot.x, dz = tz - bot.z, d2 = dx * dx + dz * dz;
        if (!nearest || d2 < nearest.d2) nearest = { kind, target, socket, dx, dz, d2 };
      };
      for (const h of humans) consider("human", h.target, h.socket);
      for (const other of this.bots) {
        if (other === bot || now < (other.wastedUntil || 0)) continue;
        consider("bot", other, null);
      }
      if (!nearest) continue;

      const d = Math.sqrt(nearest.d2) || 0.001;
      const difficulty = safeBotDifficulty(meta?.botDifficulty);
      const profile = BOT_DIFFICULTIES[difficulty];
      bot.yaw = Math.atan2(-nearest.dx, -nearest.dz);
      if (d > 8.5) {
        const speed = d > 16 ? settings.movement.runSpeed * profile.moveRun : settings.movement.walkSpeed * profile.moveWalk;
        const step = Math.min(d - 7.5, speed * dt);
        const ux = nearest.dx / d, uz = nearest.dz / d;
        const attempts = [[ux, uz], [-uz, ux], [uz, -ux]];
        for (const [ax, az] of attempts) {
          const nx = bot.x + ax * step, nz = bot.z + az * step;
          if (!worldBlocked(nx, bot.z, 0.34) && !worldBlocked(nx, nz, 0.34)) { bot.x = nx; bot.z = nz; break; }
          if (!worldBlocked(bot.x, nz, 0.34)) { bot.z = nz; break; }
        }
        bot.y = terrainHeight(bot.x, bot.z);
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
        bullet.x += bullet.vx * step;
        bullet.y += bullet.vy * step;
        bullet.z += bullet.vz * step;

        if (Math.abs(bullet.x) > ARENA_LIMIT + 2 || Math.abs(bullet.z) > ARENA_LIMIT + 2 || bullet.y <= terrainHeight(bullet.x, bullet.z) + 0.06 || pointHitsObstacle(bullet.x, bullet.y, bullet.z)) {
          this.endBullet(id, "world");
          ended = true;
          break;
        }

        for (const h of humans) {
          const target = h.player;
          if (!target.clientId || target.replaced || target.clientId === bullet.ownerId || target.hp <= 0 || now < (target.wastedUntil || 0) || safeTeam(target.team) === bullet.ownerTeam || bullet.hitTargets.has(target.clientId)) continue;
          const dx = target.x - bullet.x;
          const dy = target.y + 1.0 - bullet.y;
          const dz = target.z - bullet.z;
          if (dx * dx + dy * dy + dz * dz <= 0.36) {
            bullet.hitTargets.add(target.clientId);
            const horizontal = Math.hypot(bullet.vx, bullet.vz) || 1;
            const targetHpBefore = Math.max(1, finiteNumber(target.hp, 100));
            const hitDamage = bullet.weapon === "sniper" ? Math.max(1, bullet.penetrationPower) : bullet.damage;
            const applied = this.damageHuman(h.socket, target, bullet.ownerId, hitDamage, bullet.weapon, {
              x: bullet.vx / horizontal * 2.4,
              z: bullet.vz / horizontal * 2.4,
              y: 1.1,
            }, now, bullet.id, settings);
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
          const dx = bot.x - bullet.x;
          const dy = bot.y + 1.0 - bullet.y;
          const dz = bot.z - bullet.z;
          if (dx * dx + dy * dy + dz * dz <= 0.36) {
            bullet.hitTargets.add(bot.id);
            const horizontal = Math.hypot(bullet.vx, bullet.vz) || 1;
            const targetHpBefore = Math.max(1, finiteNumber(bot.hp, 100));
            const hitDamage = bullet.weapon === "sniper" ? Math.max(1, bullet.penetrationPower) : bullet.damage;
            this.damageBot(bot, bullet.ownerId, hitDamage, bullet.weapon, {
              x: bullet.vx / horizontal * 2.4,
              z: bullet.vz / horizontal * 2.4,
              y: 1.1,
            }, now, bullet.id, settings);
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

  awardKill(attackerId, victimId) {
    if (!attackerId || attackerId === victimId) return;
    for (const socket of this.ctx.getWebSockets()) {
      const p = socket.deserializeAttachment() || {};
      if (p.clientId !== attackerId || p.replaced) continue;
      p.kills = Math.max(0, Math.floor(finiteNumber(p.kills, 0))) + 1;
      socket.serializeAttachment(p);
      return;
    }
    const bot = this.bots.find((b) => b.id === attackerId);
    if (bot) bot.kills = Math.max(0, Math.floor(finiteNumber(bot.kills, 0))) + 1;
  }

  damageHuman(socket, target, attackerId, damage, weapon, knockback, now, bulletId = "", settings = normalizeWorldSettings()) {
    if (target.godMode) {
      this.broadcast({ t: "blocked", attacker: attackerId, target: target.clientId, weapon, bulletId, godMode: true });
      return false;
    }
    target.hp = Math.max(0, target.hp - damage);
    target.moveCredit = Math.max(finiteNumber(target.moveCredit, 0), Math.hypot(knockback.x || 0, knockback.z || 0) * 0.75);
    target.lastHitAt = now;
    target.regenAt = now + settings.combat.regenDelayMs;
    const wasted = target.hp <= 0;
    if (wasted) {
      target.wastedUntil = now + settings.combat.respawnMs;
      target.deaths = Math.max(0, Math.floor(finiteNumber(target.deaths, 0))) + 1;
      this.awardKill(attackerId, target.clientId);
    }
    socket.serializeAttachment(target);
    this.broadcast({
      t: "hit", attacker: attackerId, target: target.clientId, hp: target.hp, damage, weapon, bulletId,
      wasted, respawnAt: target.wastedUntil || 0,
      knockback: wasted ? { x: knockback.x * 1.35, z: knockback.z * 1.35, y: Math.max(3.8, knockback.y) } : knockback,
    });
    if (wasted) this.broadcast(this.killEvent(attackerId, target.clientId, weapon, now));
    return true;
  }

  damageBot(bot, attackerId, damage, weapon, knockback, now, bulletId = "", settings = normalizeWorldSettings()) {
    bot.hp = Math.max(0, bot.hp - damage);
    bot.lastHitAt = now;
    bot.regenAt = now + settings.combat.regenDelayMs;
    const wasted = bot.hp <= 0;
    if (wasted) {
      bot.wastedUntil = now + settings.combat.respawnMs;
      bot.deaths = Math.max(0, Math.floor(finiteNumber(bot.deaths, 0))) + 1;
      this.awardKill(attackerId, bot.id);
    }
    this.broadcast({
      t: "hit", attacker: attackerId, target: bot.id, hp: bot.hp, damage, weapon, bulletId,
      wasted, respawnAt: bot.wastedUntil || 0, knockback,
    });
    if (wasted) this.broadcast(this.killEvent(attackerId, bot.id, weapon, now));
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

  killEvent(attackerId, victimId, weapon, now) {
    const attacker = this.findCombatant(attackerId);
    const victim = this.findCombatant(victimId);
    return { t: "kill", at: now, weapon: safeWeapon(weapon), attacker, victim };
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

    const live = this.ctx.getWebSockets().filter((ws) => ws !== socket);
    const meta = await this.ctx.storage.get("meta");
    if (!meta) return;

    if (live.length === 0) {
      const now = Date.now();
      await this.ctx.storage.put("emptySince", now);
      await this.ctx.storage.setAlarm(Math.min(meta.expiresAt, now + EMPTY_ROOM_GRACE_MS));
    }
    await this.updateDirectory(live.length, meta, attachment.replaced ? "" : (attachment.clientId || ""));
  }

  async webSocketError(socket) {
    try { socket.close(1011, "WebSocket error"); } catch {}
  }

  async alarm() {
    const meta = await this.ctx.storage.get("meta");
    if (!meta) return;
    const now = Date.now();
    const sockets = this.ctx.getWebSockets();
    const emptySince = await this.ctx.storage.get("emptySince");

    if (sockets.length === 0 && emptySince && now - emptySince >= EMPTY_ROOM_GRACE_MS) {
      await this.removeDirectory(meta.code);
      await this.ctx.storage.deleteAll();
      return;
    }

    if (now >= meta.expiresAt && sockets.length > 0) {
      meta.expiresAt = now + ROOM_MAX_LIFETIME_MS;
      await this.ctx.storage.put("meta", meta);
      await this.updateDirectory(sockets.length, meta);
    }

    await this.ctx.storage.setAlarm(meta.expiresAt);
  }

  broadcast(payload, exceptSocket = null) {
    const message = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === exceptSocket) continue;
      try { socket.send(message); } catch {}
    }
  }

  async updateDirectory(players, meta, excludeClientId = "") {
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
