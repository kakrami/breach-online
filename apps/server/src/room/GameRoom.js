import { roomId, sessionId } from "../../../../packages/shared/src/ids.js";
import { decodeClientCommand } from "../../../../packages/shared/src/validation.js";
import { PROTOCOL_VERSION } from "../../../../packages/shared/src/version.js";
import { SERVER_FIXED_STEP } from "../../../../packages/simulation/src/movement.js";
import { RoomRuntime } from "./RoomRuntime.js";
const TICK_MS = SERVER_FIXED_STEP * 1000;
const MAX_CATCH_UP_STEPS = 4;
const PERSIST_INTERVAL_MS = 1000;
export class GameRoom {
    state;
    ready;
    runtime = new RoomRuntime();
    timer = null;
    lastTickAt = 0;
    accumulatorMs = 0;
    lastPersistAt = 0;
    ticking = false;
    constructor(state) {
        this.state = state;
        this.ready = state.blockConcurrencyWhile(async () => {
            const persisted = await state.storage.get("room");
            this.runtime = new RoomRuntime(persisted);
        });
    }
    async fetch(request) {
        await this.ready;
        if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
            const snapshot = this.runtime.snapshot();
            return Response.json({ ok: true, protocol: PROTOCOL_VERSION, players: snapshot.players.length, snapshotSeq: snapshot.snapshotSeq });
        }
        try {
            const url = new URL(request.url);
            roomId(url.searchParams.get("room") ?? "");
            const sid = sessionId(url.searchParams.get("session") ?? "");
            const name = url.searchParams.get("name") ?? "Player";
            for (const oldSocket of this.state.getWebSockets(`session:${sid}`)) {
                try {
                    oldSocket.close(4001, "Replaced by reconnect");
                }
                catch { /* no-op */ }
            }
            const pair = new WebSocketPair();
            const client = pair[0];
            const server = pair[1];
            this.state.acceptWebSocket(server, [`session:${sid}`]);
            const now = Date.now();
            const result = this.runtime.connect(sid, name, now);
            server.serializeAttachment?.({ sessionId: sid, connectionEpoch: result.connectionEpoch });
            await this.persist(now);
            this.dispatch(result.emissions);
            this.ensureScheduler(now);
            return new Response(null, { status: 101, webSocket: client });
        }
        catch (error) {
            return Response.json({ ok: false, error: error instanceof Error ? error.message : "join_failed" }, { status: 400 });
        }
    }
    async webSocketMessage(socket, message) {
        await this.ready;
        const attachment = readAttachment(socket);
        if (!attachment)
            return;
        try {
            const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
            const command = decodeClientCommand(raw);
            const now = Date.now();
            const emissions = this.runtime.handle(attachment.sessionId, command, now);
            if (emissions.length > 0)
                await this.persist(now);
            this.dispatch(emissions);
            this.ensureScheduler(now);
        }
        catch (error) {
            const event = {
                v: PROTOCOL_VERSION,
                type: "error",
                seq: Date.now(),
                payload: { code: error instanceof Error ? error.message : "command_failed", message: "Command rejected" }
            };
            safeSend(socket, event);
        }
    }
    async webSocketClose(socket) {
        await this.ready;
        const attachment = readAttachment(socket);
        if (!attachment)
            return;
        const emissions = this.runtime.disconnect(attachment.sessionId, attachment.connectionEpoch);
        if (emissions.length > 0) {
            const now = Date.now();
            await this.persist(now);
            this.dispatch(emissions);
        }
        if (this.state.getWebSockets().length === 0)
            this.stopScheduler();
    }
    async webSocketError(socket) {
        await this.webSocketClose(socket);
    }
    ensureScheduler(now = Date.now()) {
        if (this.timer || this.ticking || this.state.getWebSockets().length === 0)
            return;
        if (this.lastTickAt <= 0)
            this.lastTickAt = now;
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.tick();
        }, TICK_MS);
    }
    stopScheduler() {
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = null;
        this.lastTickAt = 0;
        this.accumulatorMs = 0;
    }
    async tick() {
        if (this.ticking)
            return;
        this.ticking = true;
        try {
            if (this.state.getWebSockets().length === 0) {
                this.stopScheduler();
                return;
            }
            const now = Date.now();
            const elapsed = Math.max(0, Math.min(250, now - this.lastTickAt));
            this.lastTickAt = now;
            this.accumulatorMs += elapsed;
            let steps = 0;
            const emissions = [];
            while (this.accumulatorMs + 0.0001 >= TICK_MS && steps < MAX_CATCH_UP_STEPS) {
                emissions.push(...this.runtime.advanceServerStep(now, TICK_MS));
                this.accumulatorMs -= TICK_MS;
                steps += 1;
            }
            if (steps === MAX_CATCH_UP_STEPS && this.accumulatorMs >= TICK_MS)
                this.accumulatorMs = 0;
            this.dispatch(emissions);
            if (now - this.lastPersistAt >= PERSIST_INTERVAL_MS)
                await this.persist(now);
        }
        finally {
            this.ticking = false;
            this.ensureScheduler(Date.now());
        }
    }
    async persist(now = Date.now()) {
        await this.state.storage.put("room", this.runtime.toPersisted());
        this.lastPersistAt = now;
    }
    dispatch(emissions) {
        for (const emission of emissions) {
            const sockets = emission.scope === "all" ? this.state.getWebSockets() : this.state.getWebSockets(`session:${emission.sessionId}`);
            for (const socket of sockets)
                safeSend(socket, emission.event);
        }
    }
}
function readAttachment(socket) {
    const value = socket.deserializeAttachment?.();
    if (!value || typeof value !== "object")
        return null;
    const candidate = value;
    if (typeof candidate.sessionId !== "string" || typeof candidate.connectionEpoch !== "number")
        return null;
    return candidate;
}
function safeSend(socket, event) {
    try {
        if (socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify(event));
    }
    catch {
        // One socket cannot interrupt room dispatch.
    }
}
