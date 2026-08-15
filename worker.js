const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 4;
const MAX_PLAYERS = 8;
const MAX_BOTS = 8;
const MAX_MESSAGE_BYTES = 24 * 1024;
const ROOM_MAX_LIFETIME_MS = 12 * 60 * 60 * 1000;
const EMPTY_ROOM_GRACE_MS = 10 * 60 * 1000;
const RECONNECT_GRACE_MS = 45 * 1000;
const PUNCH_COOLDOWN_MS = 430;
const PUNCH_DAMAGE = 25;
const PUNCH_REACH = 2.55;
const PUNCH_VERTICAL_REACH = 2.1;
const BOT_PISTOL_DAMAGE = 18;
const WEAPONS = {
  pistol: { mag: 7, reloadMs: 950, cooldownMs: 190, damage: 34, speed: 42, lifetimeMs: 3200 },
  sniper: { mag: 5, reloadMs: 2200, cooldownMs: 950, damage: 90, speed: 88, lifetimeMs: 4800 },
};
const TEAM_COLORS = { blue: "#46a7ff", red: "#ff5c6c" };
const PLAYER_HEIGHT = 1.7;
const ARENA_LIMIT = 88;
const PLAYER_COLORS = [
  "#4cc9f0", "#f72585", "#80ed99", "#ffd166",
  "#b388ff", "#ff8c42", "#90e0ef", "#f28482",
];
const BOT_COLORS = ["#78baff", "#ff8290"];

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
  return value === "sniper" ? "sniper" : "pistol";
}

function freshAmmo() {
  return { pistol: WEAPONS.pistol.mag, sniper: WEAPONS.sniper.mag };
}

function normalizeAmmo(value) {
  const v = value && typeof value === "object" ? value : {};
  return {
    pistol: clamp(Math.floor(finiteNumber(v.pistol, WEAPONS.pistol.mag)), 0, WEAPONS.pistol.mag),
    sniper: clamp(Math.floor(finiteNumber(v.sniper, WEAPONS.sniper.mag)), 0, WEAPONS.sniper.mag),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function terrainHeight(x, z) {
  const rolling = 0.52 + 0.52 * Math.sin(x * 0.052) * Math.cos(z * 0.047) + 0.28 * Math.sin((x + z) * 0.034);
  const hillA = 1.45 * Math.exp(-((x + 34) ** 2 + (z - 24) ** 2) / 900);
  const hillB = 1.15 * Math.exp(-((x - 43) ** 2 + (z + 30) ** 2) / 720);
  const low = 0.55 * Math.exp(-((x - 2) ** 2 + (z + 50) ** 2) / 520);
  return clamp(rolling + hillA + hillB - low, -0.25, 2.9);
}

function worldBlocked(x, z, radius = 0.38) {
  if (Math.abs(x) > ARENA_LIMIT || Math.abs(z) > ARENA_LIMIT) return true;
  for (const o of WORLD_OBSTACLES) {
    if (o.type === "box") {
      if (Math.abs(x - o.x) < o.w / 2 + radius && Math.abs(z - o.z) < o.d / 2 + radius) return true;
    } else {
      if (Math.hypot(x - o.x, z - o.z) < o.base * 0.52 + radius) return true;
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
    } else {
      const t = clamp((y - baseY) / o.h, 0, 1);
      const r = o.base * 0.52 * (1 - t);
      if (Math.hypot(x - o.x, z - o.z) <= r) return true;
    }
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
    koUntil: attachment.koUntil || 0,
    x: attachment.x,
    y: attachment.y,
    z: attachment.z,
    yaw: attachment.yaw,
    pitch: attachment.pitch,
    weapon: safeWeapon(attachment.weapon),
    ammo: normalizeAmmo(attachment.ammo),
    reloadAt: attachment.reloadAt || 0,
    reloadWeapon: attachment.reloadWeapon || "",
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
    koUntil: bot.koUntil || 0,
    x: bot.x,
    y: bot.y,
    z: bot.z,
    yaw: bot.yaw,
    pitch: 0,
    weapon: "pistol",
  };
}

function spawnFor(index) {
  const points = [
    [-58, -58], [58, 58], [-58, 58], [58, -58],
    [0, -66], [66, 0], [0, 66], [-66, 0],
    [-42, 4], [42, -4], [-6, 42], [6, -42],
  ];
  const p = points[index % points.length];
  return { x: p[0], y: terrainHeight(p[0], p[1]), z: p[1] };
}

function makeBot(index) {
  const spawn = spawnFor(index + 2);
  const team = index % 2 === 0 ? "red" : "blue";
  return {
    id: `bot-${index + 1}`,
    name: `Bot ${index + 1}`,
    team,
    color: TEAM_COLORS[team],
    ...spawn,
    yaw: 0,
    hp: 100,
    koUntil: 0,
    lastPunch: 0,
    lastShot: 0,
    nextShotDelay: 800 + Math.floor(Math.random() * 450),
    ammo: freshAmmo(),
    reloadAt: 0,
    reloadWeapon: "",
    weapon: "pistol",
    lastHitAt: 0,
  };
}

async function directoryStub(env) {
  return env.DIRECTORY.get(env.DIRECTORY.idFromName("global"));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (url.pathname === "/health") {
      return json(request, env, {
        ok: true,
        service: "punch-world-online",
        protocol: 3,
        version: 3,
        game: "1.6.0",
        mode: "durable-object-team-sandbox-weapons-projectiles-bots",
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
      const name = safeName(body.name);
      const botCount = clamp(Math.floor(finiteNumber(body.bots, 0)), 0, MAX_BOTS);
      if (!clientId) return json(request, env, { error: "Missing client ID." }, 400);

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const code = makeRoomCode();
        const room = env.ROOMS.get(env.ROOMS.idFromName(code));
        const created = await room.fetch(
          `https://room.internal/create?code=${code}&client=${encodeURIComponent(clientId)}&name=${encodeURIComponent(name)}&bots=${botCount}`,
          { method: "POST" },
        );
        if (created.status === 201) {
          return json(request, env, { code, maxPlayers: MAX_PLAYERS, bots: botCount }, 201);
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
    const stored = await this.ctx.storage.get("bots");
    if (Array.isArray(stored) && stored.length === meta.botCount) this.bots = stored;
    else {
      this.bots = Array.from({ length: meta.botCount }, (_, i) => makeBot(i));
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
      const botCount = clamp(Math.floor(finiteNumber(url.searchParams.get("bots"), 0)), 0, MAX_BOTS);
      const now = Date.now();
      const meta = { code, botCount, createdAt: now, expiresAt: now + ROOM_MAX_LIFETIME_MS };
      await this.ctx.storage.put("meta", meta);
      this.bots = Array.from({ length: botCount }, (_, i) => makeBot(i));
      await this.ctx.storage.put("bots", this.bots);
      await this.ctx.storage.setAlarm(meta.expiresAt);
      await this.updateDirectory(0, meta);
      return json(request, this.env, { ok: true }, 201);
    }

    const meta = await this.ctx.storage.get("meta");
    if (!meta) return json(request, this.env, { error: "World not found." }, 404);
    if (Date.now() >= meta.expiresAt) return json(request, this.env, { error: "World expired." }, 410);
    await this.ensureSimulation(meta);

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json(request, this.env, { error: "WebSocket required." }, 426);
    }

    const clientId = safeClientId(url.searchParams.get("client"));
    const name = safeName(url.searchParams.get("name"));
    const requestedTeam = safeTeam(url.searchParams.get("team"));
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

    const spawn = preserved || spawnFor(liveMembers.length);
    const colorIndex = preserved?.colorIndex ?? (liveMembers.length % PLAYER_COLORS.length);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    if (!preserved && liveMembers.length === 0 && this.bots.length) {
      const opposite = requestedTeam === "red" ? "blue" : "red";
      for (let i = 0; i < this.bots.length; i += 1) {
        this.bots[i].team = i % 2 === 0 ? opposite : requestedTeam;
        this.bots[i].color = TEAM_COLORS[this.bots[i].team];
      }
    }

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
      koUntil: finiteNumber(spawn.koUntil, 0),
      lastPunch: 0,
      lastShot: 0,
      lastHitAt: finiteNumber(spawn.lastHitAt, 0),
      weapon: safeWeapon(spawn.weapon),
      ammo: normalizeAmmo(spawn.ammo),
      reloadAt: finiteNumber(spawn.reloadAt, 0),
      reloadWeapon: safeWeapon(spawn.reloadWeapon || spawn.weapon),
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
      serverTime: Date.now(),
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
      if (me.hp > 0 || now >= me.koUntil) {
        let nx = clamp(finiteNumber(payload.x, me.x), -ARENA_LIMIT, ARENA_LIMIT);
        let nz = clamp(finiteNumber(payload.z, me.z), -ARENA_LIMIT, ARENA_LIMIT);
        if (worldBlocked(nx, nz)) { nx = me.x; nz = me.z; }
        const ground = terrainHeight(nx, nz);
        me = {
          ...me,
          x: nx,
          y: clamp(finiteNumber(payload.y, me.y), ground, ground + 8.5),
          z: nz,
          yaw: finiteNumber(payload.yaw, me.yaw),
          pitch: clamp(finiteNumber(payload.pitch, me.pitch), -1.4, 1.4),
        };
        socket.serializeAttachment(me);
        this.broadcast({
          t: "state", id: me.clientId,
          x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch,
        }, socket);
      }
      await this.stepSimulation(now, meta);
      return;
    }

    if (payload.t === "punch") {
      if (me.hp <= 0 || now < me.koUntil || now - me.lastPunch < PUNCH_COOLDOWN_MS) return;
      me.lastPunch = now;
      socket.serializeAttachment(me);
      this.broadcast({ t: "swing", id: me.clientId, at: now });
      this.humanPunch(socket, me, now);
      await this.stepSimulation(now, meta);
      return;
    }

    if (payload.t === "fire") {
      const weapon = safeWeapon(me.weapon);
      const spec = WEAPONS[weapon];
      me.ammo = normalizeAmmo(me.ammo);
      if (me.hp <= 0 || now < me.koUntil || me.reloadAt || now - me.lastShot < spec.cooldownMs) return;
      if (me.ammo[weapon] <= 0) {
        try { socket.send(JSON.stringify({ t: "loadout", weapon, ammo: me.ammo, reloadAt: me.reloadAt || 0, reloadWeapon: me.reloadWeapon || "" })); } catch {}
        return;
      }
      me.lastShot = now;
      me.ammo[weapon] -= 1;
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
        lifetimeMs: spec.lifetimeMs,
        x: me.x + fx * 0.62,
        y: me.y + PLAYER_HEIGHT - 0.18 + fy * 0.25,
        z: me.z + fz * 0.62,
        vx: fx * spec.speed,
        vy: fy * spec.speed,
        vz: fz * spec.speed,
        now,
      });
      try { socket.send(JSON.stringify({ t: "loadout", weapon, ammo: me.ammo, reloadAt: 0, reloadWeapon: "" })); } catch {}
      await this.stepSimulation(now, meta);
      return;
    }

    if (payload.t === "reload") {
      const weapon = safeWeapon(me.weapon);
      const spec = WEAPONS[weapon];
      me.ammo = normalizeAmmo(me.ammo);
      if (me.hp <= 0 || me.reloadAt || me.ammo[weapon] >= spec.mag) return;
      me.reloadAt = now + spec.reloadMs;
      me.reloadWeapon = weapon;
      socket.serializeAttachment(me);
      try { socket.send(JSON.stringify({ t: "loadout", weapon, ammo: me.ammo, reloadAt: me.reloadAt, reloadWeapon: weapon })); } catch {}
      return;
    }

    if (payload.t === "weapon") {
      if (me.hp <= 0 || now < me.koUntil) return;
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

    if (payload.t === "respawn") {
      if (me.hp > 0 || now < me.koUntil) return;
      const spawn = spawnFor(Math.floor(Math.random() * 12));
      me = { ...me, ...spawn, hp: 100, koUntil: 0, lastHitAt: 0, weapon: "pistol", ammo: freshAmmo(), reloadAt: 0, reloadWeapon: "" };
      socket.serializeAttachment(me);
      this.broadcast({ t: "respawn", player: publicPlayer(me) });
      return;
    }

    if (payload.t === "ping") {
      try { socket.send(JSON.stringify({ t: "pong", at: now })); } catch {}
      await this.stepSimulation(now, meta);
    }
  }

  humanPunch(socket, me, now) {
    const forwardX = -Math.sin(me.yaw);
    const forwardZ = -Math.cos(me.yaw);
    let best = null;

    for (const targetSocket of this.ctx.getWebSockets()) {
      if (targetSocket === socket) continue;
      const target = targetSocket.deserializeAttachment() || {};
      if (!target.clientId || target.replaced || target.hp <= 0 || now < target.koUntil || safeTeam(target.team) === safeTeam(me.team)) continue;
      const candidate = this.punchCandidate(me, target, forwardX, forwardZ);
      if (candidate && (!best || candidate.distance < best.distance)) best = { ...candidate, type: "human", socket: targetSocket, target };
    }
    for (const bot of this.bots) {
      if (bot.hp <= 0 || now < bot.koUntil || safeTeam(bot.team) === safeTeam(me.team)) continue;
      const candidate = this.punchCandidate(me, bot, forwardX, forwardZ);
      if (candidate && (!best || candidate.distance < best.distance)) best = { ...candidate, type: "bot", bot };
    }
    if (!best) return;

    const distance = Math.max(0.001, best.distance);
    const knockback = {
      x: (best.dx / distance) * 6.4,
      z: (best.dz / distance) * 6.4,
      y: 2.7,
    };
    if (best.type === "human") this.damageHuman(best.socket, best.target, me.clientId, PUNCH_DAMAGE, "punch", knockback, now);
    else this.damageBot(best.bot, me.clientId, PUNCH_DAMAGE, "punch", knockback, now);
  }

  punchCandidate(me, target, forwardX, forwardZ) {
    const dx = target.x - me.x;
    const dz = target.z - me.z;
    const dy = Math.abs(target.y - me.y);
    const distance = Math.hypot(dx, dz);
    if (distance <= 0.001 || distance > PUNCH_REACH || dy > PUNCH_VERTICAL_REACH) return null;
    const dot = (dx / distance) * forwardX + (dz / distance) * forwardZ;
    if (dot < 0.42) return null;
    return { distance, dx, dz };
  }

  spawnBullet({ ownerId, ownerTeam, damage, weapon, lifetimeMs, x, y, z, vx, vy, vz, now }) {
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const bullet = { id, ownerId, ownerTeam: safeTeam(ownerTeam), damage, weapon, lifetimeMs: lifetimeMs || WEAPONS[safeWeapon(weapon)].lifetimeMs, x, y, z, vx, vy, vz, born: now, lastAt: now };
    this.bullets.set(id, bullet);
    this.broadcast({ t: "shot", ...bullet, at: now });
  }

  async stepSimulation(now, meta) {
    const elapsed = this.lastSimAt ? Math.min(0.12, Math.max(0, (now - this.lastSimAt) / 1000)) : 0;
    this.lastSimAt = now;
    if (elapsed <= 0) return;

    this.stepBots(now, elapsed);
    this.stepBullets(now);

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

  stepBots(now, dt) {
    const humans = this.ctx.getWebSockets()
      .map((socket) => ({ socket, player: socket.deserializeAttachment() || {} }))
      .filter(({ player }) => player.clientId && !player.replaced && player.hp > 0 && now >= (player.koUntil || 0));

    for (let i = 0; i < this.bots.length; i += 1) {
      const bot = this.bots[i];
      if (bot.hp <= 0) {
        if (now >= bot.koUntil) {
          const spawn = spawnFor(i + Math.floor(Math.random() * 8));
          Object.assign(bot, spawn, { hp: 100, koUntil: 0, weapon: "pistol", ammo: freshAmmo(), reloadAt: 0, reloadWeapon: "", lastHitAt: 0 });
          this.broadcast({ t: "respawn", player: publicBot(bot) });
        }
        continue;
      }
      if (bot.reloadAt && now >= bot.reloadAt) {
        bot.reloadAt = 0;
        bot.reloadWeapon = "";
        bot.ammo = normalizeAmmo(bot.ammo);
        bot.ammo.pistol = WEAPONS.pistol.mag;
      }
      if (!humans.length) continue;

      let nearest = null;
      for (const h of humans) {
        if (safeTeam(h.player.team) === safeTeam(bot.team)) continue;
        const dx = h.player.x - bot.x;
        const dz = h.player.z - bot.z;
        const distance = Math.hypot(dx, dz);
        if (!nearest || distance < nearest.distance) nearest = { ...h, dx, dz, distance };
      }
      if (!nearest) continue;

      const d = Math.max(0.001, nearest.distance);
      bot.yaw = Math.atan2(-nearest.dx, -nearest.dz);

      if (d > 3.0) {
        const speed = d > 16 ? 4.8 : 3.3;
        const step = Math.min(speed * dt, Math.max(0, d - 2.1));
        const nx = bot.x + nearest.dx / d * step;
        const nz = bot.z + nearest.dz / d * step;
        if (!worldBlocked(nx, bot.z, 0.34)) bot.x = nx;
        if (!worldBlocked(bot.x, nz, 0.34)) bot.z = nz;
        bot.y = terrainHeight(bot.x, bot.z);
      }

      if (d <= 2.45 && now - bot.lastPunch >= 780) {
        bot.lastPunch = now;
        this.broadcast({ t: "swing", id: bot.id, at: now });
        const knockback = { x: nearest.dx / d * 4.8, z: nearest.dz / d * 4.8, y: 2.1 };
        this.damageHuman(nearest.socket, nearest.player, bot.id, 18, "punch", knockback, now);
        continue;
      }

      if (d <= 24 && now - bot.lastShot >= bot.nextShotDelay) {
        bot.ammo = normalizeAmmo(bot.ammo);
        if (bot.ammo.pistol <= 0) {
          if (!bot.reloadAt) { bot.reloadAt = now + WEAPONS.pistol.reloadMs; bot.reloadWeapon = "pistol"; }
          continue;
        }
        bot.lastShot = now;
        bot.nextShotDelay = 760 + Math.floor(Math.random() * 520);
        bot.ammo.pistol -= 1;
        const tx = nearest.player.x - bot.x;
        const ty = (nearest.player.y + 1.05) - (bot.y + 1.28);
        const tz = nearest.player.z - bot.z;
        let len = Math.hypot(tx, ty, tz) || 1;
        let fx = tx / len + (Math.random() - 0.5) * 0.06;
        let fy = ty / len + (Math.random() - 0.5) * 0.035;
        let fz = tz / len + (Math.random() - 0.5) * 0.06;
        len = Math.hypot(fx, fy, fz) || 1;
        fx /= len; fy /= len; fz /= len;
        this.spawnBullet({
          ownerId: bot.id,
          ownerTeam: safeTeam(bot.team),
          damage: BOT_PISTOL_DAMAGE,
          weapon: "pistol",
          lifetimeMs: WEAPONS.pistol.lifetimeMs,
          x: bot.x + fx * 0.55,
          y: bot.y + 1.25,
          z: bot.z + fz * 0.55,
          vx: fx * WEAPONS.pistol.speed,
          vy: fy * WEAPONS.pistol.speed,
          vz: fz * WEAPONS.pistol.speed,
          now,
        });
      }
    }
  }

  stepBullets(now) {
    const humans = this.ctx.getWebSockets().map((socket) => ({ socket, player: socket.deserializeAttachment() || {} }));
    for (const [id, bullet] of this.bullets) {
      if (now - bullet.born > bullet.lifetimeMs) {
        this.endBullet(id, "expired");
        continue;
      }
      let remaining = Math.min(0.14, Math.max(0, (now - bullet.lastAt) / 1000));
      bullet.lastAt = now;
      let ended = false;
      while (remaining > 0 && !ended) {
        const step = Math.min(0.01, remaining);
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
          if (!target.clientId || target.replaced || target.clientId === bullet.ownerId || target.hp <= 0 || now < (target.koUntil || 0) || safeTeam(target.team) === bullet.ownerTeam) continue;
          const dx = target.x - bullet.x;
          const dy = target.y + 1.0 - bullet.y;
          const dz = target.z - bullet.z;
          if (dx * dx + dy * dy + dz * dz <= 0.36) {
            const horizontal = Math.hypot(bullet.vx, bullet.vz) || 1;
            this.damageHuman(h.socket, target, bullet.ownerId, bullet.damage, bullet.weapon, {
              x: bullet.vx / horizontal * 2.4,
              z: bullet.vz / horizontal * 2.4,
              y: 1.1,
            }, now, bullet.id);
            this.endBullet(id, "hit");
            ended = true;
            break;
          }
        }
        if (ended) break;

        for (const bot of this.bots) {
          if (bot.id === bullet.ownerId || bot.hp <= 0 || now < bot.koUntil || safeTeam(bot.team) === bullet.ownerTeam) continue;
          const dx = bot.x - bullet.x;
          const dy = bot.y + 1.0 - bullet.y;
          const dz = bot.z - bullet.z;
          if (dx * dx + dy * dy + dz * dz <= 0.36) {
            const horizontal = Math.hypot(bullet.vx, bullet.vz) || 1;
            this.damageBot(bot, bullet.ownerId, bullet.damage, bullet.weapon, {
              x: bullet.vx / horizontal * 2.4,
              z: bullet.vz / horizontal * 2.4,
              y: 1.1,
            }, now, bullet.id);
            this.endBullet(id, "hit");
            ended = true;
            break;
          }
        }
      }
    }
  }

  damageHuman(socket, target, attackerId, damage, weapon, knockback, now, bulletId = "") {
    target.hp = Math.max(0, target.hp - damage);
    target.lastHitAt = now;
    const ko = target.hp <= 0;
    if (ko) target.koUntil = now + 2800;
    socket.serializeAttachment(target);
    this.broadcast({
      t: "hit", attacker: attackerId, target: target.clientId, hp: target.hp, damage, weapon, bulletId,
      ko, respawnAt: target.koUntil || 0,
      knockback: ko ? { x: knockback.x * 1.35, z: knockback.z * 1.35, y: Math.max(3.8, knockback.y) } : knockback,
    });
    if (ko) this.broadcast(this.killEvent(attackerId, target.clientId, weapon, now));
  }

  damageBot(bot, attackerId, damage, weapon, knockback, now, bulletId = "") {
    bot.hp = Math.max(0, bot.hp - damage);
    bot.lastHitAt = now;
    const ko = bot.hp <= 0;
    if (ko) bot.koUntil = now + 2800;
    this.broadcast({
      t: "hit", attacker: attackerId, target: bot.id, hp: bot.hp, damage, weapon, bulletId,
      ko, respawnAt: bot.koUntil || 0, knockback,
    });
    if (ko) this.broadcast(this.killEvent(attackerId, bot.id, weapon, now));
  }

  findCombatant(id) {
    for (const socket of this.ctx.getWebSockets()) {
      const p = socket.deserializeAttachment() || {};
      if (p.clientId === id) return { id, name: p.name || "Player", team: safeTeam(p.team), bot: false };
    }
    const bot = this.bots.find((b) => b.id === id);
    if (bot) return { id, name: bot.name || "Bot", team: safeTeam(bot.team), bot: true };
    return { id, name: "Player", team: "blue", bot: false };
  }

  killEvent(attackerId, victimId, weapon, now) {
    const attacker = this.findCombatant(attackerId);
    const victim = this.findCombatant(victimId);
    return { t: "kill", at: now, weapon: safeWeapon(weapon) === "sniper" ? "sniper" : weapon === "punch" ? "punch" : "pistol", attacker, victim };
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
    await this.updateDirectory(live.length, meta);
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

  async updateDirectory(players, meta) {
    const directory = await directoryStub(this.env);
    try {
      await directory.fetch("https://directory.internal/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: meta.code,
          players,
          bots: meta.botCount || 0,
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
