export function clonePlayer(player) {
    return {
        ...player,
        transform: { ...player.transform },
        movement: { ...player.movement },
        health: { ...player.health }
    };
}
export function cloneInputFrame(frame) {
    return { ...frame };
}
export function playerPosition(player) {
    return { x: player.transform.x, y: player.transform.y, z: player.transform.z };
}
