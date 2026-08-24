export const APP_VERSION = '1.37.16';
export const PROTOCOL_VERSION = 56;
export const ROOM_CODE_LENGTH = 4;
export const MAX_PLAYERS = 8;
export const MAX_BOTS = 8;
export const TEAM_COLORS = { blue:'#54a9ff', red:'#ff3b45' };

export const MAP_ORDER = ['highlands','depot','yard','rig'];
export const DEFAULT_MAP_ID = 'highlands';
export const MAPS = Object.freeze({
  highlands:Object.freeze({id:'highlands',name:'HIGHLANDS',short:'HIGHLANDS',description:'Open highland combat with mixed civilian/industrial buildings, wrecks, walls, ladders, and natural cover.'}),
  depot:Object.freeze({id:'depot',name:'FREIGHT DEPOT',short:'DEPOT',description:'Industrial freight yard with varied warehouses, vehicle wrecks, service props, ladders, and close flanking routes.'}),
  yard:Object.freeze({id:'yard',name:'CONTAINER YARD',short:'YARD',description:'Compact container arena with wrecks, service cover, a climbable stack, crossing lanes, and fast respawns.'}),
  rig:Object.freeze({id:'rig',name:'DUST RIG',short:'RIG',description:'Compact desert oil yard with varied utility structures, wrecks, ladders, exposed high ground, and fast four-way rotations.'}),
});
export function normalizeMapId(value){const id=String(value||'').toLowerCase();return MAPS[id]?id:DEFAULT_MAP_ID;}
export function mapSpec(value){return MAPS[normalizeMapId(value)];}

export const WEAPON_ORDER = ['pistol','assault','ump','shotgun','semiShotgun','sniper','grenadeLauncher','rpg'];
export const PRIMARY_WEAPONS = ['assault','ump','shotgun','semiShotgun','sniper','grenadeLauncher','rpg'];
export const WEAPON_SPECS = {
  pistol: { name:'PISTOL', short:'PST', mag:12, damage:35, reloadMs:900, cooldownMs:180, bulletSpeed:90, lifetimeMs:3200, adsFov:54, pellets:1, headshotMultiplier:1.50, headshotMinDamage:0, falloffStart:26, falloffEnd:60, minDamageScale:.72, recoilPitch:.0095, recoilYaw:.0030, recoilMaxPitch:.0240, recoilRecovery:15, recoilRecoveryDelayMs:80 },
  assault: { name:'ASSAULT RIFLE', short:'AR', mag:30, damage:28, reloadMs:1450, cooldownMs:100, bulletSpeed:115, lifetimeMs:3000, adsFov:46, pellets:1, headshotMultiplier:1.50, headshotMinDamage:0, falloffStart:42, falloffEnd:92, minDamageScale:.76, recoilPitch:.0058, recoilYaw:.0026, recoilMaxPitch:.0300, recoilRecovery:11.5, recoilRecoveryDelayMs:95, automatic:true },
  ump: { name:'UMP', short:'UMP', mag:30, damage:27, reloadMs:1320, cooldownMs:92, bulletSpeed:105, lifetimeMs:3000, adsFov:49, pellets:1, headshotMultiplier:1.45, headshotMinDamage:0, falloffStart:25, falloffEnd:62, minDamageScale:.68, recoilPitch:.0049, recoilYaw:.0034, recoilMaxPitch:.0280, recoilRecovery:13, recoilRecoveryDelayMs:80, automatic:true },
  shotgun: { name:'PUMP SHOTGUN', short:'SG', mag:6, damage:16, reloadMs:620, cooldownMs:800, bulletSpeed:100, lifetimeMs:1700, adsFov:52, pellets:8, headshotMultiplier:1.10, headshotMinDamage:0, falloffStart:10, falloffEnd:26, minDamageScale:.38, recoilPitch:.0175, recoilYaw:.0042, recoilMaxPitch:.0260, recoilRecovery:9.5, recoilRecoveryDelayMs:140, shellReload:true },
  semiShotgun: { name:'SEMI-AUTO SHOTGUN', short:'SAS', mag:8, damage:12, reloadMs:1550, cooldownMs:330, bulletSpeed:100, lifetimeMs:1750, adsFov:51, pellets:8, headshotMultiplier:1.10, headshotMinDamage:0, falloffStart:9, falloffEnd:24, minDamageScale:.36, recoilPitch:.0135, recoilYaw:.0052, recoilMaxPitch:.0320, recoilRecovery:9, recoilRecoveryDelayMs:150 },
  sniper: { name:'SNIPER', short:'SNP', mag:5, damage:110, reloadMs:1650, cooldownMs:1050, bulletSpeed:240, lifetimeMs:2400, adsFov:18, pellets:1, headshotMultiplier:1.50, headshotMinDamage:0, falloffStart:115, falloffEnd:190, minDamageScale:.92, recoilPitch:.0290, recoilYaw:.0048, recoilMaxPitch:.0380, recoilRecovery:8.2, recoilRecoveryDelayMs:220 },
  grenadeLauncher: { name:'GRENADE LAUNCHER', short:'GL', mag:1, damage:30, reloadMs:1650, cooldownMs:1100, bulletSpeed:34, lifetimeMs:3000, adsFov:52, pellets:1, headshotMultiplier:1, headshotMinDamage:0, falloffStart:999, falloffEnd:1000, minDamageScale:1, recoilPitch:.0200, recoilYaw:.0038, recoilMaxPitch:.0300, recoilRecovery:8.4, recoilRecoveryDelayMs:180, projectileGravity:13.5, launchPitchDeg:5.0, explosionRadius:6.8, explosionDamage:140 },
  rpg: { name:'RPG', short:'RPG', mag:1, damage:35, reloadMs:2200, cooldownMs:1450, bulletSpeed:50, lifetimeMs:4300, adsFov:50, pellets:1, headshotMultiplier:1, headshotMinDamage:0, falloffStart:999, falloffEnd:1000, minDamageScale:1, recoilPitch:.0240, recoilYaw:.0034, recoilMaxPitch:.0340, recoilRecovery:7.6, recoilRecoveryDelayMs:220, projectileGravity:0, explosionRadius:8.2, explosionDamage:165 },
};
// Accuracy is centered on the reticle. Movement, stance, airborne state and
// sustained-fire heat widen the cone around that center; they never offset the
// cone sideways from the player's aim direction.
export const WEAPON_ACCURACY = {
  pistol: { hipDeg:1.15, adsDeg:0.09, moveDeg:0.62, adsMoveScale:0.36, airborneDeg:1.55, crouchScale:0.78, fireDeg:0.30, fireMaxDeg:1.05, heatRecoveryMs:170 },
  assault: { hipDeg:1.85, adsDeg:0.06, moveDeg:0.90, adsMoveScale:0.30, airborneDeg:1.85, crouchScale:0.78, fireDeg:0.20, fireMaxDeg:1.00, heatRecoveryMs:215 },
  ump: { hipDeg:1.45, adsDeg:0.095, moveDeg:0.68, adsMoveScale:0.28, airborneDeg:1.65, crouchScale:0.80, fireDeg:0.24, fireMaxDeg:1.15, heatRecoveryMs:195 },
  shotgun: { hipDeg:4.60, adsDeg:2.70, moveDeg:1.00, adsMoveScale:0.52, airborneDeg:1.60, crouchScale:0.88, fireDeg:0.04, fireMaxDeg:0.15, heatRecoveryMs:230 },
  semiShotgun: { hipDeg:5.00, adsDeg:3.00, moveDeg:1.08, adsMoveScale:0.54, airborneDeg:1.70, crouchScale:0.90, fireDeg:0.18, fireMaxDeg:0.72, heatRecoveryMs:280 },
  sniper: { hipDeg:6.50, adsDeg:0.02, moveDeg:1.70, adsMoveScale:0.25, airborneDeg:3.40, crouchScale:0.75, fireDeg:0.04, fireMaxDeg:0.12, heatRecoveryMs:320 },
  grenadeLauncher: { hipDeg:1.35, adsDeg:0.22, moveDeg:0.78, adsMoveScale:0.40, airborneDeg:1.65, crouchScale:0.86, fireDeg:0.04, fireMaxDeg:0.08, heatRecoveryMs:340 },
  rpg: { hipDeg:1.80, adsDeg:0.28, moveDeg:0.95, adsMoveScale:0.42, airborneDeg:2.00, crouchScale:0.88, fireDeg:0.04, fireMaxDeg:0.08, heatRecoveryMs:380 },
};

function clamp01(value){return Math.max(0,Math.min(1,Number(value)||0));}
export function weaponHeatAfterDelay(weapon,heat,deltaMs){
  const accuracy=WEAPON_ACCURACY[weapon]||WEAPON_ACCURACY.pistol,recovery=Math.max(40,Number(accuracy.heatRecoveryMs)||200),dt=Math.max(0,Number(deltaMs)||0);
  return Math.max(0,(Number(heat)||0)*Math.exp(-dt/recovery));
}
export function weaponHeatAfterShot(weapon,heat){
  const accuracy=WEAPON_ACCURACY[weapon]||WEAPON_ACCURACY.pistol,maxHeat=Math.max(1,(Number(accuracy.fireMaxDeg)||0)/Math.max(.001,Number(accuracy.fireDeg)||.001));
  return Math.min(maxHeat,Math.max(0,Number(heat)||0)+1);
}
export function weaponSpreadRadians(weapon,moveSpeed,runSpeed,adsAmount=0,crouched=false,airborne=false,shotHeat=0){
  const accuracy=WEAPON_ACCURACY[weapon]||WEAPON_ACCURACY.pistol,ads=clamp01(adsAmount),moveRatio=Math.max(0,Math.min(1,(Number(moveSpeed)||0)/Math.max(.1,Number(runSpeed)||.1)));
  const base=accuracy.hipDeg+(accuracy.adsDeg-accuracy.hipDeg)*ads,moveScale=1+(accuracy.adsMoveScale-1)*ads;
  let degrees=base+accuracy.moveDeg*moveRatio*moveScale;
  if(airborne)degrees+=accuracy.airborneDeg*(1-.18*ads);
  if(crouched&&!airborne)degrees*=accuracy.crouchScale;
  const firePenalty=Math.min(accuracy.fireMaxDeg,Math.max(0,Number(shotHeat)||0)*accuracy.fireDeg)*(1-.42*ads);
  degrees+=firePenalty;
  return Math.max(0,degrees)*Math.PI/180;
}

export function weaponDamageAtDistance(weapon,baseDamage,distance,headshot=false){
  const spec=WEAPON_SPECS[weapon]||WEAPON_SPECS.pistol,base=Math.max(0,Number(baseDamage)||0),d=Math.max(0,Number(distance)||0);
  const start=Math.max(0,Number(spec.falloffStart)||0),end=Math.max(start+.001,Number(spec.falloffEnd)||start+.001),minScale=Math.max(0,Math.min(1,Number(spec.minDamageScale)||1));
  const t=Math.max(0,Math.min(1,(d-start)/(end-start))),scaled=base*(1-(1-minScale)*t);
  if(!headshot)return scaled;
  return Math.max(Number(spec.headshotMinDamage)||0,scaled*Math.max(1,Number(spec.headshotMultiplier)||1));
}

export const MOVEMENT_FEEL = Object.freeze({
  groundAcceleration:58,
  groundBraking:78,
  airAcceleration:16,
  coyoteTimeMs:105,
  jumpBufferMs:130,
});

export const WEAPON_SWITCH_MS = 120;

export const CROUCH_HEIGHT = 1.08;
export const CROUCH_SPEED_MULTIPLIER = 0.62;
export const TACTICAL_EQUIPMENT = ['flash','smoke'];
export const LETHAL_EQUIPMENT = ['sticky','frag'];
export const EQUIPMENT_CAPS = { flash:1, smoke:1, sticky:1, frag:1 };
export const EQUIPMENT_SPECS = Object.freeze({
  flash:Object.freeze({name:'FLASHBANG',short:'FLASH',slot:'tactical'}),
  smoke:Object.freeze({name:'SMOKE GRENADE',short:'SMOKE',slot:'tactical'}),
  sticky:Object.freeze({name:'SEMTEX',short:'SEMTEX',slot:'lethal'}),
  frag:Object.freeze({name:'FRAG GRENADE',short:'FRAG',slot:'lethal'}),
});
export function normalizeTactical(value){return TACTICAL_EQUIPMENT.includes(value)?value:'flash';}
export function normalizeLethal(value){return LETHAL_EQUIPMENT.includes(value)?value:'sticky';}
export function equipmentForLoadout(tactical='flash',lethal='sticky'){
  const out=Object.fromEntries(Object.keys(EQUIPMENT_CAPS).map(name=>[name,0]));
  const t=normalizeTactical(tactical),l=normalizeLethal(lethal);out[t]=EQUIPMENT_CAPS[t];out[l]=EQUIPMENT_CAPS[l];return out;
}

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
export const DEFAULT_MATCH_RULES = { mode:DEFAULT_GAME_MODE, scoreLimit:GAME_MODES.tdm.scoreLimit, timeLimitMs:GAME_MODES.tdm.timeLimitMs, minimapRevealAll:false, minimapDirectional:false };
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
export const FLASH_RADIUS = 18;
export const STICKY_RADIUS = 7.2;
export const STICKY_MAX_DAMAGE = 145;
export const FRAG_RADIUS = 7.8;
export const FRAG_MAX_DAMAGE = 150;
export const SMOKE_RADIUS = 9.6;
export const SMOKE_DURATION_MS = 14000;
export const GROUND_FOLLOW_DROP = 0.32;
