const PLAYER_RE = /^p_[a-z0-9-]{8,80}$/i;
const SESSION_RE = /^s_[a-z0-9-]{8,120}$/i;
const ROOM_RE = /^[A-Z0-9_-]{2,20}$/;
export function playerId(value) {
    const normalized = value.trim().toLowerCase();
    if (!PLAYER_RE.test(normalized))
        throw new Error(`Invalid player id: ${value}`);
    return normalized;
}
export function sessionId(value) {
    const normalized = value.trim().toLowerCase();
    if (!SESSION_RE.test(normalized))
        throw new Error("Invalid session id");
    return normalized;
}
export function roomId(value) {
    const normalized = value.trim().toUpperCase();
    if (!ROOM_RE.test(normalized))
        throw new Error("Room must be 2-20 characters using A-Z, 0-9, _ or -");
    return normalized;
}
export function newPlayerId() {
    return playerId(`p_${crypto.randomUUID()}`);
}
