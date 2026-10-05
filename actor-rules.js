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
export function roleMovement(base,mode,actor,infectionSpeed=1.2){
  return mode==='infection'&&actor?.infected?{...base,walkSpeed:base.walkSpeed*infectionSpeed,runSpeed:base.runSpeed*infectionSpeed}:base;
}
