import { PROTOCOL_VERSION } from "./version.js";
import { isTeam } from "./team.js";
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function finite(value) {
    return typeof value === "number" && Number.isFinite(value);
}
export function decodeClientCommand(raw) {
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        throw new Error("invalid_json");
    }
    if (!isObject(value))
        throw new Error("invalid_envelope");
    if (value.v !== PROTOCOL_VERSION)
        throw new Error("protocol_mismatch");
    if (typeof value.type !== "string" || typeof value.requestId !== "string" || !isObject(value.payload))
        throw new Error("invalid_envelope");
    if (value.type === "player.team.switch" || value.type === "debug.life.kill")
        return value;
    if (value.type === "diagnostics.ping" && finite(value.payload.sentAt))
        return value;
    if (value.type === "movement.input") {
        if (!finite(value.payload.lifeId) || value.payload.lifeId < 1 || !Array.isArray(value.payload.frames) || value.payload.frames.length === 0 || value.payload.frames.length > 12)
            throw new Error("invalid_movement_frames");
        for (const frame of value.payload.frames)
            validateMovementFrame(frame);
        return value;
    }
    throw new Error("unsupported_command");
}
export function decodeServerEvent(raw) {
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        throw new Error("invalid_json");
    }
    if (!isObject(value) || value.v !== PROTOCOL_VERSION || typeof value.type !== "string" || !finite(value.seq) || !isObject(value.payload))
        throw new Error("invalid_event");
    switch (value.type) {
        case "session.welcome":
            if (typeof value.payload.playerId !== "string" || !finite(value.payload.connectionEpoch) || !finite(value.payload.roomRevision) || !finite(value.payload.serverTime))
                throw new Error("invalid_welcome");
            break;
        case "room.snapshot":
            validatePlayersPayload(value.payload, true);
            break;
        case "simulation.snapshot":
            if (!finite(value.payload.snapshotSeq) || !finite(value.payload.serverTime) || !Array.isArray(value.payload.players))
                throw new Error("invalid_simulation_snapshot");
            for (const player of value.payload.players)
                validatePlayer(player);
            break;
        case "player.updated":
        case "player.respawned":
            if (!finite(value.payload.revision))
                throw new Error("invalid_player_update");
            validatePlayer(value.payload.player);
            break;
        case "player.removed":
            if (typeof value.payload.playerId !== "string")
                throw new Error("invalid_player_remove");
            break;
        case "diagnostics.pong":
            if (!finite(value.payload.serverAt) || !finite(value.payload.sentAt))
                throw new Error("invalid_pong");
            break;
        case "error":
            if (typeof value.payload.code !== "string" || typeof value.payload.message !== "string")
                throw new Error("invalid_error");
            break;
        default:
            throw new Error("unsupported_event");
    }
    return value;
}
function validatePlayersPayload(payload, requireRevision) {
    if (requireRevision && !finite(payload.revision))
        throw new Error("invalid_snapshot");
    if (!finite(payload.serverTime) || !Array.isArray(payload.players))
        throw new Error("invalid_snapshot");
    for (const player of payload.players)
        validatePlayer(player);
}
function validateMovementFrame(value) {
    if (!isObject(value))
        throw new Error("invalid_movement_frame");
    if (!finite(value.seq) || value.seq < 1 || value.seq > Number.MAX_SAFE_INTEGER)
        throw new Error("invalid_movement_seq");
    if (!finite(value.moveX) || !finite(value.moveY) || Math.abs(value.moveX) > 1.001 || Math.abs(value.moveY) > 1.001)
        throw new Error("invalid_movement_axis");
    if (!finite(value.yaw) || !finite(value.pitch) || Math.abs(value.pitch) > 1.5)
        throw new Error("invalid_look");
    if (typeof value.jumpPressed !== "boolean" || typeof value.sprintHeld !== "boolean" || typeof value.crouchHeld !== "boolean")
        throw new Error("invalid_movement_buttons");
}
function validatePlayer(value) {
    if (!isObject(value))
        throw new Error("invalid_player");
    if (typeof value.id !== "string" || typeof value.displayName !== "string" || !isTeam(value.team) || typeof value.connected !== "boolean" || !finite(value.lifeId) || !finite(value.revision))
        throw new Error("invalid_player");
    if (value.life !== "alive" && value.life !== "dead" && value.life !== "respawning")
        throw new Error("invalid_player_life");
    if (!isObject(value.transform) || !finite(value.transform.x) || !finite(value.transform.y) || !finite(value.transform.z) || !finite(value.transform.yaw) || !finite(value.transform.pitch))
        throw new Error("invalid_player_transform");
    if (!isObject(value.movement) || !finite(value.movement.velocityX) || !finite(value.movement.velocityY) || !finite(value.movement.velocityZ) || typeof value.movement.grounded !== "boolean" || typeof value.movement.crouched !== "boolean" || typeof value.movement.sprinting !== "boolean" || !finite(value.movement.lastProcessedInputSeq))
        throw new Error("invalid_player_movement");
    if (!isObject(value.health) || !finite(value.health.hp) || !finite(value.health.maxHp))
        throw new Error("invalid_player_health");
    if (value.respawnAt !== null && !finite(value.respawnAt))
        throw new Error("invalid_respawn_time");
}
