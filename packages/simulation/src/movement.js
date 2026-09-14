import { ALPHA_WORLD, PLAYER_CROUCH_HEIGHT, PLAYER_STANDING_HEIGHT, moveWithCollision } from "../../world/src/alphaWorld.js";
export const CLIENT_FIXED_STEP = 1 / 60;
export const SERVER_FIXED_STEP = 1 / 30;
export const SERVER_SUBSTEPS = 2;
export const MOVEMENT = Object.freeze({
    walkSpeed: 4.6,
    runSpeed: 8.4,
    crouchMultiplier: 0.62,
    sprintMultiplier: 1.28,
    groundAcceleration: 58,
    groundBraking: 78,
    airAcceleration: 16,
    gravity: 23,
    jumpHeight: 1.6,
    maxPitch: 1.35
});
export function neutralInput(seq, yaw = 0, pitch = 0) {
    return { seq, moveX: 0, moveY: 0, yaw, pitch, jumpPressed: false, sprintHeld: false, crouchHeld: false };
}
export function simulatePlayerMovement(player, input, dt = CLIENT_FIXED_STEP) {
    if (player.life !== "alive")
        return player;
    const step = Math.max(0, Math.min(0.05, Number.isFinite(dt) ? dt : 0));
    if (step <= 0)
        return player;
    const moveX = clamp(input.moveX, -1, 1);
    const moveY = clamp(input.moveY, -1, 1);
    const inputLength = Math.hypot(moveX, moveY);
    const norm = inputLength > 1 ? 1 / inputLength : 1;
    const ix = moveX * norm;
    const iy = moveY * norm;
    const yaw = wrapAngle(input.yaw);
    const pitch = clamp(input.pitch, -MOVEMENT.maxPitch, MOVEMENT.maxPitch);
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const wishX = rightX * ix + forwardX * iy;
    const wishZ = rightZ * ix + forwardZ * iy;
    const crouched = Boolean(input.crouchHeld);
    const sprinting = Boolean(input.sprintHeld && iy > 0.35 && inputLength > 0.55 && !crouched);
    const baseSpeed = MOVEMENT.walkSpeed * (crouched ? MOVEMENT.crouchMultiplier : sprinting ? MOVEMENT.sprintMultiplier : 1);
    const wishSpeed = Math.min(1, inputLength) * baseSpeed;
    const desiredX = wishX * wishSpeed;
    const desiredZ = wishZ * wishSpeed;
    const grounded = player.movement.grounded;
    const accel = grounded ? MOVEMENT.groundAcceleration : MOVEMENT.airAcceleration;
    const braking = grounded ? MOVEMENT.groundBraking : MOVEMENT.airAcceleration;
    let velocityX = approach(player.movement.velocityX, desiredX, (Math.abs(desiredX) > 0.001 ? accel : braking) * step);
    let velocityZ = approach(player.movement.velocityZ, desiredZ, (Math.abs(desiredZ) > 0.001 ? accel : braking) * step);
    let velocityY = player.movement.velocityY;
    let y = player.transform.y;
    let nextGrounded = grounded;
    if (grounded && input.jumpPressed) {
        velocityY = Math.sqrt(2 * MOVEMENT.gravity * MOVEMENT.jumpHeight);
        nextGrounded = false;
    }
    if (!nextGrounded) {
        velocityY -= MOVEMENT.gravity * step;
        y += velocityY * step;
        if (y <= ALPHA_WORLD.groundY) {
            y = ALPHA_WORLD.groundY;
            velocityY = 0;
            nextGrounded = true;
        }
    }
    const height = crouched ? PLAYER_CROUCH_HEIGHT : PLAYER_STANDING_HEIGHT;
    const moved = moveWithCollision(player.transform.x, player.transform.z, velocityX * step, velocityZ * step, height);
    if (moved.blocked) {
        if (Math.abs(moved.x - player.transform.x) < Math.abs(velocityX * step) * 0.25)
            velocityX = 0;
        if (Math.abs(moved.z - player.transform.z) < Math.abs(velocityZ * step) * 0.25)
            velocityZ = 0;
    }
    return {
        ...player,
        transform: { x: moved.x, y, z: moved.z, yaw, pitch },
        movement: {
            ...player.movement,
            velocityX,
            velocityY,
            velocityZ,
            grounded: nextGrounded,
            crouched,
            sprinting,
            lastProcessedInputSeq: Math.max(player.movement.lastProcessedInputSeq, input.seq)
        }
    };
}
export function distance3(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
function approach(value, target, amount) {
    if (value < target)
        return Math.min(target, value + amount);
    if (value > target)
        return Math.max(target, value - amount);
    return target;
}
function clamp(value, min, max) {
    const n = Number.isFinite(value) ? value : 0;
    return Math.max(min, Math.min(max, n));
}
function wrapAngle(value) {
    let n = Number.isFinite(value) ? value : 0;
    while (n > Math.PI)
        n -= Math.PI * 2;
    while (n < -Math.PI)
        n += Math.PI * 2;
    return n;
}
