export const APP_VERSION = '1.44.33';
export const PROTOCOL_VERSION = 84;
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

export const WEAPON_ORDER = ['pistol','akimbo1887','assault','ump','machineGun','shotgun','semiShotgun','sniper','grenadeLauncher','rpg'];
export const PRIMARY_WEAPONS = ['assault','ump','machineGun','sniper','grenadeLauncher','rpg'];
export const SECONDARY_WEAPONS = ['pistol','shotgun','semiShotgun','akimbo1887'];

export const ATTACHMENT_SLOTS = Object.freeze(['optic','muzzle','barrel','magazine','underbarrel','stock']);
export const ATTACHMENTS = Object.freeze({
  redDot:Object.freeze({id:'redDot',slot:'optic',name:'RED DOT',short:'RDS',description:'Clean reflex sight · slight zoom · +6% ADS time.',compatible:Object.freeze(['pistol','assault','ump','machineGun','shotgun','semiShotgun']),mods:Object.freeze({adsInMs:1.06}),adsFov:44}),
  holoSight:Object.freeze({id:'holoSight',slot:'optic',name:'HOLOGRAPHIC SIGHT',short:'HOLO',description:'Large eye box · moderate zoom · +10% ADS time.',compatible:Object.freeze(['assault','ump','machineGun','semiShotgun']),mods:Object.freeze({adsInMs:1.10}),adsFov:40}),
  combatOptic:Object.freeze({id:'combatOptic',slot:'optic',name:'3× COMBAT OPTIC',short:'3X',description:'3× mid-range optic · +16% ADS time · -4% ADS movement.',compatible:Object.freeze(['assault','machineGun','semiShotgun']),mods:Object.freeze({adsInMs:1.16}),adsMoveAdd:-.04,adsFov:27}),
  variableScope:Object.freeze({id:'variableScope',slot:'optic',name:'VARIABLE SCOPE',short:'VAR',description:'3× / 6× sniper optic · +10% ADS time.',compatible:Object.freeze(['sniper']),mods:Object.freeze({adsInMs:1.10}),adsFov:24,highAdsFov:12.5}),
  suppressor:Object.freeze({id:'suppressor',slot:'muzzle',name:'SUPPRESSOR',short:'SUP',description:'+5% damage · quieter / off radar · +5% ADS time.',compatible:Object.freeze(['pistol','akimbo1887','assault','ump','machineGun','shotgun','sniper']),mods:Object.freeze({damage:1.05,adsInMs:1.05}),modsByWeapon:Object.freeze({akimbo1887:Object.freeze({damage:1.05})}),adsMoveAddByWeapon:Object.freeze({akimbo1887:.05}),soundScale:.88}),
  compensator:Object.freeze({id:'compensator',slot:'muzzle',name:'COMPENSATOR',short:'COMP',description:'-18% recoil · +8% ADS time.',compatible:Object.freeze(['pistol','assault','ump','machineGun']),mods:Object.freeze({recoilPitch:.82,recoilYaw:.82,recoilMaxPitch:.82,recoilMaxYaw:.82,adsInMs:1.08})}),
  shotgunChoke:Object.freeze({id:'shotgunChoke',slot:'muzzle',name:'SHOTGUN CHOKE',short:'CHOKE',description:'-28% pellet spread · +10% ADS time.',compatible:Object.freeze(['shotgun','semiShotgun']),mods:Object.freeze({adsInMs:1.10}),accuracyMods:Object.freeze({hipDeg:.72,adsDeg:.72,moveDeg:.85,airborneDeg:.90,slideDeg:.90})}),
  heavyBarrel:Object.freeze({id:'heavyBarrel',slot:'barrel',name:'HEAVY BARREL',short:'HEAVY',description:'+12% velocity · +15% range · slower handling.',compatible:Object.freeze(['assault','ump','machineGun','sniper']),mods:Object.freeze({bulletSpeed:1.12,falloffStart:1.15,falloffEnd:1.15,adsInMs:1.12,sprintOutMs:1.08}),adsMoveAdd:-.04}),
  shortBarrel:Object.freeze({id:'shortBarrel',slot:'barrel',name:'SHORT BARREL',short:'SHORT',description:'-10% velocity · -14% range · faster ADS / sprint-out · more horizontal recoil.',compatible:Object.freeze(['assault','ump']),mods:Object.freeze({bulletSpeed:.90,falloffStart:.86,falloffEnd:.86,adsInMs:.90,sprintOutMs:.86,recoilYaw:1.08,recoilMaxYaw:1.08}),adsMoveAdd:.05}),
  shotgunLongBarrel:Object.freeze({id:'shotgunLongBarrel',slot:'barrel',name:'LONG BARREL',short:'LONG',description:'+22% range · +8% velocity · tighter spread · slower handling.',compatible:Object.freeze(['akimbo1887','shotgun','semiShotgun']),mods:Object.freeze({bulletSpeed:1.08,falloffStart:1.22,falloffEnd:1.22,adsInMs:1.12,sprintOutMs:1.10}),accuracyMods:Object.freeze({hipDeg:.90,adsDeg:.88,moveDeg:.94})}),
  extendedMag:Object.freeze({id:'extendedMag',slot:'magazine',name:'EXTENDED MAG',short:'EXT',description:'More ammo · +12% reload time.',compatible:Object.freeze(['pistol','assault','ump','machineGun','semiShotgun','sniper']),mods:Object.freeze({reloadMs:1.12}),modsByWeapon:Object.freeze({pistol:Object.freeze({reloadMs:1.12,adsInMs:1.06})}),magAdd:Object.freeze({pistol:6,assault:15,ump:15,machineGun:25,semiShotgun:4,sniper:2})}),
  fastMag:Object.freeze({id:'fastMag',slot:'magazine',name:'FAST MAG',short:'FAST',description:'-22% reload time.',compatible:Object.freeze(['pistol','akimbo1887','assault','ump','semiShotgun','sniper']),mods:Object.freeze({reloadMs:.78,adsInMs:1.06}),modsByWeapon:Object.freeze({pistol:Object.freeze({reloadMs:.78}),akimbo1887:Object.freeze({reloadMs:.78})}),magAdd:Object.freeze({pistol:-3})}),
  verticalGrip:Object.freeze({id:'verticalGrip',slot:'underbarrel',name:'VERTICAL GRIP',short:'GRIP',description:'-16% recoil · +8% ADS time.',compatible:Object.freeze(['assault','ump','machineGun']),mods:Object.freeze({recoilPitch:.84,recoilYaw:.84,recoilMaxPitch:.84,recoilMaxYaw:.84,adsInMs:1.08})}),
  angledGrip:Object.freeze({id:'angledGrip',slot:'underbarrel',name:'ANGLED GRIP',short:'ANG',description:'-12% ADS time · -8% sprint-out · +8% recoil.',compatible:Object.freeze(['assault','ump','machineGun']),mods:Object.freeze({adsInMs:.88,sprintOutMs:.92,recoilPitch:1.08,recoilYaw:1.08,recoilMaxPitch:1.08,recoilMaxYaw:1.08})}),
  bipod:Object.freeze({id:'bipod',slot:'underbarrel',name:'BIPOD',short:'BIPOD',description:'-38% recoil while crouched, grounded, and nearly still.',compatible:Object.freeze(['machineGun']),mods:Object.freeze({}),conditionalRecoilScale:.62}),
  laser:Object.freeze({id:'laser',slot:'underbarrel',name:'LASER',short:'LASER',description:'+10% accuracy.',compatible:Object.freeze(['pistol','akimbo1887','assault','ump','machineGun','shotgun','semiShotgun','sniper','rpg']),mods:Object.freeze({}),accuracyMods:Object.freeze({hipDeg:.90,adsDeg:.90,moveDeg:.90,airborneDeg:.90,slideDeg:.90,fireDeg:.90,fireMaxDeg:.90})}),
  lightweightStock:Object.freeze({id:'lightweightStock',slot:'stock',name:'LIGHTWEIGHT STOCK',short:'LIGHT',description:'+8% ADS movement · +12% horizontal recoil.',compatible:Object.freeze(['akimbo1887','assault','ump','machineGun']),mods:Object.freeze({recoilYaw:1.12,recoilMaxYaw:1.12}),adsMoveAdd:.08,adsMoveAddByWeapon:Object.freeze({akimbo1887:-.08})}),
  fullStock:Object.freeze({id:'fullStock',slot:'stock',name:'FULL STOCK',short:'FULL',description:'Better recoil control · -8% ADS movement · +8% ADS time.',compatible:Object.freeze(['assault','ump','machineGun']),mods:Object.freeze({recoilPitch:.88,recoilYaw:.84,recoilMaxPitch:.88,recoilMaxYaw:.84,adsInMs:1.08}),adsMoveAdd:-.08}),
  compactStock:Object.freeze({id:'compactStock',slot:'stock',name:'COMPACT STOCK',short:'COMPCT',description:'Faster ADS / movement · substantially more recoil.',compatible:Object.freeze(['assault','ump']),mods:Object.freeze({adsInMs:.92,sprintOutMs:.90,recoilPitch:1.12,recoilYaw:1.24,recoilMaxPitch:1.12,recoilMaxYaw:1.24}),adsMoveAdd:.10}),
});
export function attachmentSpec(id){return ATTACHMENTS[String(id||'')]||null;}
function attachmentFieldForWeapon(item,field,weapon){const map=item?.[`${field}ByWeapon`];if(map&&Object.prototype.hasOwnProperty.call(map,weapon))return map[weapon];return item?.[field];}
export function attachmentModsForWeapon(itemOrId,weapon){const item=typeof itemOrId==='string'?attachmentSpec(itemOrId):itemOrId;return attachmentFieldForWeapon(item,'mods',weapon)||{};}
export function attachmentAccuracyModsForWeapon(itemOrId,weapon){const item=typeof itemOrId==='string'?attachmentSpec(itemOrId):itemOrId;return attachmentFieldForWeapon(item,'accuracyMods',weapon)||{};}
export function attachmentAdsMoveAddForWeapon(itemOrId,weapon){const item=typeof itemOrId==='string'?attachmentSpec(itemOrId):itemOrId;const value=attachmentFieldForWeapon(item,'adsMoveAdd',weapon);return Number.isFinite(Number(value))?Number(value):0;}
export function attachmentOptionsForWeapon(weapon,slot=''){
  const safe=Object.prototype.hasOwnProperty.call(WEAPON_SPECS,weapon)?weapon:'pistol',wanted=String(slot||'');
  return Object.values(ATTACHMENTS).filter(item=>(!wanted||item.slot===wanted)&&item.compatible.includes(safe));
}
export function normalizeWeaponAttachments(weapon,value={}){
  const safe=Object.prototype.hasOwnProperty.call(WEAPON_SPECS,weapon)?weapon:'pistol',raw=value&&typeof value==='object'?value:{},out={};
  for(const slot of ATTACHMENT_SLOTS){const id=String(raw[slot]||''),spec=ATTACHMENTS[id];out[slot]=spec&&spec.slot===slot&&spec.compatible.includes(safe)?id:'';}
  return out;
}
export function attachmentIdsForWeapon(weapon,value={}){const normalized=normalizeWeaponAttachments(weapon,value);return ATTACHMENT_SLOTS.map(slot=>normalized[slot]).filter(Boolean);}
export function weaponHasAttachment(weapon,value,id){return attachmentIdsForWeapon(weapon,value).includes(String(id||''));}
function applyNumericMods(target,mods){for(const [key,mult] of Object.entries(mods||{})){if(Number.isFinite(Number(target[key]))&&Number.isFinite(Number(mult)))target[key]=Number(target[key])*Number(mult);}}
export function resolveWeaponSpec(weapon,attachments={}){
  const safe=Object.prototype.hasOwnProperty.call(WEAPON_SPECS,weapon)?weapon:'pistol',out={...WEAPON_SPECS[safe]},normalized=normalizeWeaponAttachments(safe,attachments);
  for(const id of attachmentIdsForWeapon(safe,normalized)){const item=ATTACHMENTS[id];applyNumericMods(out,attachmentModsForWeapon(item,safe));if(item.adsFov!=null)out.adsFov=Number(item.adsFov);const adsMoveAdd=attachmentAdsMoveAddForWeapon(item,safe);if(adsMoveAdd)out.adsMoveSpeedScale=Math.max(.5,Math.min(1.25,Number(out.adsMoveSpeedScale||1)+adsMoveAdd));if(item.magAdd?.[safe])out.mag=Math.max(1,Math.round(Number(out.mag||1)+Number(item.magAdd[safe])));}
  for(const key of ['mag','reloadMs','cooldownMs','adsInMs','adsOutMs','sprintOutMs','sprintAdsMs'])if(Number.isFinite(Number(out[key])))out[key]=Math.max(key==='mag'?1:0,Math.round(Number(out[key])));
  return out;
}
export function resolveWeaponAccuracy(weapon,attachments={}){
  const safe=Object.prototype.hasOwnProperty.call(WEAPON_ACCURACY,weapon)?weapon:'pistol',out={...WEAPON_ACCURACY[safe]};
  for(const id of attachmentIdsForWeapon(safe,attachments))applyNumericMods(out,attachmentAccuracyModsForWeapon(ATTACHMENTS[id],safe));
  return out;
}
export function attachmentSoundScale(weapon,attachments={}){let scale=1;for(const id of attachmentIdsForWeapon(weapon,attachments)){const value=Number(ATTACHMENTS[id]?.soundScale);if(Number.isFinite(value))scale*=value;}return Math.max(.2,Math.min(1,scale));}
export const WEAPON_SPECS = {
  // Handling fields are part of the weapon role, not cosmetic animation values.
  // adsInMs/adsOutMs drive the actual ADS transition and adsMoveSpeedScale is
  // enforced by both client prediction and server movement validation.
  pistol: { name:'GLOCK', short:'GLK', mag:15, damage:35, playerPenetrationRetention:.42, reloadMs:1050, cooldownMs:180, bulletSpeed:300, lifetimeMs:2600, adsFov:54, adsInMs:135, adsOutMs:110, adsMoveSpeedScale:1.00, sprintOutMs:105, sprintAdsMs:90, pellets:1, headshotMultiplier:1.50, headshotMinDamage:0, falloffStart:24, falloffEnd:58, minDamageScale:.70, recoilPitch:.0202, recoilYaw:.0064, firstShotRecoilScale:.50, recoilMaxPitch:.051, recoilRecovery:15.5, recoilRecoveryDelayMs:45 },
  akimbo1887: { name:'MODEL 1887 AKIMBO', short:'1887×2', mag:14, damage:15, playerPenetrationRetention:.18, reloadMs:3000, cooldownMs:1450, bulletSpeed:280, lifetimeMs:1300, adsFov:70, adsInMs:0, adsOutMs:0, adsMoveSpeedScale:1.00, sprintOutMs:185, sprintAdsMs:0, pellets:8, headshotMultiplier:1.0, headshotMinDamage:0, falloffStart:6.5, falloffEnd:17.5, minDamageScale:.30, recoilPitch:.0415, recoilYaw:.0094, firstShotRecoilScale:.80, recoilMaxPitch:.066, recoilRecovery:9.2, recoilRecoveryDelayMs:90, akimbo:true },
  assault: { name:'ASSAULT RIFLE', short:'AR', mag:30, damage:38, playerPenetrationRetention:.66, reloadMs:1550, cooldownMs:100, bulletSpeed:360, lifetimeMs:2400, adsFov:46, adsInMs:190, adsOutMs:150, adsMoveSpeedScale:.92, sprintOutMs:175, sprintAdsMs:145, pellets:1, headshotMultiplier:1.50, headshotMinDamage:0, falloffStart:38, falloffEnd:88, minDamageScale:.70, recoilPitch:.0097, recoilYaw:.0053, firstShotRecoilScale:.29, recoilMaxPitch:.092, recoilMaxYaw:.041, recoilRecovery:10.5, recoilRecoveryDelayMs:60, automatic:true },
  ump: { name:'UMP', short:'UMP', mag:30, damage:40, playerPenetrationRetention:.52, reloadMs:1400, cooldownMs:80, bulletSpeed:320, lifetimeMs:2300, adsFov:49, adsInMs:150, adsOutMs:125, adsMoveSpeedScale:1.00, sprintOutMs:130, sprintAdsMs:110, pellets:1, headshotMultiplier:1.45, headshotMinDamage:0, falloffStart:17, falloffEnd:52, minDamageScale:.55, recoilPitch:.0067, recoilYaw:.0038, firstShotRecoilScale:.24, recoilMaxPitch:.063, recoilMaxYaw:.028, recoilRecovery:15.5, recoilRecoveryDelayMs:42, automatic:true },
  machineGun: { name:'MACHINE GUN', short:'LMG', mag:75, damage:36, playerPenetrationRetention:.80, reloadMs:3600, cooldownMs:100, bulletSpeed:380, lifetimeMs:2500, adsFov:48, adsInMs:285, adsOutMs:220, adsMoveSpeedScale:.82, sprintOutMs:300, sprintAdsMs:250, pellets:1, headshotMultiplier:1.45, headshotMinDamage:0, falloffStart:38, falloffEnd:95, minDamageScale:.72, recoilPitch:.0086, recoilYaw:.0062, firstShotRecoilScale:.34, recoilMaxPitch:.078, recoilMaxYaw:.050, recoilRecovery:8.8, recoilRecoveryDelayMs:70, automatic:true },
  shotgun: { name:'PUMP SHOTGUN', short:'SG', mag:6, damage:15, playerPenetrationRetention:.20, centerPelletDamageScale:2.0, reloadMs:650, cooldownMs:820, bulletSpeed:300, lifetimeMs:1250, adsFov:52, adsInMs:180, adsOutMs:145, adsMoveSpeedScale:.95, sprintOutMs:190, sprintAdsMs:160, pellets:8, headshotMultiplier:1.05, headshotMinDamage:0, falloffStart:9, falloffEnd:22, minDamageScale:.32, recoilPitch:.0395, recoilYaw:.0098, firstShotRecoilScale:.80, recoilMaxPitch:.060, recoilRecovery:9.2, recoilRecoveryDelayMs:85, shellReload:true },
  semiShotgun: { name:'SEMI-AUTO SHOTGUN', short:'SAS', mag:8, damage:13, playerPenetrationRetention:.16, centerPelletDamageScale:1.70, reloadMs:1700, cooldownMs:360, bulletSpeed:300, lifetimeMs:1250, adsFov:51, adsInMs:170, adsOutMs:140, adsMoveSpeedScale:.96, sprintOutMs:180, sprintAdsMs:155, pellets:8, headshotMultiplier:1.05, headshotMinDamage:0, falloffStart:7, falloffEnd:20, minDamageScale:.30, recoilPitch:.0305, recoilYaw:.0120, firstShotRecoilScale:.58, recoilMaxPitch:.073, recoilRecovery:8.8, recoilRecoveryDelayMs:72 },
  sniper: { name:'SNIPER', short:'SNP', mag:5, damage:115, playerPenetrationRetention:.92, lowerBodyDamageScale:.76, armDamageScale:.72, reloadMs:1950, cooldownMs:1150, bulletSpeed:700, lifetimeMs:2000, adsFov:18, adsInMs:330, adsOutMs:220, adsMoveSpeedScale:.72, sprintOutMs:300, sprintAdsMs:260, pellets:1, headshotMultiplier:1.50, headshotMinDamage:0, falloffStart:130, falloffEnd:200, minDamageScale:.88, recoilPitch:.066, recoilYaw:.0112, firstShotRecoilScale:.84, recoilMaxPitch:.087, recoilRecovery:7.8, recoilRecoveryDelayMs:100 },
  grenadeLauncher: { name:'GRENADE LAUNCHER', short:'GL', mag:1, damage:25, playerPenetrationRetention:0, reloadMs:1800, cooldownMs:1200, bulletSpeed:33, lifetimeMs:3000, adsFov:52, adsInMs:220, adsOutMs:175, adsMoveSpeedScale:.88, sprintOutMs:240, sprintAdsMs:200, pellets:1, headshotMultiplier:1, headshotMinDamage:0, falloffStart:999, falloffEnd:1000, minDamageScale:1, recoilPitch:.045, recoilYaw:.0085, firstShotRecoilScale:.78, recoilMaxPitch:.068, recoilRecovery:8.2, recoilRecoveryDelayMs:105, projectileGravity:13.5, projectileRadius:.11, launchPitchDeg:5.0, explosionRadius:5.2, explosionDamage:120 },
  rpg: { name:'RPG', short:'RPG', mag:1, damage:30, playerPenetrationRetention:0, reloadMs:2600, cooldownMs:1600, bulletSpeed:50, lifetimeMs:4300, adsFov:50, adsInMs:300, adsOutMs:230, adsMoveSpeedScale:.76, sprintOutMs:320, sprintAdsMs:270, pellets:1, headshotMultiplier:1, headshotMinDamage:0, falloffStart:999, falloffEnd:1000, minDamageScale:1, recoilPitch:.0535, recoilYaw:.0075, firstShotRecoilScale:.84, recoilMaxPitch:.076, recoilRecovery:7.4, recoilRecoveryDelayMs:115, projectileGravity:0, projectileRadius:.085, explosionRadius:6.0, explosionDamage:145 },
};
// Accuracy is centered on the reticle. Movement, stance, airborne state and
// sustained-fire heat widen the cone around that center; they never offset the
// cone sideways from the player's aim direction.
export const WEAPON_ACCURACY = {
  pistol: { hipDeg:1.10, adsDeg:0.08, moveDeg:0.60, adsMoveScale:0.34, airborneDeg:1.50, crouchScale:0.78, slideDeg:.70, fireDeg:0.28, fireMaxDeg:1.00, heatRecoveryMs:165 },
  akimbo1887: { hipDeg:5.35, adsDeg:5.35, moveDeg:1.05, adsMoveScale:1, airborneDeg:2.15, crouchScale:0.90, slideDeg:1.15, fireDeg:0.08, fireMaxDeg:0.30, heatRecoveryMs:270 },
  assault: { hipDeg:1.90, adsDeg:0.06, moveDeg:0.94, adsMoveScale:0.30, airborneDeg:1.90, crouchScale:0.78, slideDeg:1.12, fireDeg:0.21, fireMaxDeg:1.02, heatRecoveryMs:220 },
  ump: { hipDeg:1.35, adsDeg:0.09, moveDeg:0.62, adsMoveScale:0.27, airborneDeg:1.58, crouchScale:0.80, slideDeg:.78, fireDeg:0.26, fireMaxDeg:1.20, heatRecoveryMs:190 },
  machineGun: { hipDeg:2.50, adsDeg:0.075, moveDeg:1.18, adsMoveScale:0.38, airborneDeg:2.35, crouchScale:0.75, slideDeg:1.42, fireDeg:0.20, fireMaxDeg:1.00, heatRecoveryMs:265 },
  shotgun: { hipDeg:4.50, adsDeg:2.40, moveDeg:0.96, adsMoveScale:0.50, airborneDeg:1.58, crouchScale:0.87, slideDeg:.76, fireDeg:0.04, fireMaxDeg:0.14, heatRecoveryMs:235 },
  semiShotgun: { hipDeg:5.20, adsDeg:3.15, moveDeg:1.10, adsMoveScale:0.55, airborneDeg:1.75, crouchScale:0.90, slideDeg:.88, fireDeg:0.19, fireMaxDeg:0.78, heatRecoveryMs:285 },
  sniper: { hipDeg:7.00, adsDeg:0.02, moveDeg:1.85, adsMoveScale:0.24, airborneDeg:3.60, crouchScale:0.74, slideDeg:2.25, fireDeg:0.04, fireMaxDeg:0.12, heatRecoveryMs:330 },
  grenadeLauncher: { hipDeg:1.50, adsDeg:0.24, moveDeg:0.82, adsMoveScale:0.40, airborneDeg:1.75, crouchScale:0.85, slideDeg:1.10, fireDeg:0.04, fireMaxDeg:0.08, heatRecoveryMs:350 },
  rpg: { hipDeg:2.00, adsDeg:0.30, moveDeg:1.02, adsMoveScale:0.44, airborneDeg:2.10, crouchScale:0.88, slideDeg:1.30, fireDeg:0.04, fireMaxDeg:0.08, heatRecoveryMs:390 },
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
export function weaponSpreadRadians(weapon,moveSpeed,runSpeed,adsAmount=0,crouched=false,airborne=false,shotHeat=0,sliding=false,attachments={}){
  const accuracy=resolveWeaponAccuracy(weapon,attachments),ads=clamp01(adsAmount),moveRatio=Math.max(0,Math.min(1,(Number(moveSpeed)||0)/Math.max(.1,Number(runSpeed)||.1)));
  // CoD-style iron/scope ADS is sight-authoritative for single-projectile guns:
  // at full ADS the visible sight point is the shot direction. Recoil moves that
  // aim ray; a hidden random cone must not move the bullet away from the post.
  if(ads>=.985&&(weapon==='pistol'||weapon==='assault'||weapon==='ump'||weapon==='machineGun'||weapon==='sniper'))return 0;
  const base=accuracy.hipDeg+(accuracy.adsDeg-accuracy.hipDeg)*ads,moveScale=1+(accuracy.adsMoveScale-1)*ads;
  let degrees=base+accuracy.moveDeg*moveRatio*moveScale;
  if(airborne)degrees+=accuracy.airborneDeg*(1-.18*ads);
  if(sliding&&!airborne)degrees+=Math.max(0,Number(accuracy.slideDeg)||0)*(1-.28*ads);
  else if(crouched&&!airborne)degrees*=accuracy.crouchScale;
  const firePenalty=Math.min(accuracy.fireMaxDeg,Math.max(0,Number(shotHeat)||0)*accuracy.fireDeg)*(1-.42*ads);
  degrees+=firePenalty;
  return Math.max(0,degrees)*Math.PI/180;
}

export function weaponDamageAtDistance(weapon,baseDamage,distance,headshot=false,attachments={}){
  const spec=resolveWeaponSpec(weapon,attachments),base=Math.max(0,Number(baseDamage)||0),d=Math.max(0,Number(distance)||0);
  const start=Math.max(0,Number(spec.falloffStart)||0),end=Math.max(start+.001,Number(spec.falloffEnd)||start+.001),minScale=Math.max(0,Math.min(1,Number(spec.minDamageScale)||1));
  const t=Math.max(0,Math.min(1,(d-start)/(end-start))),scaled=base*(1-(1-minScale)*t);
  if(!headshot)return scaled;
  return Math.max(Number(spec.headshotMinDamage)||0,scaled*Math.max(1,Number(spec.headshotMultiplier)||1));
}

export function weaponZoneDamageScale(weapon,zone='upper'){
  const spec=WEAPON_SPECS[weapon]||WEAPON_SPECS.pistol;
  if(zone==='lower')return Math.max(0,Math.min(1,Number(spec.lowerBodyDamageScale) || 1));
  if(zone==='arm')return Math.max(0,Math.min(1,Number(spec.armDamageScale) || 1));
  return 1;
}

export const MOVEMENT_FEEL = Object.freeze({
  groundAcceleration:58,
  groundBraking:78,
  airAcceleration:16,
  coyoteTimeMs:105,
  jumpBufferMs:130,
  sprintSpeedMultiplier:1.28,
  sprintMinForward:0.35,
  sprintMinInput:0.55,
  slideDurationMs:650,
  slideStartSpeedMultiplier:1.72,
  slideEndSpeedMultiplier:0.10,
  slideSteer:0.12,
  slideRecoveryMs:200,
  slideServerGraceMs:900,
});

export const WEAPON_SWITCH_MS = 280;

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


export const LOADOUT_CLASS_COUNT = 5;
export const LOADOUT_CLASS_IDS = Object.freeze(Array.from({length:LOADOUT_CLASS_COUNT},(_,i)=>`class${i+1}`));
const LOADOUT_CLASS_PRESETS = Object.freeze([
  Object.freeze({name:'CLASS 1',primaryWeapon:'assault',secondaryWeapon:'pistol',tactical:'flash',lethal:'sticky'}),
  Object.freeze({name:'CLASS 2',primaryWeapon:'ump',secondaryWeapon:'pistol',tactical:'flash',lethal:'frag'}),
  Object.freeze({name:'CLASS 3',primaryWeapon:'machineGun',secondaryWeapon:'pistol',tactical:'smoke',lethal:'sticky'}),
  Object.freeze({name:'CLASS 4',primaryWeapon:'assault',secondaryWeapon:'shotgun',tactical:'flash',lethal:'frag'}),
  Object.freeze({name:'CLASS 5',primaryWeapon:'sniper',secondaryWeapon:'pistol',tactical:'smoke',lethal:'sticky'}),
]);
export function normalizeLoadoutClassId(value){const id=String(value||'');return LOADOUT_CLASS_IDS.includes(id)?id:LOADOUT_CLASS_IDS[0];}
export function normalizeLoadoutClassName(value,index=0){const clean=String(value||'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim().slice(0,18);return clean||`CLASS ${Math.max(1,Math.min(LOADOUT_CLASS_COUNT,Number(index)+1))}`;}
export function normalizeLoadoutDefinition(value={},fallback={primaryWeapon:'assault',secondaryWeapon:'pistol',primaryAttachments:{},secondaryAttachments:{},tactical:'flash',lethal:'sticky'}){
  const v=value&&typeof value==='object'?value:{},f=fallback&&typeof fallback==='object'?fallback:{},primaryWeapon=PRIMARY_WEAPONS.includes(v.primaryWeapon)?v.primaryWeapon:(PRIMARY_WEAPONS.includes(f.primaryWeapon)?f.primaryWeapon:'assault'),secondaryWeapon=SECONDARY_WEAPONS.includes(v.secondaryWeapon)?v.secondaryWeapon:(SECONDARY_WEAPONS.includes(f.secondaryWeapon)?f.secondaryWeapon:'pistol');
  return {primaryWeapon,secondaryWeapon,primaryAttachments:normalizeWeaponAttachments(primaryWeapon,v.primaryAttachments??f.primaryAttachments),secondaryAttachments:normalizeWeaponAttachments(secondaryWeapon,v.secondaryAttachments??f.secondaryAttachments),tactical:normalizeTactical(v.tactical??f.tactical),lethal:normalizeLethal(v.lethal??f.lethal)};
}
export function defaultLoadoutClasses(baseLoadout=null){const out=[];for(let i=0;i<LOADOUT_CLASS_COUNT;i++){const preset=LOADOUT_CLASS_PRESETS[i]||LOADOUT_CLASS_PRESETS[0],seed=i===0&&baseLoadout?normalizeLoadoutDefinition(baseLoadout,preset):normalizeLoadoutDefinition(preset,preset);out.push({id:LOADOUT_CLASS_IDS[i],name:normalizeLoadoutClassName(preset.name,i),...seed});}return out;}
export function normalizeLoadoutClasses(value,baseLoadout=null){const fallback=defaultLoadoutClasses(baseLoadout),raw=Array.isArray(value)?value:[];return LOADOUT_CLASS_IDS.map((id,i)=>{const source=raw.find(item=>String(item?.id||'')===id)||raw[i]||fallback[i],loadout=normalizeLoadoutDefinition(source,fallback[i]);return{id,name:normalizeLoadoutClassName(source?.name,i),...loadout};});}
export function loadoutClassById(classes,id,baseLoadout=null){const normalized=normalizeLoadoutClasses(classes,baseLoadout),safeId=normalizeLoadoutClassId(id);return normalized.find(item=>item.id===safeId)||normalized[0];}

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
  combat: { regenDelayMs:5000, regenPerSecond:50, respawnMs:2800 },
  weapons: Object.fromEntries(WEAPON_ORDER.map((name) => {
    const spec = WEAPON_SPECS[name];
    return [name, { damage:spec.damage, speed:spec.bulletSpeed, reloadMs:spec.reloadMs, cooldownMs:spec.cooldownMs, recoilScale:100 }];
  })),
};

export function normalizeWorldSettings(value) {
  const v=value&&typeof value==='object'?value:{},movement=v.movement&&typeof v.movement==='object'?v.movement:{},combat=v.combat&&typeof v.combat==='object'?v.combat:{},weapons=v.weapons&&typeof v.weapons==='object'?v.weapons:{};
  const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
  const bounded=(value,min,max,fallback)=>Math.max(min,Math.min(max,number(value,fallback)));
  const weapon=(name)=>{const src=weapons[name]&&typeof weapons[name]==='object'?weapons[name]:{},def=DEFAULT_WORLD_SETTINGS.weapons[name];return{damage:bounded(src.damage,1,400,def.damage),speed:bounded(src.speed,10,800,def.speed),reloadMs:Math.round(bounded(src.reloadMs,100,5000,def.reloadMs)),cooldownMs:Math.round(bounded(src.cooldownMs,50,2500,def.cooldownMs)),recoilScale:bounded(src.recoilScale,0,300,def.recoilScale)}};
  const runSpeed=bounded(movement.runSpeed,3,16,DEFAULT_WORLD_SETTINGS.movement.runSpeed);
  return {
    movement:{runSpeed,walkSpeed:Math.min(runSpeed,bounded(movement.walkSpeed,1.5,9,DEFAULT_WORLD_SETTINGS.movement.walkSpeed)),jumpHeight:bounded(movement.jumpHeight,.4,5,DEFAULT_WORLD_SETTINGS.movement.jumpHeight),gravity:bounded(movement.gravity,8,40,DEFAULT_WORLD_SETTINGS.movement.gravity)},
    combat:{regenDelayMs:Math.round(bounded(combat.regenDelayMs,0,15000,DEFAULT_WORLD_SETTINGS.combat.regenDelayMs)),regenPerSecond:bounded(combat.regenPerSecond,0,100,DEFAULT_WORLD_SETTINGS.combat.regenPerSecond),respawnMs:Math.round(bounded(combat.respawnMs,1000,10000,DEFAULT_WORLD_SETTINGS.combat.respawnMs))},
    weapons:Object.fromEntries(WEAPON_ORDER.map(name=>[name,weapon(name)])),
  };
}

export const EQUIPMENT_THROW_COMMIT_MS = 135;
export const EQUIPMENT_WEAPON_RECOVER_MS = 285;
export const TACTICAL_THROW_SPEED = 23.5;
export const TACTICAL_THROW_LOFT = 6.4;
export const TACTICAL_GRAVITY = 18;
export const EQUIPMENT_COLLISION_RADII = Object.freeze({flash:.09,smoke:.10,sticky:.11,frag:.12});
export function equipmentCollisionRadius(kind){return Number(EQUIPMENT_COLLISION_RADII[String(kind||'')])||.10;}
export const FLASH_RADIUS = 18;
export const STICKY_RADIUS = 7.2;
export const STICKY_MAX_DAMAGE = 145;
export const FRAG_RADIUS = 7.8;
export const FRAG_MAX_DAMAGE = 150;
export const SMOKE_RADIUS = 9.6;
export const SMOKE_DURATION_MS = 14000;
export const SMOKE_LOS_RADIUS_SCALE = .88;
export const SMOKE_GROW_MS = 750;
export const SMOKE_START_SCALE = .54;
export const GROUND_FOLLOW_DROP = 0.32;
