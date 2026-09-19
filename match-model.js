import { DEFAULT_MATCH_RULES, gameModeSpec, normalizeGameMode } from './game-config.js';
import { normalizeMatchStatus } from './gameplay-phase.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finiteNumber=(value,fallback=0)=>{const n=Number(value);return Number.isFinite(n)?n:fallback;};

export function normalizeMatchRules(value){
  const v=value&&typeof value==='object'?value:{};
  const mode=normalizeGameMode(v.mode??DEFAULT_MATCH_RULES.mode),spec=gameModeSpec(mode);
  const minimapDirectional=!!v.minimapDirectional,minimapRevealAll=minimapDirectional||!!v.minimapRevealAll;
  if(spec.scoreType==='none')return{mode,scoreLimit:0,timeLimitMs:0,minimapRevealAll,minimapDirectional};
  return{
    mode,
    scoreLimit:clamp(Math.floor(finiteNumber(v.scoreLimit,spec.scoreLimit)),5,100),
    timeLimitMs:clamp(Math.round(finiteNumber(v.timeLimitMs,spec.timeLimitMs)),2*60*1000,30*60*1000),
    minimapRevealAll,minimapDirectional,
  };
}

export function defaultMatchState(now=Date.now(),rules=DEFAULT_MATCH_RULES){
  const normalized=normalizeMatchRules(rules);
  return{
    status:'waiting',round:1,mode:normalized.mode,blueScore:0,redScore:0,
    scoreLimit:normalized.scoreLimit,timeLimitMs:normalized.timeLimitMs,minimapRevealAll:normalized.minimapRevealAll,minimapDirectional:normalized.minimapDirectional,
    warmupEndsAt:0,startedAt:0,endsAt:0,endedAt:0,restartAt:0,
    winner:'',winnerId:'',winnerName:'',reason:'',updatedAt:now,
  };
}

export function normalizeMatchState(value,now=Date.now(),rules=DEFAULT_MATCH_RULES){
  const v=value&&typeof value==='object'?value:{},mode=normalizeGameMode(v.mode??rules?.mode),def=defaultMatchState(now,{...rules,mode});
  const normalizedRules=normalizeMatchRules({...def,...v,mode});
  const status=normalizeMatchStatus(v.status??def.status);
  const winner=['blue','red','draw'].includes(String(v.winner))?String(v.winner):'';
  return{
    status,round:Math.max(1,Math.floor(finiteNumber(v.round,def.round))),mode,
    blueScore:Math.max(0,Math.floor(finiteNumber(v.blueScore,0))),redScore:Math.max(0,Math.floor(finiteNumber(v.redScore,0))),
    scoreLimit:normalizedRules.scoreLimit,timeLimitMs:normalizedRules.timeLimitMs,minimapRevealAll:normalizedRules.minimapRevealAll,minimapDirectional:normalizedRules.minimapDirectional,
    warmupEndsAt:Math.max(0,finiteNumber(v.warmupEndsAt,0)),startedAt:Math.max(0,finiteNumber(v.startedAt,0)),endsAt:Math.max(0,finiteNumber(v.endsAt,0)),endedAt:Math.max(0,finiteNumber(v.endedAt,0)),restartAt:Math.max(0,finiteNumber(v.restartAt,0)),
    winner,winnerId:String(v.winnerId||'').slice(0,64),winnerName:String(v.winnerName||'').slice(0,24),reason:String(v.reason||'').slice(0,24),updatedAt:Math.max(0,finiteNumber(v.updatedAt,now)),
  };
}

export function publicMatchState(value,now=Date.now()){const match=normalizeMatchState(value,now,value);return{...match,serverTime:now};}

export function matchRulesAreDefault(match){
  const normalized=normalizeMatchState(match,Date.now(),match),spec=gameModeSpec(normalized.mode);
  return normalized.scoreLimit===spec.scoreLimit&&normalized.timeLimitMs===spec.timeLimitMs&&!normalized.minimapRevealAll&&!normalized.minimapDirectional;
}
