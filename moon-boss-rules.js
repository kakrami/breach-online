import { zombieBossSpec } from './infection-rules.js';
export const BOSS_WEAKPOINT=Object.freeze({y:1.06,z:-.35,radius:.18,damageScale:2});
export const MOON_SUPPLY=Object.freeze({firstMs:30000,intervalMs:60000,approachMs:5000,beamMs:2500,departureMs:3000,expiryMs:45000,maxPickups:2,claimRadius:1.6,heal:45});
export function bossSpec(archetype,wave,players=1){
 const base=zombieBossSpec(wave,players),kind=archetype==='ravager'?'ravager':'abomination';
 return {...base,kind,reach:kind==='ravager'?7+Math.min(5,base.tier-1)*.8:base.reach,width:2.2,windupMs:kind==='ravager'?1400:1100,attackDurationMs:kind==='ravager'?1000:180,recoveryMs:kind==='ravager'?1800:1600,chargeSpeed:11};
}
export function bossKindForWave(wave){return Math.floor(wave/5)%2===0?'ravager':'abomination';}
export function bossWeakpointActive(bot,now){return !!bot?.boss&&bot.bossPhase==='recovery'&&now>=bot.bossPhaseStartedAt&&now<bot.weakpointUntil&&bot.hp>0;}
export function bossAttackGeometry(bot){
 const common={x:Number(bot.x)||0,y:Number(bot.y)||0,z:Number(bot.z)||0,maxHeightDelta:1.25};
 if(bot.bossKind==='ravager'){const yaw=Number(bot.bossAttackYaw)||0;return {...common,kind:'lane',dx:-Math.sin(yaw),dz:-Math.cos(yaw),length:Math.max(0,(Number(bot.bossAttackReach)||0)-(Number(bot.bossAttackDistance)||0)),width:Number(bot.bossAttackWidth)||2.2};}
 return {...common,kind:'circle',radius:Number(bot.bossAttackReach)||2.6};
}
export function bossAttackContains(shape,actor,radius=0){
 if(Math.abs((Number(actor.y)||0)-shape.y)>shape.maxHeightDelta)return false;
 const x=actor.x-shape.x,z=actor.z-shape.z;
 if(shape.kind==='circle')return Math.hypot(x,z)<=shape.radius+radius;
 const along=x*shape.dx+z*shape.dz,side=Math.abs(x*shape.dz-z*shape.dx);
 return along>=-radius&&along<=shape.length+radius&&side<=shape.width/2+radius;
}
