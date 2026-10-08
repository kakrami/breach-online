// Shared Infection contract: identical authority and presentation rules.
export const INFECTION = Object.freeze({buyMs:20000,roundMs:360000,rounds:1,respawnMs:4000,spawnRetryMs:500,spawnProtectionMs:1200,reach:1.65,clawMs:1000,clawDamage:100,startCash:8,cashCap:60,minSpawnDistance:24,spawnSightDistance:10000,damagePerPack:500,motherRatio:8,conversionGraceMs:2200,armorRecoveryMs:7000,knockbackCap:4.2,knockbackWindowMs:350,supplyIntervalMs:95000,supplyLifetimeMs:55000,barricadeHp:420,barricadeLimit:3});
export const INFECTION_ARMS = Object.freeze({bombRadius:4,bombCooldownMs:8000,grenadeFuseMs:1500,fireSeconds:6,fireDps:45,frostMs:1800,frostRecoveryMs:8000,carapaceMs:2800,carapaceCooldownMs:22000,purgeMs:2500});
export const INFECTION_CLASSES = Object.freeze({
 runner:{label:'RUNNER',hp:1000,speed:1.03,jump:1,knockback:1,ability:'DASH',abilityMs:850,cooldownMs:13000,boost:1.65,detail:'Dash through gaps · light health'},
 leaper:{label:'LEAPER',hp:1200,speed:1.0,jump:1.1,knockback:1.1,ability:'POUNCE',abilityMs:1200,cooldownMs:16000,boost:1.3,abilityJump:2.5,detail:'Directional pounce · clears low cover'},
 brute:{label:'BRUTE',hp:1900,speed:.88,jump:.9,knockback:.55,ability:'CHARGE',abilityMs:1700,cooldownMs:20000,boost:1.5,resistance:.5,detail:'Charge breaks barricades · slow turns'},
 stalker:{label:'STALKER',hp:950,speed:1.06,jump:1,knockback:1,ability:'SILENCE',abilityMs:4500,cooldownMs:18000,boost:1.12,detail:'Quiet approach · stays visible'}
});
export function infectionClassId(id){return Object.hasOwn(INFECTION_CLASSES,id)?id:'runner';}
export function infectionClass(id){return INFECTION_CLASSES[infectionClassId(id)];}
export function infectionAbilityActive(actor,now=Date.now()){return !!actor?.infected&&now>=Number(actor.abilityStartsAt||0)&&now<Number(actor.abilityUntil||0);}
export function infectionStatusActive(actor,key,now=Date.now()){return Number(actor?.[key]||0)>now;}
export function infectionInitialCount(count){return Math.max(1,Math.min(count-1,Math.ceil(count/INFECTION.motherRatio)));}
export function infectionFirstHealth(count){return Math.min(1.8,1.2+Math.max(0,count-2)*.035);}
export const INFECTION_SHOP = Object.freeze({
 smg:{cost:3,label:'UMP',role:'survivor',tab:'weapons',weapon:'ump',detail:'Free during preparation · close-range defense'},
 assault:{cost:3,label:'ASSAULT RIFLE',role:'survivor',tab:'weapons',weapon:'assault',detail:'Free during preparation · versatile defense'},
 shotgun:{cost:3,label:'SHOTGUN',role:'survivor',tab:'weapons',weapon:'shotgun',detail:'Free during preparation · strong close-range knockback'},
 auto:{cost:3,label:'AUTO SHOTGUN',role:'survivor',tab:'weapons',weapon:'semiShotgun',detail:'Free during preparation · close-range follow-up shots'},
 machine:{cost:3,label:'MACHINE GUN',role:'survivor',tab:'weapons',weapon:'machineGun',detail:'Free during preparation · sustained defensive fire'},
 sniper:{cost:3,label:'SNIPER',role:'survivor',tab:'weapons',weapon:'sniper',detail:'Free during preparation · powerful single shots'},
 armor:{cost:6,label:'INFECTION ARMOR',role:'survivor',tab:'gear',detail:'Absorbs 2 claws · replenish out of combat',art:'armor'},
 fire:{cost:3,label:'NAPALM',role:'survivor',tab:'gear',detail:'Burns and slows · carry 2',art:'fire'},
 frost:{cost:4,label:'FROST',role:'survivor',tab:'gear',detail:'Brief freeze · repeated freezes weaken',art:'frost'},
 flare:{cost:1,label:'FLARE',role:'survivor',tab:'gear',detail:'20-second light · carry 2',art:'flare'},
 barricade:{cost:5,label:'BARRICADE KIT',role:'survivor',tab:'gear',detail:'Build at marked defense sockets · carry 1',art:'barricade'},
 carapace:{cost:9,label:'CARAPACE',role:'infected',tab:'gear',detail:'45% damage resistance for 2.8s · equip, then use',art:'carapace'},
 purge:{cost:5,label:'PURGE',role:'infected',tab:'gear',detail:'Clear fire and frost · brief status resistance',art:'purge'},
 antidote:{cost:25,label:'ANTIDOTE',role:'infected',tab:'gear',chaos:true,detail:'Chaos rules only · first/last infected cannot cure',art:'antidote'},
 bomb:{cost:20,label:'INFECTION BOMB',role:'infected',tab:'gear',chaos:true,detail:'Chaos rules only · cannot convert last survivor',art:'bomb'},
 ...Object.fromEntries(Object.entries(INFECTION_CLASSES).map(([id,v])=>['class_'+id,{cost:0,label:v.label,role:'any',tab:'classes',classId:id,detail:v.detail,art:'class_'+id}]))
});
export function isInfectionPrimaryWeapon(weapon){return Object.values(INFECTION_SHOP).some(item=>item.weapon===weapon);}
export function infectionShopItems(infected,tab=infected?'gear':'weapons',chaos=false){return Object.entries(INFECTION_SHOP).filter(([,s])=>s.tab===tab&&(!s.chaos||chaos)&&(s.role==='any'||s.role===(infected?'infected':'survivor')));}
export function infectionPrice(spec,phase){return spec?.weapon&&phase==='buy'?0:spec?.cost||0;}
export function infectionCash(value,amount=0){return Math.min(INFECTION.cashCap,Math.max(0,Math.floor(Number(value)||0)+amount));}
export function infectionOutcome(actors,now,endsAt){if(!actors.length)return '';if(!actors.some(a=>!a.infected))return 'red';return now>=endsAt?'blue':'';}
export function infectionPublicState(a={}){const keys=['infectionRound','infectionPending','infectionClass','infectionNextClass','infectionMother','infectionReadyAt','infectionGear','infectionGrenades','infectionStats','infectionTotals','survivalMs','survivalTotalMs','abilityStartsAt','abilityUntil','abilityReadyAt','abilityYaw','carapaceUntil','carapaceReadyAt','statusImmuneUntil','frostRecoveryUntil','infectionSelectedItem','infectionChaosAllowed','lastArmorHitAt','frozenUntil','burningUntil','infectedCount','antidoteUsed','grenadeReadyAt'];return Object.fromEntries(keys.map(k=>[k,a[k]??({infectionClass:'runner',infectionNextClass:'runner',infectionGear:{},infectionGrenades:{},infectionStats:{conversions:0,assists:0,damage:0,supplies:0},infectionTotals:{conversions:0,assists:0,damage:0,supplies:0}}[k]??0)]));}
export function infectionPurchaseAvailability(a={},item,phase,now=Date.now()){
 const spec=INFECTION_SHOP[item],gear=a.infectionGear||{},nades=a.infectionGrenades||{};
 let reason=!spec?'unavailable':!['buy','active'].includes(phase)?'phase_locked':spec.role!=='any'&&spec.role!==(a.infected?'infected':'survivor')?'wrong_role':'';
 if(!reason){
  if(spec.classId)reason=(a.infectionNextClass||a.infectionClass||'runner')===spec.classId?'selected':'';
  else if(a.hp<=0)reason='respawning';
  else if(spec.chaos&&!a.infectionChaosAllowed)reason='host_disabled';
  else if(item==='antidote'&&(a.infectionMother||a.infectedCount<2||a.antidoteUsed))reason='unavailable';
  else if(['carapace','purge'].includes(item)&&gear[item]&&a.infectionSelectedItem===item)reason='equipped';
  else if(item==='barricade'&&gear[item])reason='owned';
  else if(['fire','frost','flare','bomb'].includes(item)&&(nades[item]||0)>=(item==='bomb'?1:2))reason='full';
  else if(item==='armor'&&(a.armor||0)>=100)reason='full';
  else if(item==='armor'&&now-Number(a.lastArmorHitAt||0)<INFECTION.armorRecoveryMs)reason='under_attack';
  else if(spec.weapon&&a.primaryOwned&&a.primaryWeapon===spec.weapon)reason='equipped';
  if(!reason&&!gear[item]&&infectionCash(a.cash)<infectionPrice(spec,phase))reason='insufficient_packs';
 }
 return {accepted:!reason,reason};
}
export function zombieBossSpec(wave,players=1){const tier=Math.min(6,Math.max(1,Math.floor(wave/5)));return {tier,health:Math.round((450+tier*110)*(1+Math.min(3,Math.max(0,players-1))*.3)),speed:Math.min(4.6,2.5+tier*.28),damage:Math.min(45,20+tier*4),reach:2.4+Math.min(3,tier)*.2,windupMs:1100,attackMs:2400-Math.min(5,tier)*100};}

// Same placement test for the visible Build prompt and authoritative construction.
export function infectionBuildSite(actor,state,actors=[actor]){
 if(actor.infected||actor.hp<=0||!actor.infectionGear?.barricade||(state.barricades||[]).filter(b=>b.hp>0).length>=INFECTION.barricadeLimit)return null;
 return (state.sockets||[]).find(s=>Math.hypot(s.x-actor.x,s.z-actor.z)<3&&Math.abs(s.y-actor.y)<.6&&!(state.barricades||[]).some(b=>b.socket===s.id&&b.hp>0)&&!actors.some(p=>{if(p.hp<=0||p.y>=s.y+1.25||p.y+1.8<=s.y)return false;const a=-(s.rot||0)*Math.PI/180,x=(p.x-s.x)*Math.cos(a)-(p.z-s.z)*Math.sin(a),z=(p.x-s.x)*Math.sin(a)+(p.z-s.z)*Math.cos(a);return Math.hypot(Math.max(0,Math.abs(x)-1.6),Math.max(0,Math.abs(z)-.24))<.36;}))||null;
}
