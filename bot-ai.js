const TAU=Math.PI*2;
const finite=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

export const BOT_WEAPONS=Object.freeze(['assault','ump','machineGun','shotgun','semiShotgun','sniper']);

export const BOT_DIFFICULTIES=Object.freeze({
  easy:Object.freeze({moveRun:.48,moveWalk:.62,strafe:.12,range:19,fireScale:1.16,reactionBase:430,reactionJitter:360,aimTurnDegPerSec:115,aimNoiseDeg:2.4,aimToleranceDeg:5.8,burstMin:2,burstMax:4,burstPauseMin:360,burstPauseMax:620,equipmentMinMs:18000,equipmentMaxMs:26000}),
  normal:Object.freeze({moveRun:.76,moveWalk:.90,strafe:.42,range:30,fireScale:1.00,reactionBase:185,reactionJitter:150,aimTurnDegPerSec:225,aimNoiseDeg:1.05,aimToleranceDeg:3.0,burstMin:3,burstMax:6,burstPauseMin:190,burstPauseMax:380,equipmentMinMs:13500,equipmentMaxMs:21000}),
  hard:Object.freeze({moveRun:.96,moveWalk:1.02,strafe:.72,range:38,fireScale:.93,reactionBase:92,reactionJitter:75,aimTurnDegPerSec:325,aimNoiseDeg:.55,aimToleranceDeg:1.8,burstMin:4,burstMax:8,burstPauseMin:130,burstPauseMax:280,equipmentMinMs:11000,equipmentMaxMs:18000}),
  elite:Object.freeze({moveRun:1.06,moveWalk:1.10,strafe:.92,range:46,fireScale:.88,reactionBase:58,reactionJitter:42,aimTurnDegPerSec:430,aimNoiseDeg:.30,aimToleranceDeg:1.15,burstMin:5,burstMax:10,burstPauseMin:95,burstPauseMax:220,equipmentMinMs:9000,equipmentMaxMs:15500}),
});

export function safeBotDifficulty(value){const key=String(value||'normal').toLowerCase();return Object.prototype.hasOwnProperty.call(BOT_DIFFICULTIES,key)?key:'normal';}
export function normalizeAngle(value){let angle=finite(value,0);while(angle>Math.PI)angle-=TAU;while(angle<-Math.PI)angle+=TAU;return angle;}
export function approachAngle(current,target,maxStep){const delta=normalizeAngle(finite(target)-finite(current));return normalizeAngle(finite(current)+clamp(delta,-Math.abs(maxStep),Math.abs(maxStep)));}
export function approachValue(current,target,maxStep){const delta=finite(target)-finite(current);return finite(current)+clamp(delta,-Math.abs(maxStep),Math.abs(maxStep));}

export function botWeaponRole(weapon,profile){
  const p=profile||BOT_DIFFICULTIES.normal,range=Math.max(8,finite(p.range,30));
  switch(String(weapon||'')){
    case 'ump':return{preferred:7,engage:Math.min(32,range*1.06),adsMin:6,retreatBelow:2.8};
    case 'machineGun':return{preferred:14,engage:Math.max(32,range*1.12),adsMin:9,retreatBelow:7.5};
    case 'shotgun':return{preferred:4.5,engage:Math.min(18,range),adsMin:6.5,retreatBelow:0};
    case 'semiShotgun':return{preferred:6.2,engage:Math.min(21,range),adsMin:7.5,retreatBelow:0};
    case 'sniper':return{preferred:25,engage:Math.max(40,range*1.30),adsMin:11,retreatBelow:13};
    default:return{preferred:11,engage:Math.max(30,range),adsMin:7,retreatBelow:5.5};
  }
}

export function targetThreatScore(candidate,currentTargetId=''){
  if(!candidate)return Infinity;
  const distance=Math.sqrt(Math.max(0,finite(candidate.d2,0))),target=candidate.target||{},current=String(candidate.id||target.clientId||target.id||'')===String(currentTargetId||'');
  const hp=clamp(finite(target.hp,100),0,100),targetYaw=finite(target.yaw,0),toBotYaw=Math.atan2(-(finite(candidate.botX)-finite(target.x)),-(finite(candidate.botZ)-finite(target.z))),facing=Math.cos(normalizeAngle(targetYaw-toBotYaw));
  let score=distance;
  if(current)score-=8.5;
  if(facing>.55)score-=3.5*facing;
  score-=(100-hp)*.018;
  return score;
}

export function chooseVisibleBotTarget(candidates,currentTargetId='',lockUntil=0,now=Date.now()){
  const visible=(candidates||[]).filter(item=>item?.visible);
  if(!visible.length)return null;
  for(const item of visible){item.id=String(item.id||item.target?.clientId||item.target?.id||'');item.score=targetThreatScore(item,currentTargetId);}
  visible.sort((a,b)=>a.score-b.score);
  const current=visible.find(item=>item.id===String(currentTargetId||''));
  if(current&&now<finite(lockUntil,0))return current;
  if(current&&visible[0]!==current&&visible[0].score>current.score-5.5)return current;
  return visible[0];
}

export function botReactionDelay(profile,random=Math.random){const p=profile||BOT_DIFFICULTIES.normal;return Math.max(0,Math.round(finite(p.reactionBase,180)+random()*finite(p.reactionJitter,140)));}
export function botBurstSize(profile,distance,weapon,random=Math.random){
  const p=profile||BOT_DIFFICULTIES.normal,min=Math.max(1,Math.floor(finite(p.burstMin,3))),max=Math.max(min,Math.floor(finite(p.burstMax,6)));
  let lo=min,hi=max;if(distance>26){hi=Math.max(lo,Math.ceil(hi*.65));}else if(distance<9&&(weapon==='ump'||weapon==='assault'))lo=Math.min(hi,lo+1);
  return lo+Math.floor(random()*(hi-lo+1));
}
export function botBurstPause(profile,random=Math.random){const p=profile||BOT_DIFFICULTIES.normal,min=finite(p.burstPauseMin,180),max=Math.max(min,finite(p.burstPauseMax,380));return Math.round(min+random()*(max-min));}
export function botEquipmentDelay(profile,random=Math.random){const p=profile||BOT_DIFFICULTIES.normal,min=finite(p.equipmentMinMs,13000),max=Math.max(min,finite(p.equipmentMaxMs,21000));return Math.round(min+random()*(max-min));}
export function botAimNoiseRadians(profile,ads=false){const deg=Math.max(0,finite(profile?.aimNoiseDeg,1))*(ads?.48:1);return deg*Math.PI/180;}
export function botAimToleranceRadians(profile,ads=false){const deg=Math.max(.1,finite(profile?.aimToleranceDeg,3))*(ads?.82:1);return deg*Math.PI/180;}
