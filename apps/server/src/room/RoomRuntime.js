import { newPlayerId } from "../../../../packages/shared/src/ids.js";
import { cloneInputFrame } from "../../../../packages/shared/src/player.js";
import { BREACH_VERSION, PROTOCOL_VERSION } from "../../../../packages/shared/src/version.js";
import { CLIENT_FIXED_STEP, SERVER_SUBSTEPS, simulatePlayerMovement, neutralInput } from "../../../../packages/simulation/src/movement.js";
import { spawnTransform } from "../../../../packages/world/src/alphaWorld.js";
import { PlayerRegistry } from "../players/PlayerRegistry.js";
import { TeamService } from "../players/TeamService.js";
import { SessionRegistry } from "../session/SessionRegistry.js";
const RESPAWN_MS = 2800;
const RESPAWNING_WINDOW_MS = 500;
const MAX_INPUT_QUEUE = 120;
const REPLICATION_STEP_MS = 50;
export class RoomRuntime {
    players;
    sessions;
    teams;
    revision;
    seq;
    snapshotSeq;
    replicationAccumulatorMs = 0;
    inputQueues = new Map();
    constructor(state) {
        this.revision = state?.revision ?? 0;
        this.seq = state?.seq ?? 0;
        this.snapshotSeq = state?.snapshotSeq ?? 0;
        this.players = new PlayerRegistry(state?.players ?? []);
        this.sessions = new SessionRegistry(state?.sessions ?? []);
        this.teams = new TeamService(this.players);
        for (const player of this.players.values())
            this.inputQueues.set(player.id, []);
    }
    connect(sessionId, displayName, now = Date.now()) {
        const previousSession = this.sessions.get(sessionId);
        let player;
        if (previousSession) {
            const existing = this.players.get(previousSession.playerId);
            player = existing ?? this.createPlayer(displayName);
            player = {
                ...player,
                displayName: sanitizeDisplayName(displayName),
                connected: true,
                revision: player.revision + 1
            };
        }
        else {
            player = this.createPlayer(displayName);
        }
        this.players.set(player);
        this.inputQueues.set(player.id, []);
        const session = this.sessions.upsert(sessionId, player.id);
        this.revision += 1;
        const emissions = [
            {
                scope: "session",
                sessionId,
                event: this.event("session.welcome", {
                    playerId: player.id,
                    roomRevision: this.revision,
                    connectionEpoch: session.connectionEpoch,
                    version: BREACH_VERSION,
                    protocol: PROTOCOL_VERSION,
                    serverTime: now
                })
            },
            {
                scope: "session",
                sessionId,
                event: this.event("room.snapshot", {
                    revision: this.revision,
                    players: this.players.values(),
                    serverTime: now
                })
            },
            {
                scope: "all",
                event: this.event("player.updated", { revision: this.revision, player })
            }
        ];
        return { playerId: player.id, connectionEpoch: session.connectionEpoch, emissions };
    }
    disconnect(sessionId, connectionEpoch) {
        if (!this.sessions.isCurrent(sessionId, connectionEpoch))
            return [];
        const session = this.sessions.require(sessionId);
        const player = this.players.require(session.playerId);
        if (!player.connected)
            return [];
        const updated = { ...player, connected: false, revision: player.revision + 1 };
        this.players.set(updated);
        this.inputQueues.set(player.id, []);
        this.revision += 1;
        return [{ scope: "all", event: this.event("player.updated", { revision: this.revision, player: updated }) }];
    }
    handle(sessionId, command, now = Date.now()) {
        const session = this.sessions.require(sessionId);
        const current = this.players.require(session.playerId);
        if (command.type === "movement.input") {
            if (!current.connected || current.life !== "alive" || command.payload.lifeId !== current.lifeId)
                return [];
            this.enqueueInputs(current.id, current.movement.lastProcessedInputSeq, command.payload.frames);
            return [];
        }
        if (command.type === "player.team.switch") {
            const updated = this.teams.switchTeam(current);
            this.players.set(updated);
            this.inputQueues.set(updated.id, []);
            this.revision += 1;
            return [{ scope: "all", event: this.event("player.respawned", { revision: this.revision, player: updated }) }];
        }
        if (command.type === "debug.life.kill") {
            if (current.life !== "alive")
                return [];
            const updated = {
                ...current,
                life: "dead",
                health: { ...current.health, hp: 0 },
                movement: { ...current.movement, velocityX: 0, velocityY: 0, velocityZ: 0, sprinting: false },
                respawnAt: now + RESPAWN_MS,
                revision: current.revision + 1
            };
            this.players.set(updated);
            this.inputQueues.set(updated.id, []);
            this.revision += 1;
            return [{ scope: "all", event: this.event("player.updated", { revision: this.revision, player: updated }) }];
        }
        if (command.type === "diagnostics.ping") {
            return [{
                    scope: "session",
                    sessionId,
                    event: this.event("diagnostics.pong", {
                        requestId: command.requestId,
                        sentAt: command.payload.sentAt,
                        serverAt: now
                    })
                }];
        }
        return [];
    }
    advanceServerStep(now, elapsedMs = 1000 / 30) {
        const lifecycle = [];
        for (const player of this.players.connectedValues()) {
            let next = player;
            if (next.life === "dead" && next.respawnAt !== null && now >= next.respawnAt - RESPAWNING_WINDOW_MS) {
                next = { ...next, life: "respawning", revision: next.revision + 1 };
                this.players.set(next);
                this.revision += 1;
                lifecycle.push({ scope: "all", event: this.event("player.updated", { revision: this.revision, player: next }) });
            }
            if (next.life === "respawning" && next.respawnAt !== null && now >= next.respawnAt) {
                next = this.respawn(next);
                this.players.set(next);
                this.inputQueues.set(next.id, []);
                this.revision += 1;
                lifecycle.push({ scope: "all", event: this.event("player.respawned", { revision: this.revision, player: next }) });
                continue;
            }
            if (next.life !== "alive")
                continue;
            const queue = this.inputQueues.get(next.id) ?? [];
            let moved = next;
            for (let i = 0; i < SERVER_SUBSTEPS; i += 1) {
                const frame = queue.shift() ?? neutralInput(moved.movement.lastProcessedInputSeq, moved.transform.yaw, moved.transform.pitch);
                moved = simulatePlayerMovement(moved, frame, CLIENT_FIXED_STEP);
            }
            this.inputQueues.set(next.id, queue);
            if (hasMotionChanged(next, moved))
                this.players.set({ ...moved, revision: next.revision + 1 });
        }
        this.replicationAccumulatorMs += Math.max(0, elapsedMs);
        if (this.replicationAccumulatorMs + 0.0001 >= REPLICATION_STEP_MS) {
            this.replicationAccumulatorMs %= REPLICATION_STEP_MS;
            this.snapshotSeq += 1;
            lifecycle.push({
                scope: "all",
                event: this.event("simulation.snapshot", { snapshotSeq: this.snapshotSeq, serverTime: now, players: this.players.values() })
            });
        }
        return lifecycle;
    }
    toPersisted() {
        return { revision: this.revision, seq: this.seq, snapshotSeq: this.snapshotSeq, players: this.players.values(), sessions: this.sessions.values() };
    }
    snapshot() {
        return { revision: this.revision, snapshotSeq: this.snapshotSeq, players: this.players.values() };
    }
    inputQueueSize(playerId) {
        return this.inputQueues.get(playerId)?.length ?? 0;
    }
    enqueueInputs(playerId, acknowledgedSeq, frames) {
        const queue = this.inputQueues.get(playerId) ?? [];
        let maxKnown = Math.max(acknowledgedSeq, queue.at(-1)?.seq ?? acknowledgedSeq);
        for (const raw of frames) {
            if (raw.seq <= maxKnown)
                continue;
            if (raw.seq !== maxKnown + 1)
                break;
            queue.push(cloneInputFrame(raw));
            maxKnown = raw.seq;
            if (queue.length >= MAX_INPUT_QUEUE)
                break;
        }
        this.inputQueues.set(playerId, queue);
    }
    createPlayer(displayName) {
        const id = newPlayerId();
        const team = this.teams.chooseBalancedTeam();
        return {
            id,
            displayName: sanitizeDisplayName(displayName),
            team,
            connected: true,
            life: "alive",
            lifeId: 1,
            revision: 1,
            transform: spawnTransform(team, id, 1),
            movement: { velocityX: 0, velocityY: 0, velocityZ: 0, grounded: true, crouched: false, sprinting: false, lastProcessedInputSeq: 0 },
            health: { hp: 100, maxHp: 100 },
            respawnAt: null
        };
    }
    respawn(player) {
        const lifeId = player.lifeId + 1;
        return {
            ...player,
            life: "alive",
            lifeId,
            transform: spawnTransform(player.team, player.id, lifeId),
            movement: { velocityX: 0, velocityY: 0, velocityZ: 0, grounded: true, crouched: false, sprinting: false, lastProcessedInputSeq: player.movement.lastProcessedInputSeq },
            health: { hp: player.health.maxHp, maxHp: player.health.maxHp },
            respawnAt: null,
            revision: player.revision + 1
        };
    }
    event(type, payload) {
        this.seq += 1;
        return { v: PROTOCOL_VERSION, type, seq: this.seq, payload };
    }
}
function sanitizeDisplayName(value) {
    const clean = value.replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 24);
    return clean || "Player";
}
function hasMotionChanged(before, after) {
    return before.transform.x !== after.transform.x || before.transform.y !== after.transform.y || before.transform.z !== after.transform.z || before.transform.yaw !== after.transform.yaw || before.transform.pitch !== after.transform.pitch || before.movement.velocityX !== after.movement.velocityX || before.movement.velocityY !== after.movement.velocityY || before.movement.velocityZ !== after.movement.velocityZ || before.movement.grounded !== after.movement.grounded || before.movement.crouched !== after.movement.crouched || before.movement.sprinting !== after.movement.sprinting || before.movement.lastProcessedInputSeq !== after.movement.lastProcessedInputSeq;
}
