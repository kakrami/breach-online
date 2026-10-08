import {infectionClass,infectionAbilityActive} from './infection-rules.js';
// Shared actor shape contract. Ordinary actors retain the 2.5 dimensions.
export function actorScale(actor){
  if(!actor?.boss)return 1;
  const scale=Number(actor.bossScale);
  return Number.isFinite(scale)?Math.max(1,Math.min(2,scale)):1.34;
}
export function actorDimensions(actor,{height,radius,crouchHeight}){
  const scale=actorScale(actor);
  return {scale,height:(actor?.crouched?crouchHeight:height)*scale,radius:radius*scale};
}
export function roleMovement(base,mode,actor,now=Date.now()){
  if(mode!=='infection')return base;
  const cls=infectionClass(actor?.infectionClass),active=infectionAbilityActive(actor,now),frozen=Number(actor?.frozenUntil||0)>now,burning=Number(actor?.burningUntil||0)>now;
  const speed=frozen?0:(actor?.infected?cls.speed:1)*(burning?.82:1)*(active?cls.boost:1);
  return {...base,walkSpeed:base.walkSpeed*speed,runSpeed:base.runSpeed*speed,jumpHeight:frozen?0:base.jumpHeight*(actor?.infected?(active&&cls.abilityJump?cls.abilityJump:cls.jump):1)};
}
