export const APP_VERSION = '1.16.16';
export const PROTOCOL_VERSION = 33;
export const ROOM_CODE_LENGTH = 4;
export const MAX_PLAYERS = 8;
export const MAX_BOTS = 8;
export const TEAM_COLORS = Object.freeze({ blue:'#54a9ff', red:'#ff6873' });

export const WEAPON_ORDER = Object.freeze(['pistol','assault','shotgun','sniper']);
export const WEAPON_SPECS = Object.freeze({
  pistol: Object.freeze({ name:'PISTOL', short:'PST', mag:12, damage:34, reloadMs:475, cooldownMs:190, bulletSpeed:42, lifetimeMs:3200, adsFov:54 }),
  assault: Object.freeze({ name:'ASSAULT RIFLE', short:'AR', mag:12, damage:26, reloadMs:650, cooldownMs:105, bulletSpeed:82, lifetimeMs:3400, adsFov:46 }),
  shotgun: Object.freeze({ name:'SHOTGUN', short:'SG', mag:6, damage:18, reloadMs:980, cooldownMs:760, bulletSpeed:68, lifetimeMs:1800, adsFov:52 }),
  sniper: Object.freeze({ name:'SNIPER', short:'SNP', mag:12, damage:120, reloadMs:1100, cooldownMs:950, bulletSpeed:180, lifetimeMs:3600, adsFov:18 }),
});

export const EQUIPMENT_CAPS = Object.freeze({ flash: 2, sticky: 2 });

export const DEFAULT_WORLD_SETTINGS = Object.freeze({
  movement: Object.freeze({ runSpeed:8.4, walkSpeed:4.6, jumpHeight:1.6, gravity:23 }),
  combat: Object.freeze({ regenDelayMs:5000, regenPerSecond:8, respawnMs:2800 }),
  weapons: Object.freeze(Object.fromEntries(WEAPON_ORDER.map((name) => {
    const spec = WEAPON_SPECS[name];
    return [name, Object.freeze({ damage:spec.damage, speed:spec.bulletSpeed, reloadMs:spec.reloadMs, cooldownMs:spec.cooldownMs })];
  }))),
});

export const TACTICAL_THROW_SPEED = 23.5;
export const TACTICAL_THROW_LOFT = 6.4;
export const TACTICAL_GRAVITY = 18;
export const FLASH_RADIUS = 22;
export const STICKY_RADIUS = 8.5;
export const STICKY_MAX_DAMAGE = 150;
export const GROUND_FOLLOW_DROP = 0.32;
