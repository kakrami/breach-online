export const APP_VERSION = '1.25.4';
export const PROTOCOL_VERSION = 46;
export const ROOM_CODE_LENGTH = 4;
export const MAX_PLAYERS = 8;
export const MAX_BOTS = 8;
export const TEAM_COLORS = { blue:'#54a9ff', red:'#ff6873' };

export const WEAPON_ORDER = ['pistol','assault','shotgun','sniper'];
export const PRIMARY_WEAPONS = ['assault','shotgun','sniper'];
export const WEAPON_SPECS = {
  pistol: { name:'PISTOL', short:'PST', mag:12, damage:34, reloadMs:475, cooldownMs:190, bulletSpeed:42, lifetimeMs:3200, adsFov:54 },
  assault: { name:'ASSAULT RIFLE', short:'AR', mag:24, damage:26, reloadMs:850, cooldownMs:105, bulletSpeed:82, lifetimeMs:3400, adsFov:46 },
  shotgun: { name:'SHOTGUN', short:'SG', mag:6, damage:18, reloadMs:980, cooldownMs:760, bulletSpeed:68, lifetimeMs:1800, adsFov:52 },
  sniper: { name:'SNIPER', short:'SNP', mag:6, damage:120, reloadMs:1100, cooldownMs:950, bulletSpeed:180, lifetimeMs:3600, adsFov:18 },
};

export const WEAPON_ACCURACY = {
  pistol: { hipDeg:1.45, adsDeg:0.48, moveDeg:0.70 },
  assault: { hipDeg:2.25, adsDeg:0.62, moveDeg:1.00 },
  shotgun: { hipDeg:5.20, adsDeg:3.05, moveDeg:1.10 },
  sniper: { hipDeg:4.25, adsDeg:0.10, moveDeg:1.35 },
};

export function weaponSpreadRadians(weapon, moveSpeed, runSpeed, ads=false, crouched=false) {
  const accuracy=WEAPON_ACCURACY[weapon]||WEAPON_ACCURACY.pistol;
  const moveRatio=Math.max(0,Math.min(1,(Number(moveSpeed)||0)/Math.max(.1,Number(runSpeed)||.1)));
  let degrees=(ads?accuracy.adsDeg:accuracy.hipDeg)+accuracy.moveDeg*moveRatio*(ads?.35:1);
  if(crouched)degrees*=.82;
  return degrees*Math.PI/180;
}

export const CROUCH_HEIGHT = 1.08;
export const CROUCH_SPEED_MULTIPLIER = 0.62;
export const EQUIPMENT_CAPS = { flash: 1, sticky: 1 };

export const GAME_MODE_ORDER = ['tdm','ffa','sandbox'];
export const DEFAULT_GAME_MODE = 'tdm';
export const GAME_MODES = Object.freeze({
  tdm:Object.freeze({id:'tdm',name:'TEAM DEATHMATCH',short:'TDM',teamBased:true,scoreType:'team',scoreLimit:30,timeLimitMs:8*60*1000}),
  ffa:Object.freeze({id:'ffa',name:'FREE FOR ALL',short:'FFA',teamBased:false,scoreType:'player',scoreLimit:20,timeLimitMs:8*60*1000}),
  sandbox:Object.freeze({id:'sandbox',name:'SANDBOX',short:'SANDBOX',teamBased:true,scoreType:'none',scoreLimit:0,timeLimitMs:0}),
});
export function normalizeGameMode(value){const id=String(value||'').toLowerCase();return GAME_MODES[id]?id:DEFAULT_GAME_MODE;}
export function gameModeSpec(value){return GAME_MODES[normalizeGameMode(value)];}
export function gameModeIsTeamBased(value){return !!gameModeSpec(value).teamBased;}
export const DEFAULT_MATCH_RULES = { mode:DEFAULT_GAME_MODE, scoreLimit:GAME_MODES.tdm.scoreLimit, timeLimitMs:GAME_MODES.tdm.timeLimitMs };
export const MATCH_WARMUP_MS = 4000;
export const MATCH_END_MS = 7000;

export const DEFAULT_WORLD_SETTINGS = {
  movement: { runSpeed:8.4, walkSpeed:4.6, jumpHeight:1.6, gravity:23 },
  combat: { regenDelayMs:5000, regenPerSecond:8, respawnMs:2800 },
  weapons: Object.fromEntries(WEAPON_ORDER.map((name) => {
    const spec = WEAPON_SPECS[name];
    return [name, { damage:spec.damage, speed:spec.bulletSpeed, reloadMs:spec.reloadMs, cooldownMs:spec.cooldownMs }];
  })),
};

export function normalizeWorldSettings(value) {
  const v=value&&typeof value==='object'?value:{},movement=v.movement&&typeof v.movement==='object'?v.movement:{},combat=v.combat&&typeof v.combat==='object'?v.combat:{},weapons=v.weapons&&typeof v.weapons==='object'?v.weapons:{};
  const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
  const bounded=(value,min,max,fallback)=>Math.max(min,Math.min(max,number(value,fallback)));
  const weapon=(name)=>{const src=weapons[name]&&typeof weapons[name]==='object'?weapons[name]:{},def=DEFAULT_WORLD_SETTINGS.weapons[name];return{damage:bounded(src.damage,1,400,def.damage),speed:bounded(src.speed,10,400,def.speed),reloadMs:Math.round(bounded(src.reloadMs,100,5000,def.reloadMs)),cooldownMs:Math.round(bounded(src.cooldownMs,50,2500,def.cooldownMs))}};
  const runSpeed=bounded(movement.runSpeed,3,16,DEFAULT_WORLD_SETTINGS.movement.runSpeed);
  return {
    movement:{runSpeed,walkSpeed:Math.min(runSpeed,bounded(movement.walkSpeed,1.5,9,DEFAULT_WORLD_SETTINGS.movement.walkSpeed)),jumpHeight:bounded(movement.jumpHeight,.4,5,DEFAULT_WORLD_SETTINGS.movement.jumpHeight),gravity:bounded(movement.gravity,8,40,DEFAULT_WORLD_SETTINGS.movement.gravity)},
    combat:{regenDelayMs:Math.round(bounded(combat.regenDelayMs,0,15000,DEFAULT_WORLD_SETTINGS.combat.regenDelayMs)),regenPerSecond:bounded(combat.regenPerSecond,0,30,DEFAULT_WORLD_SETTINGS.combat.regenPerSecond),respawnMs:Math.round(bounded(combat.respawnMs,1000,10000,DEFAULT_WORLD_SETTINGS.combat.respawnMs))},
    weapons:Object.fromEntries(WEAPON_ORDER.map(name=>[name,weapon(name)])),
  };
}

export const TACTICAL_THROW_SPEED = 23.5;
export const TACTICAL_THROW_LOFT = 6.4;
export const TACTICAL_GRAVITY = 18;
export const FLASH_RADIUS = 22;
export const STICKY_RADIUS = 8.5;
export const STICKY_MAX_DAMAGE = 150;
export const GROUND_FOLLOW_DROP = 0.32;
