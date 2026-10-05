export const INFECTION = Object.freeze({buyMs:15000,roundMs:120000,breakMs:7000,speed:1.2,reach:2.4,clawMs:650,clawDamage:40,startCash:2000,cashCap:16000});
export const INFECTION_SHOP = Object.freeze({heal:{cost:300,label:'MEDKIT'},armor:{cost:600,label:'ARMOR'},smg:{cost:1200,label:'UMP SMG',weapon:'ump'},sniper:{cost:1600,label:'SNIPER',weapon:'sniper'},assault:{cost:2200,label:'ASSAULT RIFLE',weapon:'assault'},frag:{cost:400,label:'FRAG GRENADE'}});
export function infectionCash(value,amount=0){return Math.min(INFECTION.cashCap,Math.max(0,Math.floor(Number(value)||0)+amount));}
export function infectionOutcome(actors,now,endsAt){const alive=actors.filter(a=>a.hp>0);if(!alive.some(a=>!a.infected))return'red';if(!alive.some(a=>a.infected))return'blue';return now>=endsAt?'blue':'';}
export function zombieBossSpec(wave,players=1){const tier=Math.min(6,Math.max(1,Math.floor(wave/5)));return {tier,health:Math.round((450+tier*110)*(1+Math.min(3,Math.max(0,players-1))*.3)),speed:Math.min(4.6,2.5+tier*.28),damage:Math.min(45,20+tier*4),reach:2.4+Math.min(3,tier)*.2,windupMs:1100,attackMs:2400-Math.min(5,tier)*100};}

// Shared server/UI purchase rules; the server still owns the transaction.
export function infectionPurchaseAvailability(actor,item,phase){
  const spec=INFECTION_SHOP[item];
  const reason=!spec?'unavailable':phase!=='buy'?'phase_locked':!(actor?.hp>0)?'not_alive':actor.infected?'infected':infectionCash(actor.cash)<spec.cost?'insufficient_cash':item==='armor'&&(actor.armor||0)>=100?'armor_full':item==='frag'&&(actor.equipment?.frag||0)>=3?'grenades_full':item==='heal'&&(actor.medkits||0)>=2?'medkits_full':spec.weapon&&actor.primaryOwned&&actor.primaryWeapon===spec.weapon?'already_owned':'';
  return {accepted:!reason,reason};
}
