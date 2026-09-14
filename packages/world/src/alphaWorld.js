export const ALPHA_WORLD = Object.freeze({
    minX: -11,
    maxX: 11,
    minZ: -7,
    maxZ: 7,
    groundY: 0,
    obstacles: Object.freeze([
        { id: "center-north", minX: -1.8, maxX: 1.8, minZ: -3.8, maxZ: -1.3, height: 2.6 },
        { id: "center-south", minX: -1.8, maxX: 1.8, minZ: 1.3, maxZ: 3.8, height: 2.6 },
        { id: "west-cover", minX: -6.0, maxX: -4.4, minZ: -0.8, maxZ: 0.8, height: 1.5 },
        { id: "east-cover", minX: 4.4, maxX: 6.0, minZ: -0.8, maxZ: 0.8, height: 1.5 }
    ])
});
export const PLAYER_RADIUS = 0.38;
export const PLAYER_STANDING_HEIGHT = 1.82;
export const PLAYER_CROUCH_HEIGHT = 1.12;
export function spawnTransform(team, id, lifeId = 1) {
    let hash = 2166136261;
    const value = `${id}:${lifeId}`;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    const lane = (hash % 5) - 2;
    return {
        x: team === "blue" ? -8.6 : 8.6,
        y: ALPHA_WORLD.groundY,
        z: lane * 1.35,
        yaw: team === "blue" ? -Math.PI / 2 : Math.PI / 2,
        pitch: 0
    };
}
export function blocksPlayer(x, z, height, radius = PLAYER_RADIUS) {
    if (x - radius < ALPHA_WORLD.minX || x + radius > ALPHA_WORLD.maxX || z - radius < ALPHA_WORLD.minZ || z + radius > ALPHA_WORLD.maxZ)
        return true;
    for (const box of ALPHA_WORLD.obstacles) {
        if (height <= 0 || box.height <= 0)
            continue;
        const closestX = Math.max(box.minX, Math.min(x, box.maxX));
        const closestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
        const dx = x - closestX;
        const dz = z - closestZ;
        if (dx * dx + dz * dz < radius * radius)
            return true;
    }
    return false;
}
export function moveWithCollision(x, z, dx, dz, height, radius = PLAYER_RADIUS) {
    const distance = Math.hypot(dx, dz);
    const pieces = Math.max(1, Math.ceil(distance / 0.12));
    const stepX = dx / pieces;
    const stepZ = dz / pieces;
    let px = x;
    let pz = z;
    let blocked = false;
    for (let i = 0; i < pieces; i += 1) {
        const targetX = px + stepX;
        const targetZ = pz + stepZ;
        if (!blocksPlayer(targetX, targetZ, height, radius)) {
            px = targetX;
            pz = targetZ;
            continue;
        }
        blocked = true;
        if (!blocksPlayer(targetX, pz, height, radius))
            px = targetX;
        if (!blocksPlayer(px, targetZ, height, radius))
            pz = targetZ;
    }
    return { x: px, z: pz, blocked };
}
