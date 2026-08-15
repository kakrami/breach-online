const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 4;
const MAX_PLAYERS = 8;
const MAX_MESSAGE_BYTES = 16 * 1024;
const ROOM_MAX_LIFETIME_MS = 12 * 60 * 60 * 1000;
const EMPTY_ROOM_GRACE_MS = 10 * 60 * 1000;
const RECONNECT_GRACE_MS = 45 * 1000;
const PUNCH_COOLDOWN_MS = 430;
const PUNCH_DAMAGE = 25;
const PUNCH_REACH = 2.55;
const PUNCH_VERTICAL_REACH = 2.1;
const ARENA_LIMIT = 38;
const PLAYER_COLORS = [
  "#4cc9f0", "#f72585", "#80ed99", "#ffd166",
  "#b388ff", "#ff8c42", "#90e0ef", "#f28482",
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function publicPlayer(attachment) {
  return {
    id: attachment.clientId,
    name: attachment.name,
    color: attachment.color,
    hp: attachment.hp,
    koUntil: attachment.koUntil || 0,
    x: attachment.x,
    y: attachment.y,
    z: attachment.z,
    yaw: attachment.yaw,
    pitch: attachment.pitch,
  };
}

function spawnFor(index) {
  const points = [
    [-12, -12], [12, 12], [-12, 12], [12, -12],
    [0, -18], [18, 0], [0, 18], [-18, 0],
  ];
  const point = points[index % points.length];
  return { x: point[0], y: 0, z: point[1] };
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
        protocol: 1,
        version: 1,
        mode: "durable-object-realtime-sandbox",
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
      if (!clientId) return json(request, env, { error: "Missing client ID." }, 400);

      for (let attempt = 0; attempt < 20; attempt += 1) {
        const code = makeRoomCode();
        const room = env.ROOMS.get(env.ROOMS.idFromName(code));
        const created = await room.fetch(
          `https://room.internal/create?code=${code}&client=${encodeURIComponent(clientId)}&name=${encodeURIComponent(name)}`,
          { method: "POST" },
        );
        if (created.status === 201) {
          return json(request, env, { code, maxPlayers: MAX_PLAYERS }, 201);
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
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/create" && request.method === "POST") {
      const existing = await this.ctx.storage.get("meta");
      if (existing) return json(request, this.env, { error: "World already exists." }, 409);

      const code = normalizeRoomCode(url.searchParams.get("code"));
      const now = Date.now();
      const meta = { code, createdAt: now, expiresAt: now + ROOM_MAX_LIFETIME_MS };
      await this.ctx.storage.put("meta", meta);
      await this.ctx.storage.setAlarm(meta.expiresAt);
      await this.updateDirectory(0, meta);
      return json(request, this.env, { ok: true }, 201);
    }

    const meta = await this.ctx.storage.get("meta");
    if (!meta) return json(request, this.env, { error: "World not found." }, 404);
    if (Date.now() >= meta.expiresAt) return json(request, this.env, { error: "World expired." }, 410);

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json(request, this.env, { error: "WebSocket required." }, 426);
    }

    const clientId = safeClientId(url.searchParams.get("client"));
    const name = safeName(url.searchParams.get("name"));
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

    const liveMembers = members.filter(({ attachment }) => attachment.clientId !== clientId);
    if (liveMembers.length >= MAX_PLAYERS) {
      return json(request, this.env, { error: "World is full." }, 409);
    }

    const spawn = preserved || spawnFor(liveMembers.length);
    const colorIndex = preserved?.colorIndex ?? (liveMembers.length % PLAYER_COLORS.length);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const attachment = {
      clientId,
      name,
      colorIndex,
      color: PLAYER_COLORS[colorIndex],
      connectedAt: Date.now(),
      replaced: false,
      x: clamp(finiteNumber(spawn.x, 0), -ARENA_LIMIT, ARENA_LIMIT),
      y: clamp(finiteNumber(spawn.y, 0), 0, 12),
      z: clamp(finiteNumber(spawn.z, 0), -ARENA_LIMIT, ARENA_LIMIT),
      yaw: finiteNumber(spawn.yaw, 0),
      pitch: clamp(finiteNumber(spawn.pitch, 0), -1.4, 1.4),
      hp: clamp(Math.floor(finiteNumber(spawn.hp, 100)), 0, 100),
      koUntil: finiteNumber(spawn.koUntil, 0),
      lastPunch: 0,
      lastHitAt: finiteNumber(spawn.lastHitAt, 0),
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
      code: meta.code,
      maxPlayers: MAX_PLAYERS,
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
    let me = socket.deserializeAttachment() || {};
    if (!me.clientId || me.replaced) return;
    const now = Date.now();

    if (payload.t === "state") {
      if (me.hp <= 0 && now < me.koUntil) return;
      me = {
        ...me,
        x: clamp(finiteNumber(payload.x, me.x), -ARENA_LIMIT, ARENA_LIMIT),
        y: clamp(finiteNumber(payload.y, me.y), 0, 12),
        z: clamp(finiteNumber(payload.z, me.z), -ARENA_LIMIT, ARENA_LIMIT),
        yaw: finiteNumber(payload.yaw, me.yaw),
        pitch: clamp(finiteNumber(payload.pitch, me.pitch), -1.4, 1.4),
      };
      socket.serializeAttachment(me);
      this.broadcast({
        t: "state", id: me.clientId,
        x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch,
      }, socket);
      return;
    }

    if (payload.t === "punch") {
      if (me.hp <= 0 || now < me.koUntil || now - me.lastPunch < PUNCH_COOLDOWN_MS) return;
      me.lastPunch = now;
      socket.serializeAttachment(me);
      this.broadcast({ t: "swing", id: me.clientId, at: now });

      const forwardX = -Math.sin(me.yaw);
      const forwardZ = -Math.cos(me.yaw);
      let best = null;

      for (const targetSocket of this.ctx.getWebSockets()) {
        if (targetSocket === socket) continue;
        const target = targetSocket.deserializeAttachment() || {};
        if (!target.clientId || target.replaced || target.hp <= 0 || now < target.koUntil) continue;

        const dx = target.x - me.x;
        const dz = target.z - me.z;
        const dy = Math.abs(target.y - me.y);
        const distance = Math.hypot(dx, dz);
        if (distance <= 0.001 || distance > PUNCH_REACH || dy > PUNCH_VERTICAL_REACH) continue;
        const dot = (dx / distance) * forwardX + (dz / distance) * forwardZ;
        if (dot < 0.42) continue;
        if (!best || distance < best.distance) best = { socket: targetSocket, target, distance, dx, dz };
      }

      if (!best) return;

      const target = best.target;
      const distance = Math.max(0.001, best.distance);
      target.hp = Math.max(0, target.hp - PUNCH_DAMAGE);
      target.lastHitAt = now;
      const ko = target.hp <= 0;
      if (ko) target.koUntil = now + 2800;
      best.socket.serializeAttachment(target);

      this.broadcast({
        t: "hit",
        attacker: me.clientId,
        target: target.clientId,
        hp: target.hp,
        damage: PUNCH_DAMAGE,
        ko,
        respawnAt: target.koUntil || 0,
        knockback: {
          x: (best.dx / distance) * (ko ? 8.6 : 6.4),
          z: (best.dz / distance) * (ko ? 8.6 : 6.4),
          y: ko ? 4.7 : 2.7,
        },
      });
      return;
    }

    if (payload.t === "respawn") {
      if (me.hp > 0 || now < me.koUntil) return;
      const index = Math.floor(Math.random() * 8);
      const spawn = spawnFor(index);
      me = { ...me, ...spawn, hp: 100, koUntil: 0, lastHitAt: 0 };
      socket.serializeAttachment(me);
      this.broadcast({ t: "respawn", player: publicPlayer(me) });
      return;
    }

    if (payload.t === "ping") {
      try { socket.send(JSON.stringify({ t: "pong", at: now })); } catch {}
    }
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
