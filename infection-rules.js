// Shared classic Infection contract: identical authority and presentation rules.
export const INFECTION = Object.freeze({buyMs:20000,roundMs:360000,rounds:1,respawnMs:4000,spawnRetryMs:500,spawnProtectionMs:1200,speed:1.08,reach:2.1,clawMs:700,clawDamage:100,startCash:10,cashCap:100,minSpawnDistance:24,spawnSightDistance:10000,damagePerPack:250,motherRatio:8,conversionGraceMs:1000});
export const INFECTION_ARMS = Object.freeze({bombRadius:4,bombCooldownMs:8000,grenadeFuseMs:1500,fireSeconds:6,fireDps:45,frostMs:3000,madnessMs:5000,madnessCooldownMs:25000});
export const INFECTION_CLASSES = Object.freeze({
 classic:{label:'CLASSIC',hp:1500,speed:1.08,jump:1,knockback:1,detail:'Balanced health, movement and resistance'},
 raptor:{label:'RAPTOR',hp:1000,speed:1.23,jump:1,knockback:1.25,detail:'Fast pursuit · lower health'},
 light:{label:'LIGHT',hp:1200,speed:1.12,jump:1.5,knockback:1.15,detail:'Higher jumps · vulnerable to gunfire'},
 tank:{label:'TANK',hp:2400,speed:.9,jump:.9,knockback:.5,detail:'Heavy health · resists knockback · slower'},
 leech:{label:'LEECH',hp:1400,speed:1.06,jump:1,knockback:1,heal:180,detail:'Recovers health after each infection'},
 rage:{label:'RAGE',hp:1800,speed:1.02,jump:1.1,knockback:.7,detail:'Resilient hunter · moderate movement'}
});
export function infectionClass(id){return INFECTION_CLASSES[id]||INFECTION_CLASSES.classic;}
export const INFECTION_SHOP = Object.freeze({
 smg:{cost:3,label:'UMP',role:'survivor',tab:'weapons',weapon:'ump',detail:'Free during preparation · close-range defense'},
 assault:{cost:3,label:'ASSAULT RIFLE',role:'survivor',tab:'weapons',weapon:'assault',detail:'Free during preparation · versatile defense'},
 shotgun:{cost:3,label:'SHOTGUN',role:'survivor',tab:'weapons',weapon:'shotgun',detail:'Free during preparation · strong close-range knockback'},
 auto:{cost:3,label:'AUTO SHOTGUN',role:'survivor',tab:'weapons',weapon:'semiShotgun',detail:'Free during preparation · close-range follow-up shots'},
 machine:{cost:3,label:'MACHINE GUN',role:'survivor',tab:'weapons',weapon:'machineGun',detail:'Free during preparation · sustained defensive fire'},
 sniper:{cost:3,label:'SNIPER',role:'survivor',tab:'weapons',weapon:'sniper',detail:'Free during preparation · powerful single shots'},
 heal:{cost:2,label:'MEDKIT',role:'survivor',tab:'gear',detail:'Restore health · carry 2',art:'medkit'},
 armor:{cost:5,label:'INFECTION ARMOR',role:'survivor',tab:'gear',detail:'Absorbs 2 claw contacts · max 100 armor',art:'armor'},
 fire:{cost:3,label:'NAPALM',role:'survivor',tab:'gear',detail:'Burns and slows zombies · carry 2',art:'fire'},
 frost:{cost:3,label:'FROST',role:'survivor',tab:'gear',detail:'Freezes nearby zombies for 3 seconds · carry 2',art:'frost'},
 flare:{cost:1,label:'FLARE',role:'survivor',tab:'gear',detail:'Throw a 20-second light · carry 2',art:'flare'},
 nightvision:{cost:8,label:'NIGHT VISION',role:'survivor',tab:'gear',detail:'Improves night visibility · persists through human deaths',art:'nightvision'},
 madness:{cost:15,label:'ZOMBIE MADNESS',role:'infected',tab:'gear',detail:'5-second damage shield · activate with ability control',art:'madness'},
 antidote:{cost:25,label:'ANTIDOTE',role:'infected',tab:'gear',detail:'Become human · unavailable to first or last infected',art:'antidote'},
 bomb:{cost:20,label:'INFECTION BOMB',role:'infected',tab:'gear',detail:'Infects within blast radius · requires host rule',art:'bomb'},
 ...Object.fromEntries(Object.entries(INFECTION_CLASSES).map(([id,v])=>['class_'+id,{cost:0,label:v.label,role:'any',tab:'classes',classId:id,detail:v.detail,art:'class_'+id}]))
});
export function isInfectionPrimaryWeapon(weapon){return Object.values(INFECTION_SHOP).some(item=>item.weapon===weapon);}
export function infectionShopItems(infected,tab=infected?'gear':'weapons'){return Object.entries(INFECTION_SHOP).filter(([,s])=>s.tab===tab&&(s.role==='any'||s.role===(infected?'infected':'survivor')));}
export function infectionPrice(spec,phase){return spec?.weapon&&phase==='buy'?0:spec?.cost||0;}
export function infectionCash(value,amount=0){return Math.min(INFECTION.cashCap,Math.max(0,Math.floor(Number(value)||0)+amount));}
export function infectionOutcome(actors,now,endsAt){if(!actors.length)return '';if(!actors.some(a=>!a.infected))return 'red';return now>=endsAt?'blue':'';}
export function infectionPublicState(a={}){const keys=['infectionRound','infectionPending','infectionClass','infectionNextClass','infectionMother','infectionReadyAt','infectionGear','infectionGrenades','infectionStats','infectionTotals','survivalMs','survivalTotalMs','madnessUntil','madnessReadyAt','frozenUntil','burningUntil','infectionBombsAllowed','infectedCount','antidoteUsed','grenadeReadyAt'];return Object.fromEntries(keys.map(k=>[k,a[k]??({infectionClass:'classic',infectionNextClass:'classic',infectionGear:{},infectionGrenades:{},infectionStats:{conversions:0,assists:0,damage:0,supplies:0},infectionTotals:{conversions:0,assists:0,damage:0,supplies:0}}[k]??0)]));}
export function infectionPurchaseAvailability(a={},item,phase){
 const spec=INFECTION_SHOP[item],gear=a.infectionGear||{},nades=a.infectionGrenades||{};
 let reason=!spec?'unavailable':!['buy','active'].includes(phase)?'phase_locked':spec.role!=='any'&&spec.role!==(a.infected?'infected':'survivor')?'wrong_role':'';
 if(!reason){
  if(spec.classId)reason=(a.infectionNextClass||a.infectionClass||'classic')===spec.classId?'selected':'';
  else if(a.hp<=0)reason='respawning';
  else if(item==='bomb'&&!a.infectionBombsAllowed)reason='host_disabled';
  else if(item==='antidote'&&(a.infectionMother||a.infectedCount<2||a.antidoteUsed))reason='unavailable';
  else if(['madness','nightvision'].includes(item)&&gear[item])reason='owned';
  else if(['fire','frost','flare','bomb'].includes(item)&&(nades[item]||0)>=(item==='bomb'?1:2))reason='full';
  else if(item==='armor'&&(a.armor||0)>=100)reason='full';
  else if(item==='heal'&&(a.medkits||0)>=2)reason='full';
  else if(spec.weapon&&a.primaryOwned&&a.primaryWeapon===spec.weapon)reason='equipped';
  if(!reason&&infectionCash(a.cash)<infectionPrice(spec,phase))reason='insufficient_packs';
 }
 return {accepted:!reason,reason};
}
export function zombieBossSpec(wave,players=1){const tier=Math.min(6,Math.max(1,Math.floor(wave/5)));return {tier,health:Math.round((450+tier*110)*(1+Math.min(3,Math.max(0,players-1))*.3)),speed:Math.min(4.6,2.5+tier*.28),damage:Math.min(45,20+tier*4),reach:2.4+Math.min(3,tier)*.2,windupMs:1100,attackMs:2400-Math.min(5,tier)*100};}
