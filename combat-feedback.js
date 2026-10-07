// Use the impact's origin/direction, never a shooter's newer position.
export function damageSource(target,attacker,knockback={},hit={}){
  const source=hit.source;
  if(source&&Number.isFinite(source.x)&&Number.isFinite(source.z))return{x:source.x,y:Number.isFinite(source.y)?source.y:target.y+1,z:source.z};
  const x=Number(knockback.x)||0,z=Number(knockback.z)||0,length=Math.hypot(x,z);
  if(length>.001){const distance=Math.max(1,Number(hit.distance)||8);return{x:target.x-x/length*distance,y:target.y+1,z:target.z-z/length*distance};}
  return attacker&&Number.isFinite(attacker.x)&&Number.isFinite(attacker.z)?{x:attacker.x,y:attacker.y+1,z:attacker.z}:null;
}
