// One authoritative contract for mode timing, role stores and equipment limits.
export const INFECTION = Object.freeze({buyMs:20000,roundMs:360000,rounds:3,breakMs:7000,respawnMs:4000,spawnRetryMs:500,spawnProtectionMs:900,speed:1.2,reach:2.4,clawMs:650,clawDamage:40,startCash:2000,cashCap:16000,minSpawnDistance:24,spawnSightDistance:10000,supplyMs:45000,supplyRadius:3.5});
export const INFECTION_ARMS = Object.freeze({mag:24,shotMs:130,damage:14,velocity:110,reloadMs:2400,heatPerShot:.095,coolPerSecond:.25,overheatMs:1800,shieldHp:400,shieldSlow:.58,bombRadius:5,bombSeconds:6,bombDps:12,bombCooldownMs:8000});
export const INFECTION_SHOP = Object.freeze({
 heal:{cost:300,label:'MEDKIT',role:'survivor',detail:'Restore 40 health · carry 2',art:'medkit'},
 armor:{cost:600,label:'ARMOR',role:'survivor',detail:'+50 armor · max 100',art:'armor'},
 smg:{cost:1200,label:'UMP SMG',role:'survivor',weapon:'ump',detail:'Fast handling · close range'},
 sniper:{cost:1600,label:'SNIPER',role:'survivor',weapon:'sniper',detail:'Long range · deliberate shots'},
 assault:{cost:2200,label:'ASSAULT RIFLE',role:'survivor',weapon:'assault',detail:'Versatile · medium range'},
 frag:{cost:400,label:'FRAG GRENADE',role:'survivor',detail:'Explosive defense · carry 3',art:'frag'},
 claws:{cost:0,label:'CLAWS',role:'infected',detail:'Free · fast melee attacks',art:'claws'},
 toxic:{cost:500,label:'INFECTED BOMB',role:'infected',detail:'Toxic cloud · carry 2 · 8s cooldown',art:'toxic'},
 mutation:{cost:1800,label:'MUTATION GUN',role:'infected',detail:'24 shots · overheats · slower movement',art:'mutation'},
 shield:{cost:1400,label:'HEAVY SHIELD',role:'infected',detail:'400 durability · sides exposed',art:'shield'},
 screech:{cost:900,label:'SCREECH',role:'infected',detail:'Brief nearby reveal · 18s cooldown',art:'screech'},
 carapace:{cost:700,label:'CARAPACE',role:'infected',detail:'+50 max health · once per round',art:'carapace'}
});
export function infectionShopItems(infected){return Object.entries(INFECTION_SHOP).filter(([,s])=>s.role===(infected?'infected':'survivor'));}
export function infectionCash(value,amount=0){return Math.min(INFECTION.cashCap,Math.max(0,Math.floor(Number(value)||0)+amount));}
// A dead infected remains a participant. Respawn queues never decide victory.
export function infectionOutcome(actors,now,endsAt){if(!actors.length)return '';if(!actors.some(a=>!a.infected))return 'red';return now>=endsAt?'blue':'';}
export function infectionPublicState(a={}){return {infectionRound:a.infectionRound||0,infectionPending:!!a.infectionPending,infectionGear:a.infectionGear||{},infectionWeapon:a.infectionWeapon||'claws',infectionReadyAt:a.infectionReadyAt||0,toxicBombs:a.toxicBombs||0,bombReadyAt:a.bombReadyAt||0,mutationAmmo:a.mutationAmmo??INFECTION_ARMS.mag,mutationHeat:a.mutationHeat||0,mutationHeatAt:a.mutationHeatAt||0,mutationShotAt:a.mutationShotAt||0,mutationReloadAt:a.mutationReloadAt||0,mutationHotUntil:a.mutationHotUntil||0,shieldHp:a.shieldHp||0,shielding:!!a.shielding,screechReadyAt:a.screechReadyAt||0,infectionStats:a.infectionStats||{conversions:0,assists:0,damage:0,supplies:0},survivalMs:a.survivalMs||0,infectionTotals:a.infectionTotals||{conversions:0,assists:0,damage:0,supplies:0},survivalTotalMs:a.survivalTotalMs||0};}
export function infectionPurchaseAvailability(actor,item,phase,atSupply=false){
 const spec=INFECTION_SHOP[item],a=actor||{},gear=a.infectionGear||{};
 let reason=!spec?'unavailable':spec.role!==(a.infected?'infected':'survivor')?'wrong_role':!['buy','active'].includes(phase)?'phase_locked':phase==='active'?(a.infected?(a.hp>0?'respawn_only':''):!atSupply?'supply_required':a.hp<=0?'not_alive':''):'';
 if(!reason){if(item==='claws')reason=a.infectionWeapon==='claws'?'equipped':'';else if(['mutation','shield','screech','carapace'].includes(item)&&gear[item])reason='owned';else if(item==='toxic'&&(a.toxicBombs||0)>=2)reason='full';else if(item==='armor'&&(a.armor||0)>=100)reason='full';else if(item==='frag'&&(a.equipment?.frag||0)>=3)reason='full';else if(item==='heal'&&(a.medkits||0)>=2)reason='full';else if(spec.weapon&&a.primaryOwned&&a.primaryWeapon===spec.weapon)reason='owned';else if(infectionCash(a.cash)<spec.cost)reason='insufficient_cash';}
 return {accepted:!reason,reason};
}
export function zombieBossSpec(wave,players=1){const tier=Math.min(6,Math.max(1,Math.floor(wave/5)));return {tier,health:Math.round((450+tier*110)*(1+Math.min(3,Math.max(0,players-1))*.3)),speed:Math.min(4.6,2.5+tier*.28),damage:Math.min(45,20+tier*4),reach:2.4+Math.min(3,tier)*.2,windupMs:1100,attackMs:2400-Math.min(5,tier)*100};}
