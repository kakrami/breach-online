import {WEAPON_SPECS} from './game-config.js';
export const INFECTION_ROUND_INTENTS=Object.freeze(['state','fire','reload','weapon','traverse','ladder']);
// Shared Infection contract: identical authority and presentation rules.
export const INFECTION = Object.freeze({buyMs:20000,roundMs:180000,rounds:5,intermissionMs:6000,respawnMs:3000,spawnRetryMs:500,spawnProtectionMs:1200,exposedSpawnProtectionMs:2500,seedReleaseMs:3000,reach:1.65,clawMs:1000,clawWindupMs:200,clawDamage:100,startCash:8,cashCap:30,roundRewardCap:8,minSpawnDistance:24,spawnSightDistance:10000,damagePerPack:500,motherRatio:8,conversionGraceMs:2200,knockbackCap:4.2,knockbackWindowMs:350,barricadeHp:420,barricadeLimit:3});
export const INFECTION_ARMS = Object.freeze({frostRadius:4,grenadeFuseMs:1500,frostMs:1400,frostRecoveryMs:8000});
export const INFECTION_CLASSES = Object.freeze({
 runner:{label:'HUNTER',hp:950,speed:1.14,jump:1,knockback:1,ability:'DASH',abilityMs:850,cooldownMs:13000,boost:1.65,detail:'Dash through gaps · light health'},
 leaper:{label:'LEAPER',hp:800,speed:1.1,jump:1.1,knockback:1.1,ability:'POUNCE',abilityMs:1200,cooldownMs:16000,boost:1.3,abilityJump:2.5,recoveryMs:450,detail:'Fragile directional pounce · committed landing recovery'},
 brute:{label:'BRUTE',hp:1650,speed:1.04,jump:.9,knockback:.55,ability:'CHARGE',abilityMs:1700,cooldownMs:20000,boost:1.5,resistance:.5,detail:'Charge breaks barricades · slow turns'}
});
export function infectionClassId(id){return Object.hasOwn(INFECTION_CLASSES,id)?id:'runner';}
export function infectionClass(id){return INFECTION_CLASSES[infectionClassId(id)];}
export function infectionAbilityActive(actor,now=Date.now()){return !!actor?.infected&&now>=Number(actor.abilityStartsAt||0)&&now<Number(actor.abilityUntil||0);}
export function infectionStatusActive(actor,key,now=Date.now()){return Number(actor?.[key]||0)>now;}
export function infectionInitialCount(count){return count<2?0:Math.max(1,Math.min(count-1,Math.ceil(count/INFECTION.motherRatio)));}
export function infectionFirstHealth(count){return Math.min(1.8,1.2+Math.max(0,count-2)*.035);}
export const INFECTION_SHOP = Object.freeze({
 smg:{cost:3,label:WEAPON_SPECS.ump.name,role:'survivor',tab:'weapons',weapon:'ump',detail:'Free during preparation · close-range defense'},
 assault:{cost:3,label:WEAPON_SPECS.assault.name,role:'survivor',tab:'weapons',weapon:'assault',detail:'Free during preparation · versatile defense'},
 shotgun:{cost:3,label:WEAPON_SPECS.shotgun.name,role:'survivor',tab:'weapons',weapon:'shotgun',detail:'Free during preparation · strong close-range knockback'},
 auto:{cost:3,label:WEAPON_SPECS.semiShotgun.name,role:'survivor',tab:'weapons',weapon:'semiShotgun',detail:'Free during preparation · close-range follow-up shots'},
 machine:{cost:3,label:WEAPON_SPECS.machineGun.name,role:'survivor',tab:'weapons',weapon:'machineGun',detail:'Free during preparation · sustained defensive fire'},
 battleRifle:{cost:3,label:WEAPON_SPECS.battleRifle.name,role:'survivor',tab:'weapons',weapon:'battleRifle',detail:'Free during preparation · bolt-action precision'},
 sniper:{cost:3,label:WEAPON_SPECS.sniper.name,role:'survivor',tab:'weapons',weapon:'sniper',detail:'Free during preparation · powerful single shots'},
 frost:{cost:3,label:'SLOW GRENADE',role:'survivor',tab:'gear',detail:'Reserve one extra · brief slow, never a freeze',art:'frost'},
 barricade:{cost:4,label:'BARRICADE KIT',role:'survivor',tab:'gear',detail:'Reserve for this round · destructible cover at marked sockets',art:'barricade'},
 ...Object.fromEntries(Object.entries(INFECTION_CLASSES).map(([id,v])=>['class_'+id,{cost:0,label:v.label,role:'any',tab:'classes',classId:id,detail:v.detail,art:'class_'+id}]))
});
export function isInfectionPrimaryWeapon(weapon){return Object.values(INFECTION_SHOP).some(item=>item.weapon===weapon);}
export function infectionShopItems(infected,tab=infected?'gear':'weapons',chaos=false){return Object.entries(INFECTION_SHOP).filter(([,s])=>s.tab===tab&&(!s.chaos||chaos)&&(s.role==='any'||s.role===(infected?'infected':'survivor')));}
export function infectionPrice(spec,phase){return spec?.weapon&&phase==='buy'?0:spec?.cost||0;}
export function infectionCash(value,amount=0){const cash=Number(value),delta=Number(amount);return Math.min(INFECTION.cashCap,Math.max(0,Math.floor(Number.isFinite(cash)?cash:0)+Math.floor(Number.isFinite(delta)?delta:0)));}
export function infectionOutcome(actors,now,endsAt){if(actors.length<2)return '';if(!actors.some(a=>!a.infected))return 'red';if(now>=endsAt)return 'blue';return '';}
export function infectionPublicState(a={}){const keys=['infectionSpawnExposed','infectionRoundReward','infectionReservations','infectionReservedCash','infectionPurchaseSequence','frostSlowUntil','infectionRound','infectionPending','infectionClass','infectionNextClass','infectionMother','infectionReadyAt','infectionGear','infectionGrenades','infectionStats','infectionTotals','survivalMs','survivalTotalMs','abilityStartsAt','abilityUntil','abilityReadyAt','abilityYaw','abilityRecoveryUntil','clawImpactAt','frostRecoveryUntil','lastArmorHitAt','frozenUntil','burningUntil','grenadeReadyAt'];return Object.fromEntries(keys.map(k=>[k,a[k]??({infectionReservations:[],infectionClass:'runner',infectionNextClass:'runner',infectionGear:{},infectionGrenades:{},infectionStats:{conversions:0,assists:0,damage:0,supplies:0},infectionTotals:{conversions:0,assists:0,damage:0,supplies:0}}[k]??0)]));}
export function infectionPurchaseAvailability(a={},item,phase,now=Date.now()){
 const spec=INFECTION_SHOP[item],reservations=a.infectionReservations||[];
 let reason=!spec?'unavailable':spec.classId?(!['buy','active'].includes(phase)?'phase_locked':''):phase!=='buy'?'phase_locked':a.infected?'wrong_role':'';
 if(!reason){
  if(spec.classId)reason=(a.infectionNextClass||a.infectionClass||'runner')===spec.classId?'selected':'';
  else if(a.hp<=0)reason='respawning';
  else if(spec.weapon&&a.primaryWeapon===spec.weapon)reason='equipped';
  else if(!spec.weapon&&reservations.includes(item))return {accepted:true,reason:'',cancel:true};
  if(!reason&&infectionCash(a.cash)-(a.infectionReservedCash||0)<infectionPrice(spec,phase))reason='insufficient_packs';
 }
 return {accepted:!reason,reason};
}


// Same placement test for the visible Build prompt and authoritative construction.
export function infectionBuildSite(actor,state,actors=[actor]){
 if(actor.infected||actor.hp<=0||!actor.infectionGear?.barricade||(state.barricades||[]).filter(b=>b.hp>0).length>=INFECTION.barricadeLimit)return null;
 return (state.sockets||[]).find(s=>Math.hypot(s.x-actor.x,s.z-actor.z)<3&&Math.abs(s.y-actor.y)<.6&&!(state.barricades||[]).some(b=>b.socket===s.id&&b.hp>0)&&!actors.some(p=>{if(p.hp<=0||p.y>=s.y+1.25||p.y+1.8<=s.y)return false;const a=-(s.rot||0)*Math.PI/180,x=(p.x-s.x)*Math.cos(a)-(p.z-s.z)*Math.sin(a),z=(p.x-s.x)*Math.sin(a)+(p.z-s.z)*Math.cos(a);return Math.hypot(Math.max(0,Math.abs(x)-1.6),Math.max(0,Math.abs(z)-.24))<.36;}))||null;
}
