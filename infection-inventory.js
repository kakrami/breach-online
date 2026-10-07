import {INFECTION as R,INFECTION_ARMS as A} from './infection-rules.js';
export function freshInfectionInventory(infected=false,first=false){return {infected,infectionShopping:false,team:infected?'red':'blue',maxHp:infected?(first?300:220):100,armor:0,primaryOwned:false,medkits:0,primaryWeapon:'ump',secondaryWeapon:'pistol',weapon:'pistol',reloadAt:0,reloadWeapon:'',weaponReadyAt:0,combatAction:'ready',combatActionKind:'',combatReadyAt:0,primaryAttachments:{},secondaryAttachments:{},equipment:{flash:0,smoke:0,sticky:0,frag:0},infectionGear:{},infectionWeapon:'claws',infectionReadyAt:0,toxicBombs:infected?1:0,bombReadyAt:0,mutationAmmo:A.mag,mutationHeat:0,mutationHeatAt:0,mutationReloadAt:0,mutationHotUntil:0,mutationShotAt:0,shieldHp:0,shielding:false,screechReadyAt:0,nextClawAt:0,attackAt:0};}

// Rejoining keeps the round inventory. Living infected return through the safe
// spawn queue with their prior health/ammunition, so reconnecting cannot heal
// them or materialize them beside a survivor who moved during disconnection.
export function infectionConnectionState(preserved,match,now){
 const sameRound=!!preserved&&preserved.infectionRound===match.infectionRound&&preserved.infectionMatchStartedAt===match.startedAt;
 if(!sameRound){const active=match.status==='active',fighting=active&&match.infectionPhase==='active';return {...freshInfectionInventory(active),infectionRound:match.infectionRound||0,infectionMatchStartedAt:match.startedAt,cash:R.startCash,hp:active?0:100,infectionPending:active,infectionShopping:fighting,wastedUntil:active?now+(fighting?R.respawnMs:0):0,infectionStats:{conversions:0,assists:0,damage:0,supplies:0}};}
 const p=preserved,keys=['infectionMatchStartedAt','infectionRound','infected','cash','primaryOwned','primaryWeapon','secondaryWeapon','weapon','primaryAttachments','secondaryAttachments','medkits','maxHp','armor','hp','wastedUntil','ammo','equipment','roundSpent','roundStartRole','infectionStats','infectionGear','infectionWeapon','infectionReadyAt','toxicBombs','bombReadyAt','mutationAmmo','mutationHeat','mutationHeatAt','mutationShotAt','mutationReloadAt','mutationHotUntil','shieldHp','screechReadyAt','infectionPending','infectionShopping','infectionResumeHp','damageRewards','killRewards','supplyClaims','contributions','survivalMs','infectionTotals','survivalTotalMs','nextClawAt','attackAt'],state={};
 for(const key of keys)if(p[key]!==undefined)state[key]=p[key];state.shielding=false;
 if(p.infected&&p.hp>0&&match.status==='active'){state.infectionResumeHp=p.hp;state.hp=0;state.infectionPending=true;state.wastedUntil=now+(match.infectionPhase==='active'?R.respawnMs:0);state.spawnAttemptAt=0;}
 return state;
}
