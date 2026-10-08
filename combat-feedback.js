// An explicit source is authoritative, including null for non-directional damage.
// Only legacy callers without a source may infer one from knockback/attacker.
export function damageSource(target,attacker,knockback={},hit={}){
  if(Object.prototype.hasOwnProperty.call(hit,'source')){
    const source=hit.source;
    return source&&Number.isFinite(source.x)&&Number.isFinite(source.z)?{x:source.x,y:Number.isFinite(source.y)?source.y:target.y+1,z:source.z}:null;
  }
  const x=Number(knockback.x)||0,z=Number(knockback.z)||0,length=Math.hypot(x,z);
  if(length>.001){const distance=Math.max(1,Number(hit.distance)||8);return{x:target.x-x/length*distance,y:target.y+1,z:target.z-z/length*distance};}
  return attacker&&Number.isFinite(attacker.x)&&Number.isFinite(attacker.z)?{x:attacker.x,y:attacker.y+1,z:attacker.z}:null;
}
